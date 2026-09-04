"""
Server locale per l'assistente asta Fantacalcio Mantra.
Solo libreria standard: nessuna dipendenza da installare.

Avvio:  python server.py [porta]   (default porta 8765)
"""
import json
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
PLAYERS_PATH = os.path.join(DATA_DIR, "players.json")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
ALLENATORI_PATH = os.path.join(DATA_DIR, "allenatori.json")
NOTE_RICERCA_PATH = os.path.join(DATA_DIR, "note_ricerca.json")
CALENDARIO_PATH = os.path.join(DATA_DIR, "calendario.json")

CALENDARIO_SCORE = {'facile': -1, 'medio': 0, 'difficile': 1, 'non_verificato': 0}

LOCK = threading.Lock()

REPARTO = {
    'Por': 'POR', 'Dc': 'DIF', 'B': 'DIF', 'Ds': 'DIF', 'Dd': 'DIF', 'E': 'DIF',
    'M': 'CEN', 'C': 'CEN', 'W': 'CEN', 'T': 'CEN', 'A': 'ATT', 'Pc': 'ATT',
}

TIER_RANK = {
    'Top': 1, 'Semi-Top': 2, 'Terza': 3, 'Quarta': 4,
    'Titolare "Scarso"': 4, 'Outsider': 5, 'Scomm.': 6,
}


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


