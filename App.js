import React, { useEffect, useRef, useState } from "react"; // ✅ Hooks 추가
import { Text, TextInput, View, AppState, Modal, TouchableOpacity, StyleSheet } from "react-native"; // ✅ AppState, Alert 추가
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
import * as Updates from "expo-updates"; // ✅ 업데이트 모듈 추가

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
  const appState = useRef(AppState.currentState);

  // ✅ [추가] 커스텀 업데이트 모달 상태
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const updatePromptShownRef = useRef(false);

  // ✅ [추가됨] 앱이 화면으로 돌아올 때마다 업데이트 확인 로직
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      // 백그라운드나 비활성 상태에서 -> 활성 상태(Active)로 돌아올 때 실행
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        // 개발 모드(__DEV__)가 아닐 때만 실행 (실사용자용)
        if (!__DEV__) {
          try {
            // ✅ 이미 한 번 띄웠으면(세션 내) 중복 팝업 방지
            if (updatePromptShownRef.current) {
              appState.current = nextAppState;
              return;
            }

            // 1. 업데이트 확인
            const update = await Updates.checkForUpdateAsync();

            if (update.isAvailable) {
              // 2. 업데이트 다운로드
              await Updates.fetchUpdateAsync();

              // 3. 커스텀 팝업 띄우기
              updatePromptShownRef.current = true;
              setUpdateModalVisible(true);
            }
          } catch (e) {
            // 네트워크 오류 등으로 실패 시 조용히 넘어감
            console.log("Update check failed:", e);
          }
        }
      }
      appState.current = nextAppState;
    };

    // 이벤트 리스너 등록
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    // ✅ 앱 전체 배경을 검은색으로 고정 (번쩍임 방지) - 원본 유지
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <StatusBar style="light" />
      <AppProvider>
        <RootNavigator />
      </AppProvider>

      {/* ✅ [수정 시작] Alert.alert → 커스텀 업데이트 모달 */}
      <Modal visible={updateModalVisible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>업데이트 알림</Text>
            <Text style={styles.modalMessage}>
              새로운 기능이 추가되었습니다.{"\n"}앱을 재실행하여 적용하시겠습니까?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => {
                  setUpdateModalVisible(false);
                }}
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
                <Text style={styles.btnText}>지금 적용</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ✅ [수정 끝] Alert.alert → 커스텀 업데이트 모달 */}
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1e1e1e",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  modalMessage: {
    color: "white",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 88,
    alignItems: "center",
  },
  btnCancel: {
    backgroundColor: "#3a3a3a",
  },
  btnConfirm: {
    backgroundColor: "#4a4a4a",
  },
  btnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
