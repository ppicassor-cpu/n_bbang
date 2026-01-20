import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View, AppState, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
import * as Updates from "expo-updates";

// ✅ [필수] 안전 영역 공급자
import { SafeAreaProvider } from "react-native-safe-area-context";

import InitialLoader from "./src/app/screens/InitialLoader"; 
import { AppProvider } from "./src/app/providers/AppContext";
import RootNavigator from "./src/app/navigation/RootNavigator";

// [폰트 고정 설정]
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;

// ✅ RevenueCat 설정
let __RC_CONFIGURED__ = false;
const __configureRevenueCatOnce__ = () => {
  if (__RC_CONFIGURED__) return;
  const rcKey =
    process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.manifest2?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    Constants.manifest?.extra?.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY ||
    "";

  if (!rcKey) {
    console.warn("[RevenueCat] Missing SDK KEY.");
    return;
  }

  try {
    Purchases.configure({ apiKey: rcKey });
    __RC_CONFIGURED__ = true;
  } catch (e) {
    console.warn("[RevenueCat] Configure failed:", e);
  }
};
__configureRevenueCatOnce__();

export default function App() {
  const appState = useRef(AppState.currentState);
  
  const [isSplashFinished, setSplashFinished] = useState(false); 
  const [isDataReady, setIsDataReady] = useState(false);       

  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const updatePromptShownRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsDataReady(true);
    }, 10000); 

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        if (!__DEV__) {
          try {
            if (updatePromptShownRef.current) {
              appState.current = nextAppState;
              return;
            }
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
              await Updates.fetchUpdateAsync();
              updatePromptShownRef.current = true;
              setUpdateModalVisible(true);
            }
          } catch (e) {
            console.log("Update check failed:", e);
          }
        }
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // ✅ [수정 완료] 전체를 SafeAreaProvider로 감쌌습니다.
  // 이제 import 구문이 활성화되고, 앱 크래시가 방지됩니다.
  return (
    <SafeAreaProvider>
      {!isSplashFinished ? (
        // 1. 애니메이션 화면
        <InitialLoader 
          isLoading={!isDataReady}             
          onLoaded={() => setSplashFinished(true)} 
        />
      ) : (
        // 2. 메인 앱 화면
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <StatusBar style="light" />
          <AppProvider>
            <RootNavigator />
          </AppProvider>

          {/* 업데이트 알림 모달 */}
          <Modal visible={updateModalVisible} transparent animationType="fade" onRequestClose={() => {}}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>업데이트 알림 🚀</Text>
                <Text style={styles.modalMessage}>
                  새로운 기능이 추가되었습니다.{"\n"}앱을 재실행하여 적용하시겠습니까?
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnCancel]}
                    onPress={() => setUpdateModalVisible(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>나중에</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnConfirm]}
                    onPress={async () => {
                      try {
                        setUpdateModalVisible(false);
                        await Updates.reloadAsync();
                      } catch (e) {
                        console.log("Update reload failed:", e);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnConfirmText}>지금 적용</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#1e1e1e",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  modalMessage: {
    color: "#cccccc",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancel: {
    backgroundColor: "#333333",
  },
  btnConfirm: {
    backgroundColor: "#CCFF00",
  },
  btnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  btnConfirmText: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "bold",
  },
});