import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { MaterialIcons } from "@expo/vector-icons";
import { ROUTES } from "./routes";

import LoginScreen from "../../features/auth/screens/LoginScreen";
import HomeScreen from "../../features/feed/screens/HomeScreen";
import WriteScreen from "../../features/post/screens/WriteScreen";
import DetailScreen from "../../features/post/screens/DetailScreen";
import ProfileScreen from "../../features/profile/screens/ProfileScreen";
import ChatRoomsScreen from "../../features/chat/screens/ChatRoomsScreen";
import ChatRoomScreen from "../../features/chat/screens/ChatRoomScreen";

const Stack = createStackNavigator();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={ROUTES.LOGIN}
        screenOptions={{
          headerStyle: { backgroundColor: "black", shadowColor: "transparent" },
          headerTintColor: "white",
          headerTitleStyle: { fontWeight: "bold" },
          cardStyle: { backgroundColor: "black" },
          headerBackTitleVisible: false,
          headerBackTitle: "",
          headerBackImage: ({ tintColor }) => (
            <MaterialIcons
              name="arrow-back-ios-new"
              size={22}
              color={tintColor || "white"}
              style={{ marginLeft: 10 }}
            />
          ),
        }}
      >
        <Stack.Screen name={ROUTES.LOGIN} component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.HOME} component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.WRITE} component={WriteScreen} options={{ title: "구매 정보 입력" }} />
        <Stack.Screen name={ROUTES.DETAIL} component={DetailScreen} options={{ title: "상세 정보" }} />
        <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} options={{ title: "내 정보" }} />
        <Stack.Screen name={ROUTES.CHAT_ROOMS} component={ChatRoomsScreen} options={{ title: "채팅" }} />
        <Stack.Screen name={ROUTES.CHAT_ROOM} component={ChatRoomScreen} options={{ title: "채팅방" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
