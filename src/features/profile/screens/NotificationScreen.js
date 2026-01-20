// FILE: src/features/profile/screens/NotificationScreen.js

import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native"; 
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, where, getDocs } from "firebase/firestore";

import { db } from "../../../firebaseConfig";
import { theme } from "../../../theme";
import { useAppContext } from "../../../app/providers/AppContext";
import { ROUTES } from "../../../app/navigation/routes";
import CustomModal from "../../../components/CustomModal"; 

export default function NotificationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAppContext();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // 모달 상태 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert", // 'alert' | 'confirm'
    onConfirm: () => {},
  });

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
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const colRef = collection(db, "users", user.uid, "notifications");
    // 최신순 정렬
    const q = query(colRef, orderBy("createdAt", "desc"));

    let unsubscribe = () => {};

    // ✅ 화면 표시용 중복 제거 (보여줄 때만 최신 1개 남김)
    const processUniqueNotifications = (rawList) => {
      const uniqueList = [];
      const visitedRoomIds = new Set();

      rawList.forEach((item) => {
        // 채팅 알림이고 roomId가 있는 경우
        if (item.type === "chat" && item.roomId) {
          if (!visitedRoomIds.has(item.roomId)) {
            visitedRoomIds.add(item.roomId);
            uniqueList.push(item); 
          }
        } else {
          uniqueList.push(item);
        }
      });
      return uniqueList;
    };

    const attachWithOrder = () =>
      onSnapshot(
        q,
        (snapshot) => {
          const loaded = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          
          const filtered = processUniqueNotifications(loaded);
          setNotifications(filtered);
          setLoading(false);
        },
        (error) => {
          console.error("알림 구독 에러:", error);
          // 폴백 로직
          try {
            unsubscribe = onSnapshot(colRef, (snapshot2) => {
                const loaded2 = snapshot2.docs
                  .map((d) => ({ id: d.id, ...d.data() }))
                  .sort((a, b) => {
                    const ad = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                    const bd = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                    return bd - ad;
                  });
                const filtered2 = processUniqueNotifications(loaded2);
                setNotifications(filtered2);
                setLoading(false);
              },
              (error2) => {
                setNotifications([]);
                setLoading(false);
              }
            );
          } catch (e2) {
            setNotifications([]);
            setLoading(false);
          }
        }
      );

    unsubscribe = attachWithOrder();

    return () => unsubscribe();
  }, [user]);

  const openModal = (title, message, type = "alert", onConfirm = () => {}) => {
    setModalConfig({ title, message, type, onConfirm });
    setModalVisible(true);
  };

  // ✅ [수정] 읽음 처리 로직 업그레이드
  // 채팅 알림 클릭 시 -> 해당 방의 '모든' 안 읽은 알림을 읽음 처리
  const handleRead = async (noti) => {
    if (!user) return;

    try {
      // 1. 채팅 알림인 경우: 같은 방의 모든 '안 읽은' 알림 찾아서 읽음 처리
      if (noti.type === "chat" && noti.roomId) {
        const batch = writeBatch(db);
        const colRef = collection(db, "users", user.uid, "notifications");
        
        // 해당 방의 isRead: false인 것들만 쿼리
        const q = query(
          colRef, 
          where("roomId", "==", noti.roomId),
          where("isRead", "==", false)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, { isRead: true });
          });
          await batch.commit();
        }
      
      } else {
        // 2. 일반 알림인 경우: 해당 알림 1개만 읽음 처리
        if (!noti.isRead) {
          const notiRef = doc(db, "users", user.uid, "notifications", noti.id);
          await updateDoc(notiRef, { isRead: true });
        }
      }
    } catch (e) {
      console.error("읽음 처리 실패:", e);
    }
  };

  // 삭제 로직 (이전과 동일하게 그룹 삭제 유지)
  const handleDelete = async (item) => {
    if (!user) return;

    try {
      if (item.type === "chat" && item.roomId) {
        const batch = writeBatch(db);
        const colRef = collection(db, "users", user.uid, "notifications");
        const q = query(colRef, where("roomId", "==", item.roomId));
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } else {
        await deleteDoc(doc(db, "users", user.uid, "notifications", item.id));
      }
    } catch (e) {
      console.error("삭제 실패:", e);
      openModal("오류", "삭제에 실패했습니다.", "alert", () => setModalVisible(false));
    }
  };

  const handleReadAll = async () => {
    if (!user) return;
    if (notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      let updateCount = 0;

      // 화면에 보이는 것들 + 실제 DB 상의 모든 안 읽은 알림을 처리하는 게 좋지만
      // 현재는 화면 목록 기준으로 처리 (간단 구현)
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
      openModal("오류", "일괄 처리 중 문제가 발생했습니다.", "alert", () => setModalVisible(false));
    }
  };

  const handleDeleteAll = () => {
    if (!user) return;
    if (notifications.length === 0) return;

    openModal(
      "알림 전체 삭제",
      "정말 모든 알림을 삭제하시겠습니까?",
      "confirm",
      async () => {
        setModalVisible(false);
        try {
          const batch = writeBatch(db);
          notifications.forEach((noti) => {
            const ref = doc(db, "users", user.uid, "notifications", noti.id);
            batch.delete(ref);
          });
          await batch.commit();
        } catch (e) {
          console.error("전체 삭제 실패:", e);
          setTimeout(() => {
            openModal("오류", "삭제 중 문제가 발생했습니다.", "alert", () => setModalVisible(false));
          }, 300);
        }
      }
    );
  };

  const onPressNoti = async (item) => {
    // ✅ 클릭 시 그룹 읽음 처리 실행
    await handleRead(item);
    
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

    const displayTitle = item.title || "알림";
    const displayBody = item.body || "내용이 없습니다.";

    return (
      <View style={[styles.card, isRead && styles.readCard]}>
        <TouchableOpacity style={styles.contentTouchable} onPress={() => onPressNoti(item)} activeOpacity={0.7}>
          <View style={styles.iconBox}>
            <MaterialIcons name={iconName} size={24} color={isRead ? "#555" : iconColor} />
            {!isRead && <View style={styles.dot} />}
          </View>

          <View style={styles.contentBox}>
            <View style={styles.headerRow}>
              <Text style={[styles.title, isRead && styles.readText]} numberOfLines={1}>
                {displayTitle}
              </Text>
              <Text style={styles.date}>{dateStr}</Text>
            </View>
            <Text style={[styles.body, isRead && styles.readText]} numberOfLines={2}>
              {displayBody}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color="#666" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <MaterialIcons name="arrow-back-ios-new" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Text style={styles.headerTitle}>알림 센터</Text>
        </View>

        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity onPress={handleReadAll} style={styles.headerBtn}>
            <Ionicons name="checkmark-done-circle-outline" size={26} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAll} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={24} color="white" />
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

      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    position: 'relative',
  },
  headerBtn: {
    padding: 5,
    zIndex: 10,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerTitle: { 
    color: "white", 
    fontSize: 18, 
    fontWeight: "bold" 
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 50 },

  card: { flexDirection: "row", backgroundColor: "#252525", borderRadius: 12, marginBottom: 12, overflow: "hidden" },
  readCard: { backgroundColor: "#1A1A1A" },

  contentTouchable: { flex: 1, flexDirection: "row", padding: 16, alignItems: "flex-start" },

  iconBox: { marginRight: 14, marginTop: 2, position: "relative" },
  dot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger },

  contentBox: { flex: 1, marginRight: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, gap: 10 },
  title: { color: "white", fontSize: 15, fontWeight: "bold", flex: 1 },
  date: { color: "#666", fontSize: 11 },
  body: { color: "#CCC", fontSize: 13, lineHeight: 18 },
  readText: { color: "#666" },

  deleteBtn: { width: 50, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderLeftColor: "#333" },
});