class Store:
    """Holds players + state in memory, source of truth is the JSON files on disk."""

    def __init__(self):
        self.reload_reference_data()
        self.state = load_json(STATE_PATH)
        self._migrate_to_per_squadra()

    def _migrate_to_per_squadra(self):
        """Prima versione teneva 'mia_squadra'/obiettivi/formazione/note_giocatore
        come un unico blocco globale: chiunque si collegava sovrascriveva l'altro.
        Ora ogni squadra ha il proprio 'per_squadra[nome]' cosi' piu' persone possono
        usare lo stesso server (stessa asta condivisa) con rose separate."""
        self.state.setdefault('per_squadra', {})
        vecchia_mia = self.state.pop('mia_squadra', None)
        vecchi_obiettivi = self.state.pop('obiettivi', None)
        vecchia_formazione = self.state.pop('formazione', None)
        vecchie_note = self.state.pop('note_giocatore', None)
        if vecchia_mia and vecchia_mia not in self.state['per_squadra']:
            self.state['per_squadra'][vecchia_mia] = {
                'obiettivi': vecchi_obiettivi or {},
                'formazione': vecchia_formazione or {'modulo': None, 'slot': {}},
                'note_giocatore': vecchie_note or {},
            }

    def get_squadra_bucket(self, squadra):
        b = self.state['per_squadra'].setdefault(squadra, {})
        b.setdefault('obiettivi', {})
        b.setdefault('formazione', {'modulo': None, 'slot': {}})
        b.setdefault('note_giocatore', {})
        return b

    def reload_reference_data(self):
        """Ricarica giocatori/config/allenatori/note ricerca da disco senza toccare lo stato live."""
        self.players = load_json(PLAYERS_PATH)
        self.by_id = {p['id']: p for p in self.players}
        self.config = load_json(CONFIG_PATH)
        self.allenatori = load_json(ALLENATORI_PATH) if os.path.exists(ALLENATORI_PATH) else {}
        calendario_raw = load_json(CALENDARIO_PATH) if os.path.exists(CALENDARIO_PATH) else []
        self.calendario = {c['team']: c for c in calendario_raw if c.get('team')}
        note_ricerca_raw = load_json(NOTE_RICERCA_PATH) if os.path.exists(NOTE_RICERCA_PATH) else []
        self._build_search_index()
        self.note_ricerca_by_id = {}
        for entry in note_ricerca_raw:
            nome, nota = entry.get('nome'), entry.get('nota')
            if not nome or not nota:
                continue
            matches = self.find_players(nome)
            if len(matches) == 1:
                self.note_ricerca_by_id[matches[0]['id']] = nota
            elif len(matches) > 1 and entry.get('team'):
                team_matches = [p for p in matches if p['team'] == entry['team']]
                if len(team_matches) == 1:
                    self.note_ricerca_by_id[team_matches[0]['id']] = nota

    def _build_search_index(self):
        self.norm_full = {}
        for p in self.players:
            self.norm_full[p['id']] = normalize(p['nome'])

    def save_state(self):
        save_json_atomic(STATE_PATH, self.state)

    def save_config(self):
        save_json_atomic(CONFIG_PATH, self.config)

    def find_players(self, query):
        """Return list of candidate players matching a free-text query (name, partial name)."""
        nq = normalize(query)
        if not nq:
            return []
        exact = [p for p in self.players if self.norm_full[p['id']] == nq]
        if exact:
            return exact
        starts = [p for p in self.players if self.norm_full[p['id']].startswith(nq)]
        if len(starts) == 1:
            return starts
        contains = [p for p in self.players if nq in self.norm_full[p['id']]]
        # also match on individual tokens (e.g. "osimhen" matches "osimhen v.")
        tokens_match = [p for p in self.players if any(tok == nq for tok in self.norm_full[p['id']].split())]
        pool = starts or tokens_match or contains
        # de-dup preserving order, prefer higher estimated price when ambiguous (more likely to be the asked-about player)
        seen = set()
        uniq = []
        for p in pool:
            if p['id'] not in seen:
                uniq.append(p)
                seen.add(p['id'])
        uniq.sort(key=lambda p: -(p.get('prezzo_stimato') or 0))
        return uniq

    def enrich(self, p, squadra):
        pick = self.state['picks'].get(p['id'])
        bucket = self.get_squadra_bucket(squadra)
        out = dict(p)
        out['preso'] = pick is not None
        out['squadra_acquirente'] = pick['squadra'] if pick else None
        out['prezzo_pagato'] = pick['prezzo'] if pick else None
        out['obiettivo'] = bucket['obiettivi'].get(p['id'])
        out['nota_utente'] = bucket['note_giocatore'].get(p['id'])
        out['allenatore'] = self.allenatori.get(p['team'])
        out['nota_ricerca'] = self.note_ricerca_by_id.get(p['id'])
        cal = self.calendario.get(p['team'])
        out['calendario'] = cal
        fmv = p.get('fmv') or 0
        prezzo = p.get('prezzo_stimato') or 0
        out['convenienza'] = round(fmv / prezzo, 3) if (fmv and prezzo) else None
        return out

    def budget_summary(self, mia):
        cfg = self.config
        budget_tot = cfg['lega']['budget_iniziale']
        squadre = self.state['squadre']
        per_squadra = {s: {'speso': 0, 'giocatori': 0} for s in squadre}
        per_reparto_mio = {'POR': {'speso': 0, 'n': 0}, 'DIF': {'speso': 0, 'n': 0},
                            'CEN': {'speso': 0, 'n': 0}, 'ATT': {'speso': 0, 'n': 0}}
        for pid, pick in self.state['picks'].items():
            sq = pick['squadra']
            if sq not in per_squadra:
                per_squadra[sq] = {'speso': 0, 'giocatori': 0}
            per_squadra[sq]['speso'] += pick['prezzo']
            per_squadra[sq]['giocatori'] += 1
            if sq == mia:
                p = self.by_id.get(pid)
                if p and p['ruoli']:
                    rep = REPARTO.get(p['ruoli'][0], 'CEN')
                    per_reparto_mio[rep]['speso'] += pick['prezzo']
                    per_reparto_mio[rep]['n'] += 1
        mio = per_squadra.get(mia, {'speso': 0, 'giocatori': 0})
        rimanente = budget_tot - mio['speso']
        rosa_target = cfg['rosa']['totale_giocatori']
        slot_rimanenti = max(rosa_target - mio['giocatori'], 0)
        return {
            'budget_totale': budget_tot,
            'speso': mio['speso'],
            'rimanente': rimanente,
            'giocatori_presi': mio['giocatori'],
            'slot_totali': rosa_target,
            'slot_rimanenti': slot_rimanenti,
            'budget_medio_per_slot_rimanente': round(rimanente / slot_rimanenti, 1) if slot_rimanenti else 0,
            'per_reparto_mio': per_reparto_mio,
            'target_pct': cfg['budget_strategy']['target_pct'],
            'target_per_reparto_slot': cfg['rosa']['target_per_reparto'],
            'per_squadra': per_squadra,
        }

    def consigli(self, mia):
        summary = self.budget_summary(mia)

        # ruoli-lettera gia' posseduti (per dare priorita' a chi copre un ruolo che non ho ancora, non solo al reparto generico)
        owned_role_counts = {}
        for pid, pick in self.state['picks'].items():
            if pick['squadra'] != mia:
                continue
            p = self.by_id.get(pid)
            if not p:
                continue
            for r in p['ruoli']:
                owned_role_counts[r] = owned_role_counts.get(r, 0) + 1

        # calcolo prima l'urgenza di TUTTI i reparti, cosi' processo prima quello piu' scoperto:
        # un giocatore multi-reparto (es. E copre sia DIF che CEN) va suggerito una sola volta,
        # nel reparto che ne ha piu' bisogno, invece di comparire duplicato in entrambe le liste
        bozze = []
        for rep in ('POR', 'DIF', 'CEN', 'ATT'):
            target_slot = summary['target_per_reparto_slot'][rep]
            info = summary['per_reparto_mio'][rep]
            slot_mancanti = target_slot - info['n']
            if slot_mancanti <= 0:
                continue
            budget_reparto_tot = round(summary['budget_totale'] * summary['target_pct'][rep] / 100)
            budget_reparto_rimanente = budget_reparto_tot - info['speso']
            budget_medio_slot = round(budget_reparto_rimanente / slot_mancanti, 1) if slot_mancanti else 0
            bozze.append({'reparto': rep, 'slot_mancanti': slot_mancanti,
                           'budget_reparto_rimanente': budget_reparto_rimanente,
                           'budget_medio_per_slot': budget_medio_slot})
        bozze.sort(key=lambda r: r['budget_medio_per_slot'])

        gia_suggeriti = set()
        righe = []
        for bozza in bozze:
            rep = bozza['reparto']
            budget_medio_slot = bozza['budget_medio_per_slot']
            tetto = max(budget_medio_slot * 1.4, 1)  # margine 40% sopra la media, non escludere occasioni di poco piu' care
            candidati = []
            for p in self.players:
                pid = p['id']
                if pid in self.state['picks'] or pid in gia_suggeriti:
                    continue
                if rep not in p['reparti']:
                    continue
                prezzo = p.get('prezzo_stimato') or 0
                if prezzo > tetto:
                    continue
                candidati.append(p)

            obiettivi_mia = self.get_squadra_bucket(mia)['obiettivi']

            def score(p):
                is_obiettivo = 0 if p['id'] in obiettivi_mia else 1
                tier_rank = TIER_RANK.get(p.get('tier_carmy'), 9)
                ruoli_rep = [r for r in p['ruoli'] if REPARTO.get(r) == rep]
                copre_ruolo_nuovo = 0 if any(owned_role_counts.get(r, 0) == 0 for r in ruoli_rep) else 1
                cal = self.calendario.get(p['team'])
                cal_score = CALENDARIO_SCORE.get(cal['difficolta'], 0) if cal else 0
                return (is_obiettivo, tier_rank, copre_ruolo_nuovo, cal_score, -(p.get('fmv') or 0))
            candidati.sort(key=score)
            scelti = candidati[:5]
            gia_suggeriti.update(p['id'] for p in scelti)
            righe.append({
                'reparto': rep,
                'slot_mancanti': bozza['slot_mancanti'],
                'budget_reparto_rimanente': bozza['budget_reparto_rimanente'],
                'budget_medio_per_slot': budget_medio_slot,
                'urgenza': 'alta' if budget_medio_slot < 5 else ('media' if budget_medio_slot < 15 else 'bassa'),
                'suggeriti': [self.enrich(p, mia) for p in scelti],
            })
        return {'consigli': righe}

    def giornate_per_team(self, team):
        cal = self.calendario.get(team)
        if not cal:
            return {}
        return {f['giornata']: f['difficolta'] for f in cal.get('calendario_completo', [])}

    def incastro(self, riferimento, mia, ruolo=None, limit=8):
        """Trova giocatori disponibili dello stesso ruolo la cui squadra copre (facile/medio)
        le giornate in cui la squadra del giocatore di riferimento e' difficile."""
        rif_giornate = self.giornate_per_team(riferimento['team'])
        rif_difficili = sorted(g for g, d in rif_giornate.items() if d == 'difficile')
        if not rif_difficili:
            return {'riferimento': riferimento['nome'], 'giornate_difficili_riferimento': [], 'candidati': []}

        ruoli_target = [ruolo] if ruolo else riferimento['ruoli']
        candidati = []
        for p in self.players:
            if p['id'] == riferimento['id'] or p['id'] in self.state['picks']:
                continue
            if not any(r in ruoli_target for r in p['ruoli']):
                continue
            if p['team'] == riferimento['team']:
                continue  # stesso calendario, non copre nulla
            p_giornate = self.giornate_per_team(p['team'])
            if not p_giornate:
                continue
            coperte = [g for g in rif_difficili if p_giornate.get(g) in ('facile', 'medio')]
            if not coperte:
                continue
            candidati.append((p, coperte))

        def score(item):
            p, coperte = item
            tier_rank = TIER_RANK.get(p.get('tier_carmy'), 9)
            return (-len(coperte), tier_rank, -(p.get('fmv') or 0))
        candidati.sort(key=score)

        return {
            'riferimento': riferimento['nome'],
            'riferimento_team': riferimento['team'],
            'giornate_difficili_riferimento': rif_difficili,
            'candidati': [
                {**self.enrich(p, mia), 'giornate_coperte': coperte, 'copertura': f"{len(coperte)}/{len(rif_difficili)}"}
                for p, coperte in candidati[:limit]
            ],
        }


