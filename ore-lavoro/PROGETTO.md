# Ore Lavoro — documento di progetto

App Android per conteggiare le ore lavorative di un lavoratore a **paga oraria / a chiamata**.

## 1. Ricerca

Funzioni ricorrenti nelle app del settore (WorkTrak, ShiftBuddy, Timesheet, Work Shift Calendar):
timbratura con pause, straordinari automatici con maggiorazioni, calendario, riepilogo paga,
promemoria di timbratura, uso offline, esportazione dati.

Scelte tecniche e motivazione:

| Scelta | Motivo |
|---|---|
| **Capacitor 8** (web app in guscio nativo Android) | Un solo codice, APK vero, accesso a notifiche e file. JDK 21 richiesto. |
| **Vite + JavaScript a moduli, senza framework** | App piccola: meno dipendenze, avvio rapido, facile da mantenere. |
| **Dati solo sul telefono** (`localStorage` del WebView) | Nessun server, nessun account, funziona offline. Il backup su file copre il cambio telefono. |
| **Logica di calcolo separata dall'interfaccia** | È la parte dove un errore costa soldi: deve essere testabile da sola. |
| **GitHub Actions** | Compila l'APK a ogni modifica, scaricabile senza avere Android Studio. |

## 2. Requisiti

Base: inserimento e modifica manuale dei turni (inizio e fine), storico, riepilogo
settimanale e mensile.

Richiesti: calcolo guadagni · promemoria · backup · calendario · saldo.
Tolti dopo le prove: cronometro, pause, straordinari, maggiorazioni, assenze (ferie, permessi, malattia).

Regole di calcolo:

- Un turno appartiene al giorno in cui **inizia** (anche se passa la mezzanotte).
- Ogni turno salva la **tariffa del momento**: cambiare tariffa non riscrive il passato.
- Paga di un turno = ore × tariffa oraria. Nessuna maggiorazione.
- Il turno nuovo prende la tariffa delle impostazioni, senza campo nel modulo; modificarlo non la cambia.
- Domeniche e festività nazionali italiane sono solo segnate in rosso nel calendario.
- Saldo ore = ore lavorate − obiettivo mensile. Saldo paga = maturato − pagamenti ricevuti.

## 3. Architettura

```
src/
  core/      logica pura, senza DOM (testata)
    time.js      date, durate, formattazione
    holidays.js  festività italiane
    calc.js      ore, guadagni, riepiloghi, saldi
    store.js     stato, validazione, backup/ripristino, migrazioni
  platform/  ponte verso Android (con ripiego per browser)
    notifications.js   promemoria
    files.js           salvataggio/condivisione backup
  ui/        schermate: Oggi · Calendario · Riepilogo · Impostazioni
tests/       test della logica (node --test)
android/     progetto nativo generato da Capacitor
```

## 4. Piano di lavoro

Ogni punto si chiude con una revisione (test o prova a schermo) prima di passare al successivo.

| # | Punto | Verifica |
|---|---|---|
| 1 | Ricerca e scelte tecniche | questo documento |
| 2 | Struttura progetto + strumenti di build | `npm run build` |
| 3 | Logica: tempo, festività, calcoli, saldi | test automatici |
| 4 | Archivio dati, backup e ripristino | test automatici |
| 5 | Schermata Oggi: totale del giorno, turni del giorno | prova nel browser |
| 6 | Calendario + dettaglio giorno | prova nel browser |
| 7 | Riepilogo: mese, guadagni, saldi, pagamenti | prova nel browser |
| 8 | Impostazioni, promemoria, backup | prova nel browser |
| 9 | Guscio Android + APK | compilazione APK |
| 10 | Compilazione automatica su GitHub | workflow |
| 11 | Revisione finale | test + prova completa |

## 4b. Linee grafiche

Scelte prese dopo una ricerca su Material 3, su linee guida per app mobili e su skill di design pubblicate su
GitHub (la skill `frontend-design` di Anthropic e alcune per app mobili). I repository letti sono piccoli e ho
letto soprattutto i README: le uso come lista di controllo, non come modello.

- **Superfici a toni** (sfondo, scheda, tessera) invece di ombre e bordi.
- **Un solo punto colorato per schermata**: il totale di oggi, il guadagno del mese. Il resto resta neutro.
- **Scala tipografica ridotta**: 12, 14, 16, 20 e 28 px (56 per il totale), tre pesi (400, 600, 700);
  spaziature su griglia da 4/8 px. Inter è incluso nell'app, cifre allineate in colonna.
- **Bersagli di tocco di almeno 48 px**.
- **Niente etichette in maiuscolo né stringhe unite da puntini**: ore e guadagno sono valori affiancati.
- **Stati vuoti che dicono cosa fare**, non solo "niente qui".
- **Contrasti controllati da `npm run contrast`**: 4,5:1 per il testo, 3:1 per bordi dei campi, barre e
  interruttori. Eseguito anche nella compilazione automatica.
- **Grafico del mese**: un colore, una scala, riga tratteggiata a 8 ore; si legge il giorno toccando una
  colonna o scorrendo il dito.
- **Calendario**: riempimento in 4 livelli in base alle ore; domeniche e festività con un puntino rosso (il
  rosso sul numero non era leggibile sui riempimenti intensi).
- **Movimento solo in risposta a un'azione** (apertura dei moduli, pressione dei pulsanti); disattivato se il
  telefono lo chiede.
- **Avvio e icona**: avvio a tinta unita come lo sfondo dell'app (chiaro e scuro), senza loghi estranei;
  icona con un orologio dentro un anello di avanzamento, lo stesso segno dell'obiettivo mensile.

## 5. Fuori dal perimetro (per ora)

Sincronizzazione cloud, più datori di lavoro con tariffe diverse, esportazione PDF, iPhone.
