# PokéNav — versione Expo (Android + iPhone)

App nativa (non più un sito/PWA) scritta in React Native con Expo. Stesse funzioni della
versione web: login per nome, Master protetto dal codice "ontano", Pokédex/Zaino/Mappa
per ogni giocatore, pannello di controllo per il Master.

## 1. Requisiti sul tuo computer

- [Node.js](https://nodejs.org) (versione 18 o superiore)
- L'app **Expo Go** installata sul telefono (Android: Play Store: iPhone: App Store) —
  è gratuita, ed è quella che permette di far girare l'app da telefono senza pubblicarla
  su nessuno store.

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

## 4. Se vuoi un'app vera e propria installabile (senza passare da Expo Go ogni volta)

Serve un account gratuito su **expo.dev**, poi:

```
npm install -g eas-cli
eas login
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Per iOS, la build genera comunque un file installabile solo tramite TestFlight o un
account sviluppatore Apple (a pagamento, 99$/anno) se vuoi installarlo direttamente senza
Expo Go — è una limitazione di Apple, non di Expo. Su Android invece il file `.apk` che
ottieni si installa liberamente, nessun account a pagamento richiesto.

## Struttura del progetto

```
App.js                      punto d'ingresso, carica i font
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
