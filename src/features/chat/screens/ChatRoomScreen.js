// ================================================================================
//  FILE: src/features/chat/screens/ChatRoomScreen.js
// ================================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Platform, ActivityIndicator, Keyboard, Animated, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead, leaveRoom, leaveRoomAsOwner } from "../services/chatService";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import CustomModal from "../../../components/CustomModal";

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params || {};
  const { user, reportUser, blockUser, blockedUsers } = useAppContext();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);
  const isOwner = !!user?.uid && !!roomOwnerId && user.uid === roomOwnerId;

  const blockedList = Array.isArray(blockedUsers) ? blockedUsers : [];

  const filteredMessages = messages.filter((msg) => {
    return msg.senderId === "system" || !blockedList.includes(msg.senderId);
  });

  useEffect(() => {
    navigation.setOptions({
      title: roomName || "채팅방",
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setIsHeaderMenuOpen((prev) => !prev)}
          style={{ marginRight: 10, padding: 5 }}
        >
          <MaterialIcons name="more-vert" size={26} color="white" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, roomName]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        Animated.timing(keyboardHeight, {
          duration: Platform.OS === "ios" ? 250 : 100,
          toValue: e.endCoordinates.height - (Platform.OS === "ios" ? insets.bottom : 0),
          useNativeDriver: false,
        }).start(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        Animated.timing(keyboardHeight, {
          duration: Platform.OS === "ios" ? 250 : 100,
          toValue: 0,
          useNativeDriver: false,
        }).start();
      }
    );

    const fetchRoomInfo = async () => {
      try {
        const roomRef = doc(db, "chatRooms", roomId);
        const snap = await getDoc(roomRef);
        if (snap.exists()) {
          setTotalParticipants(snap.data().participants?.length || 0);
        }
      } catch (e) {}
    };
    fetchRoomInfo();

    const roomRef = doc(db, "chatRooms", roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      setTotalParticipants(data.participants?.length || 0);
      setRoomOwnerId(data.ownerId || null);
      setIsClosed(!!data.isClosed);
    });

    const unsubscribe = subscribeMessages(roomId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      unsubscribe();
      unsubRoom();
    };
  }, [roomId, insets.bottom, keyboardHeight]);

  useEffect(() => {
    if (!user || messages.length === 0 || !roomId) return;

    const unreadMsgIds = messages
      .filter((m) => m.senderId !== user.uid)
      .filter((m) => !m.readBy || !m.readBy.includes(user.uid))
      .map((m) => m.id);

    if (unreadMsgIds.length > 0) {
      markAsRead(roomId, unreadMsgIds);
    }
  }, [messages, user, roomId]);

  const handleSend = async () => {
    if (!roomId) return;
    if (isClosed) return;
    if (!text.trim()) return;
    const tempText = text;
    setText("");
    try {
      await sendMessage(roomId, tempText);
    } catch (e) {
      setText(tempText);
    }
  };

  const handleLeave = async () => {
    if (!roomId) return;
    try {
      if (isOwner) {
        await leaveRoomAsOwner(roomId);
      } else {
        await leaveRoom(roomId);
      }
      setLeaveModalVisible(false);
      navigation.goBack();
    } catch (e) {
      setLeaveModalVisible(false);
      console.error("방 나가기 실패:", e);
    }
  };

  const handleReportRoom = () => {
    setIsHeaderMenuOpen(false);
    Alert.alert("신고하기", "이 채팅방을 부적절한 콘텐츠로 신고하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "신고",
        onPress: () => {
          if (!roomOwnerId || typeof reportUser !== "function") return;
          reportUser(roomOwnerId, roomId, "부적절한 채팅방", "chat");
        },
      },
    ]);
  };

  const handleBlockAndLeave = () => {
    setIsHeaderMenuOpen(false);
    if (!roomId) return;
    if (!roomOwnerId || roomOwnerId === user?.uid) return;

    Alert.alert("차단하고 나가기", "방장을 차단하고 채팅방을 나가시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "차단 및 나가기",
        style: "destructive",
        onPress: async () => {
          if (typeof blockUser === "function") {
            await blockUser(roomOwnerId);
          }
          await leaveRoom(roomId);
          navigation.goBack();
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const isSystemLeave = item.senderId === "system";
    if (isSystemLeave) {
      return (
        <View style={styles.systemMsgContainer}>
          <Text style={styles.systemMsgText}>{item.text}</Text>
        </View>
      );
    }

    const isMy = item.senderId === user?.uid;
    const timeString =
      item.createdAt instanceof Date
        ? item.createdAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        : "";

    // ✅ (문제2) unreadCount 음수 방지: readCount가 participants를 넘거나 participants가 0일 때도 0 이상으로 클램프
    const safeTotal = Number.isFinite(totalParticipants) ? totalParticipants : 0;
    const readCountRaw = Array.isArray(item.readBy) ? item.readBy.length : 0;
    const readCount = Math.max(0, Math.min(readCountRaw, safeTotal));
    const unreadCount = Math.max(0, safeTotal - readCount);

    return (
      <View style={[styles.msgContainer, isMy ? styles.myMsgContainer : styles.otherMsgContainer]}>
        {!isMy && (
          <Text style={styles.senderName}>
            {item.senderNickname || item.senderEmail?.split("@")[0] || "알 수 없음"}
          </Text>
        )}
        <View style={{ flexDirection: isMy ? "row-reverse" : "row", alignItems: "flex-end" }}>
          <View style={[styles.bubble, isMy ? styles.myBubble : styles.otherBubble]}>
            <Text style={[styles.msgText, isMy ? styles.myMsgText : styles.otherMsgText]}>{item.text}</Text>
          </View>
          <View style={{ alignItems: isMy ? "flex-end" : "flex-start", marginHorizontal: 5 }}>
            {unreadCount > 0 && <Text style={styles.unreadCountText}>{unreadCount}</Text>}
            <Text style={styles.timeText}>{timeString}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {isHeaderMenuOpen && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setIsHeaderMenuOpen(false)}
        >
          <View style={[styles.menuContainer, { top: insets.top + 50 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setIsHeaderMenuOpen(false);
                setLeaveModalVisible(true);
              }}
            >
              <MaterialIcons name="logout" size={20} color={theme.danger} />
              <Text style={[styles.menuText, { color: theme.danger }]}>나가기</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleReportRoom}>
              <MaterialIcons name="report-problem" size={20} color="#FFD700" />
              <Text style={[styles.menuText, { color: "#FFD700" }]}>신고하기</Text>
            </TouchableOpacity>

            {!isOwner && (
              <TouchableOpacity style={styles.menuItem} onPress={handleBlockAndLeave}>
                <MaterialIcons name="block" size={20} color="#AAA" />
                <Text style={[styles.menuText, { color: "#AAA" }]}>차단하고 나가기</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}

      <Animated.View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredMessages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 10 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor="grey"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!isClosed}
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendBtn} disabled={!text.trim() || isClosed}>
            <MaterialIcons name="send" size={24} color={text.trim() ? "black" : "#555"} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <CustomModal
        visible={leaveModalVisible}
        title="채팅방 나가기"
        message={isOwner ? "방장이 나가면 채팅이 종료됩니다. 계속하시겠습니까?" : "방에서 나가시겠습니까?"}
        type="confirm"
        onConfirm={handleLeave}
        onCancel={() => setLeaveModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  systemMsgContainer: { marginVertical: 10, alignItems: "center" },
  systemMsgText: { color: "#666", fontSize: 12, textAlign: "center" },
  msgContainer: { marginVertical: 6 },
  myMsgContainer: { alignItems: "flex-end" },
  otherMsgContainer: { alignItems: "flex-start" },
  senderName: { color: "#888", fontSize: 12, marginBottom: 4, marginLeft: 4 },
  bubble: { padding: 12, borderRadius: 16, maxWidth: "75%" },
  myBubble: { backgroundColor: theme.primary, borderBottomRightRadius: 2 },
  otherBubble: { backgroundColor: "#333", borderTopLeftRadius: 2 },
  msgText: { fontSize: 16, lineHeight: 22 },
  myMsgText: { color: "black" },
  otherMsgText: { color: "white" },
  timeText: { color: "#666", fontSize: 10, marginTop: 2 },
  unreadCountText: { fontSize: 11, fontWeight: "bold", color: "#D0FFD0", marginBottom: 1 },
  inputContainer: { flexDirection: "row", padding: 10, backgroundColor: theme.cardBg, alignItems: "center" },
  input: { flex: 1, backgroundColor: "#111", color: "white", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, borderColor: "#333" },
  sendBtn: { backgroundColor: theme.primary, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  menuOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 999 },
  menuContainer: { position: "absolute", right: 10, backgroundColor: "#222", borderRadius: 8, padding: 5, elevation: 5, borderWidth: 1, borderColor: "#333", minWidth: 150 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: "#333" },
  menuText: { fontSize: 14, fontWeight: "bold", marginLeft: 10 },
});
