import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { MaterialIcons } from "@expo/vector-icons";
import { ROUTES } from "./routes";
import { StatusBar } from "expo-status-bar";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebaseConfig";

import LoginScreen from "../../features/auth/screens/LoginScreen";
import HomeScreen from "../../features/feed/screens/HomeScreen";
import WriteScreen from "../../features/post/screens/WriteScreen";
import WriteFreeScreen from "../../features/post/screens/WriteFreeScreen"; 
import DetailScreen from "../../features/post/screens/DetailScreen";
import FreeDetailScreen from "../../features/post/screens/FreeDetailScreen"; 
import ProfileScreen from "../../features/profile/screens/ProfileScreen";
import ChatRoomsScreen from "../../features/chat/screens/ChatRoomsScreen";
import ChatRoomScreen from "../../features/chat/screens/ChatRoomScreen";
import MyListingsScreen from "../../features/profile/screens/MyListingsScreen"; 
import PremiumScreen from "../../features/profile/screens/PremiumScreen";
import AdminReportScreen from "../../features/profile/screens/AdminReportScreen";

// ✅ [추가] 알림 화면 import
import NotificationScreen from "../../features/profile/screens/NotificationScreen";

const Stack = createStackNavigator();

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "black",
    card: "#1E1E1E",
    text: "white",
    border: "#333",
  },
};

export default function RootNavigator() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser || null);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={AppDarkTheme}>
      <StatusBar style="light" /> 
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "black", shadowColor: "transparent" },
          headerTintColor: "white",
          headerTitleStyle: { fontWeight: "bold" },
          headerTitleAlign: "center",
          cardStyle: { backgroundColor: "black" },
          headerBackTitleVisible: false,
          headerBackTitle: "",
          headerRight: () => <View style={{ width: 45 }} />, 
          headerBackImage: ({ tintColor }) => (
            <MaterialIcons
              name="arrow-back-ios-new"
              size={22}
              color={tintColor || "white"}
              style={{ marginLeft: 10, width: 35 }}
            />
          ),
        }}
      >
        {!user ? (
          <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name={ROUTES.HOME} component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name={ROUTES.WRITE} component={WriteScreen} options={{ title: "N빵 모집하기" }} />
            <Stack.Screen name={ROUTES.WRITE_FREE} component={WriteFreeScreen} options={{ title: "무료나눔 하기" }} />
            <Stack.Screen name={ROUTES.DETAIL} component={DetailScreen} options={{ title: "상세 정보" }} />
            <Stack.Screen name={ROUTES.FREE_DETAIL} component={FreeDetailScreen} options={{ title: "무료나눔 상세" }} />
            <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} options={{ title: "내 정보" }} />
            <Stack.Screen name={ROUTES.CHAT_ROOMS} component={ChatRoomsScreen} options={{ title: "채팅" }} />
            <Stack.Screen name={ROUTES.CHAT_ROOM} component={ChatRoomScreen} options={{ title: "채팅방" }} />

            {/* 프리미엄 화면 */}
            <Stack.Screen
              name={ROUTES.PREMIUM}
              component={PremiumScreen}
              options={{ title: "프리미엄" }}
            />
            
            {/* 내가 쓴 글 관리 */}
            <Stack.Screen 
              name={ROUTES.MY_LISTINGS} 
              component={MyListingsScreen} 
              options={{ headerShown: false }} 
            />

            {/* 관리자 신고 내역 화면 */}
            <Stack.Screen 
              name={ROUTES.ADMIN_REPORT} 
              component={AdminReportScreen} 
              options={{ headerShown: false }} 
            />

            {/* ✅ [추가] 알림 센터 화면 (커스텀 헤더 사용으로 headerShown: false) */}
            <Stack.Screen 
              name={ROUTES.NOTIFICATION} 
              component={NotificationScreen} 
              options={{ headerShown: false }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
