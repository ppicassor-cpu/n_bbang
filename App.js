import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AppProvider } from './src/app/providers/AppContext';

import LoginScreen from './src/features/auth/screens/LoginScreen';
import HomeScreen from './src/features/feed/screens/HomeScreen';
import WriteScreen from './src/features/post/screens/WriteScreen';
import DetailScreen from './src/features/post/screens/DetailScreen';
import ProfileScreen from './src/features/profile/screens/ProfileScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: 'black', shadowColor: 'transparent' },
            headerTintColor: 'white',
            headerTitleStyle: { fontWeight: 'bold' },
            cardStyle: { backgroundColor: 'black' }
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Write" component={WriteScreen} options={{ title: '구매 정보 입력' }} />
          <Stack.Screen name="Detail" component={DetailScreen} options={{ title: '상세 정보' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '내 정보' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
