import React from "react";
import { Text, TextInput, View } from "react-native"; // ✅ View 추가
import { StatusBar } from "expo-status-bar"; // ✅ 상태바 색상 제어
import Constants from "expo-constants";
import Purchases from "react-native-purchases";

import { AppProvider } from "./src/app/providers/AppContext";
import RootNavigator from "./src/app/navigation/RootNavigator";

// [폰트 고정 설정]
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

// ✅ RevenueCat configure를 "렌더 이전(모듈 로드 시점)"에 1회만 실행해서 레이스 방지
let __RC_CONFIGURED__ = false;

const __configureRevenueCatOnce__ = () => {
  if (__RC_CONFIGURED__) return;

  const rcKey =
    process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.manifest2?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.manifest?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    "";

  console.log("[RevenueCat] EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY exists:", !!rcKey);

  if (!rcKey) {
    console.warn("[RevenueCat] Missing EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY (EAS env not injected).");
    return;
  }

  try {
    Purchases.configure({ apiKey: rcKey });
    __RC_CONFIGURED__ = true;
    console.log("[RevenueCat] Purchases.configure done");
  } catch (e) {
    console.warn("[RevenueCat] Purchases.configure failed:", e?.message || e);
  }
};

__configureRevenueCatOnce__();

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
