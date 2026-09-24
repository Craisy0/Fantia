import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Icon from './Icon';

export default function AppTile({ label, iconName, color, onPress }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.iconWrap, { backgroundColor: color }]}>
        <Icon name={iconName} size={26} color="#fff" />
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: { width: 84, alignItems: 'center', gap: 7 },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  label: { fontFamily: 'Baloo2_700Bold', fontSize: 11, color: '#fff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textAlign: 'center' },
});
