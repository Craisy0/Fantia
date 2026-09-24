import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BootScreen from '../screens/BootScreen';
import PlayerScreen from '../screens/PlayerScreen';
import MasterScreen from '../screens/MasterScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Boot" component={BootScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Master" component={MasterScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
