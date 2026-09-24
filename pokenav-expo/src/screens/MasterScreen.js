import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, Image, ScrollView, TouchableOpacity, FlatList, StyleSheet, Switch } from 'react-native';
import DeviceFrame from '../components/DeviceFrame';
import HomeBackdrop from '../components/HomeBackdrop';
import TopBar from '../components/TopBar';
import HomeBar from '../components/HomeBar';
import AppTile from '../components/AppTile';
import { Button, EmptyState } from '../components/Button';
import { MASTER_THEME, APP_COLORS, spriteUrl } from '../theme';
import { LOCATIONS } from '../data/locations';
import POKELIST from '../data/pokelist.json';
import {
  subscribePlayers, addPlayerName, removePlayerName,
  subscribePlayerData, getPlayerDataOnce, savePlayerData,
  subscribeMapState, saveMapState,
} from '../storage';

const APPS = [
  { k: 'giocatori', label: 'Party', icon: 'users', color: APP_COLORS.giocatori },
  { k: 'dex', label: 'Pokédex', icon: 'dex', color: APP_COLORS.dex },
  { k: 'zaino', label: 'Zaino', icon: 'bag', color: APP_COLORS.zaino },
  { k: 'mappa', label: 'Mappa', icon: 'map', color: APP_COLORS.mappa },
];

export default function MasterScreen({ navigation }) {
  const [tab, setTab] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const unsub = subscribePlayers(setPlayers);
    return unsub;
  }, []);

  return (
    <View style={styles.outer}>
      <DeviceFrame theme={MASTER_THEME}>
        <TopBar theme={MASTER_THEME} title="Modalità Master" subtitle="PANNELLO DI CONTROLLO" onExit={() => navigation.goBack()} />
        <View style={styles.content}>
          {tab === null && (
            <HomeBackdrop caseBottom={MASTER_THEME.caseBottom}>
              <View style={styles.grid}>
                {APPS.map((a) => (
                  <AppTile key={a.k} label={a.label} iconName={a.icon} color={a.color} onPress={() => setTab(a.k)} />
                ))}
              </View>
            </HomeBackdrop>
          )}
          {tab === 'giocatori' && <PlayersView players={players} />}
          {tab === 'dex' && <DexAdminView players={players} selected={selected} setSelected={setSelected} />}
          {tab === 'zaino' && <WalletAdminView players={players} selected={selected} setSelected={setSelected} />}
          {tab === 'mappa' && <MapAdminView />}
        </View>
        <HomeBar theme={MASTER_THEME} active={tab !== null} onPress={() => setTab(null)} />
      </DeviceFrame>
    </View>
  );
}

// ---------------- Party ----------------
function PlayersView({ players }) {
  const [name, setName] = useState('');
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <Text style={styles.sectionTitle}>PARTY ATTUALE</Text>
      {players.length === 0 ? (
        <EmptyState glyph="🧭" text="Nessun giocatore ancora. Aggiungine uno qui sotto, oppure fai entrare i tuoi amici dalla schermata iniziale." />
      ) : (
        players.map((p) => (
          <View key={p} style={styles.listRow}>
            <Text style={styles.listRowText}>{p}</Text>
            <Button label="Rimuovi" small color={MASTER_THEME.screenDim} textColor={MASTER_THEME.ink} onPress={() => removePlayerName(p)} />
          </View>
        ))
      )}
      <Text style={styles.sectionTitle}>AGGIUNGI GIOCATORE</Text>
      <View style={styles.row}>
        <TextInput value={name} onChangeText={setName} placeholder="Nome allenatore..." placeholderTextColor="#8994ac" style={styles.input} />
        <Button label="Aggiungi" color={MASTER_THEME.spark} textColor="#241613" onPress={async () => { if (name.trim()) { await addPlayerName(name.trim()); setName(''); } }} />
      </View>
    </ScrollView>
  );
}