STORE = Store()


class Handler(BaseHTTPRequestHandler):
    server_version = "AstaMantra/1.0"

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
            mia = self._squadra_from_qs(qs)
            if path == '/api/players':
                out = [STORE.enrich(p, mia) for p in STORE.players]
                self._send_json(out)
                return
            if path == '/api/state':
                bucket = STORE.get_squadra_bucket(mia)
                self._send_json({
                    'state': {k: v for k, v in STORE.state.items() if k != 'per_squadra'},
                    'mia': {'squadra': mia, **bucket},
                    'config': STORE.config,
                })
                return
            if path == '/api/summary':
                self._send_json(STORE.budget_summary(mia))
                return
            if path == '/api/consigli':
                self._send_json(STORE.consigli(mia))
                return
            if path == '/api/incastro':
                query = (qs.get('id') or qs.get('query') or [None])[0]
                if not query:
                    self._send_json({'error': 'specifica "id" o "query" (giocatore di riferimento, di solito uno che possiedi gia\')'}, 400)
                    return
                riferimento = STORE.by_id.get(query)
                if not riferimento:
                    matches = STORE.find_players(query)
                    if not matches:
                        self._send_json({'error': f'nessun giocatore trovato per "{query}"'}, 404)
                        return
                    if len(matches) > 1:
                        self._send_json({'error': f'{len(matches)} giocatori corrispondono, specifica meglio o usa "id"',
                                          'candidati': [{'id': p['id'], 'nome': p['nome'], 'team': p['team']} for p in matches[:8]]}, 400)
                        return
                    riferimento = matches[0]
                ruolo = (qs.get('ruolo') or [None])[0]
                limit = int((qs.get('limit') or ['8'])[0])
                self._send_json(STORE.incastro(riferimento, mia, ruolo, limit))
                return
            if path == '/api/suggest':
                ruolo = (qs.get('ruolo') or [None])[0]
                reparto = (qs.get('reparto') or [None])[0]
                budget_max = qs.get('budget_max')
                budget_max = float(budget_max[0]) if budget_max else None
                limit = int((qs.get('limit') or ['10'])[0])
                solo_obiettivi = (qs.get('solo_obiettivi') or ['0'])[0] == '1'
                obiettivi_mia = STORE.get_squadra_bucket(mia)['obiettivi']
                cands = []
                for p in STORE.players:
                    pid = p['id']
                    if pid in STORE.state['picks']:
                        continue
                    if ruolo and ruolo not in p['ruoli']:
                        continue
                    if reparto and reparto not in p['reparti']:
                        continue
                    if solo_obiettivi and pid not in obiettivi_mia:
                        continue
                    prezzo = p.get('prezzo_stimato') or 0
                    if budget_max is not None and prezzo > budget_max:
                        continue
                    cands.append(STORE.enrich(p, mia))
                cands.sort(key=lambda p: (TIER_RANK.get(p.get('tier_carmy'), 9), -(p.get('fmv') or 0), -(p.get('convenienza') or 0)))
                self._send_json(cands[:limit])
                return
            if path == '/api/search':
                q = (qs.get('q') or [''])[0]
                results = [STORE.enrich(p, mia) for p in STORE.find_players(q)]
                self._send_json(results[:15])
                return
            if path == '/api/export':
                self._send_json({
                    'state': STORE.state,
                    'config': STORE.config,
                    'exported_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                })
                return

        self._send_json({'error': 'not found', 'path': path}, 404)

    def _squadra_from_qs(self, qs):
        squadra = (qs.get('squadra') or [None])[0]
        if squadra:
            return squadra
        return STORE.state['squadre'][0] if STORE.state['squadre'] else 'La Mia Squadra'

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            body = self._read_json_body()
        except Exception as e:
            self._send_json({'error': f'json non valido: {e}'}, 400)
            return

        with LOCK:
            if path == '/api/pick':
                self._handle_pick(body)
                return
            if path == '/api/undo':
                self._handle_undo(body)
                return
            if path == '/api/undo-last':
                self._handle_undo_last()
                return
            if path == '/api/target':
                self._handle_target(body)
                return
            if path == '/api/note':
                self._handle_note(body)
                return
            if path == '/api/team-names':
                self._handle_team_names(body)
                return
            if path == '/api/config':
                self._handle_config(body)
                return
            if path == '/api/reset-all':
                self._handle_reset_all(body)
                return
            if path == '/api/formazione':
                self._handle_formazione(body)
                return
            if path == '/api/reload-data':
                STORE.reload_reference_data()
                self._send_json({'ok': True, 'giocatori': len(STORE.players)})
                return

        self._send_json({'error': 'not found', 'path': path}, 404)

    # ---- handlers ----

    def _resolve_player(self, body):
        pid = body.get('id')
        if pid and pid in STORE.by_id:
            return STORE.by_id[pid], None
        query = body.get('query') or body.get('nome') or body.get('name')
        if not query:
            return None, {'error': 'specifica "id" oppure "query" (nome del giocatore)'}
        matches = STORE.find_players(query)
        if not matches:
            return None, {'error': f'nessun giocatore trovato per "{query}"'}
        if len(matches) > 1:
            return None, {
                'error': f'{len(matches)} giocatori corrispondono a "{query}", specifica meglio o usa "id"',
                'candidati': [{'id': p['id'], 'nome': p['nome'], 'team': p['team'], 'ruoli': p['ruoli']} for p in matches[:8]],
            }
        return matches[0], None

    def _squadra_from_body(self, body):
        squadra = body.get('squadra')
        if squadra:
            return squadra
        return STORE.state['squadre'][0] if STORE.state['squadre'] else 'La Mia Squadra'

    def _handle_pick(self, body):
        player, err = self._resolve_player(body)
        if err:
            self._send_json(err, 400)
            return
        mia = self._squadra_from_body(body)
        squadra = body.get('team') or body.get('squadra_acquirente') or body.get('squadra')
        prezzo = body.get('price')
        if prezzo is None:
            prezzo = body.get('prezzo')
        if not squadra:
            self._send_json({'error': 'specifica "team" (squadra acquirente)'}, 400)
            return
        try:
            prezzo = float(prezzo)
        except (TypeError, ValueError):
            self._send_json({'error': 'specifica "price" (prezzo pagato, numero)'}, 400)
            return
        if squadra not in STORE.state['squadre']:
            STORE.state['squadre'].append(squadra)
        pid = player['id']
        if pid in STORE.state['picks']:
            self._send_json({'error': f'{player["nome"]} risulta gia\' assegnato a {STORE.state["picks"][pid]["squadra"]}. Usa /api/undo per correggere.'}, 409)
            return
        STORE.state['picks'][pid] = {'squadra': squadra, 'prezzo': prezzo, 'ts': time.time()}
        STORE.state['log'].append({'azione': 'pick', 'id': pid, 'nome': player['nome'], 'squadra': squadra, 'prezzo': prezzo, 'ts': time.time()})
        STORE.save_state()
        self._send_json({'ok': True, 'giocatore': STORE.enrich(player, mia), 'riepilogo': STORE.budget_summary(mia)})

    def _handle_undo(self, body):
        player, err = self._resolve_player(body)
        if err:
            self._send_json(err, 400)
            return
        mia = self._squadra_from_body(body)
        pid = player['id']
        if pid not in STORE.state['picks']:
            self._send_json({'error': f'{player["nome"]} non risulta assegnato'}, 404)
            return
        removed = STORE.state['picks'].pop(pid)
        self._rimuovi_da_formazione(pid)
        STORE.state['log'].append({'azione': 'undo', 'id': pid, 'nome': player['nome'], 'ts': time.time()})
        STORE.save_state()
        self._send_json({'ok': True, 'rimosso': removed, 'giocatore': STORE.enrich(player, mia)})

    def _rimuovi_da_formazione(self, pid):
        # un giocatore annullato non e' piu' di nessuno: toglilo da TUTTE le formazioni
        # (non solo quella di chi ha chiamato l'undo), altrimenti resterebbe uno slot fantasma
        for bucket in STORE.state['per_squadra'].values():
            slot = bucket.get('formazione', {}).get('slot', {})
            for k in [k for k, v in slot.items() if v == pid]:
                del slot[k]

    def _handle_undo_last(self):
        last_pick_idx = None
        for i in range(len(STORE.state['log']) - 1, -1, -1):
            if STORE.state['log'][i]['azione'] == 'pick':
                last_pick_idx = i
                break
        if last_pick_idx is None:
            self._send_json({'error': 'nessuna assegnazione da annullare'}, 404)
            return
        entry = STORE.state['log'][last_pick_idx]
        pid = entry['id']
        removed = STORE.state['picks'].pop(pid, None)
        self._rimuovi_da_formazione(pid)
        STORE.state['log'].append({'azione': 'undo-last', 'id': pid, 'nome': entry['nome'], 'ts': time.time()})
        STORE.save_state()
        self._send_json({'ok': True, 'annullato': entry, 'rimosso': removed})

    def _handle_target(self, body):
        player, err = self._resolve_player(body)
        if err:
            self._send_json(err, 400)
            return
        mia = self._squadra_from_body(body)
        bucket = STORE.get_squadra_bucket(mia)
        pid = player['id']
        azione = body.get('azione', 'set')
        if azione == 'remove':
            bucket['obiettivi'].pop(pid, None)
        else:
            priorita = body.get('priorita', 2)
            nota = body.get('nota', '')
            bucket['obiettivi'][pid] = {'priorita': priorita, 'nota': nota}
        STORE.save_state()
        self._send_json({'ok': True, 'giocatore': STORE.enrich(player, mia)})

    def _handle_note(self, body):
        player, err = self._resolve_player(body)
        if err:
            self._send_json(err, 400)
            return
        mia = self._squadra_from_body(body)
        bucket = STORE.get_squadra_bucket(mia)
        nota = body.get('nota', '')
        if nota:
            bucket['note_giocatore'][player['id']] = nota
        else:
            bucket['note_giocatore'].pop(player['id'], None)
        STORE.save_state()
        self._send_json({'ok': True, 'giocatore': STORE.enrich(player, mia)})

    def _handle_team_names(self, body):
        squadre = body.get('squadre')
        if squadre:
            rename_map = body.get('rename_map', {})
            for pid, pick in STORE.state['picks'].items():
                if pick['squadra'] in rename_map:
                    pick['squadra'] = rename_map[pick['squadra']]
            for vecchio, nuovo in rename_map.items():
                if vecchio in STORE.state['per_squadra'] and vecchio != nuovo:
                    STORE.state['per_squadra'][nuovo] = STORE.state['per_squadra'].pop(vecchio)
            STORE.state['squadre'] = squadre
        STORE.save_state()
        self._send_json({'ok': True, 'state': {k: v for k, v in STORE.state.items() if k != 'per_squadra'}})

    def _handle_config(self, body):
        def deep_update(base, upd):
            for k, v in upd.items():
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    deep_update(base[k], v)
                else:
                    base[k] = v
        deep_update(STORE.config, body)
        STORE.save_config()
        self._send_json({'ok': True, 'config': STORE.config})

    def _handle_formazione(self, body):
        mia = self._squadra_from_body(body)
        bucket = STORE.get_squadra_bucket(mia)
        modulo = body.get('modulo')
        slot = body.get('slot')
        if modulo is not None:
            bucket['formazione']['modulo'] = modulo
        if slot is not None:
            pulito = {}
            for slot_key, pid in slot.items():
                if not pid:
                    continue
                pick = STORE.state['picks'].get(pid)
                if not pick or pick['squadra'] != mia:
                    continue  # ignora slot con un giocatore non tuo (es. appena venduto ad altri)
                pulito[slot_key] = pid
            bucket['formazione']['slot'] = pulito
        STORE.save_state()
        self._send_json({'ok': True, 'formazione': bucket['formazione']})

    def _handle_reset_all(self, body):
        if body.get('conferma') != 'SI':
            self._send_json({'error': 'per confermare invia {"conferma": "SI"}'}, 400)
            return
        per_squadra_pulito = {}
        for nome, bucket in STORE.state['per_squadra'].items():
            per_squadra_pulito[nome] = {
                'obiettivi': {}, 'note_giocatore': {},
                'formazione': {'modulo': bucket.get('formazione', {}).get('modulo'), 'slot': {}},
            }
        STORE.state = {
            'squadre': STORE.state['squadre'],
            'picks': {}, 'log': [],
            'per_squadra': per_squadra_pulito,
        }
        STORE.save_state()
        self._send_json({'ok': True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f"Asta Mantra server su http://localhost:{port}  (Ctrl+C per fermare)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
