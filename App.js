import React from "react";
import { Text, TextInput } from "react-native";
import { AppProvider } from "./src/app/providers/AppContext";
import RootNavigator from "./src/app/navigation/RootNavigator";

// ✅ [폰트 고정 설정] 시스템 폰트 크기 변경 무시
// 이 설정이 없으면 휴대폰 설정에 따라 앱 글씨가 깨질 수 있습니다.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

export default function App() {
  return (
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}
