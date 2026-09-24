export const PLAYER_THEME = {
  caseTop: '#ff7a63',
  caseBottom: '#e2382b',
  screen: '#eef9fb',
  screenDim: '#dcf0f4',
  card: '#ffffff',
  ink: '#20232b',
  inkMuted: '#7c8a97',
  accentGood: '#3fae72',
  accentGoodDark: '#2c8558',
  accentBad: '#e5493f',
  spark: '#ffcc33',
};

export const MASTER_THEME = {
  caseTop: '#4a2f77',
  caseBottom: '#160b28',
  screen: '#171c2b',
  screenDim: '#10141f',
  card: '#232a3d',
  ink: '#eef3fb',
  inkMuted: '#8c98b3',
  accentGood: '#4fd18a',
  accentGoodDark: '#33a06a',
  accentBad: '#ff6a5e',
  spark: '#ff5fce',
};

export const CREATURE = '#7bd6e8';
export const CREATURE_DARK = '#2f8fae';

export const TYPE_COLORS = {
  Erba: '#4c9a5b', Veleno: '#a24aa0', Fuoco: '#e2732c', Acqua: '#4f83d6', Elettro: '#e0b628',
  Volante: '#8f9fe0', Normale: '#9a9a80', Coleottero: '#9dab27', Terra: '#c9a15a', Roccia: '#a8935a',
  Lotta: '#b23a30', Psico: '#e0578c', Ghiaccio: '#5fc2c2', Spettro: '#5f4d8a', Drago: '#5b4de0',
  Buio: '#5b5045', Acciaio: '#8f95a8', Folletto: '#e08fa8',
};

export function typeColor(t) {
  return TYPE_COLORS[t] || '#8a806c';
}

export function spriteUrl(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

export const APP_COLORS = {
  dex: '#3aa6c2',
  zaino: '#e0a828',
  mappa: '#4c9a5b',
  giocatori: '#8a5fd6',
};
