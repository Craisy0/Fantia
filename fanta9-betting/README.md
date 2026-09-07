# Gottabet — Scommesse della lega GOTTA

Pagina web per scommesse virtuali in fantamilioni tra le 10 squadre della lega GOTTA (Davide, Giammi, Nando, Luca, Cucca, Ale, Fili, Cri, Rota, Giorgio), con quote calcolate automaticamente (modello Poisson, come i bookmaker reali) e scommesse libere gestite da te come admin.

## Come funziona

- **Accesso con password personale**: al primo accesso ognuno sceglie la propria squadra dall'elenco e imposta una password (almeno 4 caratteri) — da quel momento in poi va inserita per rientrare con quella squadra. Il dispositivo resta collegato finché non si preme "cambia". Le password sono salvate con hash (PBKDF2-SHA256 con salt), mai in chiaro.
- **Tu (admin)** sei una voce in più nello stesso elenco ("— Admin —"), con una password unica fissata da te (di default `GOTTA123` in `config.json` → `admin.password`, cambiala subito prima di condividere il link, oppure dal tab Admin → "Cambia password").
- **Password dimenticata**: nel form di accesso c'è un link "Password dimenticata?" che spiega di chiedere a te. Tu, dal tab Admin → "Gestisci accessi squadre", vedi quali squadre hanno già impostato una password e puoi resettarla con un click: al prossimo accesso quella squadra potrà impostarne una nuova, senza bisogno di sapere la vecchia. Non c'è recupero via email/SMS (nessuna infrastruttura esterna, resta tutto nella lega).
- **Fantamilioni**: saldo virtuale separato dal budget reale dell'asta, ogni squadra parte con 20 FM (modificabile in `config.json` → `lega.saldo_iniziale`).

### Punti fantacalcio → "gol equivalenti"

L'esito 1X2 di un testa a testa è calcolato dal punteggio fantacalcio con la formula che ci hai dato:

- sotto 66 punti → 0 gol
- da 66 punti → 1 gol, poi +1 gol ogni 4 punti aggiuntivi

Modificabile in `config.json` → `formula_gol`. (Non ci sono più mercati Over/Under: solo 1X2 per i testa a testa, più le scommesse libere.)

### Quote automatiche

Per ogni testa a testa, il sistema stima quanti "gol equivalenti" farà ciascuna squadra in quella giornata, calcola con un modello di Poisson chi ha più probabilità di segnarne di più (lo stesso approccio usato realmente per stimare le quote sul mercato dei gol nel calcio), stima il pareggio a parte (vedi sotto) e infila un margine da bookmaker (25% di default, `config.json` → `quote.margine_bookmaker`) per ottenere le quote finali. Un margine più alto abbassa tutte le quote in blocco — utile finché ci sono poche giornate di dati e le stime sono meno affidabili. Attenzione a spingerlo troppo oltre: sopra ~1.30 i match molto sbilanciati iniziano a schiacciare il favorito sulla quota minima 1.01, perdendo la differenziazione che il motore delle proiezioni dà proprio a quei casi.

La stima dei gol attesi di una squadra per una giornata, in ordine di priorità:

1. **Proiezione FantaLab di quella giornata specifica**, se l'hai importata (vedi sotto) — la fonte più affidabile perché tiene già conto di formazione, forma recente, infortuni/squalifiche.
2. Altrimenti, **la media delle giornate storiche** già importate (fino alle ultime 8).
3. Altrimenti (nessun dato, es. inizio stagione), **un valore di default** (`config.json` → `quote.lambda_default`).

Il tab Admin ti dice sempre da quale delle tre fonti provengono le quote proposte, prima che tu le pubblichi.

**Correzioni al modello** (emerse testando le prime quote reali):

