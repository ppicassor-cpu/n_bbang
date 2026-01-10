import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { MaterialIcons, FontAwesome, FontAwesome5 } from "@expo/vector-icons";
// ✅ [수정] 라우트 상수 import 추가
import { ROUTES } from "../../../app/navigation/routes";

export default function LoginScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.content}>
        <FontAwesome5 name="hand-holding-usd" size={80} color={theme.primary} />
        <Text style={styles.title}>N빵</Text>
        <Text style={styles.subtitle}>우리 동네 공동구매 커뮤니티</Text>
        
        <View style={styles.buttonContainer}>
          {/* ✅ [수정] "Home" 문자열 대신 ROUTES.HOME 상수 사용 */}
          <TouchableOpacity style={[styles.btn, { backgroundColor: "#FEE500" }]} onPress={() => navigation.replace(ROUTES.HOME)}>
            <FontAwesome name="comment" size={20} color="black" />
            <Text style={[styles.btnText, { color: "black" }]}>카카오로 3초 만에 시작하기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, { backgroundColor: "white" }]} onPress={() => navigation.replace(ROUTES.HOME)}>
            <FontAwesome name="google" size={20} color="black" />
            <Text style={[styles.btnText, { color: "black" }]}>구글 계정으로 시작하기</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.emailBtn]} onPress={() => navigation.replace(ROUTES.HOME)}>
            <MaterialIcons name="email" size={20} color="white" />
            <Text style={[styles.btnText, { color: "white" }]}>이메일로 시작하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "bold", color: theme.primary, marginTop: 20 },
  subtitle: { color: theme.textDim, fontSize: 16, marginBottom: 60 },
  buttonContainer: { width: "100%", gap: 12 },
  btn: { flexDirection: "row", height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 10 },
  emailBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.textDim },
  btnText: { fontSize: 16, fontWeight: "bold" },
});
