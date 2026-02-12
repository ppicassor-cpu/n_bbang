import React, { useState, useEffect } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../../../components/MyText";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, limit, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, where, getDocs, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert",
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
    const q = query(colRef, orderBy("createdAt", "desc"), limit(200));

    let unsubscribe = () => {};

    const processUniqueNotifications = (rawList) => {
      const uniqueList = [];
      const visitedRoomIds = new Set();

      rawList.forEach((item) => {
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
        async (snapshot) => {
          const personalData = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            isSystem: false
          }));

          const systemQ = query(
            collection(db, "system_notices"),
            where("isShow", "==", true),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const systemSnap = await getDocs(systemQ);

          const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
          const readIds = readJson ? JSON.parse(readJson) : [];

          const systemData = systemSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            isSystem: true,
            isRead: readIds.includes(d.id),
            type: d.data().type || "notice"
          }));

          const combined = [...personalData, ...systemData].sort((a, b) => {
            if (a.isSystem && !b.isSystem) return -1;
            if (!a.isSystem && b.isSystem) return 1;

            const getMillis = (t) => {
              if (!t) return 0;
              if (typeof t.toDate === "function") return t.toDate().getTime();
              if (t instanceof Date) return t.getTime();
              return new Date(t).getTime();
            };
            return getMillis(b.createdAt) - getMillis(a.createdAt);
          });

          const filtered = processUniqueNotifications(combined);
          setNotifications(filtered);
          setLoading(false);
        },
        (error) => {
          console.error("알림 구독 에러:", error);
          setNotifications([]);
          setLoading(false);
        }
      );

    unsubscribe = attachWithOrder();

    return () => unsubscribe();
  }, [user]);

  const openModal = (title, message, type = "alert", onConfirm = () => {}) => {
    setModalConfig({ title, message, type, onConfirm });
    setModalVisible(true);
  };

  const handleRead = async (noti) => {
    if (!user) return;

    try {
      if (noti.isSystem) {
        if (noti.isRead) return;

        setNotifications((prev) => prev.map((n) => (n.id === noti.id ? { ...n, isRead: true } : n)));

        const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
        const readIds = readJson ? JSON.parse(readJson) : [];
        if (!readIds.includes(noti.id)) {
          readIds.push(noti.id);
          await AsyncStorage.setItem("READ_SYSTEM_NOTICES", JSON.stringify(readIds));
        }
        return;
      }

      if (noti.type === "chat" && noti.roomId) {
        const batch = writeBatch(db);
        const colRef = collection(db, "users", user.uid, "notifications");
        const q = query(colRef, where("roomId", "==", noti.roomId), where("isRead", "==", false));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => batch.update(docSnap.ref, { isRead: true }));
          await batch.commit();
        }
      } else {
        if (!noti.isRead) {
          const notiRef = doc(db, "users", user.uid, "notifications", noti.id);
          await updateDoc(notiRef, { isRead: true });
        }
      }
    } catch (e) {
      console.error("읽음 처리 실패:", e);
    }
  };

  const handleDelete = async (item) => {
    if (!user) return;

    if (item.isSystem) {
      openModal("알림", "공지사항은 삭제할 수 없습니다.", "alert", () => setModalVisible(false));
      return;
    }

    try {
      if (item.type === "chat" && item.roomId) {
        const batch = writeBatch(db);
        const colRef = collection(db, "users", user.uid, "notifications");
        const q = query(colRef, where("roomId", "==", item.roomId));
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
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
      let dbUpdateCount = 0;
      let systemReadIds = [];

      const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
      const prevReadIds = readJson ? JSON.parse(readJson) : [];
      systemReadIds = [...prevReadIds];

      notifications.forEach((noti) => {
        if (!noti.isRead) {
          if (noti.isSystem) {
            if (!systemReadIds.includes(noti.id)) {
              systemReadIds.push(noti.id);
            }
          } else {
            const ref = doc(db, "users", user.uid, "notifications", noti.id);
            batch.update(ref, { isRead: true });
            dbUpdateCount++;
          }
        }
      });

      if (systemReadIds.length > prevReadIds.length) {
        await AsyncStorage.setItem("READ_SYSTEM_NOTICES", JSON.stringify(systemReadIds));
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }

      if (dbUpdateCount > 0) {
        await batch.commit();
      }
    } catch (e) {
      openModal("오류", "일괄 처리 중 문제가 발생했습니다.", "alert", () => setModalVisible(false));
    }
  };

  const handleDeleteAll = () => {
    if (!user) return;

    const personalNotis = notifications.filter((n) => !n.isSystem);
    if (personalNotis.length === 0) {
      openModal("알림", "삭제할 개인 알림이 없습니다.", "alert", () => setModalVisible(false));
      return;
    }

    openModal(
      "알림 전체 삭제",
      "공지사항을 제외한 모든 알림을 삭제하시겠습니까?",
      "confirm",
      async () => {
        setModalVisible(false);
        try {
          const batch = writeBatch(db);
          personalNotis.forEach((noti) => {
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
    await handleRead(item);

    if (item.isSystem) {
      openModal(
        item.title || "공지사항",
        item.message || item.body || "내용이 없습니다.",
        "alert",
        () => setModalVisible(false)
      );
      return;
    }

    if (item?.type === "chat" && item?.roomId) {
      try {
        const roomRef = doc(db, "chat_rooms", item.roomId);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
          navigation.navigate(ROUTES.CHAT_ROOM, {
            roomId: item.roomId,
            roomName: item.roomName || item.title || "채팅방",
          });
        } else {
          const handleConfirm = () => setModalVisible(false);
          openModal(
            "알림",
            "해당 게시글(또는 채팅방)이 삭제되어\n내용을 확인할 수 없습니다.",
            "alert",
            handleConfirm
          );
        }
      } catch (e) {
        console.error("데이터 확인 오류:", e.code);

        const handleConfirm = () => setModalVisible(false);

        if (e.code === "permission-denied" || e.code === "not-found") {
          openModal(
            "알림",
            "해당 게시글(또는 채팅방)이 삭제되어\n내용을 확인할 수 없습니다.",
            "alert",
            handleConfirm
          );
        } else {
          openModal(
            "오류",
            "내용을 불러오는 중 문제가 발생했습니다.",
            "alert",
            handleConfirm
          );
        }
      }
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
    const displayBody = item.body || item.message || "내용이 없습니다.";

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
    position: "relative",
  },
  headerBtn: {
    padding: 5,
    zIndex: 10,
  },
  headerTitleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
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
