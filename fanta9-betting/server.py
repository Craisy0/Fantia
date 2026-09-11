"""
Gottabet - Scommesse tra amici della lega GOTTA
Solo libreria standard, a eccezione di pywebpush (notifiche push del browser: serve per la
crittografia VAPID/aes128gcm che Python di base non ha) - vedi requirements.txt.

Avvio:  python server.py [porta]   (default porta 8765, o $PORT se impostata dall'hosting)
"""
import hashlib
import json
import math
import os
import random
import re
import secrets
import sys
import time
import unicodedata
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from pywebpush import webpush, WebPushException

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
STATIC_DIR = os.path.join(APP_DIR, "static")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
CALENDARIO_PATH = os.path.join(DATA_DIR, "calendario.json")
ROSE_GOTTA_PATH = os.path.join(DATA_DIR, "rose_gotta.json")
TITOLARI_REALI_PATH = os.path.join(DATA_DIR, "titolari_reali.json")
CALENDARIO_SERIE_A_PATH = os.path.join(DATA_DIR, "calendario_serie_a.json")
STATS_SERIE_A_PATH = os.path.join(DATA_DIR, "stats_serie_a.json")

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


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 100_000)
    return salt, digest.hex()


def verifica_password_hash(password, salt, hash_atteso):
    _, digest = hash_password(password, salt)
    return secrets.compare_digest(digest, hash_atteso)


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


def lambda_da_proiezione(punti_proiettati, formula, lambda_default):
    """Stima il lambda di Poisson pre-partita direttamente dai punti fantacalcio proiettati
    (FantaLab), come rapporto rispetto alla soglia ufficiale dei 'gol equivalenti' (66 punti = 1 gol,
    quindi lambda_default). A differenza della conversione 'a gol' usata per liquidare le scommesse
    reali, qui NON si passa dal gradino/soglia: altrimenti, con poche giornate di dati, quasi tutte le
    proiezioni finiscono sotto soglia e collassano tutte sullo stesso lambda minimo, rendendo le quote
    quasi identiche. Il rapporto diretto sui punti mantiene invece la differenza di forza reale tra le
    squadre anche quando nessuna delle due proietta 66+ punti."""
    if punti_proiettati is None:
        return None
    soglia = formula['soglia']
    return max(lambda_default * (punti_proiettati / soglia), 0.15)


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


def stima_probabilita_pareggio(lam_a, lam_b, base, decadimento):
    """Il pareggio sui 'gol equivalenti' non e' affidabile calcolato dal Poisson grezzo: la
    conversione punti->gol raggruppa punteggi fantacalcio diversi nello stesso numero di gol
    (es. 50 e 61 punti fanno entrambi 0 gol), gonfiando artificialmente la probabilita' di
    pareggio quando le medie sono entrambe basse. Stimiamo invece il pareggio direttamente
    dalla differenza di forza tra le due squadre: piu' sono vicine, piu' e' plausibile un
    pareggio (fino a 'base', un incontro perfettamente equilibrato), e decade man mano che
    una delle due e' nettamente piu' forte."""
    return base * math.exp(-decadimento * abs(lam_a - lam_b))


def combina_pareggio(p1_raw, p2_raw, px):
    """Fissata la probabilita' di pareggio, ridistribuisce il resto tra 1 e 2 mantenendo le
    proporzioni relative del modello di Poisson (chi ha lambda piu' alto resta piu' favorito)."""
    somma_12 = p1_raw + p2_raw
    if somma_12 <= 0:
        meta = (1.0 - px) / 2
        return meta, px, meta
    resto = 1.0 - px
    return resto * (p1_raw / somma_12), px, resto * (p2_raw / somma_12)


def quota_da_probabilita(p, margine, soglia_tassa=None, quota_massima=None, tassa_scala=None):
    """Converte una probabilita' in quota. Sopra 'soglia_tassa' (partite molto sbilanciate)
    comprime la quota verso 'quota_massima' con una funzione asintotica: piu' lo scarto tra le
    squadre e' grande, piu' la 'tassa' e' aggressiva, ma la quota resta sempre sotto quota_massima
    invece di crescere linearmente (es. 8.00, 17.00...) come farebbe il Poisson puro. 'tassa_scala'
    regola quanto in fretta la curva si avvicina al tetto (piu' alto = compressione piu' graduale)."""
    p = max(p, 0.005)
    quota = (1.0 / p) / margine
    quota = max(quota, 1.01)
    if soglia_tassa is not None and quota_massima is not None and quota > soglia_tassa:
        ampiezza = quota_massima - soglia_tassa
        scala = tassa_scala or ampiezza
        eccesso = quota - soglia_tassa
        quota = soglia_tassa + ampiezza * (1 - math.exp(-eccesso / scala))
    return round(quota, 2)


