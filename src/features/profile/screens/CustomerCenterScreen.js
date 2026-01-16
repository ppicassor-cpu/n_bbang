// FILE: src/features/profile/screens/CustomerCenterScreen.js

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { theme } from "../../../theme";

export default function CustomerCenterScreen({ navigation }) {
  const handleContact = () => {
    // 이메일 보내기 등으로 연결 가능
    Linking.openURL("mailto:ppicassor@gmail.com");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="support-agent" size={80} color={theme.primary} />
        <Text style={styles.title}>고객센터</Text>
        <Text style={styles.desc}>
          궁금한 점이나 불편한 사항이 있으신가요?{'\n'}
          아래 버튼을 통해 문의해 주세요.
        </Text>

        <TouchableOpacity style={styles.button} onPress={handleContact}>
          <Text style={styles.btnText}>1:1 이메일 문의하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  content: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: "white", marginTop: 20, marginBottom: 10 },
  desc: { fontSize: 16, color: "#AAA", textAlign: "center", marginBottom: 30, lineHeight: 24 },
  button: {
    backgroundColor: theme.primary,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  btnText: { fontSize: 16, fontWeight: "bold", color: "black" },
});