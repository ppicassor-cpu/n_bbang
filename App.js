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

      {/* ✅ [수정] Alert.alert → 커스텀 업데이트 모달 (테마 적용 및 가운데 정렬) */}
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
                {/* 테마색 배경에는 검은 글씨가 가독성이 좋습니다 */}
                <Text style={styles.btnConfirmText}>지금 적용</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ✅ [수정 끝] */}
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)", // 배경을 조금 더 어둡게
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320, // 폭을 조금 줄여서 오밀조밀하게
    backgroundColor: "#1e1e1e",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center", // ✅ 카드 내부 요소 가운데 정렬
    borderWidth: 1,
    borderColor: "#333",
  },
  modalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center", // ✅ 텍스트 가운데 정렬
  },
  modalMessage: {
    color: "#cccccc",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: "center", // ✅ 텍스트 가운데 정렬
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "center", // ✅ 버튼들도 가운데 정렬
    gap: 12,
    width: "100%",
  },
  btn: {
    flex: 1, // 버튼 크기 균등 분배
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancel: {
    backgroundColor: "#333333",
  },
  btnConfirm: {
    backgroundColor: "#CCFF00", // ✅ 테마 색상 (라임 그린) 적용
  },
  btnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  btnConfirmText: {
    color: "#000000", // ✅ 라임 배경 위엔 검은 글씨
    fontSize: 15,
    fontWeight: "bold",
  },
});