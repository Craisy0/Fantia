# Asta Mantra — Regia Live

App locale (nessuna dipendenza da installare, solo Python standard) per seguire l'asta Fantacalcio Mantra a 10: chi è ancora disponibile, budget e slot rimasti, i tuoi obiettivi.

## Avvio

Doppio click su `start.bat`, oppure da terminale:

```
python server.py 8765
```

Poi apri `http://localhost:8765` nel browser. Lascialo aperto per tutta la durata dell'asta — i dati si salvano su disco (`data/state.json`) a ogni azione, quindi puoi chiudere e riaprire senza perdere nulla.

## Più persone sulla stessa app (multi-identità)

Al primo accesso l'app chiede "Chi sei?" — scegli quale squadra rappresenti (l'elenco è limitato a `config.json` → `lega.utenti_app`, oggi **MN STELVIO** e **420 smoke**; aggiungi un nome lì se si aggiunge una terza persona). Da quel momento rosa, obiettivi ★ e formazione che vedi sono **personali**, salvati per squadra — se un amico si collega dallo stesso server (stessa rete WiFi, stesso link) con la propria identità, non sovrascrive la tua. Le uniche cose condivise da tutti sono la parte reale dell'asta: chi ha comprato chi e il log. Per cambiare identità (es. hai aperto l'app sul telefono di qualcun altro per sbaglio): tab Impostazioni → "Cambia identità", o clic sul badge col tuo nome in alto a destra.

## Struttura

- `data/players.json` — anagrafica di 534 giocatori unici, aggiornata il 3 settembre (chiusura mercato) fondendo 18 fonti diverse (listoni della community Mantra: Carmy, Strategia Provvisoria, SOS Mantra, Copernico, Fantabox, ecc.). Prezzo = mediana tra le fonti (+ `prezzo_min`/`prezzo_max`/`n_fonti_prezzo` per vedere il disaccordo), fascia = consenso tra le fonti che usano la tassonomia standard, fino a 6 commenti scouting distinti per giocatore.
- `data/state.json` — lo stato live dell'asta (chi hai preso, chi hanno preso gli altri, i tuoi obiettivi, la formazione). Si aggiorna in tempo reale.
- `data/allenatori.json` — allenatore 2026/27 per ciascuna delle 20 squadre (fonte: LaPresse, 3 luglio 2026), usato nel popup giocatore.
- `data/calendario.json` — calendario ufficiale completo 2026/27 (tutte le 38 giornate, tutte le 20 squadre, da Wikipedia, validato). Ogni singola partita di `calendario_completo` ha una difficoltà facile/medio/difficile su scala GLOBALE (stesso metro per tutte le squadre, terzili su tutte le 760 partite-squadra della stagione) — usata per l'incastro calendario (vedi sotto). Il campo `difficolta`/`punteggio_difficolta` a livello squadra resta invece sulle prime 8 giornate (una media sull'intera stagione è quasi piatta per costruzione in un girone completo, non è un buon riassunto).
- `data/note_ricerca.json` — note brevi verificate via ricerca web su ~60 giocatori di punta (trasferimenti estate 2026, infortuni, titolarità sotto il nuovo allenatore), mostrate nel popup. Non copre tutti i 534 giocatori per scelta: meglio poche note solide che tante generiche — se manca la nota per qualcuno che ti interessa, chiedimela.
- `config.json` — regole di punteggio, strategia di budget, catalogo moduli, tutte modificabili dal tab Impostazioni o a mano.
- `server.py` — backend, unico processo, nessuna dipendenza esterna.
- `static/` — frontend (HTML/CSS/JS vanilla).

## Cosa c'è nel tab "La mia squadra"

- **Rosa per reparto** — quanti giocatori hai preso vs target, con spesa.
- **Suddivisione budget** — grafico a ciambella (speso/rimanente) + barre per reparto con il target consigliato segnato come lineetta, per vedere a colpo d'occhio se stai sforando un reparto.
- **Formazione** — vero campo da gioco in stile FIFA Ultimate Team: scegli un modulo (3-4-3, 4-3-3, 3-5-2, ecc. — il conteggio è per reparto, coerente con gli "slot liberi" della lega, non un incastro di ruoli-lettera specifico), clicca su uno slot per assegnare/sostituire un giocatore già preso da un menu a comparsa, il resto va automaticamente in panchina sotto il campo.
- **Consigli live** — per ogni reparto ancora incompleto, ti dice quanti slot mancano, quanto budget/slot hai realisticamente e ti propone i migliori giocatori ancora liberi in quella fascia di prezzo (i tuoi ★ obiettivi hanno sempre priorità).
- **Popup giocatore** — passa il mouse (o tocca) sul nome di un giocatore ovunque nell'app per vedere squadra, allenatore, statistiche, tag ("titolarissimo", "rischio infortuni", ecc.), e — per i giocatori più noti — una nota aggiornata da ricerca web su mercato/infortuni/titolarità. Clicca per "fissarla" aperta.
- **Incastro calendario** — sul popup di un giocatore che hai già preso, il pulsante "🔄 Chi si incastra bene con lui?" cerca tra i liberi dello stesso ruolo quelli la cui squadra ha un calendario buono (facile/medio) proprio nelle giornate in cui la squadra del tuo giocatore è difficile, così eviti di avere due giocatori dello stesso ruolo "spenti" nella stessa giornata. Guarda tutte le 38 giornate, non solo l'inizio.