// ---------------- Player selector chips ----------------
function PlayerSelect({ players, selected, setSelected }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ gap: 8 }}>
      {players.length === 0 && <Text style={styles.noPlayersHint}>Nessun giocatore nel party</Text>}
      {players.map((p) => (
        <TouchableOpacity
          key={p}
          onPress={() => setSelected(p)}
          style={[styles.chip, { backgroundColor: selected === p ? MASTER_THEME.spark : MASTER_THEME.card }]}
        >
          <Text style={[styles.chipText, { color: selected === p ? '#241613' : MASTER_THEME.ink }]}>{p}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ---------------- Pokédex admin ----------------
function DexAdminView({ players, selected, setSelected }) {
  const [data, setData] = useState({ pokemon: [] });
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!selected) return;
    const unsub = subscribePlayerData(selected, setData);
    return unsub;
  }, [selected]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return POKELIST.filter((p) => p[1].toLowerCase().includes(q) || p[2].toLowerCase().includes(q) || (p[3] && p[3].toLowerCase().includes(q))).slice(0, 30);
  }, [query]);

  async function addMon(mon, nick) {
    const current = await getPlayerDataOnce(selected);
    const pokemon = [...(current.pokemon || []), { id: mon[0], name: mon[1], t1: mon[2], t2: mon[3], nick: nick || '' }];
    await savePlayerData(selected, { ...current, pokemon });
  }

  async function removeMon(idx) {
    const current = await getPlayerDataOnce(selected);
    const pokemon = [...(current.pokemon || [])];
    pokemon.splice(idx, 1);
    await savePlayerData(selected, { ...current, pokemon });
  }

  return (
    <View style={{ flex: 1 }}>
      <PlayerSelect players={players} selected={selected} setSelected={setSelected} />
      {!selected ? (
        <EmptyState glyph="📖" text="Seleziona un giocatore per gestire il suo Pokédex." />
      ) : (
        <FlatList
          contentContainerStyle={styles.pad}
          data={results}
          keyExtractor={(item) => String(item[0])}
          ListHeaderComponent={
            <>
              <Text style={styles.sectionTitle}>AGGIUNGI A {selected.toUpperCase()}</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Cerca per nome o tipo..."
                placeholderTextColor="#8994ac"
                style={styles.input}
              />
              <View style={{ height: 8 }} />
            </>
          }
          renderItem={({ item }) => <PokeResultRow mon={item} onAdd={(nick) => addMon(item, nick)} />}
          ListFooterComponent={
            <>
              <Text style={styles.sectionTitle}>POKÉDEX DI {selected.toUpperCase()}</Text>
              {(data.pokemon || []).length === 0 ? (
                <EmptyState glyph="✦" text="Nessun Pokémon ancora catturato." />
              ) : (
                (data.pokemon || []).map((m, i) => (
                  <View key={i} style={styles.caughtRow}>
                    <Image source={{ uri: spriteUrl(m.id) }} style={styles.smallSprite} resizeMode="contain" />
                    <Text style={styles.caughtName} numberOfLines={1}>{m.nick || m.name}{m.nick ? `  (${m.name})` : ''}</Text>
                    <Button label="Rimuovi" small color={MASTER_THEME.screenDim} textColor={MASTER_THEME.ink} onPress={() => removeMon(i)} />
                  </View>
                ))
              )}
            </>
          }
        />
      )}
    </View>
  );
}

