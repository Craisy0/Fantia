// === CONFIGURAZIONE FIREBASE ===
// 1. Vai su https://console.firebase.google.com, crea un progetto gratuito (basta un account Google).
// 2. Dentro il progetto: "Crea app web" (icona </>), dagli un nome qualsiasi.
// 3. Copia i valori che ti mostra in questo oggetto, qui sotto.
// 4. Nel progetto Firebase, vai su "Firestore Database" -> "Crea database" -> modalità test
//    (per iniziare velocemente; per uso reale coi tuoi amici va bene comunque, il database
//    non è pubblicamente linkato da nessuna parte).
//
// Se lasci questi valori vuoti l'app parte comunque, ma Master e Giocatori non si sincronizzano
// tra loro (ogni telefono vede solo i propri dati in locale).

export const firebaseConfig = {
  apiKey: 'INSERISCI_API_KEY',
  authDomain: 'INSERISCI_PROGETTO.firebaseapp.com',
  projectId: 'INSERISCI_PROGETTO',
  storageBucket: 'INSERISCI_PROGETTO.appspot.com',
  messagingSenderId: 'INSERISCI_SENDER_ID',
  appId: 'INSERISCI_APP_ID',
};

export const FIREBASE_ENABLED = firebaseConfig.apiKey !== 'INSERISCI_API_KEY';