- **Pareggio stimato dalla differenza di forza, non dal Poisson grezzo** (`quote.pareggio_base` e `quote.pareggio_decadimento`, default 35% e 1.5): i "gol equivalenti" raggruppano punteggi fantacalcio diversi nello stesso numero di gol (es. 50 e 61 punti fanno entrambi 0 gol), quindi la probabilità di pareggio calcolata direttamente dal Poisson risulta artificialmente gonfiata — a volte perfino il favorito, il che non ha senso. Al suo posto, il pareggio è stimato come `pareggio_base × e^(-pareggio_decadimento × |differenza tra i due gol attesi|)`: più le due squadre sono vicine come forza, più il pareggio è probabile (fino a `pareggio_base`, un incontro perfettamente equilibrato — quota indicativa intorno a 2.5), e scende man mano che una delle due è nettamente più forte. Il resto della probabilità va a 1 e 2, mantenendo le proporzioni del modello di Poisson tra chi è più favorito.
- **Quota minima 1.01**: nessuna quota (nemmeno un esito fortissimo favorito) può scendere sotto 1.01, altrimenti si vincerebbe meno di quanto puntato.
- **"Tassa" sulle quote troppo alte** (`quote.quota_soglia_tassa` = 2.99, `quote.quota_massima` = 3.2, `quote.quota_tassa_scala` = 8.0): nei testa a testa molto sbilanciati il Poisson grezzo farebbe salire la quota dello sfavorito/pareggio anche a 8, 15 o oltre. Sopra 2.99 la quota viene compressa verso `quota_massima` con una curva che si appiattisce sempre di più (più lo squilibrio è grande, più la compressione è aggressiva), così le quote restano sempre nell'intorno di 3 invece di esplodere. Si applica solo alle quote calcolate in automatico (1X2 dei testa a testa); le scommesse libere che inserisci a mano non hanno questo limite.
- **Tetto massimo di vincita per schedina** (`quote.vincita_massima_per_scommessa`, default 30 FM): indipendentemente da puntata e quota totale, una singola schedina non può pagare più di questo importo — evita che una combinazione fortunata con poche giornate di dati faccia guadagnare troppo in un colpo solo. Il sito mostra la vincita potenziale (già limitata dal tetto) prima di confermare la puntata. Con `saldo_iniziale` a 20 FM il tetto (30) è ormai più alto dell'intero saldo di partenza, quindi in pratica non limita quasi mai — se vuoi che resti un vincolo stretto anche con l'economia ridotta, abbassalo (es. 5-10).
- **Vincite sempre arrotondate per difetto, senza decimali**: sia la vincita potenziale mostrata prima di confermare, sia quella effettivamente accreditata alla liquidazione, sono l'intero inferiore (es. una vincita calcolata di 18.9 FM paga 18 FM, mai 18.9 o 19).

#### Proiezioni pre-giornata da FantaLab (semi-automatico)

Prima della chiusura di ogni giornata, apri la formazione consigliata di ciascuna squadra su FantaLab e leggi il riquadro "recap": ti interessa la **Fanta Media Proiettata Titolari** (es. 64.3) — è già una proiezione del punteggio fantacalcio che quella squadra farà con la formazione ottimale suggerita, tenendo conto di tutto quello che FantaLab sa (indice di schierabilità dei singoli giocatori, forma, calendario). Incolla questi numeri nel tab Admin → "Inserisci proiezioni FantaLab" (una riga per squadra: `Nome; Fanta Media Proiettata; Indice Schierabilità` — il terzo valore è opzionale, solo per tenerne traccia). Da lì in poi, quando crei un testa a testa per quella giornata, le quote vengono calcolate direttamente sui punti proiettati — è la versione automatizzata di quello che facevi a mano confrontando i due numeri e ricavando una quota "a occhio".

Il lambda di Poisson di ogni squadra è proporzionale al rapporto tra i suoi punti proiettati e la soglia ufficiale dei "gol equivalenti" (66 punti = 1 gol): **non passa dalla conversione a gradino** usata per liquidare le scommesse reali. Con poche giornate di dati capita che nessuna squadra proietti 66+ punti — se si passasse dal gradino, tutte le proiezioni finirebbero sotto soglia e collasserebbero sullo stesso lambda minimo, con quote quasi identiche per ogni incontro. Usando il rapporto diretto sui punti, invece, la differenza di forza reale tra le squadre resta visibile nelle quote anche quando i punteggi proiettati sono bassi.

Non serve più aspettare che si accumuli storico per avere quote sensate: fin dalla prima giornata, se importi le proiezioni, le quote si basano su dati reali di quella settimana.

Le scommesse "libere" (outright, prop bet custom) non hanno una formula automatica valida in generale: tu inserisci titolo, esiti e quote a mano nel tab Admin — è l'unico tipo di mercato che crei manualmente, dato che i testa a testa vengono pubblicati in automatico dal calendario (vedi sotto).

