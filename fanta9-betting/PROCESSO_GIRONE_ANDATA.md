# Istruzione permanente: aggiornamento quote "Vincitore girone d'andata"

Confermato dall'utente il 2026-10-29, dopo aver trovato che `data/titolari_reali.json`
(file statico, congelato a inizio stagione) aveva formazioni titolari reali non più
aggiornate — es. Thuram (Inter) e Douvikas (Como) risultavano "non titolari" mentre in
realtà lo sono, facendo sottostimare la forza offensiva proiettata di alcune squadre
GOTTA (vedi caso Rota).

**Regola**: ogni volta che si ricalcolano le quote del girone d'andata (chiamata a
`simula_vincitore_girone_andata` / `aggiorna_quote_girone_andata`, sia dopo un import
punti sia su richiesta manuale), prima di lanciare il calcolo fare una ricerca
dettagliata e aggiornata di:

1. **Formazioni titolari reali attuali** dei club di Serie A presenti nelle rose GOTTA
   (`data/rose_gotta.json`) — confrontarle con quelle in `data/titolari_reali.json` e
   segnalare/correggere le discrepanze trovate (giocatori diventati titolari o persa la
   maglia da titolare rispetto allo snapshot congelato).
2. **Cambiamenti sostanziali di fantamedia/quotazione** dei giocatori coinvolti (es. un
   giocatore esploso o in forte calo rispetto alla `quotazione_mantra` statica in
   `data/rose_gotta.json`).

Mostrare all'utente le modifiche proposte (diff) prima di applicarle a
`data/titolari_reali.json` o `data/rose_gotta.json` — non sovrascrivere questi file
senza conferma esplicita, dato che alimentano un mercato con soldi veri. Solo dopo la
conferma, procedere con il ricalcolo delle quote.
