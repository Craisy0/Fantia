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
   `data/rose_gotta.json`) — per TUTTI i giocatori rosterati, non solo quelli attualmente
   titolari: un giocatore in panchina oggi puo' diventare titolare domani, e in ogni caso
   una quotazione aggiornata serve a cogliere subito il cambio di titolarita'.

**Metodo verificato il 2026-11-09 per il punto 2** (fonte: listone Mantra di
fantacalcio-online.com, si ricalcola dopo ogni giornata pesando 60% rendimento reale vs
costo, 20% mercato di lega, 20% schierabilita' attesa):
- Il listone FCO usa una scala diversa (sistematicamente ~1.6x piu' alta per i non
  portieri, ~1.0-1.3x per i portieri) rispetto a `quotazione_mantra` — questo scarto di
  base e' pura differenza di scala, NON segnale di rendimento, e va normalizzato (dividere
  il valore FCO fresco per ~1.6, o ~1.15 per i portieri) prima di confrontarlo 1:1.
- Il vero segnale da correggere e' il RESIDUO rispetto a questa tendenza generale: un
  giocatore il cui valore FCO normalizzato si discosta di molto (es. >=30-40%) dal valore
  statico attuale, in piu' o in meno, e' il caso da aggiornare in `quotazione_mantra`.
  Chi segue semplicemente il trend medio non va toccato.
- Una fonte di rendimento isolata (es. una sola statistica di media voto) puo' contraddire
  il segnale FCO (che pesa anche mercato reale e schierabilita' attesa, non solo voti
  recenti) — in caso di conflitto tra fonti, non applicare la correzione e segnalarlo
  all'utente invece di scegliere arbitrariamente (vedi caso Kolo Muani, 2026-11-09).
- Controllare sempre se un forte rialzo di valore nasconde in realta' un infortunio
  recente (il prezzo puo' riflettere ancora il rendimento pre-infortunio) — in tal caso la
  correzione giusta e' togliere il giocatore dai titolari (punto 1), non alzargli la
  quotazione (vedi caso Raimondo, 2026-11-09).

Mostrare all'utente le modifiche proposte (diff) prima di applicarle a
`data/titolari_reali.json` o `data/rose_gotta.json` — non sovrascrivere questi file
senza conferma esplicita, dato che alimentano un mercato con soldi veri. Solo dopo la
conferma, procedere con il ricalcolo delle quote.
