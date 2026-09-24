export const LOCATIONS = [
  { id: 'lab_ontano', zone: 'Approdo', name: 'Laboratorio del Prof. Ontano', blurb: "Tra provette e piante rampicanti, qui ogni allenatore riceve il proprio Pokédex.", x: 70, y: 118, defaultUnlocked: true },
  { id: 'casa_nino', zone: 'Approdo', name: 'Casa di Nino', blurb: "Isolata nel prato aperto, ai margini del paese.", x: 46, y: 178, defaultUnlocked: false },
  { id: 'molo', zone: 'Approdo', name: 'Molo dei Traghetti', blurb: "Il punto d'imbarco verso il resto di Ionia, sorvegliato dall'Agente Jenny.", x: 112, y: 196, defaultUnlocked: false },
  { id: 'laghetto', zone: 'Approdo', name: 'Laghetto Nascosto', blurb: "Uno specchio d'acqua che non compare su nessuna mappa ufficiale.", x: 96, y: 78, defaultUnlocked: false },
  { id: 'percorso1', zone: 'Rotta', name: 'Sentiero per Frondaria', blurb: "La via che lascia Approdo alle spalle, battuta da allenatori di passaggio.", x: 200, y: 150, defaultUnlocked: false },
  { id: 'focolare', zone: 'Frondaria', name: 'Il Focolare tra i Rami', blurb: "Un Centro Pokémon cresciuto dentro un albero secolare ancora vivo.", x: 268, y: 104, defaultUnlocked: false },
  { id: 'emporio', zone: 'Frondaria', name: 'Emporio di Corteccia', blurb: "Rifornimenti essenziali, a prezzi che salgono un po' ogni settimana.", x: 332, y: 86, defaultUnlocked: false },
  { id: 'mercato', zone: 'Frondaria', name: 'Mercato delle Foglie Cadute', blurb: "Poche bancarelle e ancora meno raccolto, quest'anno.", x: 356, y: 138, defaultUnlocked: false },
  { id: 'tendaggi', zone: 'Frondaria', name: 'Quartiere dei Tendaggi', blurb: "Case di tela tese tra i tronchi, pronte a spostarsi con la foresta.", x: 288, y: 194, defaultUnlocked: false },
  { id: 'palestra_edera', zone: 'Frondaria', name: 'Palestra di Edera', blurb: "Una grotta ricoperta d'edera, in palio il Distintivo Foglia.", x: 336, y: 206, defaultUnlocked: false },
  { id: 'percorso2', zone: 'Rotta', name: 'Percorso 2 — verso Pietrataglio', blurb: "La dogana di confine segna il passaggio tra la foresta e la cava.", x: 400, y: 150, defaultUnlocked: false },
];

export function defaultUnlockedMap() {
  const unlocked = {};
  LOCATIONS.forEach((l) => { unlocked[l.id] = !!l.defaultUnlocked; });
  return unlocked;
}
