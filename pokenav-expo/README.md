# PokéNav — versione Expo (Android + iPhone)

App nativa (non più un sito/PWA) scritta in React Native con Expo. Stesse funzioni della
versione web: login per nome, Master protetto dal codice "ontano", Pokédex/Zaino/Mappa
per ogni giocatore, pannello di controllo per il Master.

## 1. Requisiti sul tuo computer

- [Node.js](https://nodejs.org) (versione 18 o superiore)
- L'app **Expo Go** installata sul telefono (Android: Play Store; iPhone: App Store) —
  è gratuita, ed è quella che permette di far girare l'app da telefono senza pubblicarla
  su nessuno store. Il progetto usa **Expo SDK 57**, cioè la versione supportata
  dall'Expo Go attuale sugli store: tenete Expo Go aggiornato.

## 2. Collega un database condiviso (Firebase — gratis)

Senza questo passaggio l'app funziona ma Master e giocatori NON si sincronizzano tra loro
(ognuno vede solo i propri dati sul proprio telefono).

1. Vai su **console.firebase.google.com** → crea un progetto (basta un account Google, è gratis).
2. Dentro il progetto: icona **</>** ("Aggiungi app web") → dagli un nome qualsiasi → copia
   l'oggetto di configurazione che ti mostra (le chiavi `apiKey`, `authDomain`, ecc.).
3. Apri il file `src/firebaseConfig.js` in questo progetto e incolla quei valori al posto
   dei segnaposto `INSERISCI_...`.
4. Nel progetto Firebase: **Firestore Database** → **Crea database** → modalità **test**
   (va benissimo per uso privato con i tuoi amici; il database non è linkato da nessuna
   parte pubblica).

## 3. Avvia l'app

```
npm install
npx expo start
```

Si apre una pagina col **QR code**. Ognuno (tu e i tuoi amici):
- **Android**: apre Expo Go → "Scan QR code" → inquadra il codice.
- **iPhone**: apre l'app **Fotocamera** (non Expo Go) → inquadra il codice → tocca la
  notifica che appare in alto → si apre dentro Expo Go.

Tutti devono essere sulla **stessa rete Wi-Fi** del computer che ha lanciato `expo start`
(oppure, se siete in posti diversi, avvia con `npx expo start --tunnel` — più lento ma
funziona ovunque).

Per provarla al volo dal computer, senza telefono: `npm run web` (si apre nel browser).

Se in futuro aggiorni Expo, usa `npx expo install --fix` per riallineare le versioni delle
librerie (non modificarle a mano in `package.json`), e `npx expo-doctor` per un controllo.

## 4. App installabile su Android (APK) — senza computer acceso e senza Expo Go

Il file `eas.json` è già pronto: il profilo `preview` produce un **.apk** da installare
direttamente sui telefoni Android. La build gira sui server di Expo (gratis, con un po' di
coda), non serve Android Studio.

**Prima di fare la build, configura Firebase (sezione 2)**: le chiavi vengono "cotte"
dentro l'APK. Se le lasci vuote, ogni telefono avrà solo i suoi dati e non vi vedrete a vicenda.

Una volta sola:

```
npm install -g eas-cli
eas login          # account gratuito su expo.dev
eas init           # collega il progetto al tuo account (conferma con Y)
```

`eas init` aggiunge a `app.json` l'id del progetto: fai commit di quella modifica.

Ogni volta che vuoi una nuova versione:

```
npm run build:apk
```

Alla prima build ti chiede di generare la chiave di firma Android: rispondi **Y** (la
conserva Expo, tienila sempre la stessa, altrimenti gli aggiornamenti non si installano
sopra la versione vecchia). Dopo 10-20 minuti ottieni un **link e un QR code**: aprilo dal
telefono Android, scarica l'APK e installalo (Android chiede di consentire l'installazione
da "origini sconosciute" per il browser: è normale). Lo stesso link lo puoi girare al gruppo.

Per aggiornare l'app: rifai `npm run build:apk` e reinstallate l'APK nuovo sopra quello
vecchio (i dati su Firebase restano).

**iPhone**: Apple non permette di installare app fuori dall'App Store senza un account
sviluppatore a pagamento (99$/anno, poi `eas build --platform ios` + TestFlight). Chi ha
l'iPhone può continuare a usare Expo Go come nella sezione 3.

## Struttura del progetto

```
App.js                      punto d'ingresso, carica i font
eas.json                    profili di build EAS (preview = APK Android)
src/
  firebaseConfig.js          ← qui vanno le tue chiavi Firebase
  firebase.js                 inizializzazione Firebase
  storage.js                  lettura/scrittura dati condivisi (in tempo reale)
  theme.js                     colori e stili condivisi
  data/
    locations.js               i luoghi della mappa di Ionia
    pokelist.json               i 1025 Pokémon (nome italiano, tipi)
  components/                 pezzi riutilizzabili (device, icone, bottoni...)
  screens/
    BootScreen.js               login / accesso Master
    PlayerScreen.js              Home + Pokédex + Zaino + Mappa (giocatore)
    MasterScreen.js              Home + Party + Pokédex + Zaino + Mappa (master)
  navigation/
    AppNavigator.js
```

## Note

- Il codice Master resta **"ontano"** (modificabile in `BootScreen.js`).
- I dati (giocatori, Pokémon assegnati, portafoglio, mappa sbloccata) vivono su Firestore
  e si aggiornano **in tempo reale** su tutti i telefoni collegati — meglio della versione
  web, che doveva ricontrollare ogni pochi secondi.
- Le icone dei Pokémon vengono scaricate al volo da PokeAPI (serve connessione internet).
