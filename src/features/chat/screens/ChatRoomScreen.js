// ================================================================================
//  FILE: src/features/chat/screens/ChatRoomScreen.js
// ================================================================================

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image,
  Platform, ActivityIndicator, Keyboard, Animated, Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead, leaveRoom, leaveRoomAsOwner } from "../services/chatService";
// ✅ [추가] 스토리지 및 압축 관련 임포트
import { db, storage } from "../../../firebaseConfig";
import { doc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { ROUTES } from "../../../app/navigation/routes";
import CustomModal from "../../../components/CustomModal";
// ✅ [추가] 갤러리 모달 및 이미지 확대 모달 임포트
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";
import ImageDetailModal from "../../../components/ImageDetailModal";
// ✅ [수정] hasBadWord -> hasProfanity 로 변경 (욕설만 검사)
import { hasProfanity } from "../../../utils/badWordFilter";

const REPORT_REASONS = [
  "광고 / 홍보성 채팅",
  "욕설 / 비하 발언",
  "사기 / 거래 문제",
  "도배 / 스팸",
  "기타 부적절한 내용"
];

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, roomName, isGhost = false } = route.params || {};
  const { user, blockUser, blockedUsers } = useAppContext(); 
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  // 연결된 게시글 정보 상태
  const [linkedPost, setLinkedPost] = useState(null);

  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  
  const [reportModalVisible, setReportModalVisible] = useState(false); 
  const [reportSuccessModalVisible, setReportSuccessModalVisible] = useState(false); 
  const [alreadyReportedModalVisible, setAlreadyReportedModalVisible] = useState(false); 

  // ✅ [추가] 이미지 업로드 로딩 상태
  const [uploading, setUploading] = useState(false);
  // ✅ [추가] 갤러리 모달 상태
  const [galleryVisible, setGalleryVisible] = useState(false);

  // ✅ [추가] 이미지 상세보기(확대) 상태
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState("");

  // ✅ [추가] 비속어 경고 모달 상태
  const [badWordModalVisible, setBadWordModalVisible] = useState(false);

  // ✅ [추가] 나가기 중복 방지
  const [leaving, setLeaving] = useState(false);

  // ✅ [추가] 나가기 실패 커스텀 모달
  const [leaveErrorModalVisible, setLeaveErrorModalVisible] = useState(false);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState("");

  // ✅ [추가] 이미지 전송 실패 커스텀 모달
  const [imageErrorModalVisible, setImageErrorModalVisible] = useState(false);
  const [imageErrorMessage, setImageErrorMessage] = useState("");

  // ✅ [추가] 차단하고 나가기 확인 커스텀 모달
  const [blockLeaveModalVisible, setBlockLeaveModalVisible] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);
  const isOwner = !!user?.uid && !!roomOwnerId && user.uid === roomOwnerId;

  const blockedList = Array.isArray(blockedUsers) ? blockedUsers : [];

  const filteredMessages = messages.filter((msg) => {
    return msg.senderId === "system" || !blockedList.includes(msg.senderId);
  });

  // 게시글 정보 불러오기
  useEffect(() => {
    if (!roomId) return;
    
    const postId = roomId.replace("post_", "");
    if (!postId) return;

    const fetchPostData = async () => {
      try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          setLinkedPost({ id: postSnap.id, ...postSnap.data() });
        }
      } catch (e) {
        console.log("게시글 정보 로드 실패:", e);
      }
    };
    fetchPostData();
  }, [roomId]);

  useEffect(() => {
    navigation.setOptions({
      title: isGhost ? `👻 ${roomName} (감시)` : (roomName || "채팅방"),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setIsHeaderMenuOpen((prev) => !prev)}
          style={{ marginRight: 10, padding: 5 }}
        >
          <MaterialIcons name="more-vert" size={26} color="white" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, roomName, isGhost]);

  useEffect(() => {
    const checkIfReported = async () => {
      if (!user?.uid || !roomId || isGhost) return;
      try {
        const q = query(
          collection(db, "reports"),
          where("reporterId", "==", user.uid),
          where("contentId", "==", roomId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setAlreadyReportedModalVisible(true);
        }
      } catch (e) {
        console.log("신고 내역 확인 중 오류:", e);
      }
    };
    checkIfReported();
  }, [roomId, user, isGhost]);

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
    if (!user || messages.length === 0 || !roomId || isGhost) return;

    const unreadMsgIds = messages
      .filter((m) => m.senderId !== user.uid)
      .filter((m) => !m.readBy || !m.readBy.includes(user.uid))
      .map((m) => m.id);

    if (unreadMsgIds.length > 0) {
      markAsRead(roomId, unreadMsgIds);
    }
  }, [messages, user, roomId, isGhost]);

  const handleSend = async () => {
    if (isGhost) return;
    if (!roomId) return;
    if (isClosed) return;
    if (!text.trim()) return;

    // ✅ [수정] hasBadWord -> hasProfanity (욕설만 검사)
    if (hasProfanity(text)) {
      setBadWordModalVisible(true); // 경고 모달 띄움
      return; // 전송 중단
    }

    const tempText = text;
    setText("");
    try {
      await sendMessage(roomId, tempText);
    } catch (e) {
      setText(tempText);
    }
  };

  // ✅ [수정] 갤러리 모달에서 이미지 선택 시 처리 (압축 및 전송)
  const handleGallerySelect = async (selectedUris) => {
    if (isGhost || isClosed) return;
    if (!selectedUris || selectedUris.length === 0) return;

    setUploading(true); // 로딩 시작 -> 모달 뜸

    try {
      // 선택된 이미지들을 순차적으로 처리
      for (const uri of selectedUris) {
        if (!uri) continue;

        // 1. 이미지 압축 (600px, 0.4, WebP)
        const manipResult = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 600 } }],
          { compress: 0.4, format: ImageManipulator.SaveFormat.WEBP }
        );

        // 2. Firebase Storage 업로드
        const response = await fetch(manipResult.uri);
        const blob = await response.blob();
        const filename = `chat_images/${roomId}/${Date.now()}_${user.uid}_${Math.random().toString(36).substring(7)}.webp`;
        const storageRef = ref(storage, filename);

        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        // 3. 메시지 전송 (텍스트는 빈 값, image 필드에 URL)
        await sendMessage(roomId, "", downloadUrl);
      }
    } catch (e) {
      console.error("Image upload/send error:", e);
      // ✅ [수정] Alert.alert 대신 커스텀 모달로 표시
      const msg = `${e?.code || "unknown"}\n${e?.message || ""}`.trim();
      setImageErrorMessage(msg || "이미지 전송 중 문제가 발생했습니다.");
      setImageErrorModalVisible(true);
    } finally {
      setUploading(false); // 로딩 끝 -> 모달 사라짐
      setGalleryVisible(false); // 갤러리 모달 닫기
    }
  };

  const handleLeave = async () => {
    if (!roomId) return;
    if (leaving) return;

    setLeaving(true);

    if (isGhost) {
      setLeaveModalVisible(false);
      setIsHeaderMenuOpen(false);
      setLeaving(false);
      navigation.reset({
        index: 0,
        routes: [{ name: ROUTES.HOME }],
      });
      return;
    }

    try {
      if (isOwner) {
        await leaveRoomAsOwner(roomId);
      } else {
        await leaveRoom(roomId);
      }
      setLeaveModalVisible(false);
      setIsHeaderMenuOpen(false);
      navigation.reset({
        index: 0,
        routes: [{ name: ROUTES.HOME }],
      });
    } catch (e) {
      setLeaveModalVisible(false);
      setIsHeaderMenuOpen(false);
      console.error("방 나가기 실패:", e);

      // ✅ [수정] Alert.alert 대신 커스텀 모달로 표시
      const msg = `${e?.code || "unknown"}\n${e?.message || ""}`.trim();
      setLeaveErrorMessage(msg || "나가기 처리 중 오류가 발생했습니다.");
      setLeaveErrorModalVisible(true);
    } finally {
      setLeaving(false);
    }
  };

  const handleReportRoom = () => {
    setIsHeaderMenuOpen(false);
    setReportModalVisible(true);
  };

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
      setReportSuccessModalVisible(true);
    } catch (e) {
      console.error("Report failed:", e);
    }
  };

  const handleReportSuccess = async () => {
    setReportSuccessModalVisible(false);
    
    if (isGhost) {
        navigation.navigate(ROUTES.HOME);
        return;
    }

    if (roomOwnerId && roomOwnerId !== user?.uid) {
        try { await blockUser(roomOwnerId); } catch (e) {}
    }

    try {
        if (isOwner) await leaveRoomAsOwner(roomId);
        else await leaveRoom(roomId);
    } catch (e) {}

    navigation.navigate(ROUTES.HOME); 
  };

  const confirmBlockAndLeave = async () => {
    setBlockLeaveModalVisible(false);
    if (isGhost) return; 

    if (!roomId) return;
    if (!roomOwnerId || roomOwnerId === user?.uid) return;

    if (typeof blockUser === "function") {
      await blockUser(roomOwnerId);
    }
    await leaveRoom(roomId);
    navigation.reset({
      index: 0,
      routes: [{ name: ROUTES.HOME }],
    });
  };

  const handleBlockAndLeave = () => {
    setIsHeaderMenuOpen(false);
    if (isGhost) return; 

    if (!roomId) return;
    if (!roomOwnerId || roomOwnerId === user?.uid) return;

    // ✅ [수정] Alert.alert 대신 커스텀 모달로 표시
    setBlockLeaveModalVisible(true);
  };

  const handleGoToPost = () => {
    if (!linkedPost) return;
    const isFree = linkedPost.category === "무료나눔" || linkedPost.isFree === true;
    navigation.navigate(isFree ? ROUTES.FREE_DETAIL : ROUTES.DETAIL, {
      post: linkedPost
    });
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
    const timeString = item.createdAt instanceof Date
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
          {/* ✅ [수정] 이미지가 있으면 배경색(녹색)과 패딩을 없앰 */}
          <View style={[
            styles.bubble, 
            isMy ? styles.myBubble : styles.otherBubble,
            item.image && { backgroundColor: "transparent", padding: 0 } 
          ]}>
            {/* ✅ [수정] 이미지를 TouchableOpacity로 감싸 확대 기능 연결 */}
            {item.image ? (
              <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={() => {
                  setSelectedImageUri(item.image);
                  setIsImageViewerVisible(true);
                }}
              >
                <Image 
                  source={{ uri: item.image }} 
                  style={{ width: 200, height: 200, borderRadius: 8 }} 
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : (
              <Text style={[styles.msgText, isMy ? styles.myMsgText : styles.otherMsgText]}>{item.text}</Text>
            )}
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
      
      {linkedPost && (
        <TouchableOpacity style={styles.postLinkBar} onPress={handleGoToPost} activeOpacity={0.8}>
          {linkedPost.images && linkedPost.images.length > 0 ? (
            <Image 
              source={{ uri: typeof linkedPost.images[0] === 'string' ? linkedPost.images[0] : linkedPost.images[0].uri }} 
              style={styles.postLinkImage} 
            />
          ) : (
            <View style={[styles.postLinkImage, { backgroundColor: '#333', alignItems:'center', justifyContent:'center' }]}>
                <Ionicons name="image-outline" size={20} color="#777" />
            </View>
          )}
          
          <View style={styles.postLinkInfo}>
            <Text style={styles.postLinkTitle} numberOfLines={1}>{linkedPost.title}</Text>
            <Text style={styles.postLinkPrice}>
              {linkedPost.category === "무료나눔" 
                ? "무료나눔" 
                : `${Number(linkedPost.pricePerPerson || 0).toLocaleString()}원 (1인)`
              }
            </Text>
          </View>
          
          <View style={styles.postLinkArrow}>
            <Text style={{color: '#AAA', fontSize: 12, marginRight: 4}}>게시글로 이동</Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#AAA" />
          </View>
        </TouchableOpacity>
      )}

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
              <MaterialIcons name={isGhost ? "logout" : "logout"} size={20} color={theme.danger} />
              <Text style={[styles.menuText, { color: theme.danger }]}>
                {isGhost ? "몰래 나가기" : "나가기"}
              </Text>
            </TouchableOpacity>

            {!isGhost && (
              <TouchableOpacity style={styles.menuItem} onPress={handleReportRoom}>
                <MaterialIcons name="report-problem" size={20} color="#FFD700" />
                <Text style={[styles.menuText, { color: "#FFD700" }]}>신고하기</Text>
              </TouchableOpacity>
            )}

            {!isOwner && !isGhost && (
              <TouchableOpacity style={styles.menuItem} onPress={handleBlockAndLeave}>
                <MaterialIcons name="block" size={20} color="#AAA" />
                <Text style={[styles.menuText, { color: "#AAA" }]}>차단하고 나가기</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}

      <Animated.View style={{ flex: 1, paddingBottom: isGhost ? 0 : keyboardHeight }}>
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

        {isGhost ? (
            <View style={[styles.ghostBanner, { paddingBottom: insets.bottom + 20 }]}>
                <MaterialIcons name="visibility" size={20} color="black" style={{marginRight: 8}}/>
                <Text style={styles.ghostText}>👻 관리자 고스트 모드로 감시 중입니다</Text>
            </View>
        ) : (
            <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
              {/* ✅ [수정] 이미지 전송 버튼: 갤러리 모달 열기 */}
              <TouchableOpacity 
                onPress={() => setGalleryVisible(true)} 
                disabled={uploading || isClosed} 
                style={{ marginRight: 10 }}
              >
                {/* 하단 스피너는 제거하고 모달로 대체하므로 여기서는 아이콘만 표시 */}
                <MaterialIcons name="add-photo-alternate" size={28} color="grey" />
              </TouchableOpacity>

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
        )}
      </Animated.View>

      <CustomModal
        visible={leaveModalVisible}
        title={isGhost ? "감시 종료" : "채팅방 나가기"}
        message={
            isGhost 
            ? "흔적 없이 조용히 나가시겠습니까?"
            : (isOwner ? "방장이 나가면 채팅이 종료됩니다. 계속하시겠습니까?" : "방에서 나가시겠습니까?")
        }
        type="confirm"
        onConfirm={handleLeave}
        onCancel={() => setLeaveModalVisible(false)}
      />

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

      <CustomModal
        visible={reportSuccessModalVisible}
        title="신고 완료"
        message={"신고가 접수되었습니다.\n확인을 누르면 홈으로 이동합니다."}
        onConfirm={handleReportSuccess}
      />

      <CustomModal
        visible={alreadyReportedModalVisible}
        title="알림"
        message="이미 신고한 채팅방입니다."
        onConfirm={() => {
            setAlreadyReportedModalVisible(false);
            navigation.navigate(ROUTES.HOME); 
        }}
      />

      {/* ✅ [추가] 업로드 중 팝업 (자동으로 사라짐) */}
      <CustomModal
        visible={uploading}
        title="이미지 업로드중 ⟳"
        message="이미지를 전송하고 있습니다..."
        loading={true}
      />

      {/* ✅ [추가] 갤러리 선택 모달 */}
      <CustomImagePickerModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        onSelect={handleGallerySelect}
        currentCount={0} 
      />

      {/* ✅ [추가] 이미지 상세보기(확대) 모달 */}
      <ImageDetailModal
        visible={isImageViewerVisible}
        images={[selectedImageUri]}
        index={0}
        onClose={() => setIsImageViewerVisible(false)}
      />

      {/* ✅ [추가] 비속어 감지 경고 모달 */}
      <CustomModal
        visible={badWordModalVisible}
        title="경고"
        message={"부적절한 단어(욕설, 비방 등)가 포함되어 있습니다.\n바른 말을 사용해주세요."}
        onConfirm={() => setBadWordModalVisible(false)}
        confirmText="확인"
      />

      {/* ✅ [추가] 나가기 실패 커스텀 모달 */}
      <CustomModal
        visible={leaveErrorModalVisible}
        title="나가기 실패"
        message={leaveErrorMessage}
        onConfirm={() => setLeaveErrorModalVisible(false)}
        confirmText="확인"
      />

      {/* ✅ [추가] 이미지 전송 실패 커스텀 모달 */}
      <CustomModal
        visible={imageErrorModalVisible}
        title="오류"
        message={imageErrorMessage}
        onConfirm={() => setImageErrorModalVisible(false)}
        confirmText="확인"
      />

      {/* ✅ [추가] 차단하고 나가기 확인 커스텀 모달 */}
      <CustomModal
        visible={blockLeaveModalVisible}
        title="차단하고 나가기"
        message="방장을 차단하고 채팅방을 나가시겠습니까?"
        type="confirm"
        onConfirm={confirmBlockAndLeave}
        onCancel={() => setBlockLeaveModalVisible(false)}
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

  ghostBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, padding: 15 },
  ghostText: { color: 'black', fontWeight: 'bold', fontSize: 16 },

  postLinkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333'
  },
  postLinkImage: { width: 40, height: 40, borderRadius: 6, marginRight: 10 },
  postLinkInfo: { flex: 1, justifyContent: 'center' },
  postLinkTitle: { color: 'white', fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  postLinkPrice: { color: theme.primary, fontSize: 13, fontWeight: '600' },
  postLinkArrow: { flexDirection: 'row', alignItems: 'center' },

  menuOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 999 },
  menuContainer: { position: "absolute", right: 10, backgroundColor: "#222", borderRadius: 8, padding: 5, elevation: 5, borderWidth: 1, borderColor: "#333", minWidth: 150 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: "#333" },
  menuText: { fontSize: 14, fontWeight: "bold", marginLeft: 10 },

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
