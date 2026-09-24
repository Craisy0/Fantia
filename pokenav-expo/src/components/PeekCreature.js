import React from 'react';
import Svg, { Path, Rect, Ellipse, Circle } from 'react-native-svg';
import { CREATURE, CREATURE_DARK } from '../theme';

export default function PeekCreature({ width = 90 }) {
  const height = (width * 78) / 140;
  return (
    <Svg width={width} height={height} viewBox="0 0 140 78">
      <Ellipse cx={12} cy={52} rx={4} ry={4} fill="rgba(0,0,0,0.18)" />
      <Ellipse cx={128} cy={52} rx={4} ry={4} fill="rgba(0,0,0,0.18)" />
      <Rect x={26} y={36} width={88} height={32} rx={12} fill="#fff" />
      <Path d="M32,52 C32,16 50,3 70,3 C90,3 108,16 108,52 Z" fill={CREATURE} />
      <Path d="M45,16 C38,6 30,2 22,4 C31,10 34,16 38,23 Z" fill={CREATURE} />
      <Path d="M95,16 C102,6 110,2 118,4 C109,10 106,16 102,23 Z" fill={CREATURE} />
      <Ellipse cx={55} cy={35} rx={14} ry={16} fill="#fff" stroke={CREATURE_DARK} strokeWidth={3} />
      <Circle cx={57} cy={38} r={6.5} fill="#204a5c" />
      <Circle cx={60} cy={34} r={2.2} fill="#fff" />
      <Ellipse cx={85} cy={35} rx={14} ry={16} fill="#fff" stroke={CREATURE_DARK} strokeWidth={3} />
      <Circle cx={87} cy={38} r={6.5} fill="#204a5c" />
      <Circle cx={90} cy={34} r={2.2} fill="#fff" />
      <Path d="M62,57 q8,8 16,0" fill="none" stroke={CREATURE_DARK} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
