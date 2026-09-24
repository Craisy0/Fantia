import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function TopBar({ theme, title, subtitle, coin, onExit, exitLabel = 'esci' }) {
  return (
    <View style={[styles.bar, { borderBottomColor: theme.inkMuted + '30' }]}>
      <View>
        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.subtitle, { color: theme.inkMuted }]}>{subtitle}</Text>}
      </View>
      <View style={styles.right}>
        {coin != null && (
          <View style={[styles.coin, { backgroundColor: theme.screenDim }]}>
            <View style={[styles.dot, { backgroundColor: theme.spark }]} />
            <Text style={[styles.coinText, { color: theme.ink }]}>{coin} ₽</Text>
          </View>
        )}
        {!!onExit && (
          <TouchableOpacity onPress={onExit}>
            <Text style={[styles.exit, { color: theme.inkMuted }]}>{exitLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1 },
  title: { fontFamily: 'Baloo2_700Bold', fontSize: 17 },
  subtitle: { fontFamily: 'Nunito_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  coinText: { fontFamily: 'Nunito_700Bold', fontSize: 12 },
  exit: { fontFamily: 'Nunito_600SemiBold', fontSize: 12, textDecorationLine: 'underline' },
});
