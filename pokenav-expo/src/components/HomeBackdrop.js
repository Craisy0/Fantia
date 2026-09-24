import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path } from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';

export default function HomeBackdrop({ caseBottom, children }) {
  return (
    <ExpoLinearGradient colors={['#5fd9c6', '#299087']} style={styles.wrap}>
      <View style={styles.ballWrap} pointerEvents="none">
        <Svg width={280} height={280} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="ballTop" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={caseBottom} />
              <Stop offset="1" stopColor={caseBottom} />
            </LinearGradient>
          </Defs>
          <Circle cx={50} cy={50} r={48} fill="#fbfaf3" opacity={0.9} />
          <Path d="M2,50 A48,48 0 0 1 98,50 Z" fill={caseBottom} opacity={0.9} />
          <Rect x={2} y={47} width={96} height={6} fill="#232323" opacity={0.9} />
          <Circle cx={50} cy={50} r={13} fill="#fbfaf3" opacity={0.9} stroke="#232323" strokeWidth={2} />
          <Circle cx={50} cy={50} r={5.5} fill="#fbfaf3" opacity={0.9} stroke="#232323" strokeWidth={1.5} />
        </Svg>
      </View>
      {children}
    </ExpoLinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  ballWrap: { position: 'absolute', bottom: -140, left: 0, right: 0, alignItems: 'center', opacity: 0.85 },
});
