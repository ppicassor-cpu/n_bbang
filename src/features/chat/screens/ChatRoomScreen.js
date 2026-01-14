// ================================================================================
//  FILE: src/features/chat/screens/ChatRoomScreen.js
// ================================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Platform, ActivityIndicator, Keyboard, Animated
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead, leaveRoom, leaveRoomAsOwner } from "../services/chatService";
import { db } from "../../../firebaseConfig";
import { doc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { ROUTES } from "../../../app/navigation/routes";
import CustomModal from "../../../components/CustomModal";

// ✅ 신고 사유 목록 정의
const REPORT_REASONS = [
  "광고 / 홍보성 채팅",
  "욕설 / 비하 발언",
  "사기 / 거래 문제",
  "도배 / 스팸",
  "기타 부적절한 내용"
];

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params || {};
  const { user, blockUser, blockedUsers } = useAppContext(); 
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  
  // ✅ 신고 관련 모달 상태들
  const [reportModalVisible, setReportModalVisible] = useState(false); // 사유 선택
  const [reportSuccessModalVisible, setReportSuccessModalVisible] = useState(false); // 신고 완료
  const [alreadyReportedModalVisible, setAlreadyReportedModalVisible] = useState(false); // 이미 신고함 (진입 차단)

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

  // ✅ 입장 시 이미 신고한 방인지 확인 -> 커스텀 모달로 알림
  useEffect(() => {
    const checkIfReported = async () => {
      if (!user?.uid || !roomId) return;
      try {
        const q = query(
          collection(db, "reports"),
          where("reporterId", "==", user.uid),
          where("contentId", "==", roomId)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          // Alert 대신 상태 변경 -> 아래에서 CustomModal 렌더링
          setAlreadyReportedModalVisible(true);
        }
      } catch (e) {
        console.log("신고 내역 확인 중 오류:", e);
      }
    };
    checkIfReported();
  }, [roomId, user]);

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
    setReportModalVisible(true);
  };

  // ✅ 신고 데이터 DB 저장 (시스템 팝업 방지)
  const confirmReport = async (selectedReason) => {
    setReportModalVisible(false);
    if (!roomOwnerId) return;
    
    try {
      await addDoc(collection(db, "reports"), {
        targetUserId: roomOwnerId,
        contentId: roomId,
        reason: selectedReason,
        type: "chat",
        reporterId: user?.uid,
        createdAt: new Date().toISOString(),
        status: "pending"
      });

      // 신고 완료 커스텀 모달 표시
      setReportSuccessModalVisible(true);

    } catch (e) {
      console.error("Report failed:", e);
      // 에러 상황은 커스텀 모달까지 만들기엔 과하므로 일단 로그만
    }
  };

  // ✅ 신고 완료 후 확인 버튼 동작
  const handleReportSuccess = async () => {
    setReportSuccessModalVisible(false);
    
    // 1. 해당 유저 차단
    if (roomOwnerId && roomOwnerId !== user?.uid) {
        try {
            await blockUser(roomOwnerId);
        } catch (e) {
            console.log("차단 실패:", e);
        }
    }

    // 2. 방 나가기
    try {
        if (isOwner) {
            await leaveRoomAsOwner(roomId);
        } else {
            await leaveRoom(roomId);
        }
    } catch (e) {
        console.error("방 나가기 오류:", e);
    }

    // 3. 홈 화면으로 이동
    navigation.navigate(ROUTES.HOME); 
  };

  // ✅ 차단하고 나가기 (메뉴에서 선택 시) - 여기도 Alert 대신 모달로 통일하면 좋겠지만, 
  // 기존 코드 유지를 위해 요청하신 '신고' 관련 부분에 집중했습니다.
  // (만약 이것도 바꾸길 원하시면 말씀해주세요. 현재는 Alert 유지)
  const handleBlockAndLeave = () => {
    setIsHeaderMenuOpen(false);
    if (!roomId) return;
    if (!roomOwnerId || roomOwnerId === user?.uid) return;

    // ※ 여기는 확인/취소 선택이 필요해서 시스템 Alert 유지 (요청하신 '신고 팝업'이 아님)
    // 원하시면 이것도 CustomModal type="confirm"으로 바꿀 수 있습니다.
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

      {/* ✅ 신고 사유 선택 모달 */}
      <CustomModal 
        visible={reportModalVisible} 
        title="신고 사유 선택" 
        message="신고하시는 사유를 선택해주세요."
        onCancel={() => setReportModalVisible(false)}
      >
        <View style={{ gap: 8, marginTop: 10, width: '100%' }}>
          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity 
              key={reason}
              style={styles.reportReasonBtn}
              onPress={() => confirmReport(reason)}
            >
              <Text style={styles.reportReasonText}>{reason}</Text>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity 
            style={[styles.reportReasonBtn, { backgroundColor: '#333', marginTop: 8 }]}
            onPress={() => setReportModalVisible(false)}
          >
            <Text style={{ color: '#BBB', fontWeight: 'bold' }}>취소</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* ✅ 신고 완료 알림 모달 */}
      <CustomModal
        visible={reportSuccessModalVisible}
        title="신고 완료"
        message={"신고가 접수되었습니다.\n확인을 누르면 채팅방에서 나갑니다."}
        onConfirm={handleReportSuccess}
      />

      {/* ✅ [추가] 이미 신고한 방 알림 모달 */}
      <CustomModal
        visible={alreadyReportedModalVisible}
        title="알림"
        message="이미 신고한 채팅방입니다."
        onConfirm={() => {
            setAlreadyReportedModalVisible(false);
            navigation.goBack(); // 확인 누르면 뒤로가기
        }}
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

  // ✅ 신고 사유 버튼 스타일
  reportReasonBtn: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
  reportReasonText: {
    color: 'white',
    fontSize: 14
  }
});