// ================================================================================
//  FILE: src/features/profile/screens/NotificationScreen.js
// ================================================================================

import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";

import { db } from "../../../firebaseConfig"; 
import { theme } from "../../../theme";
import { useAppContext } from "../../../app/providers/AppContext";

export default function NotificationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAppContext();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // ✅ 내 알림 컬렉션 구독 (users/{uid}/notifications)
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotifications(loaded);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // ✅ 알림 읽음 처리
  const handleRead = async (noti) => {
    if (noti.isRead) return;
    try {
      const notiRef = doc(db, "users", user.uid, "notifications", noti.id);
      await updateDoc(notiRef, { isRead: true });
    } catch (e) {
      console.error("읽음 처리 실패:", e);
    }
  };

  // ✅ 알림 삭제
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
    } catch (e) {
      console.error("삭제 실패:", e);
    }
  };

  // ✅ 모두 읽음 처리
  const handleReadAll = async () => {
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((noti) => {
        if (!noti.isRead) {
          const ref = doc(db, "users", user.uid, "notifications", noti.id);
          batch.update(ref, { isRead: true });
        }
      });
      await batch.commit();
    } catch (e) {
      Alert.alert("오류", "일괄 처리 중 문제가 발생했습니다.");
    }
  };

  // ✅ 모두 삭제
  const handleDeleteAll = () => {
    if (notifications.length === 0) return;
    Alert.alert("알림 전체 삭제", "정말 모든 알림을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const batch = writeBatch(db);
          notifications.forEach((noti) => {
            const ref = doc(db, "users", user.uid, "notifications", noti.id);
            batch.delete(ref);
          });
          await batch.commit();
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const isRead = item.isRead;
    const dateStr = item.createdAt ? item.createdAt.slice(0, 10) : "";
    
    // 아이콘 결정
    let iconName = "notifications";
    let iconColor = theme.primary;
    if (item.type === "report_result") { iconName = "gavel"; iconColor = "#FF6B6B"; }
    if (item.type === "info") { iconName = "info"; iconColor = "#4CD964"; }

    return (
      <TouchableOpacity 
        style={[styles.card, isRead && styles.readCard]} 
        onPress={() => handleRead(item)}
        activeOpacity={0.8}
      >
        <View style={styles.iconBox}>
          <MaterialIcons name={iconName} size={24} color={isRead ? "#555" : iconColor} />
          {!isRead && <View style={styles.dot} />}
        </View>
        <View style={styles.contentBox}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, isRead && styles.readText]}>{item.title}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <Text style={[styles.body, isRead && styles.readText]} numberOfLines={2}>
            {item.body}
          </Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
          <Ionicons name="close" size={18} color="#666" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <MaterialIcons name="arrow-back-ios-new" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림 센터</Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPress={handleReadAll} style={{ padding: 10 }}>
            <MaterialIcons name="done-all" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAll} style={{ padding: 10 }}>
            <MaterialIcons name="delete-sweep" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={60} color="#333" />
              <Text style={{ color: "#666", marginTop: 10 }}>새로운 알림이 없습니다.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333" },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 50 },
  
  card: { flexDirection: "row", backgroundColor: "#252525", borderRadius: 12, padding: 16, marginBottom: 12, alignItems: "flex-start" },
  readCard: { backgroundColor: "#1A1A1A" },
  
  iconBox: { marginRight: 14, marginTop: 2, position: "relative" },
  dot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },
  
  contentBox: { flex: 1, marginRight: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  title: { color: "white", fontSize: 15, fontWeight: "bold" },
  date: { color: "#666", fontSize: 11 },
  body: { color: "#CCC", fontSize: 13, lineHeight: 18 },
  readText: { color: "#666" },
  
  deleteBtn: { padding: 4 },
});
