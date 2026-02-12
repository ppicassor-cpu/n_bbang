import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal  } from "react-native";
import { Text } from "../../../components/MyText";
import { useNavigation } from "@react-navigation/native";
import { useAppContext } from "../../../app/providers/AppContext"; 
import { ROUTES } from "../../../app/navigation/routes";
import { theme } from "../../../theme";
import CustomModal from "../../../components/CustomModal";
import { Ionicons } from "@expo/vector-icons";import { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET } from "@env";
import { login as kakaoLogin } from "@react-native-seoul/kakao-login";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NaverLogin from "@react-native-seoul/naver-login";
import AsyncStorage from "@react-native-async-storage/async-storage";


export default function LoginScreen() {
  const navigation = useNavigation();
  const { login, signup, resetPassword, loginWithGoogle, loginWithKakao, loginWithNaver } = useAppContext();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMsg, setModalMsg] = useState("");

  // ✅ 로그인 중 팝업(확인 버튼 없음) + 이중클릭 방지용
  const [loginBusyVisible, setLoginBusyVisible] = useState(false);

  // ✅ 중복 클릭 완전 방지 락 (디자인/스타일/레이아웃 변경 없음)
  const lockRef = useRef(false);

  /* ============================================================
      🟢 [네이버] 로그인 설정 & 핸들러 (추가됨)
  ============================================================ */
  // ✅ 수정 후 (네이버 initialize 1회 고정: OTA로 JS가 바뀌어도 재초기화 방지)
  const NAVER_SDK_INIT_KEY = "NAVER_SDK_INIT_DONE_v1";

  useEffect(() => {
    (async () => {
      try {
        // ✅ 이미 초기화 완료면(앱 재시작/OTA 포함) 재초기화 금지
        const done = await AsyncStorage.getItem(NAVER_SDK_INIT_KEY);
        if (done === "1") return;

        // ✅ 환경변수 공백/개행(trim)까지 제거해서 오염 방지
        const clientId = String(process.env.EXPO_PUBLIC_NAVER_CLIENT_ID || "").trim();
        const clientSecret = String(process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET || "").trim();
        if (!clientId || !clientSecret) return;

        NaverLogin.initialize({
          appName: "우리동네N빵",
          consumerKey: clientId,
          consumerSecret: clientSecret,
          serviceUrlSchemeIOS: "com.sonsunghyun.nbbang",
        });

        // ✅ initialize 호출 성공 시에만 1회 고정 플래그 저장
        await AsyncStorage.setItem(NAVER_SDK_INIT_KEY, "1");
      } catch (e) {
        // ✅ 여기서 불필요 팝업/로그 없음
      }
    })();
  }, []);