### La schedina

I compagni non piazzano scommesse singole: giocano una **schedina** (come su Sisal), un'unica volta a giornata per squadra:

1. Nel tab "Scommesse aperte" toccano le quote che vogliono includere (anche su mercati diversi, ma tutti della stessa giornata) — ogni tocco la aggiunge a un carrello.
2. Una barra in basso mostra quante selezioni hanno e la quota combinata; toccandola si apre il popup della schedina.
3. Nel popup vedono l'elenco delle selezioni (rimovibili), la **quota totale** (le quote si moltiplicano tra loro, come su una schedina vera), inseriscono quanti fantamilioni puntare e vedono subito la vincita potenziale (già limitata dal tetto massimo).
4. Confermano: la puntata viene scalata subito dal saldo. Non possono giocarne un'altra per la stessa giornata finché non ne hanno già una (a meno che tu, admin, non la elimini per correggere un errore).

La schedina vince solo se **tutte** le selezioni sono corrette; basta che una sbagli per farla perdere. Si liquida in automatico non appena tutti i mercati coinvolti sono risolti (di solito quando importi i punteggi finali della giornata).

### Calendario ufficiale e pubblicazione automatica

`data/calendario.json` contiene gli scontri delle giornate 1-16 del girone all'italiana della lega GOTTA, già tradotti dai nomi fantasia del calendario ai nomi reali delle 10 squadre. Nel tab Admin → "Pubblica una giornata dal calendario" scrivi il numero di giornata, controlli gli scontri e pubblichi con un click tutti e 5 i mercati 1X2 con le quote calcolate dal sistema — salta in automatico gli incontri già pubblicati, quindi puoi richiamarlo senza creare doppioni. È l'unico modo per creare un testa a testa: non c'è più una creazione manuale singola. Mancano le giornate 17-20 (non ancora fornite) — appena arrivano gli screenshot mancanti si possono aggiungere a `calendario.json`.

Nel tab "Scommesse aperte" i mercati sono raggruppati sotto un titolo con il numero di giornata; ogni singolo incontro mostra solo i nomi delle due squadre (es. "Giammi vs Ale"), senza ripetere giornata e dettagli tecnici nel titolo.

### Dati delle giornate (rose/punteggi)

Non esiste un connettore ufficiale verso FantaLab o l'app Lega Fantacalcio, quindi l'unico modo pensato per adesso è: dopo ogni giornata, tu copi la tabella dei punteggi da dove la guardi di solito e la incolli nel tab Admin → "Importa punteggi giornata" (una riga per squadra, es. `Squadra 1; 72`). Il sistema riconosce automaticamente i nomi delle squadre e, appena importa i punti di una giornata, **liquida in automatico** tutti i mercati 1X2 aperti su quella giornata (e con loro le schedine che li includono, accreditando le vincite). Le scommesse libere le risolvi tu a mano scegliendo l'esito vincente.

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
7. Deploy. Render ti darà un URL pubblico tipo `https://gottabet.onrender.com` da condividere con i compagni.

**Attenzione — limite del piano gratuito**: i Web Service gratuiti di Render non hanno un disco persistente garantito: i dati (`data/state.json`) possono azzerarsi a un nuovo deploy **e anche a un semplice restart del servizio** (verificato: "Restart service" da solo riporta `state.json` alla versione salvata su GitHub). Questo azzera saldi, mercati, schedine, **e anche le password che le squadre hanno impostato** (tornano tutte a "primo accesso"). Non serve un deploy o un restart ogni giornata (basta il primo), quindi in pratica i dati restano stabili finché non tocchi il servizio da dashboard — ma quando serve toccarlo (per aggiornare il codice), segui questa procedura:

1. Dal tab Admin → "Backup e ripristino" → **"Scarica backup completo"** (salva un file `gottabet-backup-*.json` con saldi, mercati, schedine, password, log, tutto).
2. Fai il deploy/restart su Render.
3. Torna nel pannello Admin → "Backup e ripristino" → scegli il file appena scaricato → **"Ripristina da backup"**: saldi, mercati, schedine e password tornano esattamente come prima.

Il ripristino ripristina anche `config.json` (password admin, squadre, parametri delle quote) se presente nel backup. Se preferisci zero passaggi manuali, un piano con disco persistente su Render (qualche $/mese) o alternative come Railway/Fly.io con volume risolvono del tutto il problema, ma per una lega tra amici il backup/ripristino manuale (gratis, un minuto di lavoro) è più che sufficiente.

