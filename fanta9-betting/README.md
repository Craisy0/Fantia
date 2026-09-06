# Fanta 9 — Scommesse

Pagina web per scommesse virtuali in fantamilioni tra le 9 squadre della tua lega, con quote calcolate automaticamente (modello Poisson, come i bookmaker reali) e scommesse libere gestite da te come admin.

## Come funziona

- **Nessun login per i compagni**: al primo accesso ognuno scegli la propria squadra da un elenco (salvata sul proprio dispositivo). Semplice, ma chi ha il link può scegliere qualsiasi squadra — se vi serve più controllo, si può aggiungere una password per squadra in futuro.
- **Tu (admin)** sblocchi le funzioni di gestione con una password (tab "Admin" → inserisci password). Cambiala subito in `config.json` → `admin.password` prima di condividere il link, oppure dal tab Admin → "Cambia password".
- **Fantamilioni**: saldo virtuale separato dal budget reale dell'asta, ogni squadra parte con 1000 FM (modificabile in `config.json` → `lega.saldo_iniziale`).

### Punti fantacalcio → "gol equivalenti"

Le scommesse 1X2 e Over/Under funzionano come sul sito di un bookmaker (tipo Sisal), ma il "gol" è calcolato dal punteggio fantacalcio con la formula che ci hai dato:

- sotto 66 punti → 0 gol
- da 66 punti → 1 gol, poi +1 gol ogni 4 punti aggiuntivi

Modificabile in `config.json` → `formula_gol`.

### Quote automatiche

Per ogni testa a testa, il sistema stima quanti "gol equivalenti" fa in media ciascuna squadra (media degli ultimi 8 turni disponibili, o un valore di default se non c'è storico), poi calcola le probabilità di 1/X/2 e di Over/Under con un modello di Poisson (lo stesso approccio usato realmente per stimare le quote sul mercato dei gol nel calcio), e infila un margine da bookmaker (7% di default, `config.json` → `quote.margine_bookmaker`) per ottenere le quote finali. Più storico importi giornata per giornata, più le quote diventano rappresentative.

Le scommesse "libere" (outright, prop bet custom) non hanno una formula automatica valida in generale: tu inserisci titolo, esiti e quote a mano nel tab Admin.

### Dati delle giornate (rose/punteggi)

Non esiste un connettore ufficiale verso FantaLab o l'app Lega Fantacalcio, quindi l'unico modo pensato per adesso è: dopo ogni giornata, tu copi la tabella dei punteggi da dove la guardi di solito e la incolli nel tab Admin → "Importa punteggi giornata" (una riga per squadra, es. `Squadra 1; 72`). Il sistema riconosce automaticamente i nomi delle squadre e, appena importa i punti di una giornata, **liquida in automatico** tutte le scommesse 1X2/Over-Under aperte su quella giornata (accredita le vincite, aggiorna i saldi). Le scommesse libere le risolvi tu a mano scegliendo l'esito vincente.

## Avvio in locale (per provare prima di pubblicare)

```
python server.py 8765
```

Poi apri `http://localhost:8765`.

## Pubblicarla online (gratis) per i tuoi compagni

Consigliato **Render** (piano free):

1. Vai su [render.com](https://render.com), crea un account gratuito e collega il tuo GitHub.
2. "New" → "Web Service" → seleziona il repository `craisy0/fantia`.
3. **Root Directory**: `fanta9-betting`
4. **Runtime**: Python 3
5. **Build Command**: (lascialo vuoto, non ci sono dipendenze)
6. **Start Command**: `python server.py`
7. Deploy. Render ti darà un URL pubblico tipo `https://fanta9-scommesse.onrender.com` da condividere con i compagni.

**Attenzione — limite del piano gratuito**: i Web Service gratuiti di Render non hanno un disco persistente garantito: i dati (`data/state.json`) possono azzerarsi a un nuovo deploy o dopo lunga inattività. Per una lega tra amici che gioca per una stagione, il rischio più concreto è perdere storico/saldi se rifai un deploy — per sicurezza:
- Non serve un deploy ogni giornata (basta il primo), quindi in pratica i dati restano stabili finché non tocchi il codice.
- Fai un backup periodico scaricando `GET /api/export` (salvalo da browser o con `curl`).
- Se preferisci zero rischi, un piano con disco persistente su Render (qualche $/mese) o alternative come Railway/Fly.io con volume risolvono del tutto il problema.

## Prima di condividere il link con i compagni

1. Rinomina le 9 squadre con i nomi reali (tab Admin, o modifica `config.json` → `lega.squadre` prima del deploy).
2. Cambia la password admin di default (`cambiami123`).
3. Decidi il saldo iniziale di fantamilioni se 1000 non ti convince.

## Struttura

- `server.py` — backend, solo libreria standard Python, nessuna dipendenza.
- `config.json` — nome lega, squadre, saldo iniziale, password admin, formula gol, margine bookmaker.
- `data/state.json` — saldi, storico punti, mercati, scommesse, log (si salva su disco a ogni azione).
- `static/` — frontend (HTML/CSS/JS vanilla).

## API principali

| Endpoint | Uso |
|---|---|
| `GET /api/state?squadra=X` | stato completo per la squadra X (saldo, mercati, mie scommesse, classifica) |
| `GET /api/mercati` | tutti i mercati (aperti/chiusi/risolti) |
| `GET /api/classifica` | classifica fantamilioni |
| `POST /api/scommessa {squadra, mercato_id, esito, importo}` | piazza una giocata |
| `GET /api/admin/anteprima-h2h?admin_password=&squadra_a=&squadra_b=&giornata=` | calcola le quote di un testa a testa senza pubblicarlo |
| `POST /api/admin/crea-mercato-h2h {admin_password, squadra_a, squadra_b, giornata}` | pubblica 1X2 + Over/Under per un incontro |
| `POST /api/admin/crea-mercato-custom {admin_password, titolo, esiti:[{label,quota}], giornata}` | pubblica una scommessa libera |
| `POST /api/admin/anteprima-import-punti {admin_password, testo}` | controlla il parsing dei punteggi senza salvare |
| `POST /api/admin/importa-punti {admin_password, giornata, testo}` | salva i punteggi e liquida automaticamente i mercati di quella giornata |
| `POST /api/admin/chiudi-mercato / riapri-mercato {admin_password, mercato_id}` | blocca/riapre le nuove giocate su un mercato |
| `POST /api/admin/risolvi-mercato {admin_password, mercato_id, esito_vincente}` | liquidazione manuale (per le scommesse libere) |
| `POST /api/admin/elimina-mercato {admin_password, mercato_id}` | elimina un mercato senza giocate |
| `POST /api/admin/correggi-saldo {admin_password, squadra, delta, motivo}` | aggiustamento manuale di un saldo |
| `POST /api/admin/rinomina-squadre {admin_password, squadre:[...], rename_map:{vecchio:nuovo}}` | rinomina le 9 squadre |
| `POST /api/admin/cambia-password {admin_password, nuova_password}` | cambia la password admin |
| `GET /api/export` | backup completo di stato + configurazione |
