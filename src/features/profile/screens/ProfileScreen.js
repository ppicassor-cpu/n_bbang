import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../../theme';

export default function ProfileScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: 'white' }}>내 정보 화면</Text>
    </View>
  );
}