## Prima di condividere il link con i compagni

1. Le 10 squadre sono già impostate con i nomi reali (Davide, Giammi, Nando, Luca, Cucca, Ale, Fili, Cri, Rota, Giorgio); se qualcuno cambia, rinomina dal tab Admin o modificando `config.json` → `lega.squadre`.
2. Cambia la password admin di default (`cambiami123`).
3. Decidi il saldo iniziale di fantamilioni se 1000 non ti convince.

## Struttura

- `server.py` — backend, solo libreria standard Python, nessuna dipendenza.
- `config.json` — nome lega, squadre, saldo iniziale, password admin, formula gol, margine bookmaker.
- `data/state.json` — saldi, storico punti, proiezioni, mercati, schedine, log (si salva su disco a ogni azione).
- `static/` — frontend (HTML/CSS/JS vanilla).

## API principali

| Endpoint | Uso |
|---|---|
| `GET /api/state?token=` | stato completo per la squadra collegata al token (saldo, mercati, mie schedine, classifica, quali squadre sono già registrate) |
| `GET /api/mercati` | tutti i mercati (aperti/chiusi/risolti) |
| `GET /api/classifica` | classifica fantamilioni |
| `POST /api/login {squadra, password}` | primo accesso: imposta la password; accessi successivi: la verifica. Ritorna un token di sessione |
| `POST /api/logout {token}` | invalida il token di sessione |
| `POST /api/schedina {token, giornata, selezioni:[{mercato_id, esito}], importo}` | gioca la schedina della giornata (una sola per squadra), la squadra è ricavata dal token |
| `POST /api/admin/reset-password-squadra {admin_password, squadra}` | cancella la password di una squadra: al prossimo accesso potrà impostarne una nuova |
| `GET /api/admin/anteprima-h2h?admin_password=&squadra_a=&squadra_b=&giornata=` | calcola le quote 1X2 di un testa a testa senza pubblicarlo (indica anche la fonte del lambda usato) |
| `POST /api/admin/anteprima-import-proiezioni {admin_password, testo}` | controlla il parsing delle proiezioni FantaLab senza salvare |
| `POST /api/admin/importa-proiezioni {admin_password, giornata, testo}` | salva le proiezioni pre-giornata usate per calcolare le quote |
| `POST /api/admin/crea-mercato-h2h {admin_password, squadra_a, squadra_b, giornata}` | pubblica il mercato 1X2 per un incontro |
| `POST /api/admin/crea-mercato-custom {admin_password, titolo, esiti:[{label,quota}], giornata}` | pubblica una scommessa libera |
| `POST /api/admin/anteprima-import-punti {admin_password, testo}` | controlla il parsing dei punteggi senza salvare |
| `POST /api/admin/importa-punti {admin_password, giornata, testo}` | salva i punteggi e liquida automaticamente i mercati (e le schedine) di quella giornata |
| `POST /api/admin/chiudi-mercato / riapri-mercato {admin_password, mercato_id}` | blocca/riapre le nuove giocate su un mercato |
| `POST /api/admin/risolvi-mercato {admin_password, mercato_id, esito_vincente}` | liquidazione manuale (per le scommesse libere) |
| `POST /api/admin/elimina-mercato {admin_password, mercato_id}` | elimina un mercato senza schedine collegate |
| `GET /api/admin/schedine?admin_password=` | elenco di tutte le schedine giocate |
| `POST /api/admin/elimina-schedina {admin_password, schedina_id}` | elimina una schedina non ancora risolta e rimborsa la puntata |
| `POST /api/admin/correggi-saldo {admin_password, squadra, delta, motivo}` | aggiustamento manuale di un saldo |
| `POST /api/admin/rinomina-squadre {admin_password, squadre:[...], rename_map:{vecchio:nuovo}}` | rinomina le squadre |
| `POST /api/admin/cambia-password {admin_password, nuova_password}` | cambia la password admin |
| `GET /api/export?admin_password=` | backup completo di stato + configurazione (protetto: contiene la password admin) |
| `POST /api/admin/ripristina-backup {admin_password, backup}` | ripristina uno stato (e opzionalmente la configurazione) da un file scaricato con `/api/export` |
