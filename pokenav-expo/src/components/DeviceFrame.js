import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PeekCreature from './PeekCreature';

export default function DeviceFrame({ theme, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={[theme.caseTop, theme.caseBottom]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.case}
      >
        <View style={styles.hwDotL} />
        <View style={styles.hwDotR} />
        <View style={styles.peekWrap}>
          <PeekCreature width={78} />
        </View>
        <View style={[styles.screen, { backgroundColor: theme.screen }]}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
  case: {
    flex: 1,
    borderRadius: 38,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 18,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  hwDotL: { position: 'absolute', top: 12, left: 20, width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  hwDotR: { position: 'absolute', top: 12, right: 20, width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  peekWrap: { position: 'absolute', top: -14, left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  screen: {
    marginTop: 26,
    borderRadius: 20,
    overflow: 'hidden',
    flex: 1,
  },
});
