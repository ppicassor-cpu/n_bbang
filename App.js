import React, { useEffect, useRef, useState } from "react";
import { 
  TextInput, 
  View, 
  AppState, 
  Modal, 
  TouchableOpacity, 
  StyleSheet, 
  Platform 
} from "react-native";

// ✅ 우리가 만든 커스텀 Text만 여기서 가져옵니다.
import { Text } from "./src/components/MyText";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
import * as Updates from "expo-updates";

// ✅ [필수] 안전 영역 공급자
import { SafeAreaProvider } from "react-native-safe-area-context";

import InitialLoader from "./src/app/screens/InitialLoader"; 
// ✅ [수정] useAppContext 훅 추가 임포트 (신호 받기 위함)
import { AppProvider, useAppContext } from "./src/app/providers/AppContext";
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

// ✅ [추가] AppContext 내부에서 동작할 실제 컨텐츠 컴포넌트
// AppProvider가 감싸고 있어야 useAppContext를 쓸 수 있으므로 분리함
function AppInner() {
  const appState = useRef(AppState.currentState);
  
  // ✅ [핵심] AppContext에서 진짜 로딩 상태(isBooting)를 가져옴
  const { isBooting } = useAppContext();

  const [isSplashFinished, setSplashFinished] = useState(false); 
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const updatePromptShownRef = useRef(false);
  
  // ✅ [추가] 업데이트 타입 상태 ("LAUNCH" or "RESUME")
  const [updateType, setUpdateType] = useState("LAUNCH");

  // ✅ [수정] 타입을 인자로 받아 상태를 설정하는 통합 함수
  const fetchUpdateIfAvailable = async (type) => {
  // ✅ [테스트] 이 줄을 잠시 주석 처리하세요!
  // if (__DEV__) return; 

  try {
    // 💡 폰 화면에 이 메시지가 뜨는지 확인하기 위함입니다.
    // alert("업데이트 체크 시작! 타입: " + type); 

    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      updatePromptShownRef.current = true;
      setUpdateType(type);
      setUpdateModalVisible(true);
    }
  } catch (e) {
    console.log(`Update failed:`, e);
  }
};
  // ✅ [수정] 앱 초기 실행 시 (LAUNCH 타입)
  useEffect(() => {
    fetchUpdateIfAvailable("LAUNCH");
  }, []);

  // ✅ [수정] 앱 재진입 시 (RESUME 타입)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        fetchUpdateIfAvailable("RESUME");
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <>
      {!isSplashFinished ? (
        // 1. 애니메이션 화면
        <InitialLoader 
          // ✅ [수정] 가짜 state 대신 진짜 Context 신호(isBooting)를 연결
          // isBooting이 true인 동안은 로딩 중(isLoading=true)으로 유지됨
          isLoading={isBooting}            
          onLoaded={() => setSplashFinished(true)} 
        />
      ) : (
        // 2. 메인 앱 화면 (데이터가 준비된 상태에서 열림)
        <View style={{ flex: 1, backgroundColor: "black" }}>
          <StatusBar style="light" />
          <RootNavigator />

          {/* 업데이트 알림 모달 */}
          <Modal visible={updateModalVisible} transparent animationType="fade" onRequestClose={() => {}}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>업데이트 알림 🚀</Text>
                <Text style={styles.modalMessage}>
                  {updateType === "LAUNCH"
                    ? "최신 업데이트 다운로드가 완료되었습니다.\n지금 바로 적용하여 새로운 기능을 만나보시겠습니까?"
                    : "사용하시는 동안 새로운 기능이 추가되었습니다.\n지금 재실행하여 적용하시겠습니까?"}
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
    </>
  );
}

// ✅ [수정] 최상위 컴포넌트 구조 변경
// AppProvider를 가장 바깥으로 빼서 앱이 켜지자마자 데이터 로딩을 시작하게 함
export default function App() {
  return (
    <AppProvider>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </AppProvider>
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