function PokeResultRow({ mon, onAdd }) {
  const [nick, setNick] = useState('');
  return (
    <View style={styles.resultRow}>
      <Image source={{ uri: spriteUrl(mon[0]) }} style={styles.smallSprite} resizeMode="contain" />
      <Text style={styles.resultName} numberOfLines={1}>{mon[1]} · {mon[2]}{mon[3] ? '/' + mon[3] : ''}</Text>
      <TextInput value={nick} onChangeText={setNick} placeholder="nomignolo" placeholderTextColor="#8994ac" style={styles.nickInput} />
      <TouchableOpacity style={styles.plusBtn} onPress={() => { onAdd(nick); setNick(''); }}>
        <Text style={styles.plusText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------- Wallet admin ----------------
function WalletAdminView({ players, selected, setSelected }) {
  const [data, setData] = useState({ money: 0, inventory: [] });
  const [customAmount, setCustomAmount] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');

  useEffect(() => {
    if (!selected) return;
    const unsub = subscribePlayerData(selected, setData);
    return unsub;
  }, [selected]);

  async function applyMoney(delta) {
    const current = await getPlayerDataOnce(selected);
    const money = Math.max(0, (current.money || 0) + delta);
    await savePlayerData(selected, { ...current, money });
  }

  async function addItem() {
    if (!itemName.trim()) return;
    const current = await getPlayerDataOnce(selected);
    const inventory = [...(current.inventory || [])];
    const qty = parseInt(itemQty, 10) || 1;
    const existing = inventory.find((i) => i.name.toLowerCase() === itemName.trim().toLowerCase());
    if (existing) existing.qty += qty;
    else inventory.push({ name: itemName.trim(), qty });
    await savePlayerData(selected, { ...current, inventory });
    setItemName('');
    setItemQty('1');
  }

  async function removeItem(idx) {
    const current = await getPlayerDataOnce(selected);
    const inventory = [...(current.inventory || [])];
    inventory.splice(idx, 1);
    await savePlayerData(selected, { ...current, inventory });
  }

  return (
    <View style={{ flex: 1 }}>
      <PlayerSelect players={players} selected={selected} setSelected={setSelected} />
      {!selected ? (
        <EmptyState glyph="🎒" text="Seleziona un giocatore per gestire zaino e Pokédollari." />
      ) : (
        <ScrollView contentContainerStyle={styles.pad}>
          <View style={styles.walletHero}>
            <Text style={styles.walletAmount}>{data.money || 0} ₽</Text>
            <Text style={styles.walletLabel}>{selected.toUpperCase()}</Text>
          </View>
          <View style={styles.quickRow}>
            {[10, 50, 100].map((v) => (
              <Button key={v} small label={`+${v}`} color={MASTER_THEME.accentGood} onPress={() => applyMoney(v)} />
            ))}
            {[-10, -50].map((v) => (
              <Button key={v} small label={`${v}`} color={MASTER_THEME.screenDim} textColor={MASTER_THEME.ink} onPress={() => applyMoney(v)} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="importo personalizzato (usa - per togliere)"
              placeholderTextColor="#8994ac"
              keyboardType="numeric"
              style={styles.input}
            />
            <Button label="Applica" color={MASTER_THEME.spark} textColor="#241613" onPress={() => { applyMoney(parseInt(customAmount, 10) || 0); setCustomAmount(''); }} />
          </View>
          <Text style={styles.sectionTitle}>ZAINO</Text>
          <View style={styles.row}>
            <TextInput value={itemName} onChangeText={setItemName} placeholder="Nome oggetto" placeholderTextColor="#8994ac" style={[styles.input, { flex: 2 }]} />
            <TextInput value={itemQty} onChangeText={setItemQty} placeholder="Qtà" placeholderTextColor="#8994ac" keyboardType="numeric" style={[styles.input, { flex: 1 }]} />
            <TouchableOpacity style={styles.plusBtn} onPress={addItem}><Text style={styles.plusText}>+</Text></TouchableOpacity>
          </View>
          {(data.inventory || []).length === 0 ? (
            <EmptyState glyph="🎒" text="Zaino vuoto." />
          ) : (
            (data.inventory || []).map((it, i) => (
              <View key={i} style={styles.invRow}>
                <Text style={styles.invName}>{it.name}  <Text style={styles.invQty}>×{it.qty}</Text></Text>
                <Button label="Rimuovi" small color={MASTER_THEME.screenDim} textColor={MASTER_THEME.ink} onPress={() => removeItem(i)} />
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------- Map admin ----------------
function MapAdminView() {
  const [mapState, setMapState] = useState({ unlocked: {} });

  useEffect(() => {
    const unsub = subscribeMapState(setMapState);
    return unsub;
  }, []);

  async function toggle(id) {
    const unlocked = { ...(mapState.unlocked || {}) };
    unlocked[id] = !unlocked[id];
    await saveMapState({ unlocked });
  }

  const zones = {};
  LOCATIONS.forEach((l) => { (zones[l.zone] = zones[l.zone] || []).push(l); });

  return (
    <ScrollView contentContainerStyle={styles.pad}>
      {Object.keys(zones).map((z) => (
        <View key={z}>
          <Text style={styles.sectionTitle}>{z.toUpperCase()}</Text>
          {zones[z].map((l) => {
            const on = !!(mapState.unlocked || {})[l.id];
            return (
              <View key={l.id} style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleName}>{l.name}</Text>
                  <Text style={styles.toggleZone}>{on ? 'Sbloccato' : 'Nebbia'}</Text>
                </View>
                <Switch value={on} onValueChange={() => toggle(l.id)} trackColor={{ true: MASTER_THEME.accentGood, false: '#3a4258' }} thumbColor="#fff" />
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#0f1420', alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { flex: 1 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center', padding: 20 },
  pad: { padding: 14, paddingBottom: 30 },
  sectionTitle: { fontSize: 10, fontFamily: 'Nunito_700Bold', color: '#8c98b3', letterSpacing: 1, marginTop: 10, marginBottom: 6 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#232a3d', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  listRowText: { fontFamily: 'Nunito_600SemiBold', color: '#eef3fb', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#232a3d', color: '#eef3fb', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, fontFamily: 'Nunito_400Regular', fontSize: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  chipsRow: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 14, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  chipText: { fontFamily: 'Baloo2_600SemiBold', fontSize: 12 },
  noPlayersHint: { color: '#8c98b3', fontFamily: 'Nunito_400Regular', fontSize: 12, paddingVertical: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#232a3d', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7, marginBottom: 6 },
  smallSprite: { width: 32, height: 32 },
  resultName: { flex: 1, color: '#eef3fb', fontFamily: 'Nunito_600SemiBold', fontSize: 12 },
  nickInput: { width: 78, backgroundColor: '#171c2b', color: '#eef3fb', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 5, fontSize: 11 },
  plusBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#4fd18a', alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#fff', fontFamily: 'Baloo2_700Bold', fontSize: 16 },
  caughtRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#232a3d', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  caughtName: { flex: 1, color: '#eef3fb', fontFamily: 'Nunito_400Regular', fontSize: 12 },
  walletHero: { alignItems: 'center', paddingVertical: 8 },
  walletAmount: { fontSize: 26, fontFamily: 'Nunito_700Bold', color: '#eef3fb' },
  walletLabel: { fontSize: 10, fontFamily: 'Nunito_700Bold', color: '#8c98b3', letterSpacing: 1 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10, marginTop: 4 },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#232a3d', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7 },
  invName: { fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: '#eef3fb' },
  invQty: { fontFamily: 'Nunito_400Regular', fontSize: 12, color: '#8c98b3' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#232a3d', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  toggleName: { fontFamily: 'Nunito_600SemiBold', fontSize: 13, color: '#eef3fb' },
  toggleZone: { fontFamily: 'Nunito_700Bold', fontSize: 10, color: '#8c98b3', textTransform: 'uppercase' },
});
