import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Ellipse, Path, Circle, G, Text as SvgText } from 'react-native-svg';
import DeviceFrame from '../components/DeviceFrame';
import HomeBackdrop from '../components/HomeBackdrop';
import TopBar from '../components/TopBar';
import HomeBar from '../components/HomeBar';
import AppTile from '../components/AppTile';
import { EmptyState } from '../components/Button';
import { PLAYER_THEME, APP_COLORS, typeColor, spriteUrl } from '../theme';
import { LOCATIONS } from '../data/locations';
import { subscribePlayerData, subscribeMapState } from '../storage';

const APPS = [
  { k: 'dex', label: 'Pokédex', icon: 'dex', color: APP_COLORS.dex },
  { k: 'zaino', label: 'Zaino', icon: 'bag', color: APP_COLORS.zaino },
  { k: 'mappa', label: 'Mappa', icon: 'map', color: APP_COLORS.mappa },
];

export default function PlayerScreen({ route, navigation }) {
  const { user } = route.params;
  const [tab, setTab] = useState(null);
  const [data, setData] = useState({ money: 0, inventory: [], pokemon: [] });
  const [mapState, setMapState] = useState({ unlocked: {} });
  const [selectedLoc, setSelectedLoc] = useState(null);

  useEffect(() => {
    const unsub = subscribePlayerData(user, setData);
    return unsub;
  }, [user]);

  useEffect(() => {
    const unsub = subscribeMapState(setMapState);
    return unsub;
  }, []);

  return (
    <View style={styles.outer}>
      <DeviceFrame theme={PLAYER_THEME}>
        <TopBar
          theme={PLAYER_THEME}
          title={user}
          subtitle="ALLENATORE"
          coin={data.money || 0}
          onExit={() => navigation.goBack()}
        />
        <View style={styles.content}>
          {tab === null && (
            <HomeBackdrop caseBottom={PLAYER_THEME.caseBottom}>
              <View style={styles.grid}>
                {APPS.map((a) => (
                  <AppTile key={a.k} label={a.label} iconName={a.icon} color={a.color} onPress={() => setTab(a.k)} />
                ))}
              </View>
            </HomeBackdrop>
          )}
          {tab === 'dex' && <DexView data={data} />}
          {tab === 'zaino' && <WalletView data={data} />}
          {tab === 'mappa' && (
            <MapView mapState={mapState} selectedLoc={selectedLoc} setSelectedLoc={setSelectedLoc} />
          )}
        </View>
        <HomeBar theme={PLAYER_THEME} active={tab !== null} onPress={() => setTab(null)} />
      </DeviceFrame>
    </View>
  );
}

