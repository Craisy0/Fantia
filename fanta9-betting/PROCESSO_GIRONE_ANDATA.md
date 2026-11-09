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

**Metodo (rivisto il 2026-11-09, seconda passata nella stessa giornata)**: il primo
tentativo — confrontare `quotazione_mantra` con il listone Mantra di
fantacalcio-online.com (FCO), normalizzato per lo scarto di scala sistemico (~1.6x) — si
e' rivelato insufficiente: ha lasciato passare Lautaro Martinez (infortunato da un mese,
ancora segnato titolare) e Gonçalo Ramos (prezzo FCO gonfiato da cartellino/reputazione
nonostante un rendimento reale scarso, 2-3 gol in 11 presenze). Il prezzo di mercato FCO
pesa anche "mercato di lega" e "schierabilita' attesa", non solo il rendimento recente,
quindi puo' mascherare sia infortuni che flop. Usare invece, per ciascun ricalcolo, DUE
controlli diretti e separati — ciascuno fatto con UNA fetch su una pagina aggregata, non
ricerche giocatore per giocatore (molto piu' efficiente su ~150-170 nomi):

1. **Indisponibilita'** (sempre, su TUTTI i titolari attuali, non solo i sospetti): una
   pagina aggregata con l'elenco completo di infortunati/squalificati di tutta la Serie A
   (es. fantacalcio.it/indisponibili-serie-a, o sosfanta/calciodangolo equivalenti),
   fetchata una volta sola e incrociata con l'elenco dei titolari rosterati. Rimuovere da
   `titolari_reali.json` chi risulta infortunato/squalificato con affidabilita' alta o
   media (diagnosi concreta anche se i tempi di rientro sono incerti); lasciare chi ha
   solo un generico "da valutare" senza diagnosi, e segnalarlo come da ricontrollare al
   giro successivo.
2. **Fantamedia reale stagionale** (non il prezzo di un listone): una pagina con la
   classifica/tabella fantamedia di TUTTA la Serie A 2026/27 in corso (es.
   fantacalcio.it/statistiche-serie-a o fantacalcio.dev/stagioni/2026-27/fantamedia-migliore
   — spesso i dati sono incorporati nell'HTML grezzo, leggibili via curl anche quando il
   fetch "normale" restituisce poco). Calibrare una curva quotazione->fantamedia-attesa
   PER RUOLO (portieri/difensori/centrocampisti/trequartisti/attaccanti separati, non una
   curva unica: altrimenti un portiere sembra sempre un flop rispetto a un attaccante) usando
   solo giocatori con un campione di partite decente, poi correggere `quotazione_mantra`
   di chi si scosta nettamente (es. >=0.70 punti di fantamedia) dall'attesa della propria
   fascia. Diffidare dei campioni piccoli (<6-7 presenze): correggere con piu' cautela.
   Controllare sempre, per i rialzi, se nascondono in realta' un infortunio recente (il
   prezzo/fantamedia puo' riflettere ancora il rendimento pre-infortunio) — in tal caso la
   correzione giusta e' il punto 1 (togliere dai titolari), non alzare la quotazione
   (vedi caso Raimondo, 2026-11-09).

Mostrare all'utente le modifiche proposte (diff) prima di applicarle a
`data/titolari_reali.json` o `data/rose_gotta.json` — non sovrascrivere questi file
senza conferma esplicita, dato che alimentano un mercato con soldi veri. Solo dopo la
conferma, procedere con il ricalcolo delle quote.
