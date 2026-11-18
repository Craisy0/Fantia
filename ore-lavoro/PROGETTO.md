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

## 5. Fuori dal perimetro (per ora)

Sincronizzazione cloud, più datori di lavoro con tariffe diverse, esportazione PDF, iPhone.