## Come interagisco io (Claude) durante l'asta live

Il modo più veloce per me di aggiornare lo stato mentre segui l'asta a voce è chiamare l'API REST direttamente da terminale, senza passare dal browser. Dimmi semplicemente cosa succede ("Osimhen preso dal Team 4 per 45") e io eseguo:

```bash
curl -s -X POST http://localhost:8765/api/pick \
  -H "Content-Type: application/json" \
  -d '{"query":"osimhen","team":"Team 4","price":45}'
```

Se il nome è ambiguo (più giocatori corrispondono), l'API risponde con un elenco di candidati tra cui scegliere per `id` invece che per nome.

Altri endpoint utili:

| Endpoint | Uso |
|---|---|
| `GET /api/players` | lista completa giocatori con stato live |
| `GET /api/search?q=nome` | ricerca live (autocomplete) |
| `GET /api/suggest?ruolo=Pc&budget_max=50&limit=10` | migliori disponibili per ruolo entro un budget, ordinati per convenienza (FMV/prezzo) |
| `GET /api/summary` | budget speso/rimanente, slot per reparto |
| `POST /api/pick {query, team, price}` | assegna un giocatore a una squadra |
| `POST /api/undo {query}` | annulla un'assegnazione (correggi un errore) |
| `POST /api/undo-last` | annulla l'ultima assegnazione registrata |
| `POST /api/target {query, azione:"set"/"remove", priorita, nota}` | segna/togli un obiettivo |
| `POST /api/note {query, nota}` | aggiungi una nota libera a un giocatore |
| `POST /api/team-names {squadre:[...], mia_squadra, rename_map:{vecchio:nuovo}}` | rinomina le 10 squadre quando scopri i nomi reali |
| `GET /api/export` | backup completo dello stato |
| `GET /api/consigli` | suggerimenti live per reparto (slot mancanti, budget/slot, migliori disponibili) |
| `POST /api/formazione {modulo, slot}` | imposta modulo e/o assegna giocatori ai titolari (`slot` è una mappa `"REP-indice": id_giocatore`) |
| `POST /api/reload-data` | ricarica `players.json`/`config.json`/`allenatori.json`/`note_ricerca.json` da disco senza riavviare il server (utile dopo un aggiornamento dati) |
| `GET /api/incastro?id=X&limit=8` | dato un giocatore (di solito uno che possiedi), i disponibili dello stesso ruolo che coprono le sue giornate di calendario difficili, su tutte le 38 giornate |

Tutti gli endpoint POST rispondono con l'oggetto giocatore aggiornato (e per `/api/pick` anche il riepilogo budget), quindi posso confermarti a voce cosa è successo senza dover riaprire il browser.

## Farmi domande durante l'asta

Tieni aperta questa sessione Claude Code (questa o una nuova) su un secondo schermo/laptop durante l'asta, con il server già avviato (`start.bat`). Poi parlami normalmente in chat — non serve nessun comando speciale:

- "Osimhen preso dal Team 4 per 45" → registro subito la giocata via API
- "chi mi manca ora?" / "quanto budget ho per gli attaccanti?" → controllo `/api/summary` e ti rispondo
- "chi mi consigli per il centrocampo?" → guardo `/api/consigli` (i suggerimenti live, veloci ma solo algoritmici)
- "dammi un'analisi più approfondita" / "questi consigli hanno senso?" → uso il sub-agente `fantacalcio-scout`, che oltre all'algoritmo controlla modulo, coerenza di rosa (es. difensori della stessa squadra per il modificatore difesa) e fa ricerche web fresche sui nomi candidati. È più lento (fa ricerche), quindi usalo per check-in ogni tanto, non ad ogni singolo giocatore

## Consigli live: cosa fa l'algoritmo e cosa no

`/api/consigli` (mostrato nel tab "La mia squadra") è **veloce ma solo algoritmico**: guarda prezzo/fascia/FMV storico, il tuo budget e slot residui per reparto, ed evita di suggerire lo stesso giocatore in due reparti diversi quando è multi-ruolo (bug corretto — prima capitava, es. un E/W compariva sia tra i difensori che tra i centrocampisti). Non legge notizie fresche, non sa se un giocatore è finito in panchina col nuovo allenatore, non pesa granché il calendario. Per quello, chiedimi un'analisi con `fantacalcio-scout` (vedi sopra).

## Prima dell'asta

1. Apri il tab **Impostazioni** e rinomina le squadre con i nomi reali dei partecipanti (o lascialo per dopo, si può rinominare a caldo — i giocatori già assegnati si spostano automaticamente sul nuovo nome).
2. Segna con la ★ i giocatori che sono già tuoi obiettivi, se li hai già in mente.
3. Rivedi in Impostazioni le regole di punteggio e la % di budget per reparto: sono precompilate con i valori che mi hai dato (10 squadre, 500 crediti, imbattibilità 0.5, modificatore difesa 1-3 con soglia media >7) più i default standard Mantra per gol/assist/cartellini/rigori — correggile se il tuo regolamento ufficiale dice altro.
