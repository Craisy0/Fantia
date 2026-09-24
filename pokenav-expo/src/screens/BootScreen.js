import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import DeviceFrame from '../components/DeviceFrame';
import { Button } from '../components/Button';
import { PLAYER_THEME } from '../theme';
import { addPlayerName, subscribePlayers } from '../storage';

const MASTER_CODE = 'ontano';

export default function BootScreen({ navigation }) {
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState('');
  const [masterOpen, setMasterOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  React.useEffect(() => {
    const unsub = subscribePlayers(setPlayers);
    return unsub;
  }, []);

  async function pickPlayer(name) {
    navigation.navigate('Player', { user: name });
  }

  async function createPlayer() {
    const name = newName.trim();
    if (!name) return;
    await addPlayerName(name);
    setNewName('');
    navigation.navigate('Player', { user: name });
  }

  function tryMasterLogin() {
    if (pin.trim().toLowerCase() === MASTER_CODE) {
      navigation.navigate('Master');
      setPin('');
      setErr('');
    } else {
      setErr('Codice non corretto.');
    }
  }

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DeviceFrame theme={PLAYER_THEME}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>ARCIPELAGO DI IONIA</Text>
          <Text style={styles.h1}>PokéNav</Text>
          <Text style={styles.sub}>Chi sei, Allenatore?</Text>

          <View style={styles.pickWrap}>
            {players.map((p) => (
              <TouchableOpacity key={p} style={styles.pickBtn} onPress={() => pickPlayer(p)}>
                <Text style={styles.pickText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Nuovo nome..."
              placeholderTextColor="#9aa"
              style={styles.input}
              onSubmitEditing={createPlayer}
            />
            <Button label="Entra" onPress={createPlayer} />
          </View>

          {masterOpen ? (
            <View>
              <View style={styles.row}>
                <TextInput
                  value={pin}
                  onChangeText={setPin}
                  placeholder="Codice Master"
                  placeholderTextColor="#9aa"
                  secureTextEntry
                  style={[styles.input, { flex: 0, width: 160 }]}
                  onSubmitEditing={tryMasterLogin}
                />
                <Button label="OK" onPress={tryMasterLogin} color={PLAYER_THEME.spark} textColor="#241613" />
              </View>
              {!!err && <Text style={styles.err}>{err}</Text>}
            </View>
          ) : (
            <TouchableOpacity onPress={() => setMasterOpen(true)}>
              <Text style={styles.masterLink}>Sei il Master?</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </DeviceFrame>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#0f1420', alignItems: 'center', justifyContent: 'center', padding: 16 },
  content: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20 },
  eyebrow: { fontFamily: 'Nunito_700Bold', fontSize: 11, letterSpacing: 1.5, color: '#7c8a97' },
  h1: { fontFamily: 'Baloo2_700Bold', fontSize: 26, color: '#20232b', marginTop: 4 },
  sub: { fontFamily: 'Nunito_700Bold', fontSize: 13, color: '#7c8a97', marginBottom: 18 },
  pickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 14 },
  pickBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14 },
  pickText: { fontFamily: 'Baloo2_600SemiBold', fontSize: 14, color: '#20232b' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, fontFamily: 'Nunito_400Regular', fontSize: 14, borderWidth: 2, borderColor: 'rgba(120,120,140,0.18)' },
  masterLink: { fontFamily: 'Nunito_400Regular', fontSize: 12, color: '#7c8a97', textDecorationLine: 'underline', marginTop: 4 },
  err: { color: '#e5493f', fontSize: 12, marginTop: 6, textAlign: 'center' },
});