function DexView({ data }) {
  const mons = data.pokemon || [];
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      {mons.length === 0 ? (
        <EmptyState glyph="📖" text="Il tuo Pokédex è ancora vuoto. Continua ad esplorare Ionia." />
      ) : (
        <View style={styles.dexGrid}>
          {mons.map((m, i) => (
            <View key={i} style={styles.dexCard}>
              <Image source={{ uri: spriteUrl(m.id) }} style={styles.dexImg} resizeMode="contain" />
              <Text style={styles.dexName} numberOfLines={1}>{m.nick || m.name}</Text>
              {!!m.nick && <Text style={styles.dexSpecies} numberOfLines={1}>{m.name}</Text>}
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: typeColor(m.t1) }]}><Text style={styles.badgeText}>{m.t1}</Text></View>
                {!!m.t2 && <View style={[styles.badge, { backgroundColor: typeColor(m.t2) }]}><Text style={styles.badgeText}>{m.t2}</Text></View>}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function WalletView({ data }) {
  const inv = data.inventory || [];
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <View style={styles.walletHero}>
        <Text style={styles.walletAmount}>{data.money || 0} ₽</Text>
        <Text style={styles.walletLabel}>POKÉDOLLARI</Text>
      </View>
      <Text style={styles.sectionTitle}>ZAINO</Text>
      {inv.length === 0 ? (
        <EmptyState glyph="🎒" text="Il tuo zaino è vuoto." />
      ) : (
        inv.map((it, i) => (
          <View key={i} style={styles.invRow}>
            <Text style={styles.invName}>{it.name}</Text>
            <Text style={styles.invQty}>×{it.qty}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function MapView({ mapState, selectedLoc, setSelectedLoc }) {
  const unlocked = mapState.unlocked || {};
  const sel = selectedLoc ? LOCATIONS.find((l) => l.id === selectedLoc) : null;
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <View style={styles.mapWrap}>
        <Svg width="100%" height={200} viewBox="0 0 420 260">
          <Ellipse cx={95} cy={150} rx={95} ry={88} fill="#c9dccb" />
          <Ellipse cx={305} cy={150} rx={105} ry={95} fill="#c9dccb" />
          <Path d="M110,150 C150,140 250,140 285,150" stroke="#b9c4bd" strokeWidth={4} fill="none" strokeDasharray="2 6" />
          {LOCATIONS.map((l) => {
            const on = !!unlocked[l.id];
            return (
              <G key={l.id} onPress={() => on && setSelectedLoc(l.id)}>
                <Circle cx={l.x} cy={l.y} r={10} fill={on ? '#3fae72' : '#b9c4bd'} stroke="#fff" strokeWidth={2} />
                {!on && (
                  <SvgText x={l.x} y={l.y + 4} fontSize={10} textAnchor="middle" fill="#fff">?</SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </View>
      {sel ? (
        <View style={styles.locDetail}>
          <Text style={styles.locZone}>{sel.zone.toUpperCase()}</Text>
          <Text style={styles.locName}>{sel.name}</Text>
          <Text style={styles.locBlurb}>{sel.blurb}</Text>
        </View>
      ) : (
        <Text style={styles.lockedNote}>Tocca un punto sbloccato della mappa per leggerne la descrizione.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#0f1420', alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { flex: 1 },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', alignItems: 'center', padding: 20 },
  pad: { padding: 14 },
  dexGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dexCard: { width: '31%', backgroundColor: '#fff', borderRadius: 14, padding: 7, alignItems: 'center' },
  dexImg: { width: 44, height: 44 },
  dexName: { fontFamily: 'Baloo2_600SemiBold', fontSize: 11, marginTop: 2 },
  dexSpecies: { fontFamily: 'Nunito_400Regular', fontSize: 9, color: '#7c8a97' },
  badges: { flexDirection: 'row', gap: 3, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  badge: { borderRadius: 20, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 8, fontFamily: 'Nunito_700Bold', color: '#fff', textTransform: 'uppercase' },
  walletHero: { alignItems: 'center', paddingVertical: 8 },
  walletAmount: { fontSize: 26, fontFamily: 'Nunito_700Bold', color: '#20232b' },
  walletLabel: { fontSize: 10, fontFamily: 'Nunito_700Bold', color: '#7c8a97', letterSpacing: 1 },
  sectionTitle: { fontSize: 10, fontFamily: 'Nunito_700Bold', color: '#7c8a97', letterSpacing: 1, marginTop: 8, marginBottom: 4 },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7 },
  invName: { fontFamily: 'Nunito_600SemiBold', fontSize: 13 },
  invQty: { fontFamily: 'Nunito_400Regular', fontSize: 12, color: '#7c8a97' },
  mapWrap: { backgroundColor: '#dcf0f4', borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  locDetail: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  locZone: { fontSize: 10, fontFamily: 'Nunito_700Bold', color: '#2c8558', letterSpacing: 1 },
  locName: { fontFamily: 'Baloo2_600SemiBold', fontSize: 15, marginVertical: 2 },
  locBlurb: { fontFamily: 'Nunito_400Regular', fontSize: 12.5, color: '#7c8a97', lineHeight: 18 },
  lockedNote: { fontFamily: 'Nunito_400Regular', fontSize: 12, color: '#7c8a97', textAlign: 'center', padding: 6 },
});
