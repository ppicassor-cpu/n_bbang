// ================================================================================
//  FILE: src/features/profile/screens/NotificationScreen.js
// ================================================================================

import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// ✅ [확인 1] writeBatch가 확실히 import 되어 있습니다.
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";

import { db } from "../../../firebaseConfig";
import { theme } from "../../../theme";
import { useAppContext } from "../../../app/providers/AppContext";
import { ROUTES } from "../../../app/navigation/routes";

export default function NotificationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAppContext();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatDate = (createdAt) => {
    try {
      if (!createdAt) return "";
      const d =
        typeof createdAt?.toDate === "function"
          ? createdAt.toDate()
          : typeof createdAt === "string"
            ? new Date(createdAt)
            : createdAt instanceof Date
              ? createdAt
              : null;
      if (!d || Number.isNaN(d.getTime())) return "";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      return "";
    }
  };

  useEffect(() => {
    // ✅ [보완 2] user가 없으면 데이터 초기화 + 로딩 해제 (잔상 방지)
    if (!user) {
      setNotifications([]); 
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users", user.uid, "notifications"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setNotifications(loaded);
        setLoading(false);
      },
      (error) => {
        console.error("알림 구독 에러:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleRead = async (noti) => {
    if (!user) return;
    if (noti.isRead) return;
    try {
      const notiRef = doc(db, "users", user.uid, "notifications", noti.id);
      await updateDoc(notiRef, { isRead: true });
    } catch (e) {
      // 읽음 처리는 실패해도 조용히 넘어감 (UX 방해 X)
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "notifications", id));
    } catch (e) {
      Alert.alert("오류", "삭제에 실패했습니다.");
    }
  };

  const handleReadAll = async () => {
    if (!user) return;
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      let updateCount = 0;
      
      notifications.forEach((noti) => {
        if (!noti.isRead) {
          const ref = doc(db, "users", user.uid, "notifications", noti.id);
          batch.update(ref, { isRead: true });
          updateCount++;
        }
      });

      if (updateCount > 0) {
        await batch.commit();
      }
    } catch (e) {
      Alert.alert("오류", "일괄 처리 중 문제가 발생했습니다.");
    }
  };

  const handleDeleteAll = () => {
    if (!user) return;
    if (notifications.length === 0) return;
    Alert.alert("알림 전체 삭제", "정말 모든 알림을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          // ✅ [보완] 배치 작업 안정성 강화 (try-catch 추가)
          try {
            const batch = writeBatch(db);
            notifications.forEach((noti) => {
              const ref = doc(db, "users", user.uid, "notifications", noti.id);
              batch.delete(ref);
            });
            await batch.commit();
          } catch (e) {
            console.error("전체 삭제 실패:", e);
            Alert.alert("오류", "삭제 중 문제가 발생했습니다.");
          }
        },
      },
    ]);
  };

  const onPressNoti = async (item) => {
    // 1. 읽음 처리 (비동기, 기다리지 않고 이동)
    handleRead(item);

    // 2. 채팅방 이동
    // ✅ [확인 3] RootNavigator 구조상 ChatRoom은 같은 Stack 내에 있으므로 안전하게 이동됨
    if (item?.type === "chat" && item?.roomId) {
      navigation.navigate(ROUTES.CHAT_ROOM, {
        roomId: item.roomId,
        roomName: item.roomName || item.title || "채팅방",
      });
    }
  };

  const renderItem = ({ item }) => {
    const isRead = !!item.isRead;
    const dateStr = formatDate(item.createdAt);

    let iconName = "notifications";
    let iconColor = theme.primary;
    if (item.type === "report_result") {
      iconName = "gavel";
      iconColor = "#FF6B6B";
    }
    if (item.type === "info") {
      iconName = "info";
      iconColor = "#4CD964";
    }
    if (item.type === "chat") {
      iconName = "chat";
      iconColor = theme.primary;
    }

    return (
      <TouchableOpacity style={[styles.card, isRead && styles.readCard]} onPress={() => onPressNoti(item)} activeOpacity={0.8}>
        <View style={styles.iconBox}>
          <MaterialIcons name={iconName} size={24} color={isRead ? "#555" : iconColor} />
          {!isRead && <View style={styles.dot} />}
        </View>

        <View style={styles.contentBox}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, isRead && styles.readText]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <Text style={[styles.body, isRead && styles.readText]} numberOfLines={2}>
            {item.body}
          </Text>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)} activeOpacity={0.8}>
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
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 50 },

  card: { flexDirection: "row", backgroundColor: "#252525", borderRadius: 12, padding: 16, marginBottom: 12, alignItems: "flex-start" },
  readCard: { backgroundColor: "#1A1A1A" },

  iconBox: { marginRight: 14, marginTop: 2, position: "relative" },
  dot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },

  contentBox: { flex: 1, marginRight: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, gap: 10 },
  title: { color: "white", fontSize: 15, fontWeight: "bold", flex: 1 },
  date: { color: "#666", fontSize: 11 },
  body: { color: "#CCC", fontSize: 13, lineHeight: 18 },
  readText: { color: "#666" },

  deleteBtn: { padding: 4 },
});