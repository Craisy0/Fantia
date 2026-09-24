import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';

export function Button({ label, onPress, color = '#3fae72', textColor = '#fff', small, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: color, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Text style={[styles.text, small && styles.textSmall, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ glyph, text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.glyph}>{glyph}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, alignItems: 'center' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  text: { fontFamily: 'Baloo2_600SemiBold', fontSize: 13 },
  textSmall: { fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20 },
  glyph: { fontSize: 26, marginBottom: 6 },
  emptyText: { fontFamily: 'Nunito_400Regular', fontSize: 13, color: '#7c8a97', textAlign: 'center', maxWidth: 220, lineHeight: 18 },
});