const handleNaverLogin = async () => {
  // ✅ 중복 탭 방지(불필요 팝업/레이스 방지)
  if (loading) return;

  setLoading(true);

  try {
    const result = await Promise.race([
      NaverLogin.login().then((r) => ({ type: "RESULT", r })),
      new Promise((resolve) => setTimeout(() => resolve({ type: "TIMEOUT" }), 8000)),
    ]);

    if (result.type === "TIMEOUT") {
      showAlert("네이버 로그인 응답이 지연되었습니다.\n잠시 후 다시 시도해주세요.");
      return;
    }

    const { successResponse, failureResponse } = result.r || {};

    // ✅ 성공: 토큰 팝업 없이 바로 서버 로그인
    if (successResponse?.accessToken) {
      await loginWithNaver(successResponse.accessToken);
      return;
    }

    // ✅ 실패: JSON 덤프 팝업 제거(핵심 메시지만)
    const fail = failureResponse || {};
    const rawMsg =
      fail?.lastErrorDescriptionFromNaverSdk ||
      fail?.lastErrorDescription ||
      fail?.message ||
      fail?.error ||
      fail?.resultMessage ||
      fail?.code ||
      "NO_SUCCESS_RESPONSE";

    const msg = String(rawMsg);

    // ✅ 사용자 취소는 조용히 종료(불필요 팝업 제거)
    if (/cancel|canceled|cancelled|user cancelled|취소/i.test(msg)) return;

    showAlert(`네이버 로그인에 실패했습니다.\n${msg}`);
  } catch (e) {
    const msg = String(e?.message ?? e);

    // ✅ 사용자 취소는 조용히 종료(불필요 팝업 제거)
    if (/cancel|canceled|cancelled|user cancelled|취소/i.test(msg)) return;

    showAlert(`네이버 로그인 중 오류가 발생했습니다.\n${msg}`);
  } finally {
    setLoading(false);
  }
};


  /* ============================================================
      🔵 [구글] 로그인 설정 (네이티브 SDK 방식)
  ============================================================ */
  useEffect(() => {
    // ✅ 앱이 켜질 때 구글 설정 한 번만 실행
    GoogleSignin.configure({
      // 파이어베이스 콘솔의 Web Client ID (google-services.json과 일치)
      webClientId: "1060639718995-fia3i2djnoe0vjum2afd1js2i6iruejg.apps.googleusercontent.com", 
    });
  }, []);

  const handleGoogleLogin = async () => {
  setLoading(true);
  try {
   await GoogleSignin.hasPlayServices();

      // ✅ [추가] 항상 계정 선택창을 띄우기 위해 기존 세션 연결 해제
      await GoogleSignin.signOut();

   const userInfo = await GoogleSignin.signIn();
   const idToken = userInfo.data?.idToken; // 최신 라이브러리 문법

   if (idToken) {
        await loginWithGoogle(idToken);
        // ✅ RootNavigator(user 상태 기반 분기)가 화면 전환을 담당하므로 reset 호출 제거
      } else {
        throw new Error("Google ID Token이 없습니다.");
      }
    } catch (error) {
      console.error("Google Login Error:", error);
      if (error.code !== 'SIGN_IN_CANCELLED') { // 사용자가 취소한 건 에러 아님
        showAlert("구글 로그인에 실패했습니다.\n다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
      🟡 [카카오] 로그인 설정 (네이티브 SDK 방식)
  ============================================================ */
  const handleKakaoLogin = async () => {
    setLoading(true);
    try {
      const token = await kakaoLogin();
      
      // ✅ 수정 포인트: idToken이 아니라 accessToken을 넘겨야 합니다!
      if (token.accessToken) {
        await loginWithKakao(token.accessToken); 
        // ✅ RootNavigator(user 상태 기반 분기)가 화면 전환을 담당하므로 reset 호출 제거
      } else {
        throw new Error("카카오 Access 토큰이 없습니다. 로그인 토큰을 확인하세요.");
      }
      
    } catch (e) {
      console.error("Kakao Login Error:", e);
      if (e.message !== "user cancelled") { 
        showAlert("카카오 로그인에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
      📧 기존 이메일 로그인 로직 (100% 유지)
  ============================================================ */
  const showAlert = (msg) => {
    setModalMsg(msg);
    setModalVisible(true);
  };

  const handleAuthAction = async () => {
    if (loading || loginBusyVisible) return;

    if (!email) { showAlert("이메일을 입력해주세요."); return; }
    
    // ✅ 로그인일 때만 “로그인 중” 팝업 (회원가입/재설정은 제외)
    if (mode === "login") setLoginBusyVisible(true);

    setLoading(true);
    try {
      if (mode === "login") {
        if (!password) { showAlert("비밀번호를 입력해주세요."); setLoginBusyVisible(false); setLoading(false); return; }
        await login(email, password);
        // ✅ RootNavigator(user 상태 기반 분기)가 화면 전환을 담당하므로 reset 호출 제거

      } else if (mode === "signup") {
        if (!nickname) { showAlert("닉네임 (활동명)을 입력해주세요."); setLoading(false); return; }
        if (!password) { showAlert("비밀번호를 입력해주세요."); setLoading(false); return; }
        
        await signup(email, password, nickname);
        showAlert("회원가입 성공! 환영합니다.");
        // ✅ RootNavigator(user 상태 기반 분기)가 화면 전환을 담당하므로 reset 호출 제거

      } else if (mode === "reset") {
        await resetPassword(email);
        showAlert("비밀번호 재설정 메일을 보냈습니다.\n이메일을 확인해주세요.");
        setMode("login");
      }
    } catch (error) {
      console.log("Auth Error:", error.code, error.message);
      let msg = "오류가 발생했습니다.";
      if (error.code === "auth/invalid-email") msg = "이메일 형식이 올바르지 않습니다.";
      else if (error.code === "auth/user-not-found") msg = "가입되지 않은 이메일입니다.";
      else if (error.code === "auth/wrong-password") msg = "비밀번호가 틀렸습니다.";
      else if (error.code === "auth/invalid-credential") msg = "비밀번호가 틀렸습니다.";
      else if (error.code === "auth/email-already-in-use") msg = "이미 사용 중인 이메일입니다.";
      else if (error.code === "auth/weak-password") msg = "비밀번호는 6자리 이상이어야 합니다.";
      else if (error.message) msg = error.message;

      showAlert(msg);
    } finally {
      setLoginBusyVisible(false);
      setLoading(false);
    }
  };

  // ✅ 소셜 로그인 버튼 연결 (네이티브 함수로 연결)
  const handleSocialLogin = (platform) => {
    if (loading || loginBusyVisible) return;
    if (lockRef.current) return; // ✅ 즉시 차단
    lockRef.current = true;

    // ✅ “로그인 중입니다…” 팝업을 먼저 띄워서 이중클릭/레이스 차단
    setLoginBusyVisible(true);

    const done = () => {
      lockRef.current = false;
      setLoginBusyVisible(false);
    };

    if (platform === "네이버") { // ✅ [추가] 네이버 분기
      handleNaverLogin().finally(done);
    } else if (platform === "카카오") {
      handleKakaoLogin().finally(done);
    } else if (platform === "구글") {
      handleGoogleLogin().finally(done);
    } else {
      done();
    }
  };

  const getButtonText = () => {
    if (loading) return "처리 중...";
    if (mode === "login") return "로그인";
    if (mode === "signup") return "회원가입 완료";
    if (mode === "reset") return "비밀번호 재설정 메일 보내기";
  };

  /* ============================================================
      🎨 UI 레이아웃 (주인님 원본 그대로 유지)
  ============================================================ */
  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.overlay}>
        
        <View style={styles.logoContainer}>
          <Image source={require("../../../../assets/icon.png")} style={styles.logoImage} resizeMode="contain" />
        </View>

        <Text style={styles.subtitle}>
          {mode === "login" ? "우리 동네 N빵 커뮤니티" : 
           mode === "signup" ? "새로운 멤버를 환영합니다!" : "비밀번호 재설정"}
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="이메일 주소"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            allowFontScaling={false}
          />
          
          {mode === "signup" && (
            <TextInput
              style={styles.input}
              placeholder="닉네임 (활동명)"
              placeholderTextColor="#999"
              value={nickname}
              onChangeText={setNickname}
              allowFontScaling={false}
            />
          )}

          {mode !== "reset" && (
            <TextInput
              style={styles.input}
              placeholder="비밀번호 (6자리 이상)"
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              allowFontScaling={false}
            />
          )}

          <TouchableOpacity style={styles.mainButton} onPress={handleAuthAction} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="black" /> 
            ) : (
              <Text style={styles.mainButtonText}>{getButtonText()}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.linksContainer}>
          {mode === "login" ? (
            <>
              <TouchableOpacity style={styles.textLink} onPress={() => setMode("signup")}>
                <Text style={styles.linkTextBold}>회원가입</Text>
              </TouchableOpacity>
              <Text style={styles.bar}>|</Text>
              <TouchableOpacity style={styles.textLink} onPress={() => setMode("reset")}>
                <Text style={styles.linkText}>비밀번호 찾기</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.textLink} onPress={() => setMode("login")}>
              <Text style={styles.linkTextBold}>로그인 화면으로 돌아가기</Text>
            </TouchableOpacity>
          )}
        </View>

        {mode !== "reset" && (
          <View style={styles.socialContainer}>
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={styles.orText}>또는</Text>
              <View style={styles.line} />
            </View>

            <View style={styles.socialButtons}>
              {/* ✅ [추가] 네이버 로그인 버튼 (카카오 위에 배치) */}
              <TouchableOpacity style={[styles.socialBtn, styles.naverBtn]} onPress={() => handleSocialLogin("네이버")}>
                {/* 네이버는 N 아이콘을 텍스트로 표현하거나 이미지를 사용 */}
                <Text style={styles.naverIcon}>N</Text> 
                <Text style={styles.naverText}>네이버로 시작하기</Text>
              </TouchableOpacity>

              {/* ✅ 카카오 로그인 버튼 */}
              <TouchableOpacity style={[styles.socialBtn, styles.kakaoBtn]} onPress={() => handleSocialLogin("카카오")}>
                <Ionicons name="chatbubble" size={20} color="#3C1E1E" />
                <Text style={styles.kakaoText}>카카오로 시작하기</Text>
              </TouchableOpacity>

              {/* ✅ 구글 로그인 버튼 (구글 로고 컬러) */}
              <TouchableOpacity 
                style={[styles.socialBtn, styles.googleBtn]} 
                onPress={() => handleSocialLogin("구글")}
                disabled={loading} // 로딩 중에만 비활성화
              >
                {/* ✅ [수정] 4색 구글 공식 로고 이미지로 교체 */}
                {/* ✅ [수정] 더 안정적인 이미지 URL로 변경 및 resizeMode 추가 */}
                <Image 
                  source={{ uri: "https://cdn-icons-png.flaticon.com/512/2991/2991148.png" }} 
                  style={styles.googleIconImage} 
                  resizeMode="contain"
                />
                <Text style={styles.googleText}>구글로 시작하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.copyrightText}>© 2026 N_bbang All rights reserved.</Text>

      <Modal
        transparent
        visible={loginBusyVisible}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View style={styles.loginBusyOverlay}>
          <View style={styles.loginBusyBox}>
            <ActivityIndicator color="black" />
            <Text style={styles.loginBusyText}>로그인 중입니다...</Text>
          </View>
        </View>
      </Modal>

      <CustomModal 
        visible={modalVisible} 
        message={modalMsg} 
        onConfirm={() => setModalVisible(false)} 
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, justifyContent: "center", alignItems: "center" },
  overlay: { width: "90%", padding: 25, backgroundColor: "rgba(30, 30, 30, 0.95)", borderRadius: 20, alignItems: "center", borderWidth: 1, borderColor: "#333", elevation: 10 },
  
  logoContainer: { alignItems: "center", marginBottom: 0 },
  logoImage: { width: 110, height: 110 },

  subtitle: { fontSize: 16, color: "#AAA", marginBottom: 15, fontWeight: "600" },
  
  inputContainer: { width: "100%", gap: 12 },
  input: { 
    width: "100%", height: 50, backgroundColor: "#222", borderRadius: 8, paddingHorizontal: 15, fontSize: 16, 
    color: "white", borderWidth: 1, borderColor: "#444" 
  },
  
  mainButton: { 
    width: "100%", height: 55, backgroundColor: theme.primary, borderRadius: 8, justifyContent: "center", alignItems: "center", marginTop: 15,
    elevation: 3
  },
  mainButtonText: { color: "black", fontSize: 18, fontWeight: "bold" },
  
  linksContainer: { flexDirection: "row", marginTop: 25, alignItems: "center" },
  textLink: { padding: 5 },
  linkText: { color: "#888", fontSize: 14 },
  linkTextBold: { color: theme.primary, fontSize: 15, fontWeight: "bold" },
  bar: { marginHorizontal: 10, color: "#555" },

  socialContainer: { width: "100%", marginTop: 20 },
  divider: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  line: { flex: 1, height: 1, backgroundColor: "#444" },
  orText: { marginHorizontal: 10, color: "#666", fontSize: 12 },
  socialButtons: { gap: 10 },
  socialBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 45, borderRadius: 8, gap: 8 },
  
  // ✅ [추가] 네이버 버튼 스타일
  naverBtn: { backgroundColor: "#03C75A" },
  naverText: { color: "white", fontWeight: "bold", fontSize: 15 },
  naverIcon: { color: "white", fontWeight: "900", fontSize: 18, marginRight: 4, marginTop: -2 },

  kakaoBtn: { backgroundColor: "#FEE500" },
  kakaoText: { color: "#3C1E1E", fontWeight: "bold", fontSize: 15 },
  googleBtn: { backgroundColor: "#FFF" },
  googleText: { color: "#555", fontWeight: "bold", fontSize: 15 },
  googleIconImage: { width: 18, height: 18 },

  copyrightText: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20, // 아이폰 하단 바 고려
    color: "#666",
    fontSize: 11,
    fontWeight: "400",
  },
  
  // ✅ 로그인 중 팝업(확인 버튼 없음)
  loginBusyOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  loginBusyBox: {
    width: "78%",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(30, 30, 30, 0.88)",
    alignItems: "center",
    gap: 10,
  },
  loginBusyText: {
    color: "white",
    fontSize: 16,
    fontWeight: "900",
  },
});
