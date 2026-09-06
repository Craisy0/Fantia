"""
Gottabet - Scommesse tra amici della lega GOTTA
Solo libreria standard: nessuna dipendenza da installare.

Avvio:  python server.py [porta]   (default porta 8765, o $PORT se impostata dall'hosting)
"""
import json
import math
import os
import re
import sys
import time
import unicodedata
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
STATIC_DIR = os.path.join(APP_DIR, "static")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")

LOCK = threading.Lock()


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json_atomic(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def normalize(s):
    if not s:
        return ''
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return s.strip()


def now_str():
    return time.strftime('%Y-%m-%d %H:%M:%S')


# ---------------------------------------------------------------------------
# Formula punti fantacalcio -> "gol equivalenti", motore quote (modello Poisson)
# ---------------------------------------------------------------------------

def punti_a_gol(punti, formula):
    """Conversione 'ufficiale' punti->gol usata per liquidare le scommesse a fine giornata
    (deve restare un numero intero: il risultato reale e' un numero intero di gol equivalenti)."""
    soglia = formula['soglia']
    ogni = formula['ogni_punti']
    if punti is None or punti < soglia:
        return 0
    return 1 + int((punti - soglia) // ogni)


def punti_a_gol_continuo(punti, formula):
    """Stessa formula ma senza lo scalino (retta continua), usata solo per stimare il lambda
    di Poisson pre-partita da una proiezione: evita un salto brusco delle quote attorno alla soglia
    (es. 65.9 proiettati non deve valere 'zero gol attesi' contro 66.0 che ne vale uno pieno)."""
    soglia = formula['soglia']
    ogni = formula['ogni_punti']
    if punti is None:
        return None
    return max(0.0, (punti - soglia) / ogni + 1.0)


def poisson_pmf(k, lam):
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def distribuzione(lam, max_gol):
    return [poisson_pmf(k, lam) for k in range(max_gol + 1)]


def calcola_probabilita_1x2(lam_a, lam_b, max_gol):
    da = distribuzione(lam_a, max_gol)
    db = distribuzione(lam_b, max_gol)
    p1 = px = p2 = 0.0
    for i, pa in enumerate(da):
        for j, pb in enumerate(db):
            p = pa * pb
            if i > j:
                p1 += p
            elif i == j:
                px += p
            else:
                p2 += p
    tot = p1 + px + p2 or 1.0
    return p1 / tot, px / tot, p2 / tot


def calcola_probabilita_over_under(lam_a, lam_b, linea, max_gol):
    lam_tot = lam_a + lam_b
    d = distribuzione(lam_tot, max_gol * 2)
    p_under = sum(p for k, p in enumerate(d) if k < linea)
    tot = sum(d) or 1.0
    p_under = p_under / tot
    p_over = 1.0 - p_under
    return p_over, p_under


def quota_da_probabilita(p, margine):
    p = max(p, 0.005)
    return round((1.0 / p) / margine, 2)


def linee_over_under(lam_a, lam_b):
    lam_tot = lam_a + lam_b
    base = math.floor(lam_tot)
    linee = sorted(set([max(0.5, base - 0.5), base + 0.5, base + 1.5]))
    return linee


class Store:
    """Tiene config + stato in memoria, la fonte di verita' sono i file JSON su disco."""

    def __init__(self):
        self.reload_config()
        self.state = load_json(STATE_PATH)
        self._assicura_squadre()

    def reload_config(self):
        self.config = load_json(CONFIG_PATH)

    def save(self):
        save_json_atomic(STATE_PATH, self.state)

    def _assicura_squadre(self):
        """Se config.json ha squadre nuove/rimosse rispetto allo stato, sincronizza saldi/storico."""
        squadre = self.config['lega']['squadre']
        saldo_iniziale = self.config['lega']['saldo_iniziale']
        for sq in squadre:
            self.state['saldi'].setdefault(sq, saldo_iniziale)
            self.state['storico_punti'].setdefault(sq, [])
            self.state.setdefault('proiezioni', {}).setdefault(sq, [])

    def _log(self, testo):
        self.state.setdefault('log', []).append({'ts': now_str(), 'testo': testo})

    def squadre(self):
        return list(self.config['lega']['squadre'])

    def check_admin(self, password):
        return password and password == self.config['admin']['password']

    # -- import punteggi ---------------------------------------------------

    def _match_squadra(self, nome_raw):
        target = normalize(nome_raw)
        if not target:
            return None
        for sq in self.squadre():
            if normalize(sq) == target:
                return sq
        candidati = [sq for sq in self.squadre() if normalize(sq) in target or target in normalize(sq)]
        if len(candidati) == 1:
            return candidati[0]
        return None

    @staticmethod
    def _parse_riga_punti(riga):
        riga = riga.strip()
        if not riga:
            return None
        parti = re.split(r'\t|;|,(?!\d)|\s{2,}', riga)
        parti = [p.strip() for p in parti if p.strip()]
        if len(parti) < 2:
            toks = riga.split()
            if len(toks) < 2:
                return None
            nome = ' '.join(toks[:-1])
            punti_raw = toks[-1]
        else:
            nome, punti_raw = parti[0], parti[-1]
        punti_raw = punti_raw.replace(',', '.')
        m = re.search(r'-?\d+(\.\d+)?', punti_raw)
        if not m:
            return None
        return nome, float(m.group())

    def anteprima_import_punti(self, testo):
        righe = [r for r in testo.splitlines() if r.strip()]
        risultati = []
        for riga in righe:
            parsed = self._parse_riga_punti(riga)
            if not parsed:
                risultati.append({'riga': riga, 'ok': False, 'errore': 'formato non riconosciuto'})
                continue
            nome_raw, punti = parsed
            squadra = self._match_squadra(nome_raw)
            if not squadra:
                risultati.append({'riga': riga, 'ok': False, 'errore': f'squadra non riconosciuta: "{nome_raw}"'})
                continue
            risultati.append({'riga': riga, 'ok': True, 'squadra': squadra, 'punti': punti})
        return risultati

    def importa_punti(self, giornata, testo):
        risultati = self.anteprima_import_punti(testo)
        non_ok = [r for r in risultati if not r['ok']]
        if non_ok:
            return {'errore': 'alcune righe non sono state riconosciute, correggi il testo prima di confermare',
                    'dettagli': non_ok}
        for r in risultati:
            storico = self.state['storico_punti'][r['squadra']]
            storico[:] = [voce for voce in storico if voce['giornata'] != giornata]
            storico.append({'giornata': giornata, 'punti': r['punti']})
            storico.sort(key=lambda v: v['giornata'])
        self._log(f"Importati punti giornata {giornata}: " + ", ".join(f"{r['squadra']}={r['punti']}" for r in risultati))
        risolti = self.auto_settle(giornata)
        self.save()
        return {'ok': True, 'importati': risultati, 'mercati_risolti': risolti}

    def punti_giornata(self, squadra, giornata):
        for voce in self.state['storico_punti'].get(squadra, []):
            if voce['giornata'] == giornata:
                return voce['punti']
        return None

    # -- proiezioni pre-giornata (da FantaLab: formazione consigliata / fanta media proiettata titolari) --

    @staticmethod
    def _parse_riga_proiezione(riga):
        """'Nome; punti_proiettati[; indice_schierabilita opzionale]'."""
        riga = riga.strip()
        if not riga:
            return None
        parti = re.split(r'\t|;|,(?!\d)|\s{2,}', riga)
        parti = [p.strip() for p in parti if p.strip()]
        if len(parti) < 2:
            return None
        nome = parti[0]
        numeri = []
        for token in parti[1:]:
            m = re.search(r'-?\d+([.,]\d+)?', token)
            if m:
                numeri.append(float(m.group().replace(',', '.')))
        if not numeri:
            return None
        punti_proiettati = numeri[0]
        indice_schierabilita = numeri[1] if len(numeri) > 1 else None
        return nome, punti_proiettati, indice_schierabilita

    def anteprima_import_proiezioni(self, testo):
        righe = [r for r in testo.splitlines() if r.strip()]
        risultati = []
        for riga in righe:
            parsed = self._parse_riga_proiezione(riga)
            if not parsed:
                risultati.append({'riga': riga, 'ok': False, 'errore': 'formato non riconosciuto'})
                continue
            nome_raw, punti_proiettati, indice_schierabilita = parsed
            squadra = self._match_squadra(nome_raw)
            if not squadra:
                risultati.append({'riga': riga, 'ok': False, 'errore': f'squadra non riconosciuta: "{nome_raw}"'})
                continue
            risultati.append({'riga': riga, 'ok': True, 'squadra': squadra,
                               'punti_proiettati': punti_proiettati, 'indice_schierabilita': indice_schierabilita})
        return risultati

    def importa_proiezioni(self, giornata, testo):
        risultati = self.anteprima_import_proiezioni(testo)
        non_ok = [r for r in risultati if not r['ok']]
        if non_ok:
            return {'errore': 'alcune righe non sono state riconosciute, correggi il testo prima di confermare',
                    'dettagli': non_ok}
        for r in risultati:
            proiezioni = self.state.setdefault('proiezioni', {}).setdefault(r['squadra'], [])
            proiezioni[:] = [voce for voce in proiezioni if voce['giornata'] != giornata]
            proiezioni.append({'giornata': giornata, 'punti_proiettati': r['punti_proiettati'],
                                'indice_schierabilita': r['indice_schierabilita']})
            proiezioni.sort(key=lambda v: v['giornata'])
        self._log(f"Importate proiezioni FantaLab giornata {giornata}: " +
                   ", ".join(f"{r['squadra']}={r['punti_proiettati']}" for r in risultati))
        self.save()
        return {'ok': True, 'importati': risultati}

    def proiezione_giornata(self, squadra, giornata):
        for voce in self.state.get('proiezioni', {}).get(squadra, []):
            if voce['giornata'] == giornata:
                return voce['punti_proiettati']
        return None

    # -- motore quote --------------------------------------------------------

    def stima_lambda_storico(self, squadra, escludi_giornata=None):
        formula = self.config['formula_gol']
        storico = self.state['storico_punti'].get(squadra, [])
        gol = [punti_a_gol(v['punti'], formula) for v in storico if v['giornata'] != escludi_giornata]
        gol = gol[-8:]
        if not gol:
            return None
        m = sum(gol) / len(gol)
        return max(m, 0.15)

    def stima_lambda_con_fonte(self, squadra, giornata):
        """Preferisce la proiezione FantaLab della giornata (specifica, aggiornata su formazione/forma/
        infortuni); se manca usa la media storica delle giornate gia' importate; se manca anche quella,
        il default di config. Ritorna (lambda, fonte) cosi' l'admin vede da dove viene la stima."""
        formula = self.config['formula_gol']
        proiezione = self.proiezione_giornata(squadra, giornata)
        if proiezione is not None:
            return max(punti_a_gol_continuo(proiezione, formula), 0.15), 'proiezione_fantalab'
        lam_storico = self.stima_lambda_storico(squadra, escludi_giornata=giornata)
        if lam_storico is not None:
            return lam_storico, 'media_storica'
        return self.config['quote']['lambda_default'], 'default'

    def anteprima_h2h(self, squadra_a, squadra_b, giornata):
        lam_a, fonte_a = self.stima_lambda_con_fonte(squadra_a, giornata)
        lam_b, fonte_b = self.stima_lambda_con_fonte(squadra_b, giornata)
        margine = self.config['quote']['margine_bookmaker']
        max_gol = self.config['quote']['max_gol_simulati']
        p1, px, p2 = calcola_probabilita_1x2(lam_a, lam_b, max_gol)
        linee = linee_over_under(lam_a, lam_b)
        ou = []
        for linea in linee:
            p_over, p_under = calcola_probabilita_over_under(lam_a, lam_b, linea, max_gol)
            ou.append({
                'linea': linea,
                'quota_over': quota_da_probabilita(p_over, margine),
                'quota_under': quota_da_probabilita(p_under, margine),
            })
        return {
            'squadra_a': squadra_a, 'squadra_b': squadra_b, 'giornata': giornata,
            'lambda_a': round(lam_a, 2), 'lambda_b': round(lam_b, 2),
            'fonte_a': fonte_a, 'fonte_b': fonte_b,
            '1x2': {
                'quota_1': quota_da_probabilita(p1, margine),
                'quota_x': quota_da_probabilita(px, margine),
                'quota_2': quota_da_probabilita(p2, margine),
            },
            'over_under': ou,
        }

    # -- mercati ---------------------------------------------------------

    def _nuovo_id_mercato(self):
        i = self.state['prossimo_id_mercato']
        self.state['prossimo_id_mercato'] = i + 1
        return i

    def _nuovo_id_scommessa(self):
        i = self.state['prossimo_id_scommessa']
        self.state['prossimo_id_scommessa'] = i + 1
        return i

    def crea_mercato_h2h(self, squadra_a, squadra_b, giornata):
        if squadra_a not in self.squadre() or squadra_b not in self.squadre():
            return {'errore': 'squadra non valida'}
        if squadra_a == squadra_b:
            return {'errore': 'le due squadre devono essere diverse'}
        anteprima = self.anteprima_h2h(squadra_a, squadra_b, giornata)
        incontro_id = f"g{giornata}-{normalize(squadra_a)}-vs-{normalize(squadra_b)}-{int(time.time())}"
        creati = []

        m_1x2 = {
            'id': self._nuovo_id_mercato(),
            'incontro_id': incontro_id,
            'tipo': '1x2',
            'titolo': f"{squadra_a} vs {squadra_b} - Giornata {giornata} - Esito (1X2 su gol equivalenti)",
            'giornata': giornata, 'squadra_a': squadra_a, 'squadra_b': squadra_b, 'linea': None,
            'esiti': [
                {'chiave': '1', 'label': f'Vince {squadra_a}', 'quota': anteprima['1x2']['quota_1']},
                {'chiave': 'X', 'label': 'Pareggio', 'quota': anteprima['1x2']['quota_x']},
                {'chiave': '2', 'label': f'Vince {squadra_b}', 'quota': anteprima['1x2']['quota_2']},
            ],
            'stato': 'aperto', 'esito_vincente': None,
            'creato_il': now_str(), 'risolto_il': None,
        }
        self.state['mercati'].append(m_1x2)
        creati.append(m_1x2)

        for linea_info in anteprima['over_under']:
            linea = linea_info['linea']
            m_ou = {
                'id': self._nuovo_id_mercato(),
                'incontro_id': incontro_id,
                'tipo': 'over_under',
                'titolo': f"{squadra_a} vs {squadra_b} - Giornata {giornata} - Over/Under {linea} gol equivalenti totali",
                'giornata': giornata, 'squadra_a': squadra_a, 'squadra_b': squadra_b, 'linea': linea,
                'esiti': [
                    {'chiave': 'Over', 'label': f'Over {linea}', 'quota': linea_info['quota_over']},
                    {'chiave': 'Under', 'label': f'Under {linea}', 'quota': linea_info['quota_under']},
                ],
                'stato': 'aperto', 'esito_vincente': None,
                'creato_il': now_str(), 'risolto_il': None,
            }
            self.state['mercati'].append(m_ou)
            creati.append(m_ou)

        self._log(f"Creato incontro {squadra_a} vs {squadra_b} (giornata {giornata}): {len(creati)} mercati")
        self.save()
        return {'ok': True, 'mercati': creati}

    def crea_mercato_custom(self, titolo, esiti, giornata=None):
        if not titolo or not esiti or len(esiti) < 2:
            return {'errore': 'servono un titolo e almeno 2 esiti possibili'}
        chiavi = set()
        esiti_norm = []
        for e in esiti:
            label = (e.get('label') or '').strip()
            quota = e.get('quota')
            if not label or not quota or float(quota) <= 1.0:
                return {'errore': f'esito non valido: {e} (serve una label e una quota decimale > 1.0)'}
            chiave = e.get('chiave') or label
            if chiave in chiavi:
                return {'errore': f'chiave duplicata: {chiave}'}
            chiavi.add(chiave)
            esiti_norm.append({'chiave': chiave, 'label': label, 'quota': round(float(quota), 2)})
        mercato = {
            'id': self._nuovo_id_mercato(),
            'incontro_id': None,
            'tipo': 'custom',
            'titolo': titolo,
            'giornata': giornata, 'squadra_a': None, 'squadra_b': None, 'linea': None,
            'esiti': esiti_norm,
            'stato': 'aperto', 'esito_vincente': None,
            'creato_il': now_str(), 'risolto_il': None,
        }
        self.state['mercati'].append(mercato)
        self._log(f"Creata scommessa libera: {titolo}")
        self.save()
        return {'ok': True, 'mercato': mercato}

    def _trova_mercato(self, mercato_id):
        for m in self.state['mercati']:
            if m['id'] == mercato_id:
                return m
        return None

    def chiudi_mercato(self, mercato_id, chiuso=True):
        m = self._trova_mercato(mercato_id)
        if not m:
            return {'errore': 'mercato non trovato'}
        if m['stato'] == 'risolto':
            return {'errore': 'mercato gia\' risolto, non puoi cambiarne lo stato'}
        m['stato'] = 'chiuso' if chiuso else 'aperto'
        self.save()
        return {'ok': True, 'mercato': m}

    def elimina_mercato(self, mercato_id):
        m = self._trova_mercato(mercato_id)
        if not m:
            return {'errore': 'mercato non trovato'}
        scommesse_collegate = [s for s in self.state['scommesse'] if s['mercato_id'] == mercato_id]
        if scommesse_collegate:
            return {'errore': 'ci sono gia\' scommesse piazzate su questo mercato, non puoi eliminarlo (chiudilo o risolvilo)'}
        self.state['mercati'] = [x for x in self.state['mercati'] if x['id'] != mercato_id]
        self.save()
        return {'ok': True}

    def _settle_mercato(self, mercato, esito_vincente):
        if mercato['stato'] == 'risolto':
            return
        chiavi_valide = {e['chiave'] for e in mercato['esiti']}
        if esito_vincente not in chiavi_valide:
            return
        mercato['stato'] = 'risolto'
        mercato['esito_vincente'] = esito_vincente
        mercato['risolto_il'] = now_str()
        for s in self.state['scommesse']:
            if s['mercato_id'] != mercato['id'] or s['stato'] != 'in_corso':
                continue
            if s['esito'] == esito_vincente:
                vincita = round(s['importo'] * s['quota'], 2)
                s['stato'] = 'vinta'
                s['vincita'] = vincita
                self.state['saldi'][s['squadra']] = round(self.state['saldi'].get(s['squadra'], 0) + vincita, 2)
            else:
                s['stato'] = 'persa'
                s['vincita'] = 0
        self._log(f"Risolto mercato #{mercato['id']} ({mercato['titolo']}): vince '{esito_vincente}'")

    def risolvi_mercato_manuale(self, mercato_id, esito_vincente):
        m = self._trova_mercato(mercato_id)
        if not m:
            return {'errore': 'mercato non trovato'}
        if m['stato'] == 'risolto':
            return {'errore': 'mercato gia\' risolto'}
        chiavi_valide = {e['chiave'] for e in m['esiti']}
        if esito_vincente not in chiavi_valide:
            return {'errore': f'esito non valido, valori possibili: {sorted(chiavi_valide)}'}
        self._settle_mercato(m, esito_vincente)
        self.save()
        return {'ok': True, 'mercato': m}

    def auto_settle(self, giornata):
        risolti = []
        for m in self.state['mercati']:
            if m['stato'] == 'risolto' or m['giornata'] != giornata or m['tipo'] not in ('1x2', 'over_under'):
                continue
            punti_a = self.punti_giornata(m['squadra_a'], giornata)
            punti_b = self.punti_giornata(m['squadra_b'], giornata)
            if punti_a is None or punti_b is None:
                continue
            formula = self.config['formula_gol']
            gol_a = punti_a_gol(punti_a, formula)
            gol_b = punti_a_gol(punti_b, formula)
            if m['tipo'] == '1x2':
                esito = '1' if gol_a > gol_b else ('X' if gol_a == gol_b else '2')
            else:
                esito = 'Over' if (gol_a + gol_b) > m['linea'] else 'Under'
            self._settle_mercato(m, esito)
            risolti.append({'mercato_id': m['id'], 'titolo': m['titolo'], 'esito_vincente': esito,
                             'gol_a': gol_a, 'gol_b': gol_b})
        return risolti

    # -- scommesse ---------------------------------------------------------

    def piazza_scommessa(self, squadra, mercato_id, esito, importo):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        m = self._trova_mercato(mercato_id)
        if not m:
            return {'errore': 'mercato non trovato'}
        if m['stato'] != 'aperto':
            return {'errore': 'le scommesse su questo mercato sono chiuse'}
        try:
            importo = round(float(importo), 2)
        except (TypeError, ValueError):
            return {'errore': 'importo non valido'}
        if importo <= 0:
            return {'errore': 'importo deve essere positivo'}
        esito_info = next((e for e in m['esiti'] if e['chiave'] == esito), None)
        if not esito_info:
            return {'errore': f'esito non valido, scegli tra: {[e["chiave"] for e in m["esiti"]]}'}
        saldo = self.state['saldi'].get(squadra, 0)
        if importo > saldo:
            return {'errore': f'fantamilioni insufficienti (saldo attuale: {saldo})'}
        self.state['saldi'][squadra] = round(saldo - importo, 2)
        scommessa = {
            'id': self._nuovo_id_scommessa(),
            'mercato_id': mercato_id,
            'squadra': squadra,
            'esito': esito,
            'importo': importo,
            'quota': esito_info['quota'],
            'stato': 'in_corso',
            'vincita': None,
            'piazzata_il': now_str(),
        }
        self.state['scommesse'].append(scommessa)
        self._log(f"{squadra} punta {importo} FM su '{esito_info['label']}' (mercato #{mercato_id}, quota {esito_info['quota']})")
        self.save()
        return {'ok': True, 'scommessa': scommessa, 'saldo': self.state['saldi'][squadra]}

    def classifica(self):
        righe = [{'squadra': sq, 'saldo': self.state['saldi'].get(sq, 0)} for sq in self.squadre()]
        righe.sort(key=lambda r: -r['saldo'])
        return righe

    # -- amministrazione ---------------------------------------------------

    def rinomina_squadre(self, nuove_squadre, rename_map):
        if len(nuove_squadre) != len(self.squadre()):
            return {'errore': f'il numero di squadre non puo\' cambiare (deve restare {len(self.squadre())})'}
        nuovi_saldi = {}
        nuovo_storico = {}
        nuove_proiezioni = {}
        for vecchio, saldo in self.state['saldi'].items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuovi_saldi[nuovo_nome] = saldo
        for vecchio, storico in self.state['storico_punti'].items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuovo_storico[nuovo_nome] = storico
        for vecchio, proiezioni in self.state.get('proiezioni', {}).items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuove_proiezioni[nuovo_nome] = proiezioni
        for m in self.state['mercati']:
            if m.get('squadra_a') in rename_map:
                m['squadra_a'] = rename_map[m['squadra_a']]
            if m.get('squadra_b') in rename_map:
                m['squadra_b'] = rename_map[m['squadra_b']]
        for s in self.state['scommesse']:
            if s.get('squadra') in rename_map:
                s['squadra'] = rename_map[s['squadra']]
        self.state['saldi'] = nuovi_saldi
        self.state['storico_punti'] = nuovo_storico
        self.state['proiezioni'] = nuove_proiezioni
        self.config['lega']['squadre'] = nuove_squadre
        save_json_atomic(CONFIG_PATH, self.config)
        self._log(f"Squadre rinominate: {rename_map}")
        self.save()
        return {'ok': True, 'squadre': nuove_squadre}

    def correggi_saldo(self, squadra, delta, motivo):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        try:
            delta = float(delta)
        except (TypeError, ValueError):
            return {'errore': 'delta non valido'}
        self.state['saldi'][squadra] = round(self.state['saldi'].get(squadra, 0) + delta, 2)
        self._log(f"Correzione saldo {squadra}: {delta:+.2f} FM ({motivo or 'nessun motivo indicato'})")
        self.save()
        return {'ok': True, 'saldo': self.state['saldi'][squadra]}

    def cambia_password_admin(self, nuova_password):
        if not nuova_password or len(nuova_password) < 4:
            return {'errore': 'password troppo corta (minimo 4 caratteri)'}
        self.config['admin']['password'] = nuova_password
        save_json_atomic(CONFIG_PATH, self.config)
        return {'ok': True}


STORE = Store()


class Handler(BaseHTTPRequestHandler):
    server_version = "Gottabet/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            with open(path, 'rb') as f:
                body = f.read()
        except FileNotFoundError:
            self._send_json({'error': 'not found'}, 404)
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if not length:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == '/' or path == '/index.html':
            self._send_file(os.path.join(STATIC_DIR, 'index.html'), 'text/html; charset=utf-8')
            return
        if path.startswith('/static/'):
            rel = path[len('/static/'):]
            full = os.path.join(STATIC_DIR, rel)
            ext = os.path.splitext(full)[1]
            ctype = {'.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                     '.png': 'image/png', '.svg': 'image/svg+xml'}.get(ext, 'application/octet-stream')
            self._send_file(full, ctype)
            return

        with LOCK:
            if path == '/api/state':
                squadra = (qs.get('squadra') or [None])[0]
                mie_scommesse = [s for s in STORE.state['scommesse'] if s['squadra'] == squadra] if squadra else []
                self._send_json({
                    'lega': STORE.config['lega']['nome'],
                    'squadre': STORE.squadre(),
                    'saldi': STORE.state['saldi'],
                    'mia_squadra': squadra,
                    'mio_saldo': STORE.state['saldi'].get(squadra) if squadra else None,
                    'mie_scommesse': mie_scommesse,
                    'mercati': STORE.state['mercati'],
                    'classifica': STORE.classifica(),
                })
                return
            if path == '/api/mercati':
                self._send_json(STORE.state['mercati'])
                return
            if path == '/api/classifica':
                self._send_json(STORE.classifica())
                return
            if path == '/api/log':
                self._send_json(STORE.state.get('log', [])[-100:])
                return
            if path == '/api/export':
                self._send_json({'state': STORE.state, 'config': STORE.config, 'exported_at': now_str()})
                return
            if path == '/api/admin/anteprima-h2h':
                if not STORE.check_admin((qs.get('admin_password') or [''])[0]):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return
                squadra_a = (qs.get('squadra_a') or [None])[0]
                squadra_b = (qs.get('squadra_b') or [None])[0]
                giornata = int((qs.get('giornata') or ['0'])[0])
                if squadra_a not in STORE.squadre() or squadra_b not in STORE.squadre():
                    self._send_json({'errore': 'squadra non valida'}, 400)
                    return
                self._send_json(STORE.anteprima_h2h(squadra_a, squadra_b, giornata))
                return

        self._send_json({'error': 'not found', 'path': path}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self._read_json_body()
        except Exception as e:
            self._send_json({'error': f'json non valido: {e}'}, 400)
            return

        with LOCK:
            if path == '/api/scommessa':
                risultato = STORE.piazza_scommessa(
                    body.get('squadra'), body.get('mercato_id'), body.get('esito'), body.get('importo'))
                self._send_json(risultato, 200 if risultato.get('ok') else 400)
                return

            if path.startswith('/api/admin/'):
                if not STORE.check_admin(body.get('admin_password')):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return

                if path == '/api/admin/anteprima-import-punti':
                    self._send_json({'righe': STORE.anteprima_import_punti(body.get('testo', ''))})
                    return
                if path == '/api/admin/importa-punti':
                    r = STORE.importa_punti(body.get('giornata'), body.get('testo', ''))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/anteprima-import-proiezioni':
                    self._send_json({'righe': STORE.anteprima_import_proiezioni(body.get('testo', ''))})
                    return
                if path == '/api/admin/importa-proiezioni':
                    r = STORE.importa_proiezioni(body.get('giornata'), body.get('testo', ''))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/crea-mercato-h2h':
                    r = STORE.crea_mercato_h2h(body.get('squadra_a'), body.get('squadra_b'), body.get('giornata'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/crea-mercato-custom':
                    r = STORE.crea_mercato_custom(body.get('titolo'), body.get('esiti', []), body.get('giornata'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/chiudi-mercato':
                    r = STORE.chiudi_mercato(body.get('mercato_id'), chiuso=True)
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/riapri-mercato':
                    r = STORE.chiudi_mercato(body.get('mercato_id'), chiuso=False)
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/elimina-mercato':
                    r = STORE.elimina_mercato(body.get('mercato_id'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/risolvi-mercato':
                    r = STORE.risolvi_mercato_manuale(body.get('mercato_id'), body.get('esito_vincente'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/rinomina-squadre':
                    r = STORE.rinomina_squadre(body.get('squadre', []), body.get('rename_map', {}))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/correggi-saldo':
                    r = STORE.correggi_saldo(body.get('squadra'), body.get('delta'), body.get('motivo'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/cambia-password':
                    r = STORE.cambia_password_admin(body.get('nuova_password'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/verifica-password':
                    self._send_json({'ok': True})
                    return

        self._send_json({'error': 'not found', 'path': path}, 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8765))
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f"Gottabet in ascolto su http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
