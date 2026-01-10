import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppContext } from "../../../app/providers/AppContext"; 
import { ROUTES } from "../../../app/navigation/routes";
import { theme } from "../../../theme";
import CustomModal from "../../../components/CustomModal";
import { Ionicons } from "@expo/vector-icons";

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login, signup, resetPassword } = useAppContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [loading, setLoading] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMsg, setModalMsg] = useState("");

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

  const handleSocialLogin = (platform) => {
    // ✅ 문법 오류 수정 (백틱 복구)
    showAlert(`${platform} 로그인은 준비 중입니다.\n(추후 연동 예정)`);
  };

  const getButtonText = () => {
    if (loading) return "처리 중...";
    if (mode === "login") return "로그인";
    if (mode === "signup") return "회원가입 완료";
    if (mode === "reset") return "비밀번호 재설정 메일 보내기";
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.overlay}>
        
        {/* ✅ [디자인 수정] 촌스러운 텍스트 대신 세련된 타이포그래피 로고 */}
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
            <Text style={styles.mainButtonText}>{getButtonText()}</Text>
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
              <TouchableOpacity style={[styles.socialBtn, styles.kakaoBtn]} onPress={() => handleSocialLogin("카카오")}>
                <Ionicons name="chatbubble" size={20} color="#3C1E1E" />
                <Text style={styles.kakaoText}>카카오로 시작하기</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.socialBtn, styles.googleBtn]} onPress={() => handleSocialLogin("구글")}>
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
