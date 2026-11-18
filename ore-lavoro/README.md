# Ore Lavoro

App Android per conteggiare le ore lavorative a paga oraria: inserimento dei turni, calendario,
guadagni a tariffa oraria, saldo ore e saldo paga, promemoria, backup.

I dati restano solo sul telefono. Il piano di progetto e le regole di calcolo sono in
[PROGETTO.md](PROGETTO.md).

## Installare l'app

1. Su GitHub: **Actions → Ore Lavoro - APK Android →** ultima esecuzione riuscita → scarica
   `ore-lavoro-apk` e apri lo zip.
2. Copia `app-release.apk` sul telefono e aprilo. Android chiede di consentire l'installazione
   da origini sconosciute: accetta.

Gli APK hanno tutti la stessa firma: una versione nuova si installa sopra la vecchia e i dati
restano. Prima di disinstallare l'app, esporta un backup da Impostazioni.

## Sviluppo

```
npm install
npm test          # test della logica di calcolo
npm run contrast  # contrasti dei colori (testo 4,5:1, elementi grafici 3:1)
npm run e2e       # prova nel browser con schermo da telefono + accessibilità (axe-core); richiede Chromium di Playwright
npm run dev       # app nel browser
npm run web       # pagina unica per provare l'app (dist/prova.html)
npm run tokens    # rigenera src/tokens.css dalle palette Radix Colors
npm run icons     # rigenera src/ui/icons.js dalle icone Lucide
npm run android   # build web + copia nel progetto Android
cd android && ./gradlew assembleRelease   # richiede JDK 21 e Android SDK
```

La chiave di firma (`android/app/ore-lavoro.keystore`) è nel repository di proposito, per avere
una firma stabile senza configurare segreti. Va bene per un'app personale installata a mano;
per pubblicare sul Play Store va sostituita con una chiave privata.
