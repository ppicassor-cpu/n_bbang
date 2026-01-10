import React from "react";
import { Text, TextInput, View } from "react-native"; // ✅ View 추가
import { StatusBar } from "expo-status-bar"; // ✅ 상태바 색상 제어
import { AppProvider } from "./src/app/providers/AppContext";
import RootNavigator from "./src/app/navigation/RootNavigator";

// [폰트 고정 설정]
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

export default function App() {
  return (
    // ✅ [핵심 수정] 앱 전체 배경을 검은색으로 고정 (번쩍임 방지)
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar style="light" /> 
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </View>
  );
}
