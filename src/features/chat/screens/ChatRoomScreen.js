// FILE: src/features/chat/screens/ChatRoomScreen.js

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image,
  Platform, ActivityIndicator, Keyboard, Animated, Alert, Vibration, Dimensions // ✅ Dimensions 추가
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { theme } from "../../../theme";
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead, leaveRoom, leaveRoomAsOwner } from "../services/chatService";
import { db, storage } from "../../../firebaseConfig";
import { doc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ROUTES } from "../../../app/navigation/routes";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";
import ImageDetailModal from "../../../components/ImageDetailModal";
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
  const headerHeight = useHeaderHeight();

  const [messages, setMessages] = useState([]);
  const [senderMap, setSenderMap] = useState({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [myJoinedAt, setMyJoinedAt] = useState(null);
  const isLoadingMoreRef = useRef(false);

const [messageLimit, setMessageLimit] = useState(50);

// ✅ [수정] 더 불러오기 핸들러 (스크롤이 끝에 닿으면 실행)
const handleLoadMore = () => {
  // ✅ 중복 트리거 방지
  if (isLoadingMoreRef.current) return;

  // 로딩 중이 아니고, 메시지가 어느 정도 있을 때만 실행
  if (!loading && messages.length >= messageLimit) {
    isLoadingMoreRef.current = true; // ✅ 로드 시작 잠금
    setMessageLimit((prev) => prev + 50); // 50개씩 더 불러옴
  }
};

  // 최근 채팅 버튼 상태
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  // ✅ [복구] 게시글 정보 상태 (무료나눔 포함)
  const [linkedPost, setLinkedPost] = useState(null);

  // ✅ [추가] 공지, 답장, 숨김 메시지, 메뉴 상태
  const [roomNotice, setRoomNotice] = useState(null);
  const [isNoticeHidden, setIsNoticeHidden] = useState(false);
  const lastNoticeIdRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, align: 'left' });
  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [pendingNoticeMsg, setPendingNoticeMsg] = useState(null);

  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportSuccessModalVisible, setReportSuccessModalVisible] = useState(false);
  const [alreadyReportedModalVisible, setAlreadyReportedModalVisible] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [galleryVisible, setGalleryVisible] = useState(false);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState("");

  const [badWordModalVisible, setBadWordModalVisible] = useState(false);

  const [leaving, setLeaving] = useState(false);

  const [leaveErrorModalVisible, setLeaveErrorModalVisible] = useState(false);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState("");
  const [cannotDeleteModalVisible, setCannotDeleteModalVisible] = useState(false);

  const [imageErrorModalVisible, setImageErrorModalVisible] = useState(false);
  const [imageErrorMessage, setImageErrorMessage] = useState("");

  const [blockLeaveModalVisible, setBlockLeaveModalVisible] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const keyboardHeightRef = useRef(0);
  const flatListRef = useRef(null);

  // ✅ [추가] 헤더(확성기/점3개) 실제 위치 기반으로 메뉴를 “딱 붙여” 띄우기 위한 ref/pos
  const headerActionsRef = useRef(null);
  const [headerMenuPos, setHeaderMenuPos] = useState({ top: 0, right: 10 });

  // ✅ [추가] 답장 원문 클릭 시 원본 메시지로 이동(없으면 더 불러온 뒤 이동)
  const pendingScrollToIdRef = useRef(null);

  const scrollToMessageById = (targetId) => {
    if (!targetId) return;

    const idx = filteredMessages.findIndex((m) => m.id === targetId);

    if (idx >= 0) {
      flatListRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
      return;
    }

    // 아직 로딩 안 된 경우: 더 불러오고, 로딩되면 이동 시도
    pendingScrollToIdRef.current = targetId;
    setMessageLimit((prev) => prev + 50);
  };

  useEffect(() => {
    const targetId = pendingScrollToIdRef.current;
    if (!targetId) return;

    const idx = filteredMessages.findIndex((m) => m.id === targetId);
    if (idx < 0) return;

    pendingScrollToIdRef.current = null;

    setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: idx,
        animated: true,
        viewPosition: 0.5,
      });
    }, 50);
  }, [filteredMessages]);

  const isOwner = !!user?.uid && !!roomOwnerId && user.uid === roomOwnerId;

  const blockedList = Array.isArray(blockedUsers) ? blockedUsers : [];
  
  // ✅ [수정] Inverted 모드 + 필터링 (차단/숨김)
  const filteredMessages = useMemo(() => {
    const list = messages.filter((msg) => {
      const isBlocked = msg.senderId !== "system" && blockedList.includes(msg.senderId);
      const isHidden = hiddenMessageIds.includes(msg.id);
      return !isBlocked && !isHidden;
    });
    return [...list].reverse();
  }, [messages, blockedList, hiddenMessageIds]);

  // ✅ [추가] 숨김 메시지 로드 (AsyncStorage)
  useEffect(() => {
    const loadHidden = async () => {
      try {
        const json = await AsyncStorage.getItem(`hidden_msgs_${roomId}`);
        if (json) setHiddenMessageIds(JSON.parse(json));
      } catch (e) {}
    };
    loadHidden();
  }, [roomId]);

  // ✅ [수정] 게시글 정보 불러오기 (무료나눔 ID 처리 강화)
  useEffect(() => {
    if (!roomId) return;

    const fetchLinkedPost = async () => {
      try {
        let targetPostId = null;

        // 1. 먼저 채팅방 정보(chatRooms)를 조회해서 '진짜 postId'를 찾습니다.
        const roomRef = doc(db, "chatRooms", roomId);
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
          const roomData = roomSnap.data();
          // 채팅방 데이터 안에 postId 필드가 있다면 그걸 사용 (가장 정확함)
          if (roomData.postId) {
            targetPostId = roomData.postId;
          }
        }

        // 2. 만약 DB에 postId가 없다면, 기존 방식대로 문자열에서 유추 (백업)
        if (!targetPostId) {
           targetPostId = roomId.replace("post_", "").replace("free_", "");
        }

        if (!targetPostId) return;

        // 3. 확보한 postId로 게시글 정보를 가져옵니다.
        const postRef = doc(db, "posts", targetPostId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
          setLinkedPost({ id: postSnap.id, ...postSnap.data() });
        }
      } catch (e) {
        console.log("게시글 정보 로드 실패:", e);
      }
    };

    fetchLinkedPost();
  }, [roomId]);

  useEffect(() => {
    navigation.setOptions({
      title: isGhost ? `👻 ${roomName} (감시)` : (roomName || "채팅방"),
      headerRight: () => (
        <View
          ref={headerActionsRef}
          collapsable={false}
          style={{ flexDirection: 'row', alignItems: 'center', marginRight: 5 }}
        >
          {/* ✅ 공지가 있는데 숨겨진 경우 -> 노란 확성기 아이콘 표시 */}
          {roomNotice && isNoticeHidden && (
            <TouchableOpacity 
              onPress={() => setIsNoticeHidden(false)} 
              style={{ padding: 5, marginRight: 5 }}
            >
              <MaterialCommunityIcons name="bullhorn-variant-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
          )}
          
          {/* ✅ [수정] 메뉴 버튼 클릭 시 headerRight 실제 좌표를 측정해서 “딱 붙여” 메뉴 띄움 */}
          <TouchableOpacity
            onPress={() => {
              if (isHeaderMenuOpen) {
                setIsHeaderMenuOpen(false);
                return;
              }

              requestAnimationFrame(() => {
                if (!headerActionsRef.current) {
                  setIsHeaderMenuOpen(true);
                  return;
                }

                headerActionsRef.current.measureInWindow((x, y, w, h) => {
                  const { width: screenW } = Dimensions.get("window");

                  const right = Math.max(10, screenW - (x + w));

                  // ✅ measureInWindow는 “전체 윈도우 기준”
                  // ✅ 메뉴는 “스크린 컨텐츠 기준(헤더 아래가 0)”이므로 headerHeight만큼 보정
                  const top = Math.max(0, (y + h) - headerHeight) + 2;

                  setHeaderMenuPos({ top, right });
                  setIsHeaderMenuOpen(true);
                });
              });
            }}
            style={{ padding: 5 }}
          >
            <MaterialIcons name="more-vert" size={26} color="white" />
          </TouchableOpacity>
        </View>
      ),
    });
    // ✅ 의존성 배열에 roomNotice, isNoticeHidden 추가 필수!
  }, [navigation, roomName, isGhost, roomNotice, isNoticeHidden]);

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

  // ✅ [수정] 방 정보 및 공지 실시간 구독 (공지 기능 추가)
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, "chatRooms", roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      
      setTotalParticipants(data.participants?.length || 0);
      setRoomOwnerId(data.ownerId || null);
      setIsClosed(!!data.isClosed);
      
      // ✅ 공지 업데이트
      const nextNotice = data.notice || null;

      setRoomNotice(nextNotice);

      if (!nextNotice) {
        lastNoticeIdRef.current = null;
        setIsNoticeHidden(false);
      } else {
        const nextId = nextNotice?.id ?? null;

        if (nextId && nextId !== lastNoticeIdRef.current) {
          lastNoticeIdRef.current = nextId;
          setIsNoticeHidden(false);
        }
      }

      // 내 입장 시간(joinedAt) 찾기
      if (data.participants && Array.isArray(data.participants)) {
        const me = data.participants.find(p => (p.uid === user?.uid) || (p === user?.uid));
        
        if (me && me.joinedAt) {
          const date = me.joinedAt.toDate ? me.joinedAt.toDate() : new Date(me.joinedAt);
          setMyJoinedAt(date);
        } else {
          setMyJoinedAt(new Date(0)); 
        }
      } else {
        setMyJoinedAt(new Date(0)); 
      }
    });

    return () => unsubRoom();
  }, [roomId, user]);

  // 2. 키보드 리스너
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const nextH = e.endCoordinates.height - (Platform.OS === "ios" ? insets.bottom : 0);
        keyboardHeightRef.current = nextH;

        Animated.timing(keyboardHeight, {
          duration: Platform.OS === "ios" ? 250 : 100,
          toValue: nextH,
          useNativeDriver: false,
        }).start();
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        keyboardHeightRef.current = 0;

        Animated.timing(keyboardHeight, {
          duration: Platform.OS === "ios" ? 250 : 100,
          toValue: 0,
          useNativeDriver: false,
        }).start();
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, keyboardHeight]);

  // 3. 메시지 구독 및 필터링
  useEffect(() => {
    if (!roomId || !myJoinedAt) return;

    // ✅ [수정] messageLimit 인자 전달
    const unsubscribe = subscribeMessages(roomId, (newMessages) => {
      const validMessages = newMessages.filter((msg) => {
        if (msg.senderId === "system") {
          const msgDate = msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt);
          return msgDate >= myJoinedAt;
        }

        const msgDate = msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt);
        return msgDate >= myJoinedAt;
      });

      setMessages(validMessages);
      setLoading(false);
      isLoadingMoreRef.current = false;
    }, messageLimit); // ✅ limit 전달

    return () => unsubscribe();
  }, [roomId, myJoinedAt, messageLimit]);

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

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const normalSenderIds = messages.map((m) => m?.senderId).filter((id) => id && id !== "system");
    const systemActorIds = messages.filter((m) => m?.senderId === "system").map((m) => m?.actorId || m?.userId || m?.uid || m?.senderUid || m?.fromUserId || m?.targetUserId || null).filter((id) => id && id !== "system");
    const senderIds = Array.from(new Set([...normalSenderIds, ...systemActorIds]));
    const missing = senderIds.filter((id) => !senderMap?.[id]);
    
    if (missing.length === 0) return;

    (async () => {
      const next = { ...(senderMap || {}) };
      for (const uid of missing) {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const data = snap.data() || {};
            next[uid] = {
              nickname: String(data.displayName || "").trim() || String(data.email || "").split("@")[0] || "사용자",
              photoURL: data.photoURL || data.photoUrl || data.profileImage || data.profileImageUrl || data.profileUrl || data.avatar || data.avatarUrl || data.imageUrl || null,
            };
          } else {
            next[uid] = { nickname: "탈퇴한 사용자", photoURL: null };
          }
        } catch (e) {
          next[uid] = { nickname: "사용자", photoURL: null };
        }
      }
      setSenderMap(next);
    })();
  }, [messages]);

  // ✅ [수정] 메시지 전송 (답장 포함)
  const handleSend = async () => {
    if (isGhost) return;
    if (!roomId) return;
    if (isClosed) return;
    if (!text.trim()) return;

    if (hasProfanity(text)) {
      setBadWordModalVisible(true);
      return;
    }

    const msgData = {
      text: text.trim(),
      // ✅ id / messageId 둘 다 저장 (서비스/DB 정규화 차이 대비)
      replyTo: replyTo ? {
        id: replyTo.id,
        messageId: replyTo.id,
        text: replyTo.text,
        senderName: senderMap[replyTo.senderId]?.nickname || "사용자"
      } : null
    };

    setText("");
    setReplyTo(null); // 답장 모드 해제

    try {
      // ✅ 답장도 sendMessage로 통일 (replyTo 저장/정규화/lastMessage/updatedAt 일관성 보장)
      await sendMessage(roomId, msgData.text, null, msgData.replyTo);
    } catch (e) {
      console.error("전송 실패:", e);
      setText(msgData.text);
    }
  };

  const handleGallerySelect = async (selectedUris) => {
    if (isGhost || isClosed) return;
    if (!selectedUris || selectedUris.length === 0) return;

    setUploading(true);

    try {
      for (const uri of selectedUris) {
        if (!uri) continue;

        const manipResult = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 600 } }],
          { compress: 0.4, format: ImageManipulator.SaveFormat.WEBP }
        );

        const response = await fetch(manipResult.uri);
        const blob = await response.blob();
        const filename = `chat_images/${roomId}/${Date.now()}_${user.uid}_${Math.random().toString(36).substring(7)}.webp`;
        const storageRef = ref(storage, filename);

        await uploadBytes(storageRef, blob);
        const downloadUrl = await getDownloadURL(storageRef);

        await sendMessage(roomId, "", downloadUrl);
      }
    } catch (e) {
      console.error("Image upload/send error:", e);
      const msg = `${e?.code || "unknown"}\n${e?.message || ""}`.trim();
      setImageErrorMessage(msg || "이미지 전송 중 문제가 발생했습니다.");
      setImageErrorModalVisible(true);
    } finally {
      setUploading(false);
      setGalleryVisible(false);
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
      try { await blockUser(roomOwnerId); } catch (e) { }
    }

    try {
      if (isOwner) await leaveRoomAsOwner(roomId);
      else await leaveRoom(roomId);
    } catch (e) { }

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

    setBlockLeaveModalVisible(true);
  };

  const handleGoToPost = () => {
    if (!linkedPost) return;
    const isFree = linkedPost.category === "무료나눔" || linkedPost.isFree === true;
    navigation.navigate(isFree ? ROUTES.FREE_DETAIL : ROUTES.DETAIL, {
      post: linkedPost
    });
  };

  // ✅ [새 기능] 공지 등록 로직
  const executeNoticeUpdate = async (msg) => {
    try {
      await updateDoc(doc(db, "chatRooms", roomId), {
        notice: {
          id: msg.id,
          text: msg.text,
          senderName: senderMap[msg.senderId]?.nickname || "사용자",
          createdAt: new Date().toISOString()
        }
      });
    } catch (e) { 
      // 실패 시 에러 모달 띄우기 (기존 imageErrorMessage 등 재활용하거나 새로 생성 가능)
      // 여기서는 콘솔로 대체하거나 기존 에러 모달 사용
      console.log("공지 등록 실패", e);
    }
  };

  // ✅ [수정] 공지 등록 버튼 클릭 핸들러
  const handleSetNotice = (msg) => {
    setMenuVisible(false);
    
    if (roomNotice) {
      // 이미 공지가 있으면 -> 커스텀 모달 띄우기
      setPendingNoticeMsg(msg);
      setNoticeModalVisible(true);
    } else {
      // 공지가 없으면 -> 바로 등록
      executeNoticeUpdate(msg);
    }
  };

  // ✅ [새 기능] 삭제 로직 (내 글 vs 남의 글)
    const handleDeleteMsg = async (msg) => {
    setMenuVisible(false);

    // 1. 남의 글인 경우 -> 삭제 불가
    if (msg.senderId !== user.uid) {
      setCannotDeleteModalVisible(true);
      return;
    }

    // 2. 내 글인 경우 -> isDeleted만 true로 찍기 (UI는 isDeleted로 "삭제된 메시지입니다." 표시)
    try {
      const msgRef = doc(db, "chatRooms", roomId, "messages", msg.id);

      await updateDoc(msgRef, {
        isDeleted: true,
      });
    } catch (e) {
      console.error("삭제 에러:", e);
      Alert.alert("삭제 실패", "오류가 발생했습니다.\n" + (e.message || ""));
    }
  };


  const renderItem = ({ item }) => {
    const isSystemLeave = item.senderId === "system";
    if (isSystemLeave) {
      // 시스템 메시지의 주체 uid / 닉네임 후보들
      const actorId = item?.actorId || item?.userId || item?.uid || item?.senderUid || item?.fromUserId || item?.targetUserId || null;
      const actorName = item?.actorNickname || item?.senderNickname || item?.senderName || item?.actorDisplayName || item?.displayName || (actorId ? (senderMap?.[actorId]?.displayName || senderMap?.[actorId]?.nickname) : null) || "사용자";
      let displayText = item?.text || "";
      if (displayText && !displayText.includes(actorName)) {
        if (/(입장)/.test(displayText)) displayText = `${actorName}님이 입장했습니다.`;
        else if (/(퇴장|나갔)/.test(displayText)) displayText = `${actorName}님이 퇴장했습니다.`;
      }
      if (!displayText) displayText = `${actorName}님`;
      return (
        <View style={styles.systemMsgContainer}>
          <Text style={styles.systemMsgText}>{displayText}</Text>
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
      <TouchableOpacity 
        activeOpacity={0.9} 
        onLongPress={(e) => {
          if (item.isDeleted) return; 
          Vibration.vibrate(20);

          const { pageY } = e.nativeEvent;
          const { height: screenHeight } = Dimensions.get('window');

          const menuHeight = 170;
          const kb = keyboardHeightRef.current || 0;
          const usableBottom = screenHeight - kb - (insets?.bottom || 0);
          // ✅ 키보드/화면 하단에 메뉴가 걸리면 위로, 아니면 아래로
          const shouldOpenUp = pageY + menuHeight + 16 > usableBottom;
          let topPos = shouldOpenUp ? pageY - menuHeight : pageY + 10;

          // ✅ 화면/세이프영역 내로 clamp
          const minTop = (insets?.top || 0) + 10;
          const maxTop = usableBottom - menuHeight - 10;
          topPos = Math.max(minTop, Math.min(topPos, maxTop));

          setMenuPosition({ 
            top: topPos, 
            align: isMy ? 'right' : 'left' 
          });

          setSelectedMsg(item);
          setMenuVisible(true);
        }}
        style={[styles.msgContainer, isMy ? styles.myMsgContainer : styles.otherMsgContainer]}
      >
        {!isMy && (
          <View style={styles.senderRow}>
            {/* ... (프로필 이미지 부분은 그대로 유지) ... */}
            <Image source={{ uri: senderMap?.[item.senderId]?.photoURL }} style={styles.senderAvatar} />
            <Text style={styles.senderName}>{senderMap?.[item.senderId]?.nickname || "사용자"}</Text>
          </View>
        )}
        <View style={{ flexDirection: isMy ? "row-reverse" : "row", alignItems: "flex-end" }}>
          <View style={[
            styles.bubble,
            isMy ? styles.myBubble : styles.otherBubble,
            item.image && { backgroundColor: "transparent", padding: 0 },
            item.isDeleted && styles.deletedBubble,
            // ✅ replyTo가 있으면 말풍선 폭이 “내 답장 텍스트 길이”에 종속되지 않게 최소 폭 보장
            item.replyTo && !item.isDeleted && { minWidth: 200 }
          ]}>
            {/* ✅ [수정] 답장 인용 표시 (글씨색: 내 글이면 검정, 남 글이면 흰색) */}
            {item.replyTo && !item.isDeleted && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const targetId =
                    item.replyTo?.id ||
                    item.replyTo?.messageId ||
                    item.replyTo?.msgId ||
                    item.replyTo?.targetId ||
                    null;

                  scrollToMessageById(targetId);
                }}
              >
                <View style={[
                  styles.replyInBubble,
                  { backgroundColor: isMy ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)' }
                ]}>
                  <View style={[styles.replyBarLine, { backgroundColor: isMy ? 'black' : theme.primary }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.replyInName, { color: isMy ? '#333' : '#DDD' }]}>
                      {item.replyTo.senderName}에게 답장
                    </Text>

                    {/* ✅ 한 줄 제한 제거 + “한 글자씩” 깨짐 방지 */}
                    <Text style={[styles.replyInText, { color: isMy ? 'black' : 'white' }]}>
                      {item.replyTo.text}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* 메시지 내용 */}
            {item.isDeleted ? (
              <Text style={[styles.msgText, isMy ? styles.myMsgText : styles.otherMsgText, styles.deletedText]}>
                삭제된 메시지입니다.
              </Text>
            ) : item.image ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => { setSelectedImageUri(item.image); setIsImageViewerVisible(true); }}>
                <Image source={{ uri: item.image }} style={{ width: 200, height: 200, borderRadius: 8 }} resizeMode="cover" />
              </TouchableOpacity>
            ) : (
              <Text style={[styles.msgText, isMy ? styles.myMsgText : styles.otherMsgText]}>{item.text}</Text>
            )}
          </View>
          {/* 시간 표시 */}
          <View style={{ alignItems: isMy ? "flex-end" : "flex-start", marginHorizontal: 5 }}>
            <Text style={styles.timeText}>{timeString}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>

      {/* ✅ [복구] 게시글 정보 바 (무료나눔/N빵 모두 표시) */}
      {linkedPost && (
        <TouchableOpacity style={styles.postLinkBar} onPress={handleGoToPost} activeOpacity={0.8}>
          {linkedPost.images && linkedPost.images.length > 0 ? (
            <Image
              source={{ uri: typeof linkedPost.images[0] === 'string' ? linkedPost.images[0] : linkedPost.images[0].uri }}
              style={styles.postLinkImage}
            />
          ) : (
            <View style={[styles.postLinkImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
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
            <Text style={{ color: '#AAA', fontSize: 12, marginRight: 4 }}>게시글로 이동</Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#AAA" />
          </View>
        </TouchableOpacity>
      )}

      {/* ✅ [추가] 공지 바 */}
      {roomNotice && !isNoticeHidden && (
        <View style={styles.noticeBar}>
          <MaterialCommunityIcons
            name="bullhorn-variant-outline"
            size={18}
            color={theme.primary}
            style={{ marginRight: 8 }}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeText} numberOfLines={1}>
              {roomNotice.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setIsNoticeHidden(true)}>
            <Ionicons name="chevron-up" size={18} color="#888" />
          </TouchableOpacity>
        </View>
      )}

      {isHeaderMenuOpen && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setIsHeaderMenuOpen(false)}
        >
          <View style={[styles.menuContainer, { top: headerMenuPos.top, right: headerMenuPos.right }]}>
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
            data={filteredMessages} // Inverted 적용
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"

            onScrollToIndexFailed={(info) => {
              // ✅ scrollToIndex 실패(가상화) 대비: 근사 offset으로 이동 후 재시도
              const wait = 50;

              setTimeout(() => {
                flatListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });

                setTimeout(() => {
                  flatListRef.current?.scrollToIndex({
                    index: info.index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                }, wait);
              }, wait);
            }}

            // ✅ Inverted 모드 활성화 (최신글이 맨 아래)
            inverted={true}

            // ✅ [추가] 무한 스크롤 트리거
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3} // 스크롤이 30% 남았을 때 미리 로딩

            scrollEventThrottle={16}
            onScroll={(e) => {
              const { contentOffset } = e.nativeEvent;
              // Inverted에서는 y > 200 이면 스크롤을 올린 것
              const scrollThreshold = 200;
              const isScrollUp = contentOffset.y > scrollThreshold;
              setShowScrollToBottom(isScrollUp);
            }}
            contentContainerStyle={{
              padding: 16,
              // Inverted에서는 상하 여백이 반대로 작동하므로 조정
              paddingTop: isGhost ? 10 : 10,
              paddingBottom: 10,
            }}
          />
        )}

        {isGhost ? (
          <View style={[styles.ghostBanner, { paddingBottom: insets.bottom + 20 }]}>
            <MaterialIcons name="visibility" size={20} color="black" style={{ marginRight: 8 }} />
            <Text style={styles.ghostText}>👻 관리자 고스트 모드로 감시 중입니다</Text>
          </View>
        ) : (
          <View style={{ paddingBottom: insets.bottom + 10 }}>
            {showScrollToBottom && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  // Inverted에서 offset: 0 은 맨 아래(최신)
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                }}
                style={styles.scrollToBottomBtn}
              >
                <MaterialIcons name="keyboard-double-arrow-down" size={24} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* ✅ [추가] 답장 취소 바 */}
            {replyTo && (
              <View style={styles.replyPreviewBar}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.replyPreviewName}>{senderMap[replyTo.senderId]?.nickname || "사용자"}님에게 답장 중</Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>{replyTo.text}</Text>
                </View>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <Ionicons name="close-circle" size={20} color="#888" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputContainer}>
              <TouchableOpacity
                onPress={() => setGalleryVisible(true)}
                disabled={uploading || isClosed}
                style={{ marginRight: 10 }}
              >
                <MaterialIcons name="add-photo-alternate" size={28} color="grey" />
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="메시지를 입력하세요"
                placeholderTextColor="grey"
                editable={!isClosed}
                // ✅ 엔터키 줄바꿈 적용
                multiline={true} 
                textAlignVertical="center"
              />
              <TouchableOpacity
                onPress={handleSend}
                style={styles.sendBtn}
                disabled={!text.trim() || isClosed}
              >
                <MaterialIcons name="send" size={24} color={text.trim() ? "black" : "#555"} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {menuVisible && (
        <TouchableOpacity 
          style={styles.menuOverlay} 
          activeOpacity={1} 
          onPress={() => setMenuVisible(false)}
        >
          <View style={[
            styles.bubbleMenuContainer, 
            { 
              top: menuPosition.top, 
              // 내 글이면 오른쪽 여백, 남의 글이면 왼쪽 여백
              [menuPosition.align === 'right' ? 'right' : 'left']: 25
            }
          ]}>
            {/* 1. 답장 */}
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => { setReplyTo(selectedMsg); setMenuVisible(false); }}>
              <Ionicons name="arrow-undo-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>답장</Text>
            </TouchableOpacity>
            
            <View style={styles.bubbleMenuDivider} />
            
            {/* 2. 공지 */}
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => handleSetNotice(selectedMsg)}>
              <MaterialCommunityIcons name="bullhorn-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>공지 등록</Text>
            </TouchableOpacity>
            
            <View style={styles.bubbleMenuDivider} />

            {/* 3. 삭제 */}
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => handleDeleteMsg(selectedMsg)}>
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
              <Text style={[styles.bubbleMenuText, { color: theme.danger }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

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

      <CustomModal
        visible={uploading}
        title="이미지 업로드중 ⟳"
        message="이미지를 전송하고 있습니다..."
        loading={true}
      />

      <CustomImagePickerModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        onSelect={handleGallerySelect}
        currentCount={0}
      />

      <ImageDetailModal
        visible={isImageViewerVisible}
        images={[selectedImageUri]}
        index={0}
        onClose={() => setIsImageViewerVisible(false)}
      />

      <CustomModal
        visible={badWordModalVisible}
        title="경고"
        message={"부적절한 단어(욕설, 비방 등)가 포함되어 있습니다.\n바른 말을 사용해주세요."}
        onConfirm={() => setBadWordModalVisible(false)}
        confirmText="확인"
      />

      <CustomModal
        visible={leaveErrorModalVisible}
        title="나가기 실패"
        message={leaveErrorMessage}
        onConfirm={() => setLeaveErrorModalVisible(false)}
        confirmText="확인"
      />

      <CustomModal
        visible={imageErrorModalVisible}
        title="오류"
        message={imageErrorMessage}
        onConfirm={() => setImageErrorModalVisible(false)}
        confirmText="확인"
      />
      <CustomModal
        visible={cannotDeleteModalVisible}
        title="삭제 불가"
        message="다른 사람의 글은 삭제할 수 없습니다."
        // onCancel만 연결하면 배경 터치 시 닫힙니다 (CustomModal 구현에 따름)
        onCancel={() => setCannotDeleteModalVisible(false)}
        // confirmText를 null로 주어 버튼 자체를 렌더링 안 하게 유도
        confirmText={null}
        onConfirm={() => setCannotDeleteModalVisible(false)}
      />

      <CustomModal
        visible={blockLeaveModalVisible}
        title="차단하고 나가기"
        message="방장을 차단하고 채팅방을 나가시겠습니까?"
        type="confirm"
        onConfirm={confirmBlockAndLeave}
        onCancel={() => setBlockLeaveModalVisible(false)}
      />
      <CustomModal
        visible={noticeModalVisible}
        title="공지 변경"
        message="기존 공지를 내리고 새로 등록하시겠습니까?"
        type="confirm"
        confirmText="등록"
        onConfirm={() => {
          if (pendingNoticeMsg) {
            executeNoticeUpdate(pendingNoticeMsg);
          }
          setNoticeModalVisible(false);
          setPendingNoticeMsg(null);
        }}
        onCancel={() => {
          setNoticeModalVisible(false);
          setPendingNoticeMsg(null);
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
  senderRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, marginLeft: 4 },
  senderAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 8, backgroundColor: "#444" },
  senderAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, marginRight: 8, backgroundColor: "#444" },
  
  scrollToBottomBtn: {
    // ✅ 공중에 띄움, 입력창 위에 배치
    position: "absolute", 
    bottom: 125, 
    alignSelf: "center", 
    zIndex: 999, 

    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    
    // ✅ 배경 70% 불투명 (그림자 분리 방지)
    backgroundColor: "rgba(30, 30, 30, 0.7)",
    
    // ✅ 그림자 효과
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  scrollToBottomText: {
    color: "#CCC",
    fontSize: 12,
    fontWeight: "bold",
    marginLeft: 6,
  },
  inputContainer: { flexDirection: "row", padding: 10, backgroundColor: theme.cardBg, alignItems: "center" },
  input: { flex: 1, backgroundColor: "#111", color: "white", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, borderColor: "#333", maxHeight: 100 },
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
  menuOverlay: { 
  position: "absolute", 
  top: 0, 
  bottom: 0, 
  left: 0, 
  right: 0, 
  zIndex: 9000, 
  backgroundColor: "rgba(0,0,0,0.2)"
},

  // ✅ 헤더 메뉴 컨테이너 (확성기/점3개 아래 우측에 고정)
  menuContainer: {
    position: "absolute",
    right: 10,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 170,

    elevation: 12,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

// 2) 말풍선 메뉴: 오버레이보다 확실히 위
bubbleMenuContainer: {
    position: "absolute",
    backgroundColor: "#2A2A2A", // 다크 그레이 배경
    borderRadius: 12,           // 모서리 둥글게
    paddingVertical: 4,         // 상하 여백
    minWidth: 160,              // 메뉴 너비 확보

    // 그림자 및 레이어 순위
    elevation: 10,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

  // ✅ 메뉴 아이템 (아이콘 + 텍스트 가로 정렬)
  bubbleMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,   // 터치 영역 확보 (상하)
    paddingHorizontal: 16, // 좌우 여백
  },

  // ✅ 메뉴 텍스트
  bubbleMenuText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12, // 아이콘과 텍스트 사이 간격
  },

  // ✅ 구분선 (가로선)
  bubbleMenuDivider: {
    height: 1,
    width: '100%',
    backgroundColor: '#3E3E3E', // 배경보다 살짝 밝은 선
  },
  menuContainer: {
    position: "absolute",
    right: 10,
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 170,

    elevation: 12,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

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
  },

  // ✅ [새 스타일] 공지, 답장, 메뉴, 삭제 스타일 추가
  noticeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  noticeText: { color: '#EEE', fontSize: 13 },
  
  // 답장 미리보기 바 (입력창 위)
  replyPreviewBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', padding: 10, borderTopWidth: 1, borderTopColor: '#333' },
  replyPreviewName: { color: theme.primary, fontSize: 12, fontWeight: 'bold' },
  replyPreviewText: { color: '#AAA', fontSize: 12 },
  
  // ✅ [수정] 말풍선 내부 인용구 스타일 (구조 변경됨)
  replyInBubble: { 
    flexDirection: 'row',
    padding: 8, 
    borderRadius: 8, 
    marginBottom: 6,
  },
  // 인용구 왼쪽 컬러바
  replyBarLine: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
    // 색상은 JS에서 동적 처리
  },
  replyInName: { 
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
    flexShrink: 1,     
  },
  replyInText: { 
    fontSize: 12,
    opacity: 0.9,
    flexShrink: 1,        // ✅ 줄바꿈 자연스럽게
    flexWrap: "wrap",
    lineHeight: 18,
  },
  
  // ✅ 삭제된 메시지 스타일
  deletedBubble: { backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  deletedText: { color: '#666', fontStyle: 'italic' },
});