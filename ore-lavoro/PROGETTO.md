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
- Cambiando la tariffa, se ci sono turni già registrati con una tariffa diversa l'app chiede se ricalcolare anche quelli
  (mostrando quanti sono e il guadagno prima e dopo), o applicarla solo ai turni nuovi, o annullare.
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

**Idea: il quadrante di un orologio.** Indaco = ore, verde acqua = paga (le due cose che l'app misura). Il
totale di oggi sta dentro un quadrante, e lo stesso segno ritorna nell'anello dell'obiettivo e nell'icona.

**Strumenti usati** (scelti dopo una ricerca su GitHub; gli strumenti di terzi sono stati letti e controllati
prima dell'uso):
- Skill di design installate in `.claude/skills/` (elenco, versioni e licenze in `.claude/skills/SOURCES.md`):
  `frontend-design` (Anthropic), `ui-ux-pro-max`, e alcune di Emil Kowalski (`mobile-native`, `emil-design-eng`,
  `break-ui`, ...). Non installate, di proposito: Impeccable e taste-skill (eseguono programmi o hook a ogni modifica).
- Pacchetti npm: **Radix Colors** (le palette, tradotte in `src/tokens.css` da `npm run tokens`), **Lucide**
  (icone, `npm run icons`), **Open Props** (ombre e curve di animazione), **Bricolage Grotesque** per titoli e numeri
  e **Inter** per il testo, **axe-core** + **Playwright** per la prova nel browser (`npm run e2e`).

**Scelte**
- **Sfondo**: grigio chiarissimo uniforme (`#f3f4f8`) con schede bianche, come nei primi test. Provati aloni
  colorati e grana, poi tolti su richiesta. Niente sfumature sulle schede.
- **Scheda principale**: l'unico punto audace di ogni schermata. In Oggi è un quadrante con tacche dei minuti e
  delle ore e un anello che si riempie fino a 8 ore (l'arco si anima solo quando si cambia scheda).
- **Superfici a toni** con ombre tinte di indaco; barra in basso fluttuante con la scheda attiva piena.
- **Scala tipografica ridotta** (12, 14, 16, 20, 28, 36 px) su griglia da 4/8 px, tre pesi; cifre allineate.
- **Bersagli di tocco di almeno 48 px**; il grafico del mese è un unico cursore (tocco, scorrimento del dito,
  frecce da tastiera) perché 30 colonne sottili non sono bersagli accettabili.
- **Niente etichette in maiuscolo né stringhe unite da puntini**; stati vuoti che dicono cosa fare.
- **Contrasti**: `npm run contrast` (4,5:1 per il testo, 3:1 per elementi grafici, caso peggiore sui fondi sfumati)
  e axe-core nella prova nel browser. Le scale Radix sono "quasi" a norma: quattro colori sono stati scuriti.
- **WebView Android**: valori di riserva per `color-mix()` e `dvh`; niente `user-scalable=no`; colore della barra
  di stato per tema; tocco senza ritardo (indicazioni della skill `mobile-native`).
- **Avvio e icona**: avvio a tinta unita come lo sfondo dell'app (chiaro e scuro); icona con un orologio dentro un
  anello di avanzamento.

## 5. Fuori dal perimetro (per ora)

Sincronizzazione cloud, più datori di lavoro con tariffe diverse, esportazione PDF, iPhone.
