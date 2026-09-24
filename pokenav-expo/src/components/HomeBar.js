import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';

export default function HomeBar({ theme, active, onPress }) {
  return (
    <View style={[styles.bar, { backgroundColor: theme.screen, borderTopColor: theme.inkMuted + '25' }]}>
      <TouchableOpacity
        disabled={!active}
        onPress={onPress}
        style={[styles.btn, { backgroundColor: active ? theme.accentBad : theme.screenDim }]}
      >
        <Icon name="house" size={16} color={active ? '#fff' : theme.inkMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: 8, alignItems: 'center', borderTopWidth: 1 },
  btn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