class Store:
    """Tiene config + stato in memoria, la fonte di verita' sono i file JSON su disco."""

    def __init__(self):
        self.reload_config()
        self.state = load_json(STATE_PATH)
        self._assicura_squadre()

    def reload_config(self):
        self.config = load_json(CONFIG_PATH)
        self.calendario = load_json(CALENDARIO_PATH) if os.path.exists(CALENDARIO_PATH) else {}
        # dati statici per il modello a livello giocatore del mercato "Vincitore girone d'andata"
        self.rose_gotta = load_json(ROSE_GOTTA_PATH) if os.path.exists(ROSE_GOTTA_PATH) else {}
        self.titolari_reali = load_json(TITOLARI_REALI_PATH) if os.path.exists(TITOLARI_REALI_PATH) else {}
        self.calendario_serie_a = load_json(CALENDARIO_SERIE_A_PATH) if os.path.exists(CALENDARIO_SERIE_A_PATH) else {}
        self.stats_serie_a = load_json(STATS_SERIE_A_PATH) if os.path.exists(STATS_SERIE_A_PATH) else {}
        self._prepara_modello_giocatori()

    def _prepara_modello_giocatori(self):
        """Indici derivati dai dati statici (titolare -> club/ruolo reale, medie di lega) usati dal
        modello a livello giocatore. Ricalcolati a ogni reload_config, non a ogni chiamata."""
        self._titolare_index = {}
        for club, dati in self.titolari_reali.items():
            if club.startswith('_'):
                continue
            for p in dati.get('titolari', []):
                self._titolare_index[p['nome']] = (club, p['ruolo'])
        club_stats = {k: v for k, v in self.stats_serie_a.items() if not k.startswith('_')}
        partite_tot = sum(v['partite_giocate'] for v in club_stats.values()) or 1
        self._media_lega_fatti_pp = sum(v['gol_fatti'] for v in club_stats.values()) / partite_tot
        self._media_lega_subiti_pp = sum(v['gol_subiti'] for v in club_stats.values()) / partite_tot

    def save(self):
        save_json_atomic(STATE_PATH, self.state)

    def _assicura_squadre(self):
        """Se config.json ha squadre nuove/rimosse rispetto allo stato, sincronizza saldi/storico."""
        squadre = self.config['lega']['squadre']
        saldo_iniziale = self.config['lega']['saldo_iniziale']
        self.state.setdefault('schedine', [])
        self.state.setdefault('prossimo_id_schedina', 1)
        self.state.setdefault('auth', {})
        self.state.setdefault('sessioni', {})
        self.state.setdefault('push_subscriptions', {})
        for sq in squadre:
            self.state['saldi'].setdefault(sq, saldo_iniziale)
            self.state['storico_punti'].setdefault(sq, [])
            self.state.setdefault('proiezioni', {}).setdefault(sq, [])
            self.state['push_subscriptions'].setdefault(sq, [])

    def _log(self, testo):
        self.state.setdefault('log', []).append({'ts': now_str(), 'testo': testo})

    def squadre(self):
        return list(self.config['lega']['squadre'])

    def check_admin(self, password):
        return password and password == self.config['admin']['password']

    # -- accessi squadre (password personale, impostata al primo accesso) --

    def squadre_registrate(self):
        auth = self.state.get('auth', {})
        return {sq: (sq in auth) for sq in self.squadre()}

    def login(self, squadra, password):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        if not password or len(password) < 4:
            return {'errore': 'la password deve avere almeno 4 caratteri'}
        auth = self.state.setdefault('auth', {})
        voce = auth.get(squadra)
        primo_accesso = voce is None
        if primo_accesso:
            salt, hash_ = hash_password(password)
            auth[squadra] = {'salt': salt, 'hash': hash_}
            self._log(f"{squadra} ha impostato la password al primo accesso")
        elif not verifica_password_hash(password, voce['salt'], voce['hash']):
            return {'errore': 'password errata'}
        token = secrets.token_hex(24)
        self.state.setdefault('sessioni', {})[token] = {'squadra': squadra, 'creata_il': now_str()}
        self.save()
        return {'ok': True, 'token': token, 'primo_accesso': primo_accesso, 'squadra': squadra}

    def logout(self, token):
        sessioni = self.state.get('sessioni', {})
        if token in sessioni:
            del sessioni[token]
            self.save()
        return {'ok': True}

    def squadra_da_token(self, token):
        if not token:
            return None
        sessione = self.state.get('sessioni', {}).get(token)
        return sessione['squadra'] if sessione else None

    def reset_password_squadra(self, squadra):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        auth = self.state.setdefault('auth', {})
        if squadra not in auth:
            return {'errore': f'{squadra} non ha ancora impostato una password'}
        del auth[squadra]
        self.state['sessioni'] = {t: s for t, s in self.state.get('sessioni', {}).items() if s['squadra'] != squadra}
        self._log(f"Admin ha resettato l'accesso di {squadra}: al prossimo accesso potra' impostarne una nuova")
        self.save()
        return {'ok': True}

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
        giornata_fine_andata = self.config.get('girone_andata', {}).get('giornata_fine')
        girone_andata_aggiornato = None
        if giornata_fine_andata and giornata <= giornata_fine_andata:
            girone_andata_aggiornato = self.aggiorna_quote_girone_andata()
        self.save()
        return {'ok': True, 'importati': risultati, 'mercati_risolti': risolti,
                'girone_andata_aggiornato': girone_andata_aggiornato}

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
            lambda_default = self.config['quote']['lambda_default']
            return lambda_da_proiezione(proiezione, formula, lambda_default), 'proiezione_fantalab'
        lam_storico = self.stima_lambda_storico(squadra, escludi_giornata=giornata)
        if lam_storico is not None:
            return lam_storico, 'media_storica'
        return self.config['quote']['lambda_default'], 'default'

    def anteprima_h2h(self, squadra_a, squadra_b, giornata):
        lam_a, fonte_a = self.stima_lambda_con_fonte(squadra_a, giornata)
        lam_b, fonte_b = self.stima_lambda_con_fonte(squadra_b, giornata)
        margine = self.config['quote']['margine_bookmaker']
        max_gol = self.config['quote']['max_gol_simulati']
        p1_raw, _, p2_raw = calcola_probabilita_1x2(lam_a, lam_b, max_gol)
        px = stima_probabilita_pareggio(lam_a, lam_b, self.config['quote']['pareggio_base'],
                                         self.config['quote']['pareggio_decadimento'])
        p1, px, p2 = combina_pareggio(p1_raw, p2_raw, px)
        soglia_tassa = self.config['quote'].get('quota_soglia_tassa')
        quota_massima = self.config['quote'].get('quota_massima')
        tassa_scala = self.config['quote'].get('quota_tassa_scala')
        return {
            'squadra_a': squadra_a, 'squadra_b': squadra_b, 'giornata': giornata,
            'lambda_a': round(lam_a, 2), 'lambda_b': round(lam_b, 2),
            'fonte_a': fonte_a, 'fonte_b': fonte_b,
            '1x2': {
                'quota_1': quota_da_probabilita(p1, margine, soglia_tassa, quota_massima, tassa_scala),
                'quota_x': quota_da_probabilita(px, margine, soglia_tassa, quota_massima, tassa_scala),
                'quota_2': quota_da_probabilita(p2, margine, soglia_tassa, quota_massima, tassa_scala),
            },
        }

    # -- mercati ---------------------------------------------------------

    def _nuovo_id_mercato(self):
        i = self.state['prossimo_id_mercato']
        self.state['prossimo_id_mercato'] = i + 1
        return i

    def crea_mercato_h2h(self, squadra_a, squadra_b, giornata):
        if squadra_a not in self.squadre() or squadra_b not in self.squadre():
            return {'errore': 'squadra non valida'}
        if squadra_a == squadra_b:
            return {'errore': 'le due squadre devono essere diverse'}
        anteprima = self.anteprima_h2h(squadra_a, squadra_b, giornata)
        incontro_id = f"g{giornata}-{normalize(squadra_a)}-vs-{normalize(squadra_b)}-{int(time.time())}"

        mercato = {
            'id': self._nuovo_id_mercato(),
            'incontro_id': incontro_id,
            'tipo': '1x2',
            'titolo': f"{squadra_a} vs {squadra_b}",
            'giornata': giornata, 'squadra_a': squadra_a, 'squadra_b': squadra_b, 'linea': None,
            'esiti': [
                {'chiave': '1', 'label': f'Vince {squadra_a}', 'quota': anteprima['1x2']['quota_1']},
                {'chiave': 'X', 'label': 'Pareggio', 'quota': anteprima['1x2']['quota_x']},
                {'chiave': '2', 'label': f'Vince {squadra_b}', 'quota': anteprima['1x2']['quota_2']},
            ],
            'stato': 'aperto', 'esito_vincente': None,
            'creato_il': now_str(), 'risolto_il': None,
        }
        self.state['mercati'].append(mercato)
        self._log(f"Creato incontro {squadra_a} vs {squadra_b} (giornata {giornata})")
        self.save()
        return {'ok': True, 'mercati': [mercato]}

    def pubblica_giornata(self, giornata):
        """Crea in automatico i mercati 1X2 di tutti gli incontri di una giornata gia' fissati
        dal calendario ufficiale (data/calendario.json), saltando quelli gia' pubblicati."""
        incontri = self.calendario.get(str(giornata))
        if not incontri:
            return {'errore': f'nessun incontro nel calendario per la giornata {giornata}'}
        creati = []
        saltati = []
        for incontro in incontri:
            squadra_a, squadra_b = incontro['a'], incontro['b']
            gia_esistente = any(
                m['giornata'] == giornata and m['tipo'] == '1x2'
                and {m.get('squadra_a'), m.get('squadra_b')} == {squadra_a, squadra_b}
                for m in self.state['mercati']
            )
            if gia_esistente:
                saltati.append(f"{squadra_a} vs {squadra_b}")
                continue
            r = self.crea_mercato_h2h(squadra_a, squadra_b, giornata)
            if r.get('ok'):
                creati.extend(r['mercati'])
        return {'ok': True, 'mercati_creati': creati, 'incontri_saltati_gia_esistenti': saltati}

    # -- vincitore girone d'andata (mercato "outright" a N vie, calcolato via simulazione) --

    def _probabilita_1x2(self, squadra_a, squadra_b, giornata):
        lam_a, _ = self.stima_lambda_con_fonte(squadra_a, giornata)
        lam_b, _ = self.stima_lambda_con_fonte(squadra_b, giornata)
        max_gol = self.config['quote']['max_gol_simulati']
        p1_raw, _, p2_raw = calcola_probabilita_1x2(lam_a, lam_b, max_gol)
        px = stima_probabilita_pareggio(lam_a, lam_b, self.config['quote']['pareggio_base'],
                                         self.config['quote']['pareggio_decadimento'])
        return combina_pareggio(p1_raw, p2_raw, px)

    # -- modello a livello giocatore (solo per il girone d'andata): forza squadra giornata =
    # somma quotazione_mantra * fattore_avversario dei migliori 11 titolari reali statici --

    def _gol_pp_squadra_reale(self, club, chiave):
        v = self.stats_serie_a.get(club)
        if not v:
            return None
        return max(v[chiave] / max(v['partite_giocate'], 1), 0.2)

    def _fattore_avversario_giocatore(self, ruolo, avversario):
        """ruolo P/D -> beneficia di un avversario che segna poco; ruolo A -> beneficia di un
        avversario che subisce molto; ruolo C -> media dei due. Smorzato verso 1.0 (nessun
        vantaggio/svantaggio) in base a quante partite reali ha giocato l'avversario: con pochi
        dati il fattore grezzo e' rumoroso, quindi pesa meno finche' il campione e' piccolo."""
        gol_subiti_pp = self._gol_pp_squadra_reale(avversario, 'gol_subiti')
        gol_fatti_pp = self._gol_pp_squadra_reale(avversario, 'gol_fatti')
        if gol_subiti_pp is None or gol_fatti_pp is None:
            return 1.0
        f_att = self._media_lega_subiti_pp / gol_subiti_pp
        f_dif = self._media_lega_fatti_pp / gol_fatti_pp
        costante_smorzamento = self.config.get('girone_andata', {}).get('smorzamento_partite', 5)
        partite = self.stats_serie_a.get(avversario, {}).get('partite_giocate', 0)
        peso = partite / (partite + costante_smorzamento) if costante_smorzamento else 1.0
        f_att = 1.0 + (f_att - 1.0) * peso
        f_dif = 1.0 + (f_dif - 1.0) * peso
        if ruolo == 'A':
            return f_att
        if ruolo in ('P', 'D'):
            return f_dif
        return (f_att + f_dif) / 2  # C

    def _avversario_reale(self, club, giornata_serie_a):
        for m in self.calendario_serie_a.get(str(giornata_serie_a), []):
            if m['casa'] == club:
                return m['trasferta']
            if m['trasferta'] == club:
                return m['casa']
        return None

    def punti_proiettati_giocatori(self, squadra_gotta, giornata):
        """Miglior 11 (1 portiere migliore + 10 di movimento migliori) tra i giocatori della rosa
        che sono titolari reali (statico) nel proprio club quella giornata, pesati per la
        difficolta' del loro avversario reale. Ritorna None se manca un dato indispensabile
        (calendario Serie A o rosa non disponibili per quella giornata/squadra)."""
        giornata_serie_a = giornata + 3  # GOTTA parte dalla 4a giornata di Serie A
        if str(giornata_serie_a) not in self.calendario_serie_a:
            return None
        rosa = self.rose_gotta.get(squadra_gotta)
        if not rosa:
            return None
        candidati = []
        for giocatore in rosa:
            nome = giocatore['nome']
            info = self._titolare_index.get(nome)
            if not info:
                continue
            club, ruolo = info
            if club != giocatore['club']:
                continue  # incongruenza rosa/club reale, salta per sicurezza
            avversario = self._avversario_reale(club, giornata_serie_a)
            if avversario is None:
                continue
            fattore = self._fattore_avversario_giocatore(ruolo, avversario)
            candidati.append({'ruolo': ruolo, 'punteggio': giocatore['quotazione_mantra'] * fattore})
        if not candidati:
            return None
        portieri = sorted((c for c in candidati if c['ruolo'] == 'P'), key=lambda c: -c['punteggio'])
        movimento = sorted((c for c in candidati if c['ruolo'] != 'P'), key=lambda c: -c['punteggio'])
        undici = ([portieri[0]] + movimento[:10]) if portieri else sorted(candidati, key=lambda c: -c['punteggio'])[:11]
        return sum(c['punteggio'] for c in undici)

    def stima_lambda_giocatori(self, squadra, giornata):
        punti = self.punti_proiettati_giocatori(squadra, giornata)
        if punti is None:
            return self.config['quote']['lambda_default'], 'default'
        formula = self.config['formula_gol']
        lambda_default = self.config['quote']['lambda_default']
        return lambda_da_proiezione(punti, formula, lambda_default), 'modello_giocatori'

    def _probabilita_1x2_girone_andata(self, squadra_a, squadra_b, giornata):
        """Come _probabilita_1x2, ma usa il modello a livello giocatore (formazioni titolari reali
        statiche + calendario reale + forza da listone) invece della proiezione FantaLab/media
        storica/default: solo per questo mercato, le partite settimanali 1X2 restano invariate."""
        lam_a, _ = self.stima_lambda_giocatori(squadra_a, giornata)
        lam_b, _ = self.stima_lambda_giocatori(squadra_b, giornata)
        max_gol = self.config['quote']['max_gol_simulati']
        p1_raw, _, p2_raw = calcola_probabilita_1x2(lam_a, lam_b, max_gol)
        px = stima_probabilita_pareggio(lam_a, lam_b, self.config['quote']['pareggio_base'],
                                         self.config['quote']['pareggio_decadimento'])
        return combina_pareggio(p1_raw, p2_raw, px)

    def simula_vincitore_girone_andata(self, n_simulazioni=None):
        """Simulazione Monte Carlo del vincitore del girone d'andata (classifica a punti stile
        campionato: 3/1/0 a partita). Le giornate gia' giocate contano con il risultato reale
        (fisso in ogni simulazione); quelle non ancora giocate vengono estratte a ogni run dalle
        stesse probabilita' 1X2 usate per le quote delle singole partite. In caso di parita' a fine
        girone il "credito" di vittoria viene diviso tra le squadre appaiate."""
        cfg = self.config.get('girone_andata', {})
        giornata_fine = cfg.get('giornata_fine')
        if not giornata_fine:
            return {'errore': "giornata_fine del girone d'andata non configurata "
                               "(config['girone_andata']['giornata_fine'])"}
        n_simulazioni = int(n_simulazioni or cfg.get('n_simulazioni', 20000))
        if n_simulazioni < 100:
            return {'errore': 'n_simulazioni troppo basso (minimo 100)'}

        formula = self.config['formula_gol']
        squadre = self.squadre()
        punti_base = {sq: 0 for sq in squadre}
        partite_da_simulare = []  # (squadra_a, squadra_b, p1, px, p2)

        for g in range(1, giornata_fine + 1):
            incontri = self.calendario.get(str(g))
            if not incontri:
                return {'errore': f"calendario incompleto: manca la giornata {g} "
                                   f"(il girone d'andata arriva alla {giornata_fine})"}
            for incontro in incontri:
                a, b = incontro['a'], incontro['b']
                punti_a = self.punti_giornata(a, g)
                punti_b = self.punti_giornata(b, g)
                if punti_a is not None and punti_b is not None:
                    gol_a = punti_a_gol(punti_a, formula)
                    gol_b = punti_a_gol(punti_b, formula)
                    if gol_a > gol_b:
                        punti_base[a] += 3
                    elif gol_a == gol_b:
                        punti_base[a] += 1
                        punti_base[b] += 1
                    else:
                        punti_base[b] += 3
                else:
                    p1, px, p2 = self._probabilita_1x2_girone_andata(a, b, g)
                    partite_da_simulare.append((a, b, p1, px, p2))

        vittorie = {sq: 0.0 for sq in squadre}
        for _ in range(n_simulazioni):
            punti = dict(punti_base)
            for a, b, p1, px, p2 in partite_da_simulare:
                r = random.random()
                if r < p1:
                    punti[a] += 3
                elif r < p1 + px:
                    punti[a] += 1
                    punti[b] += 1
                else:
                    punti[b] += 3
            massimo = max(punti.values())
            vincitori = [sq for sq, p in punti.items() if p == massimo]
            credito = 1.0 / len(vincitori)
            for sq in vincitori:
                vittorie[sq] += credito

        margine = self.config['quote']['margine_bookmaker']
        # tassa/tetto dedicati al girone d'andata (mercato a 10 vie, favorite piu' nette delle
        # singole partite): usano i valori sotto girone_andata, con fallback su quelli generali.
        soglia_tassa = cfg.get('quota_soglia_tassa', self.config['quote'].get('quota_soglia_tassa'))
        quota_massima = cfg.get('quota_massima', self.config['quote'].get('quota_massima'))
        tassa_scala = cfg.get('quota_tassa_scala', self.config['quote'].get('quota_tassa_scala'))

        quote = []
        for sq in squadre:
            probabilita = vittorie[sq] / n_simulazioni
            quote.append({
                'squadra': sq,
                'probabilita': round(probabilita, 4),
                'quota': quota_da_probabilita(probabilita, margine, soglia_tassa, quota_massima, tassa_scala),
            })
        quote.sort(key=lambda r: r['quota'])
        return {'ok': True, 'giornata_fine': giornata_fine, 'n_simulazioni': n_simulazioni,
                'partite_gia_giocate': len(partite_da_simulare) == 0,
                'partite_da_giocare': len(partite_da_simulare), 'quote': quote}

    def mercato_girone_andata_aperto(self):
        return next((m for m in self.state['mercati']
                     if m.get('tipo') == 'girone_andata' and m['stato'] == 'aperto'), None)

    def pubblica_girone_andata(self, n_simulazioni=None):
        if self.mercato_girone_andata_aperto():
            return {'errore': "esiste gia' un mercato aperto per il vincitore del girone d'andata "
                               "(chiudilo o risolvilo prima di pubblicarne uno nuovo)"}
        r = self.simula_vincitore_girone_andata(n_simulazioni)
        if not r.get('ok'):
            return r
        esiti = [{'chiave': q['squadra'], 'label': f"Vince {q['squadra']}", 'quota': q['quota']}
                 for q in r['quote']]
        # giornata=None: e' una scommessa "libera" a se stante, non lega/consuma lo slot
        # settimanale di una singola giornata (vedi anche crea_schedina).
        creato = self.crea_mercato_custom("Vincitore girone d'andata", esiti, giornata=None,
                                           tipo='girone_andata')
        if creato.get('ok'):
            creato['simulazione'] = {'giornata_fine': r['giornata_fine'], 'n_simulazioni': r['n_simulazioni'],
                                      'partite_da_giocare': r['partite_da_giocare']}
        return creato

    def aggiorna_quote_girone_andata(self):
        """Ricalcola le quote del mercato 'vincitore girone d'andata' ancora aperto con i dati
        piu' recenti (punteggi/calendario). Aggiorna le quote sul mercato stesso: le schedine gia'
        giocate non ne risentono, perche' ognuna si porta dietro la propria quota congelata al
        momento della giocata."""
        mercato = self.mercato_girone_andata_aperto()
        if not mercato:
            return None
        r = self.simula_vincitore_girone_andata()
        if not r.get('ok'):
            return None
        quote_per_squadra = {q['squadra']: q['quota'] for q in r['quote']}
        for esito in mercato['esiti']:
            if esito['chiave'] in quote_per_squadra:
                esito['quota'] = quote_per_squadra[esito['chiave']]
        self._log(f"Ricalcolate le quote del vincitore girone d'andata (mercato #{mercato['id']})")
        return {'mercato_id': mercato['id'], 'quote': mercato['esiti']}

    def crea_mercato_custom(self, titolo, esiti, giornata=None, tipo='custom'):
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
            'tipo': tipo,
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
        schedine_collegate = [s for s in self.state['schedine']
                               if any(sel['mercato_id'] == mercato_id for sel in s['selezioni'])]
        if schedine_collegate:
            return {'errore': 'ci sono gia\' schedine giocate su questo mercato, non puoi eliminarlo (chiudilo o risolvilo)'}
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

        for sch in self.state['schedine']:
            if sch['stato'] != 'in_corso':
                continue
            if not any(sel['mercato_id'] == mercato['id'] for sel in sch['selezioni']):
                continue
            persa = any(sel['mercato_id'] == mercato['id'] and sel['esito'] != esito_vincente
                        for sel in sch['selezioni'])
            if persa:
                sch['stato'] = 'persa'
                sch['vincita'] = 0
                continue
            tutte_risolte = all(self._trova_mercato(sel['mercato_id'])
                                 and self._trova_mercato(sel['mercato_id'])['stato'] == 'risolto'
                                 for sel in sch['selezioni'])
            if tutte_risolte:
                tetto = self.config['quote'].get('vincita_massima_per_scommessa')
                vincita = math.floor(sch['importo'] * sch['quota_totale'])
                if tetto is not None:
                    vincita = min(vincita, math.floor(tetto))
                sch['stato'] = 'vinta'
                sch['vincita'] = vincita
                self.state['saldi'][sch['squadra']] = round(self.state['saldi'].get(sch['squadra'], 0) + vincita, 2)

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
            if m['stato'] == 'risolto' or m['giornata'] != giornata or m['tipo'] != '1x2':
                continue
            punti_a = self.punti_giornata(m['squadra_a'], giornata)
            punti_b = self.punti_giornata(m['squadra_b'], giornata)
            if punti_a is None or punti_b is None:
                continue
            formula = self.config['formula_gol']
            gol_a = punti_a_gol(punti_a, formula)
            gol_b = punti_a_gol(punti_b, formula)
            esito = '1' if gol_a > gol_b else ('X' if gol_a == gol_b else '2')
            self._settle_mercato(m, esito)
            risolti.append({'mercato_id': m['id'], 'titolo': m['titolo'], 'esito_vincente': esito,
                             'gol_a': gol_a, 'gol_b': gol_b})
        return risolti

    # -- schedina (unica per squadra per giornata, combina piu' esiti come un bookmaker vero) --

    def _nuovo_id_schedina(self):
        i = self.state['prossimo_id_schedina']
        self.state['prossimo_id_schedina'] = i + 1
        return i

    def ha_schedina(self, squadra, giornata):
        return any(s['squadra'] == squadra and s['giornata'] == giornata for s in self.state['schedine'])

    def crea_schedina(self, squadra, giornata, selezioni, importo):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        if not selezioni:
            return {'errore': 'la schedina deve contenere almeno una selezione'}

        mercati_selezionati = [self._trova_mercato(s.get('mercato_id')) for s in selezioni]
        if any(m and m.get('tipo') == 'girone_andata' for m in mercati_selezionati):
            if len(selezioni) != 1:
                return {'errore': "la scommessa sul vincitore del girone d'andata va giocata da sola, "
                                   "non combinata con altre selezioni"}
            mercato_ga = mercati_selezionati[0]
            gia_giocata = any(s['squadra'] == squadra
                               and any(sel['mercato_id'] == mercato_ga['id'] for sel in s['selezioni'])
                               for s in self.state['schedine'])
            if gia_giocata:
                return {'errore': "hai gia' scelto il tuo vincitore del girone d'andata: si puo' "
                                   "giocare un solo vincitore, la scelta resta bloccata"}

        if self.ha_schedina(squadra, giornata):
            return {'errore': f'hai gia\' giocato la tua schedina per la giornata {giornata} (una sola a giornata)'}
        try:
            importo = round(float(importo), 2)
        except (TypeError, ValueError):
            return {'errore': 'importo non valido'}
        if importo <= 0:
            return {'errore': 'importo deve essere positivo'}

        dettaglio = []
        quota_totale = 1.0
        mercati_usati = set()
        for sel in selezioni:
            mercato_id = sel.get('mercato_id')
            esito = sel.get('esito')
            if mercato_id in mercati_usati:
                return {'errore': 'non puoi scegliere due esiti dello stesso mercato nella stessa schedina'}
            m = self._trova_mercato(mercato_id)
            if not m:
                return {'errore': f'mercato #{mercato_id} non trovato'}
            if m['stato'] != 'aperto':
                return {'errore': f'il mercato "{m["titolo"]}" non e\' piu\' aperto'}
            if m['giornata'] != giornata:
                return {'errore': 'tutte le selezioni della schedina devono appartenere alla stessa giornata'}
            esito_info = next((e for e in m['esiti'] if e['chiave'] == esito), None)
            if not esito_info:
                return {'errore': f'esito non valido per il mercato "{m["titolo"]}"'}
            mercati_usati.add(mercato_id)
            quota_totale *= esito_info['quota']
            dettaglio.append({'mercato_id': mercato_id, 'titolo_mercato': m['titolo'],
                               'esito': esito, 'label_esito': esito_info['label'], 'quota': esito_info['quota']})

        saldo = self.state['saldi'].get(squadra, 0)
        if importo > saldo:
            return {'errore': f'fantamilioni insufficienti (saldo attuale: {saldo})'}
        self.state['saldi'][squadra] = round(saldo - importo, 2)

        quota_totale = round(quota_totale, 2)
        tetto = self.config['quote'].get('vincita_massima_per_scommessa')
        vincita_potenziale = math.floor(importo * quota_totale)
        if tetto is not None:
            vincita_potenziale = min(vincita_potenziale, math.floor(tetto))

        schedina = {
            'id': self._nuovo_id_schedina(),
            'squadra': squadra,
            'giornata': giornata,
            'selezioni': dettaglio,
            'quota_totale': quota_totale,
            'importo': importo,
            'stato': 'in_corso',
            'vincita': None,
            'creata_il': now_str(),
        }
        self.state['schedine'].append(schedina)
        riepilogo = ' + '.join(f"{d['label_esito']} ({d['quota']})" for d in dettaglio)
        self._log(f"{squadra} gioca la schedina giornata {giornata}: {riepilogo} = quota {quota_totale}, "
                   f"punta {importo} FM (vincita potenziale {vincita_potenziale})")
        self.save()
        return {'ok': True, 'schedina': schedina, 'saldo': self.state['saldi'][squadra],
                'vincita_potenziale': vincita_potenziale}

    def elimina_schedina(self, schedina_id):
        sch = next((s for s in self.state['schedine'] if s['id'] == schedina_id), None)
        if not sch:
            return {'errore': 'schedina non trovata'}
        if sch['stato'] != 'in_corso':
            return {'errore': 'la schedina e\' gia\' risolta, non e\' piu\' eliminabile'}
        self.state['saldi'][sch['squadra']] = round(self.state['saldi'].get(sch['squadra'], 0) + sch['importo'], 2)
        self.state['schedine'] = [s for s in self.state['schedine'] if s['id'] != schedina_id]
        self._log(f"Eliminata schedina #{schedina_id} di {sch['squadra']} (rimborsati {sch['importo']} FM)")
        self.save()
        return {'ok': True}

    # -- notifiche push del browser (promemoria "non hai ancora giocato la schedina") --

    def vapid_chiave_pubblica(self):
        return self.config.get('push', {}).get('vapid_public_key')

    def sottoscrivi_push(self, squadra, subscription):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        if not isinstance(subscription, dict) or not subscription.get('endpoint'):
            return {'errore': 'sottoscrizione non valida (manca endpoint)'}
        lista = self.state['push_subscriptions'].setdefault(squadra, [])
        lista[:] = [s for s in lista if s.get('endpoint') != subscription['endpoint']]
        lista.append(subscription)
        self._log(f"{squadra} ha attivato le notifiche push su un dispositivo")
        self.save()
        return {'ok': True}

    def annulla_push(self, squadra, endpoint):
        if squadra not in self.squadre():
            return {'errore': 'squadra non valida'}
        lista = self.state['push_subscriptions'].setdefault(squadra, [])
        prima = len(lista)
        lista[:] = [s for s in lista if s.get('endpoint') != endpoint]
        if len(lista) < prima:
            self._log(f"{squadra} ha disattivato le notifiche push su un dispositivo")
            self.save()
        return {'ok': True}

    def _invia_push_a_squadra(self, squadra, titolo, testo):
        """Manda la notifica a tutti i dispositivi sottoscritti di una squadra. Rimuove da sole le
        sottoscrizioni scadute/non piu' valide (410/404: il browser non le riconosce piu')."""
        push_cfg = self.config.get('push', {})
        # la chiave privata non sta mai in config.json/nel repository: solo variabile d'ambiente
        chiave_privata = os.environ.get('VAPID_PRIVATE_KEY')
        claims_sub = push_cfg.get('vapid_claims_sub')
        if not chiave_privata:
            return {'inviate': 0, 'fallite': 0,
                    'errore': "variabile d'ambiente VAPID_PRIVATE_KEY non impostata sul server"}
        lista = self.state['push_subscriptions'].get(squadra, [])
        if not lista:
            return {'inviate': 0, 'fallite': 0, 'nessuna_sottoscrizione': True}
        payload = json.dumps({'titolo': titolo, 'testo': testo})
        inviate, fallite, scadute = 0, 0, []
        for sub in list(lista):
            try:
                webpush(subscription_info=sub, data=payload,
                        vapid_private_key=chiave_privata, vapid_claims={'sub': claims_sub})
                inviate += 1
            except WebPushException as e:
                status = getattr(e.response, 'status_code', None) if e.response is not None else None
                if status in (404, 410):
                    scadute.append(sub['endpoint'])
                else:
                    fallite += 1
        if scadute:
            lista[:] = [s for s in lista if s.get('endpoint') not in scadute]
            self.save()
        return {'inviate': inviate, 'fallite': fallite, 'scadute_rimosse': len(scadute)}

    def invia_notifica(self, squadre, titolo, testo):
        if not titolo or not testo:
            return {'errore': 'titolo e testo sono obbligatori'}
        squadre_valide = [sq for sq in (squadre or self.squadre()) if sq in self.squadre()]
        risultati = {sq: self._invia_push_a_squadra(sq, titolo, testo) for sq in squadre_valide}
        self._log(f"Notifica push \"{titolo}\" inviata a: " + ", ".join(squadre_valide))
        return {'ok': True, 'risultati': risultati}

    def squadre_senza_schedina_giornata(self, giornata):
        return [sq for sq in self.squadre() if not self.ha_schedina(sq, giornata)]

    def squadre_senza_schedina_girone_andata(self):
        mercato = self.mercato_girone_andata_aperto()
        if not mercato:
            return None
        hanno_giocato = {s['squadra'] for s in self.state['schedine']
                         if any(sel['mercato_id'] == mercato['id'] for sel in s['selezioni'])}
        return [sq for sq in self.squadre() if sq not in hanno_giocato]

    def ricorda_schedina_giornata(self, giornata=None, titolo=None, testo=None):
        if giornata is None:
            giornate = [m['giornata'] for m in self.state['mercati'] if m.get('giornata') is not None]
            if not giornate:
                return {'errore': "nessuna giornata pubblicata, indica un numero di giornata"}
            giornata = max(giornate)
        squadre = self.squadre_senza_schedina_giornata(giornata)
        if not squadre:
            return {'ok': True, 'squadre_avvisate': [], 'nota': f'tutti hanno gia\' giocato la giornata {giornata}'}
        titolo = titolo or 'Gottabet'
        testo = testo or f"Non hai ancora giocato la schedina della giornata {giornata}!"
        r = self.invia_notifica(squadre, titolo, testo)
        if not r.get('ok'):
            return r
        return {'ok': True, 'giornata': giornata, 'squadre_avvisate': squadre, 'risultati': r['risultati']}

    def ricorda_girone_andata(self, titolo=None, testo=None):
        squadre = self.squadre_senza_schedina_girone_andata()
        if squadre is None:
            return {'errore': "nessun mercato 'vincitore girone d'andata' aperto al momento"}
        if not squadre:
            return {'ok': True, 'squadre_avvisate': [], 'nota': 'hanno gia\' tutti scelto il loro vincitore'}
        titolo = titolo or 'Gottabet'
        testo = testo or "Non hai ancora scelto il tuo vincitore del girone d'andata!"
        r = self.invia_notifica(squadre, titolo, testo)
        if not r.get('ok'):
            return r
        return {'ok': True, 'squadre_avvisate': squadre, 'risultati': r['risultati']}

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
        nuovo_auth = {}
        for vecchio, saldo in self.state['saldi'].items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuovi_saldi[nuovo_nome] = saldo
        for vecchio, storico in self.state['storico_punti'].items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuovo_storico[nuovo_nome] = storico
        for vecchio, voce in self.state.get('auth', {}).items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuovo_auth[nuovo_nome] = voce
        for sessione in self.state.get('sessioni', {}).values():
            if sessione['squadra'] in rename_map:
                sessione['squadra'] = rename_map[sessione['squadra']]
        for vecchio, proiezioni in self.state.get('proiezioni', {}).items():
            nuovo_nome = rename_map.get(vecchio, vecchio)
            nuove_proiezioni[nuovo_nome] = proiezioni
        for m in self.state['mercati']:
            if m.get('squadra_a') in rename_map:
                m['squadra_a'] = rename_map[m['squadra_a']]
            if m.get('squadra_b') in rename_map:
                m['squadra_b'] = rename_map[m['squadra_b']]
        for s in self.state['schedine']:
            if s.get('squadra') in rename_map:
                s['squadra'] = rename_map[s['squadra']]
        self.state['saldi'] = nuovi_saldi
        self.state['storico_punti'] = nuovo_storico
        self.state['proiezioni'] = nuove_proiezioni
        self.state['auth'] = nuovo_auth
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

    def ripristina_backup(self, dati):
        """Ripristina stato (e opzionalmente configurazione) da un file scaricato con GET /api/export.
        Serve perche' Render free tier azzera data/state.json a ogni restart/redeploy: l'admin scarica
        un backup prima di riavviare il servizio e lo ricarica subito dopo."""
        if not isinstance(dati, dict) or not isinstance(dati.get('state'), dict):
            return {'errore': 'file di backup non valido: manca "state"'}
        nuovo_state = dati['state']
        chiavi_richieste = {'saldi', 'mercati', 'schedine', 'storico_punti'}
        if not chiavi_richieste.issubset(nuovo_state.keys()):
            return {'errore': 'file di backup non valido: mancano dei campi nello stato'}
        self.state = nuovo_state
        config_ripristinata = False
        if isinstance(dati.get('config'), dict):
            self.config = dati['config']
            save_json_atomic(CONFIG_PATH, self.config)
            config_ripristinata = True
        self._assicura_squadre()
        self._log(f"Stato ripristinato da backup (config inclusa: {config_ripristinata})")
        self.save()
        return {'ok': True, 'config_ripristinata': config_ripristinata}


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
        if path == '/sw.js':
            # servito dalla radice (non /static/) apposta: e' l'unico modo per cui lo scope di
            # default del service worker copre tutto il sito e non solo /static/.
            self._send_file(os.path.join(STATIC_DIR, 'sw.js'), 'application/javascript; charset=utf-8')
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
                token = (qs.get('token') or [None])[0]
                squadra = STORE.squadra_da_token(token)
                mie_schedine = [s for s in STORE.state['schedine'] if s['squadra'] == squadra] if squadra else []
                self._send_json({
                    'lega': STORE.config['lega']['nome'],
                    'squadre': STORE.squadre(),
                    'squadre_registrate': STORE.squadre_registrate(),
                    'saldi': STORE.state['saldi'],
                    'mia_squadra': squadra,
                    'mio_saldo': STORE.state['saldi'].get(squadra) if squadra else None,
                    'mie_schedine': mie_schedine,
                    'mercati': STORE.state['mercati'],
                    'classifica': STORE.classifica(),
                    'vincita_massima_per_scommessa': STORE.config['quote'].get('vincita_massima_per_scommessa'),
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
            if path == '/api/push/chiave-pubblica':
                self._send_json({'chiave_pubblica': STORE.vapid_chiave_pubblica()})
                return
            if path == '/api/export':
                if not STORE.check_admin((qs.get('admin_password') or [''])[0]):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return
                self._send_json({'state': STORE.state, 'config': STORE.config, 'exported_at': now_str()})
                return
            if path == '/api/admin/schedine':
                if not STORE.check_admin((qs.get('admin_password') or [''])[0]):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return
                self._send_json(STORE.state['schedine'])
                return
            if path == '/api/admin/calendario':
                if not STORE.check_admin((qs.get('admin_password') or [''])[0]):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return
                giornata = (qs.get('giornata') or [None])[0]
                if giornata:
                    self._send_json(STORE.calendario.get(giornata, []))
                else:
                    self._send_json(STORE.calendario)
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
            if path == '/api/admin/quote-girone-andata':
                if not STORE.check_admin((qs.get('admin_password') or [''])[0]):
                    self._send_json({'errore': 'password admin errata'}, 403)
                    return
                n_simulazioni = (qs.get('n_simulazioni') or [None])[0]
                r = STORE.simula_vincitore_girone_andata(n_simulazioni)
                self._send_json(r, 200 if r.get('ok') else 400)
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
            if path == '/api/login':
                risultato = STORE.login(body.get('squadra'), body.get('password'))
                self._send_json(risultato, 200 if risultato.get('ok') else 400)
                return

            if path == '/api/logout':
                self._send_json(STORE.logout(body.get('token')))
                return

            if path == '/api/schedina':
                squadra = STORE.squadra_da_token(body.get('token'))
                if not squadra:
                    self._send_json({'errore': 'sessione scaduta, rientra con la tua squadra'}, 401)
                    return
                risultato = STORE.crea_schedina(
                    squadra, body.get('giornata'), body.get('selezioni', []), body.get('importo'))
                self._send_json(risultato, 200 if risultato.get('ok') else 400)
                return

            if path == '/api/push/sottoscrivi':
                squadra = STORE.squadra_da_token(body.get('token'))
                if not squadra:
                    self._send_json({'errore': 'sessione scaduta, rientra con la tua squadra'}, 401)
                    return
                r = STORE.sottoscrivi_push(squadra, body.get('subscription'))
                self._send_json(r, 200 if r.get('ok') else 400)
                return

            if path == '/api/push/annulla':
                squadra = STORE.squadra_da_token(body.get('token'))
                if not squadra:
                    self._send_json({'errore': 'sessione scaduta, rientra con la tua squadra'}, 401)
                    return
                r = STORE.annulla_push(squadra, body.get('endpoint'))
                self._send_json(r, 200 if r.get('ok') else 400)
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
                if path == '/api/admin/pubblica-giornata':
                    r = STORE.pubblica_giornata(body.get('giornata'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/crea-mercato-custom':
                    r = STORE.crea_mercato_custom(body.get('titolo'), body.get('esiti', []), body.get('giornata'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/pubblica-girone-andata':
                    r = STORE.pubblica_girone_andata(body.get('n_simulazioni'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/notifica':
                    r = STORE.invia_notifica(body.get('squadre'), body.get('titolo'), body.get('testo'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/ricorda-schedina':
                    r = STORE.ricorda_schedina_giornata(body.get('giornata'), body.get('titolo'), body.get('testo'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/ricorda-girone-andata':
                    r = STORE.ricorda_girone_andata(body.get('titolo'), body.get('testo'))
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
                if path == '/api/admin/elimina-schedina':
                    r = STORE.elimina_schedina(body.get('schedina_id'))
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
                if path == '/api/admin/reset-password-squadra':
                    r = STORE.reset_password_squadra(body.get('squadra'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/cambia-password':
                    r = STORE.cambia_password_admin(body.get('nuova_password'))
                    self._send_json(r, 200 if r.get('ok') else 400)
                    return
                if path == '/api/admin/ripristina-backup':
                    r = STORE.ripristina_backup(body.get('backup'))
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
