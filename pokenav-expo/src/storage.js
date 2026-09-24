import { doc, getDoc, setDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, FIREBASE_ENABLED } from './firebase';
import { defaultUnlockedMap } from './data/locations';

export function slug(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'g'
  );
}

export function defaultPlayerData() {
  return { money: 0, inventory: [], pokemon: [] };
}

function defaultMapState() {
  return { unlocked: defaultUnlockedMap() };
}

// ---- fallback locale (usato solo se Firebase non è configurato) ----
const local = {
  players: [],
  playerData: {},
  mapState: defaultMapState(),
  listeners: { players: [], map: [], playerData: {} },
};
function notify(list) {
  list.forEach((fn) => fn());
}

// ================= PLAYERS =================
export function subscribePlayers(callback) {
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'party', 'players');
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : { list: [] };
      callback(data.list || []);
    });
  }
  const fn = () => callback(local.players);
  local.listeners.players.push(fn);
  callback(local.players);
  return () => {
    local.listeners.players = local.listeners.players.filter((f) => f !== fn);
  };
}

export async function addPlayerName(name) {
  if (FIREBASE_ENABLED) {
    await setDoc(doc(db, 'party', 'players'), { list: arrayUnion(name) }, { merge: true });
    return;
  }
  if (!local.players.includes(name)) {
    local.players = [...local.players, name];
    notify(local.listeners.players);
  }
}

export async function removePlayerName(name) {
  if (FIREBASE_ENABLED) {
    await setDoc(doc(db, 'party', 'players'), { list: arrayRemove(name) }, { merge: true });
    return;
  }
  local.players = local.players.filter((p) => p !== name);
  notify(local.listeners.players);
}

// ================= PLAYER DATA =================
export function subscribePlayerData(name, callback) {
  if (!name) {
    callback(defaultPlayerData());
    return () => {};
  }
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'playerData', slug(name));
    return onSnapshot(ref, (snap) => {
      callback(snap.exists() ? snap.data() : defaultPlayerData());
    });
  }
  const key = slug(name);
  if (!local.playerData[key]) local.playerData[key] = defaultPlayerData();
  if (!local.listeners.playerData[key]) local.listeners.playerData[key] = [];
  const fn = () => callback(local.playerData[key]);
  local.listeners.playerData[key].push(fn);
  callback(local.playerData[key]);
  return () => {
    local.listeners.playerData[key] = local.listeners.playerData[key].filter((f) => f !== fn);
  };
}

export async function getPlayerDataOnce(name) {
  if (!name) return defaultPlayerData();
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'playerData', slug(name));
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : defaultPlayerData();
  }
  const key = slug(name);
  return local.playerData[key] || defaultPlayerData();
}

export async function savePlayerData(name, data) {
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'playerData', slug(name));
    await setDoc(ref, data);
    return;
  }
  const key = slug(name);
  local.playerData[key] = data;
  notify(local.listeners.playerData[key] || []);
}

// ================= MAP STATE =================
export function subscribeMapState(callback) {
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'party', 'map');
    return onSnapshot(ref, (snap) => {
      callback(snap.exists() ? snap.data() : defaultMapState());
    });
  }
  const fn = () => callback(local.mapState);
  local.listeners.map.push(fn);
  callback(local.mapState);
  return () => {
    local.listeners.map = local.listeners.map.filter((f) => f !== fn);
  };
}

export async function saveMapState(state) {
  if (FIREBASE_ENABLED) {
    const ref = doc(db, 'party', 'map');
    await setDoc(ref, state);
    return;
  }
  local.mapState = state;
  notify(local.listeners.map);
}
