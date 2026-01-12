import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppContext } from "../../../app/providers/AppContext"; 
import { ROUTES } from "../../../app/navigation/routes";
import { theme } from "../../../theme";
import CustomModal from "../../../components/CustomModal";
import { Ionicons } from "@expo/vector-icons";

// ✅ 소셜 로그인을 위한 라이브러리
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session"; // ✅ 카카오 로그인을 위해 추가

// ✅ 웹 브라우저 리다이렉트 처리 (필수)
WebBrowser.maybeCompleteAuthSession();

// ✅ 카카오 디스커버리 설정
const kakaoDiscovery = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
  tokenEndpoint: "https://kauth.kakao.com/oauth/token",
};

export default function LoginScreen() {
  const navigation = useNavigation();
  // ✅ loginWithKakao 함수 가져오기
  const { login, signup, resetPassword, loginWithGoogle, loginWithKakao } = useAppContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [loading, setLoading] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMsg, setModalMsg] = useState("");

  /* ============================================================
     🔵 [구글] 로그인 설정 (성공했던 설정 유지)
  ============================================================ */
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: "1060639718995-m6l2vuims8lrt4endto85hkr3k69k8a7.apps.googleusercontent.com",
    androidClientId: "1060639718995-m6l2vuims8lrt4endto85hkr3k69k8a7.apps.googleusercontent.com",
    webClientId: "1060639718995-m6l2vuims8lrt4endto85hkr3k69k8a7.apps.googleusercontent.com",
    // ✅ 400 오류 해결했던 강제 리디렉션 주소 유지
    redirectUri: "https://auth.expo.io/@sonsunghyun1978/n_bbang"
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const { id_token } = googleResponse.params;
      handleGoogleLogin(id_token);
    } else if (googleResponse?.type === "error") {
      console.error("Google Auth Error:", googleResponse.error);
      showAlert("구글 로그인 설정 오류가 발생했습니다.");
    }
  }, [googleResponse]);

  const handleGoogleLogin = async (idToken) => {
    setLoading(true);
    try {
      await loginWithGoogle(idToken);
      navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });
    } catch (error) {
      console.error("Google Login Error:", error);
      showAlert("구글 로그인에 실패했습니다.\n다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
     🟡 [카카오] 로그인 설정
  ============================================================ */
  const [kakaoRequest, kakaoResponse, promptKakaoAsync] = AuthSession.useAuthRequest(
    {
      clientId: "e39bd5a53cd9855ab05af1ad5f8656f1", // ✅ 사용자님의 REST API 키
      scopes: ["profile_nickname", "account_email"], // 이메일 권한 요청
      redirectUri: "https://auth.expo.io/@sonsunghyun1978/n_bbang", // ✅ 설정한 리디렉션 주소
      responseType: "code",
    },
    kakaoDiscovery
  );

  // 🔥 [중요] KOE205 해결을 위한 주소 확인 로그
  useEffect(() => {
    if (kakaoRequest) {
      console.log("\n🔥 [카카오 리디렉션 확인] 아래 주소를 카카오 콘솔에 정확히 등록하세요:");
      console.log(kakaoRequest.redirectUri);
      console.log("----------------------------------------------------------\n");
    }
  }, [kakaoRequest]);

  // 카카오 응답 처리
  useEffect(() => {
    if (kakaoResponse?.type === "success") {
      const { code } = kakaoResponse.params;
      handleKakaoTokenExchange(code);
    } else if (kakaoResponse?.type === "error") {
      console.error("Kakao Login Error:", kakaoResponse.error);
      showAlert("카카오 로그인 중 오류가 발생했습니다.\n(KOE205: 리디렉션 주소 불일치)");
    }
  }, [kakaoResponse]);

  // 카카오 토큰 교환 및 로그인 실행
  const handleKakaoTokenExchange = async (code) => {
    setLoading(true);
    try {
      const response = await fetch("https://kauth.kakao.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: `grant_type=authorization_code&client_id=${kakaoRequest.clientId}&redirect_uri=${kakaoRequest.redirectUri}&code=${code}`,
      });
      const data = await response.json();
      
      if (data.access_token) {
        console.log("카카오 토큰 획득 성공!");
        // AppContext의 로그인 함수 호출
        await loginWithKakao(data.access_token);
        navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });
      } else {
        console.error("Token Exchange Failed:", data);
        throw new Error("카카오 토큰 교환 실패");
      }
    } catch (e) {
      console.error(e);
      showAlert("카카오 로그인 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  /* ============================================================
     📧 기존 이메일 로그인 로직
  ============================================================ */
  const showAlert = (msg) => {
    setModalMsg(msg);
    setModalVisible(true);
  };

  const handleAuthAction = async () => {
    if (!email) { showAlert("이메일을 입력해주세요."); return; }
    
    setLoading(true);
    try {
      if (mode === "login") {
        if (!password) { showAlert("비밀번호를 입력해주세요."); setLoading(false); return; }
        await login(email, password);
        navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });

      } else if (mode === "signup") {
        if (!nickname) { showAlert("닉네임을 입력해주세요."); setLoading(false); return; }
        if (!password) { showAlert("비밀번호를 입력해주세요."); setLoading(false); return; }
        
        await signup(email, password, nickname);
        showAlert("회원가입 성공! 환영합니다.");
        navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });

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
      else if (error.code === "auth/email-already-in-use") msg = "이미 사용 중인 이메일입니다.";
      else if (error.code === "auth/weak-password") msg = "비밀번호는 6자리 이상이어야 합니다.";
      else if (error.message) msg = error.message;

      showAlert(msg);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 소셜 로그인 핸들러 분기 처리 (구글 & 카카오)
  const handleSocialLogin = (platform) => {
    if (platform === "카카오") {
      if (kakaoRequest) {
        promptKakaoAsync();
      } else {
        showAlert("카카오 로그인 초기화 중입니다.\n잠시 후 다시 시도해주세요.");
      }
    } else if (platform === "구글") {
      if (googleRequest) {
        promptGoogleAsync();
      } else {
        showAlert("구글 로그인 초기화 중입니다.\n잠시 후 다시 시도해주세요.");
      }
    }
  };

  const getButtonText = () => {
    if (loading) return "처리 중...";
    if (mode === "login") return "로그인";
    if (mode === "signup") return "회원가입 완료";
    if (mode === "reset") return "비밀번호 재설정 메일 보내기";
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.overlay}>
        
        <View style={styles.logoContainer}>
            <Text style={styles.logoTextMain}>N-BBANG</Text>
            <Text style={styles.logoTextSub}>Premium Joint Purchase</Text>
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
          />
          
          {mode === "signup" && (
            <TextInput
              style={styles.input}
              placeholder="닉네임 (활동명)"
              placeholderTextColor="#999"
              value={nickname}
              onChangeText={setNickname}
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
              {/* ✅ 카카오 로그인 버튼 */}
              <TouchableOpacity style={[styles.socialBtn, styles.kakaoBtn]} onPress={() => handleSocialLogin("카카오")}>
                <Ionicons name="chatbubble" size={20} color="#3C1E1E" />
                <Text style={styles.kakaoText}>카카오로 시작하기</Text>
              </TouchableOpacity>

              {/* ✅ 구글 로그인 버튼 */}
              <TouchableOpacity 
                style={[styles.socialBtn, styles.googleBtn]} 
                onPress={() => handleSocialLogin("구글")}
                disabled={!googleRequest || loading}
              >
                <Ionicons name="logo-google" size={20} color="#555" />
                <Text style={styles.googleText}>구글로 시작하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

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
  
  logoContainer: { alignItems: "center", marginBottom: 20 },
  logoTextMain: { fontSize: 42, fontWeight: "900", color: theme.primary, letterSpacing: 2, fontStyle: "italic" },
  logoTextSub: { fontSize: 12, color: "#888", marginTop: -5, letterSpacing: 1 },

  subtitle: { fontSize: 16, color: "#AAA", marginBottom: 25, fontWeight: "600" },
  
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

  socialContainer: { width: "100%", marginTop: 30 },
  divider: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  line: { flex: 1, height: 1, backgroundColor: "#444" },
  orText: { marginHorizontal: 10, color: "#666", fontSize: 12 },
  socialButtons: { gap: 10 },
  socialBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 45, borderRadius: 8, gap: 8 },
  kakaoBtn: { backgroundColor: "#FEE500" },
  kakaoText: { color: "#3C1E1E", fontWeight: "bold", fontSize: 15 },
  googleBtn: { backgroundColor: "#FFF" },
  googleText: { color: "#555", fontWeight: "bold", fontSize: 15 },
});