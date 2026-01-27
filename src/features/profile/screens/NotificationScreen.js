// FILE: src/features/profile/screens/NotificationScreen.js

import React, { useState, useEffect } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator  } from "react-native";
import { Text } from "../../../components/MyText"; 
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, limit, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, where, getDocs, getDoc } from "firebase/firestore";
// ✅ [추가] AsyncStorage 추가
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
    const q = query(colRef, orderBy("createdAt", "desc"));

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
          // 1. 내 개인 알림 가져오기
          const personalData = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            isSystem: false 
          }));

          // 2. 전체 공지 가져오기 (isShow == true인 것 중 가장 최신 1개만)
          const systemQ = query(
            collection(db, "system_notices"), 
            where("isShow", "==", true),
            orderBy("createdAt", "desc"), // 날짜 최신순으로 줄 세우고
            limit(1) // 맨 위 1개만 가져옴
          );
          const systemSnap = await getDocs(systemQ);
          
          // 3. 공지 읽음 상태 확인 (AsyncStorage)
          const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
          const readIds = readJson ? JSON.parse(readJson) : [];

          const systemData = systemSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            isSystem: true,
            isRead: readIds.includes(d.id),
            type: d.data().type || 'notice'
          }));

          // 4. 합치기 및 정렬 (공지사항 상단 고정)
          const combined = [...personalData, ...systemData].sort((a, b) => {
            // [1순위] 공지사항(System)이 무조건 위로 오게 처리
            if (a.isSystem && !b.isSystem) return -1; // a가 공지면 앞으로
            if (!a.isSystem && b.isSystem) return 1;  // b가 공지면 앞으로

            // [2순위] 같은 타입끼리는 최신 날짜순
            const getMillis = (t) => {
              if (!t) return 0;
              if (typeof t.toDate === 'function') return t.toDate().getTime();
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

  // ✅ [수정] 읽음 처리 로직 (공지사항 포함)
  const handleRead = async (noti) => {
    if (!user) return;

    try {
      // 1. 공지사항(System)인 경우 -> 로컬 스토리지에 읽음 기록
      if (noti.isSystem) {
        if (noti.isRead) return;
        
        // 화면 즉시 반영
        setNotifications(prev => prev.map(n => n.id === noti.id ? {...n, isRead: true} : n));

        // AsyncStorage 업데이트
        const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
        const readIds = readJson ? JSON.parse(readJson) : [];
        if (!readIds.includes(noti.id)) {
          readIds.push(noti.id);
          await AsyncStorage.setItem("READ_SYSTEM_NOTICES", JSON.stringify(readIds));
        }
        return;
      }

      // 2. 채팅 알림인 경우
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
        // 3. 일반 알림인 경우
        if (!noti.isRead) {
          const notiRef = doc(db, "users", user.uid, "notifications", noti.id);
          await updateDoc(notiRef, { isRead: true });
        }
      }
    } catch (e) {
      console.error("읽음 처리 실패:", e);
    }
  };

  // ✅ [수정] 삭제 로직 (공지사항은 삭제 불가)
  const handleDelete = async (item) => {
    if (!user) return;
    
    if (item.isSystem) {
      // ✅ [해결] 4번째 파라미터에 '닫기 함수' 추가!
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

  // ✅ [수정] 전체 읽음 (공지사항 + 개인알림)
  const handleReadAll = async () => {
    if (!user) return;
    if (notifications.length === 0) return;
    
    try {
      const batch = writeBatch(db);
      let dbUpdateCount = 0;
      let systemReadIds = [];

      // 1. AsyncStorage에 있는 기존 읽음 목록 가져오기
      const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
      const prevReadIds = readJson ? JSON.parse(readJson) : [];
      systemReadIds = [...prevReadIds];

      notifications.forEach((noti) => {
        if (!noti.isRead) {
          if (noti.isSystem) {
            // 공지는 로컬 ID 수집
            if (!systemReadIds.includes(noti.id)) {
              systemReadIds.push(noti.id);
            }
          } else {
            // 개인 알림은 DB 업데이트
            const ref = doc(db, "users", user.uid, "notifications", noti.id);
            batch.update(ref, { isRead: true });
            dbUpdateCount++;
          }
        }
      });

      // 공지 읽음 처리 반영
      if (systemReadIds.length > prevReadIds.length) {
        await AsyncStorage.setItem("READ_SYSTEM_NOTICES", JSON.stringify(systemReadIds));
        // 화면 강제 갱신
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }

      // 개인 알림 DB 반영
      if (dbUpdateCount > 0) {
        await batch.commit();
      }
    } catch (e) {
      openModal("오류", "일괄 처리 중 문제가 발생했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ [수정] 전체 삭제 (공지사항 제외하고 삭제)
  const handleDeleteAll = () => {
    if (!user) return;
    // 개인 알림만 필터링
    const personalNotis = notifications.filter(n => !n.isSystem);
    if (personalNotis.length === 0) {
      // ✅ [해결] 4번째 파라미터에 '닫기 함수' 추가!
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
    // ✅ 클릭 시 그룹 읽음 처리 실행
    await handleRead(item);

    // ✅ [추가] 공지사항(isSystem)이면 내용 모달 띄우기
    if (item.isSystem) {
      openModal(
        item.title || "공지사항", 
        item.message || item.body || "내용이 없습니다.", 
        "alert", 
        () => setModalVisible(false) // 확인 버튼 누르면 닫기
      );
      return;
    }

    // 채팅(또는 게시글 연동 채팅) 알림일 경우
    if (item?.type === "chat" && item?.roomId) {
      try {
        // ✅ 이동하기 전에 실제 데이터(채팅방/게시글)가 존재하는지 확인
        const roomRef = doc(db, "chat_rooms", item.roomId);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
          // 존재하면 정상 이동
          navigation.navigate(ROUTES.CHAT_ROOM, {
            roomId: item.roomId,
            roomName: item.roomName || item.title || "채팅방",
          });
        } else {
          // ❌ 존재하지 않음 (Snapshot은 가져왔으나 데이터가 없는 경우)
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

        // ✅ [핵심 수정] 권한 없음(permission-denied)도 삭제된 것으로 간주
        // (보안 규칙상 삭제된 문서는 접근 권한 체크 실패로 이어지는 경우가 많음)
        if (e.code === 'permission-denied' || e.code === 'not-found') {
          openModal(
            "알림",
            "해당 게시글(또는 채팅방)이 삭제되어\n내용을 확인할 수 없습니다.",
            "alert",
            handleConfirm
          );
        } else {
          // 그 외의 진짜 오류 (네트워크 문제 등)
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
