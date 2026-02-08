// FILE: src/features/chat/screens/ChatRoomScreen.js

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View, TextInput, TouchableOpacity, FlatList, StyleSheet, Image,
  Platform, ActivityIndicator, Keyboard, Animated, Alert, Vibration, Dimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { theme } from "../../../theme";
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead, leaveRoom, leaveRoomAsOwner, loadCachedMessages, saveCachedMessages } from "../services/chatService";
import { db, storage } from "../../../firebaseConfig";
import { doc, getDoc, onSnapshot, collection, addDoc, query, where, getDocs, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Text } from "../../../components/MyText";
// ✅ [추가] 라이브러리 임포트
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Clipboard from 'expo-clipboard';
import { captureRef } from 'react-native-view-shot';

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
  const [myJoinedAt, setMyJoinedAt] = useState(new Date());
  const isLoadingMoreRef = useRef(false);

  const didResetUnreadCountsRef = useRef(false);

  const [messageLimit, setMessageLimit] = useState(50);

  // ✅ [수정] 더 불러오기 핸들러
  const handleLoadMore = () => {
    if (isLoadingMoreRef.current) return;
    if (!loading && messages.length >= messageLimit) {
      isLoadingMoreRef.current = true;
      setMessageLimit((prev) => prev + 50);
    }
  };

  useEffect(() => {
    didResetUnreadCountsRef.current = false;
  }, [roomId, user?.uid]);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  
  const [totalParticipants, setTotalParticipants] = useState(0);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [isClosed, setIsClosed] = useState(false);

  const [linkedPost, setLinkedPost] = useState(null);

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
  const [captureModalVisible, setCaptureModalVisible] = useState(false);
  const [captureModalTitle, setCaptureModalTitle] = useState("");
  const [captureModalMessage, setCaptureModalMessage] = useState("");

  const [blockLeaveModalVisible, setBlockLeaveModalVisible] = useState(false);

  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const keyboardHeightRef = useRef(0);
  const flatListRef = useRef(null);

  const headerActionsRef = useRef(null);
  const [headerMenuPos, setHeaderMenuPos] = useState({ top: 0, right: 10 });

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
  
  const filteredMessages = useMemo(() => {
    const list = messages.filter((msg) => {
      const isBlocked = msg.senderId !== "system" && blockedList.includes(msg.senderId);
      const isHidden = hiddenMessageIds.includes(msg.id);
      return !isBlocked && !isHidden;
    });
    return [...list].reverse();
  }, [messages, blockedList, hiddenMessageIds]);

  useEffect(() => {
    const loadHidden = async () => {
      try {
        const json = await AsyncStorage.getItem(`hidden_msgs_${roomId}`);
        if (json) setHiddenMessageIds(JSON.parse(json));
      } catch (e) {}
    };
    loadHidden();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const fetchLinkedPost = async () => {
      try {
        let targetPostId = null;
        const roomRef = doc(db, "chatRooms", roomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const roomData = roomSnap.data();
          if (roomData.postId) {
            targetPostId = roomData.postId;
          }
        }
        if (!targetPostId) {
           if (roomId.startsWith("free_")) {
             targetPostId = roomId.split("_")[1]; 
           } else {
             targetPostId = roomId.replace("post_", "");
           }
        }
        if (!targetPostId) return;
        let postRef = doc(db, "posts", targetPostId);
        let postSnap = await getDoc(postRef);
        if (!postSnap.exists()) {
          postRef = doc(db, "free_posts", targetPostId);
          postSnap = await getDoc(postRef);
        }
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
          {roomNotice && isNoticeHidden && (
            <TouchableOpacity 
              onPress={() => setIsNoticeHidden(false)} 
              style={{ padding: 5, marginRight: 5 }}
            >
              <MaterialCommunityIcons name="bullhorn-variant-outline" size={24} color="#ffffff" />
            </TouchableOpacity>
          )}
          
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

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, "chatRooms", roomId);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      
      const __participants = Array.isArray(data.participants) ? data.participants : [];
      const __participantIds = __participants
        .map((p) => (p && typeof p === "object" ? p.uid : p))
        .filter(Boolean);

      const __uniqueIds = new Set(__participantIds);
      if (data.ownerId) __uniqueIds.add(data.ownerId);

      setTotalParticipants(__uniqueIds.size);
      setRoomOwnerId(data.ownerId || null);
      setIsClosed(!!data.isClosed);
      
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

      const myJoinedKey = `joinedAt_${user?.uid}`;
      const myJoinedTs = data[myJoinedKey]; 

      let isParticipant = false;
      if (data.participants && Array.isArray(data.participants)) {
        isParticipant = data.participants.some(p => (p.uid === user?.uid) || (p === user?.uid));
      }

      if (isParticipant && myJoinedTs) {
        const date = myJoinedTs.toDate ? myJoinedTs.toDate() : new Date(myJoinedTs);
        setMyJoinedAt(date);
      } else if (isParticipant) {
        const roomCreatedAt =
          typeof data?.createdAt?.toDate === "function"
            ? data.createdAt.toDate()
            : (data?.createdAt ? new Date(data.createdAt) : null);
        setMyJoinedAt(
          roomCreatedAt && !Number.isNaN(roomCreatedAt.getTime())
            ? roomCreatedAt
            : new Date(0)
        );
      } else {
        setMyJoinedAt(new Date()); 
      }
    });
    return () => unsubRoom();
  }, [roomId, user]);

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

  // ✅ [수정] 초기 로딩 및 구독 로직 (캐싱 적용)
  useEffect(() => {
    if (!roomId) return;

    let unsubscribe = () => {};

    const initChat = async () => {
      setLoading(true);

      // 1. 💾 로컬 캐시 먼저 로드 (비용 절약)
      const cached = await loadCachedMessages(roomId);
      let lastMsgDate = null;

      if (cached && cached.length > 0) {
        setMessages(cached);
        // 캐시된 가장 최신 메시지의 시간 찾기 (보통 0번 인덱스)
        if (cached[0]?.createdAt instanceof Date) {
          lastMsgDate = cached[0].createdAt;
        }
      }

      // 2. 📡 파이어베이스 구독 (캐시된 마지막 시간 이후 데이터만 요청)
      unsubscribe = subscribeMessages(roomId, (newItems) => {
        if (!newItems || newItems.length === 0) {
          setLoading(false);
          return;
        }

        setMessages((prev) => {
          // 기존 메시지(prev)와 새 메시지(newItems) 합치기
          const combined = [...prev, ...newItems]; 
          
          // ID 기준 중복 제거
          const uniqueMap = new Map();
          combined.forEach((m) => uniqueMap.set(m.id, m));
          
          // 시간순 정렬 (최신이 위로 오게 내림차순 DESC)
          const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
             const tA = a.createdAt ? a.createdAt.getTime() : 0;
             const tB = b.createdAt ? b.createdAt.getTime() : 0;
             return tB - tA; 
          });

          // 💾 합쳐진 최신 상태를 로컬에 저장 (500개 제한)
          saveCachedMessages(roomId, sorted); 

          return sorted;
        });
        
        setLoading(false);
        isLoadingMoreRef.current = false;
      }, lastMsgDate); // 🔥 마지막 시간을 넘겨주어 쿼리 비용 최적화
    };

    initChat();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]); // messageLimit 의존성 제거

  useEffect(() => {
    if (!roomId) return;
    if (!user?.uid) return;
    if (isGhost) return;
    if (loading) return;
    if (didResetUnreadCountsRef.current) return;
    didResetUnreadCountsRef.current = true;
    (async () => {
      try {
        await updateDoc(doc(db, "chatRooms", roomId), {
          [`unreadCounts.${user.uid}`]: 0,
        });
      } catch (e) {}
    })();
  }, [roomId, user?.uid, isGhost, loading]);

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

  // ✅ [수정] 메시지 전송 (답장 시 닉네임 처리 강화)
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
      replyTo: replyTo ? {
        id: replyTo.id,
        messageId: replyTo.id,
        text: replyTo.text,
        // ✅ [핵심] 여기서 senderName을 senderMap의 최신 닉네임으로 저장
        senderName: senderMap[replyTo.senderId]?.nickname || senderMap[replyTo.senderId]?.displayName || "알 수 없음"
      } : null
    };

    setText("");
    setReplyTo(null);

    try {
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
      navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });
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
      navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });
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
    navigation.reset({ index: 0, routes: [{ name: ROUTES.HOME }] });
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
      console.log("공지 등록 실패", e);
    }
  };

  const handleSetNotice = (msg) => {
    setMenuVisible(false);
    if (roomNotice) {
      setPendingNoticeMsg(msg);
      setNoticeModalVisible(true);
    } else {
      executeNoticeUpdate(msg);
    }
  };

  // ✅ [추가] 메시지 복사 핸들러
  const handleCopyMsg = async (msg) => {
    setMenuVisible(false);
    if (msg.text) {
      await Clipboard.setStringAsync(msg.text);
    }
  };

  // ✅ [수정] 메시지 캡쳐 핸들러 (커스텀 모달 적용)
  const handleCaptureMsg = async (msg) => {
    setMenuVisible(false);
    try {
      // flatListRef는 이미 useRef로 선언되어 있습니다.
      const uri = await captureRef(flatListRef, {
        format: "jpg",
        quality: 0.8,
        result: "tmpfile" 
      });
      
      console.log("캡쳐된 이미지 경로:", uri);
      
      // Alert.alert 대신 상태 업데이트
      setCaptureModalTitle("캡쳐 완료");
      setCaptureModalMessage("이미지가 임시 저장되었습니다.\n" + uri);
      setCaptureModalVisible(true);
      
    } catch (e) {
      console.error("캡쳐 실패", e);
      // Alert.alert 대신 상태 업데이트
      setCaptureModalTitle("오류");
      setCaptureModalMessage("캡쳐에 실패했습니다.");
      setCaptureModalVisible(true);
    }
  };

  const handleDeleteMsg = async (msg) => {
    setMenuVisible(false);
    if (msg.senderId !== user.uid) {
      setCannotDeleteModalVisible(true);
      return;
    }
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
      const actorId = item?.actorId || item?.userId || item?.uid || null;

      const rawDisplayName = typeof item?.displayName === "string" ? item.displayName.trim() : "";
      const rawSenderName = typeof item?.senderName === "string" ? item.senderName.trim() : "";
      const rawMapName = actorId
        ? String(senderMap?.[actorId]?.nickname || senderMap?.[actorId]?.displayName || "").trim()
        : "";

      const actorName =
        (rawDisplayName && rawDisplayName !== "알 수 없음" ? rawDisplayName : "") ||
        (rawSenderName && rawSenderName !== "알 수 없음" ? rawSenderName : "") ||
        (rawMapName && rawMapName !== "알 수 없음" ? rawMapName : "") ||
        "사용자";

      let displayText = item?.text || "";
      
      if (displayText.includes("님이 퇴장") || displayText.includes("님이 나갔") || displayText.includes("떠났습니다")) {
        displayText = `${actorName}님이 퇴장하셨습니다.`;
      } else if (displayText.includes("님이 입장")) {
        displayText = `${actorName}님이 입장했습니다.`;
      } else if (!displayText.includes(actorName)) {
        displayText = `${actorName}: ${displayText}`;
      }
      
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
    const readByArr = Array.isArray(item.readBy) ? item.readBy : [];
    const readBySet = new Set(readByArr.filter(Boolean));
    if (item?.senderId && item.senderId !== "system") {
      readBySet.add(item.senderId);
    }
    const readCount = Math.max(0, Math.min(readBySet.size, safeTotal));
    const unreadCount = Math.max(0, safeTotal - readCount);

    // ✅ [추가] 스와이프 액션 (왼쪽으로 밀면 보이는 아이콘)
    const renderRightActions = (progress, dragX) => {
      return (
        <View style={styles.swipeReplyIconContainer}>
          <Ionicons name="arrow-undo" size={24} color={theme.primary} />
        </View>
      );
    };

    // ✅ [필수] 이 변수 선언이 꼭 있어야 에러가 안 납니다!
    let rowRef = null;

    return (
      // ✅ [추가] Swipeable 감싸기 시작
      <Swipeable
        ref={(ref) => (rowRef = ref)}
        renderRightActions={renderRightActions}
        onSwipeableOpen={() => {
          setReplyTo(item); // 답장 모드 설정
          rowRef?.close();  // 즉시 닫기 (카카오톡 스타일)
        }}
        friction={2}
      >
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
            const shouldOpenUp = pageY + menuHeight + 16 > usableBottom;
            let topPos = shouldOpenUp ? pageY - menuHeight : pageY + 10;
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
              item.replyTo && !item.isDeleted && { minWidth: 200 }
            ]}>
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
                      <Text style={[styles.replyInText, { color: isMy ? 'black' : 'white' }]}>
                        {item.replyTo.text}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

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
            <View style={{ alignItems: isMy ? "flex-end" : "flex-start", marginHorizontal: 5 }}>
              {isMy && !item.isDeleted && unreadCount > 0 && (
                <Text style={styles.unreadCountText}>{unreadCount}</Text>
              )}
              <Text style={styles.timeText}>{timeString}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable> // ✅ 닫는 태그 확인 완료
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
            data={filteredMessages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            onScrollToIndexFailed={(info) => {
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
            inverted={true}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const { contentOffset } = e.nativeEvent;
              const scrollThreshold = 200;
              const isScrollUp = contentOffset.y > scrollThreshold;
              setShowScrollToBottom(isScrollUp);
            }}
            contentContainerStyle={{
              padding: 16,
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
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                }}
                style={styles.scrollToBottomBtn}
              >
                <MaterialIcons name="keyboard-double-arrow-down" size={24} color="#FFF" />
              </TouchableOpacity>
            )}

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
                multiline={true} 
                textAlignVertical="center"
                allowFontScaling={false}
                maxFontSizeMultiplier={1}
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
              [menuPosition.align === 'right' ? 'right' : 'left']: 25
            }
          ]}>
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => { setReplyTo(selectedMsg); setMenuVisible(false); }}>
              <Ionicons name="arrow-undo-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>답장</Text>
            </TouchableOpacity>
            
            <View style={styles.bubbleMenuDivider} />

            {/* ✅ [추가] 복사하기 기능 */}
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => handleCopyMsg(selectedMsg)}>
              <Ionicons name="copy-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>복사</Text>
            </TouchableOpacity>

            <View style={styles.bubbleMenuDivider} />

            {/* ✅ [추가] 캡쳐하기 기능 */}
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => handleCaptureMsg(selectedMsg)}>
              <Ionicons name="scan-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>캡쳐</Text>
            </TouchableOpacity>
            
            <View style={styles.bubbleMenuDivider} />
            
            <TouchableOpacity style={styles.bubbleMenuItem} onPress={() => handleSetNotice(selectedMsg)}>
              <MaterialCommunityIcons name="bullhorn-outline" size={20} color="white" />
              <Text style={styles.bubbleMenuText}>공지 등록</Text>
            </TouchableOpacity>
            
            <View style={styles.bubbleMenuDivider} />

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
        onCancel={() => setCannotDeleteModalVisible(false)}
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

      {/* ✅ [추가] 캡쳐 결과 표시용 커스텀 모달 */}
      <CustomModal
        visible={captureModalVisible}
        title={captureModalTitle}
        message={captureModalMessage}
        onConfirm={() => setCaptureModalVisible(false)}
        confirmText="확인"
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
    position: "absolute", 
    bottom: 125, 
    alignSelf: "center", 
    zIndex: 999, 
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(30, 30, 30, 0.7)",
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

  bubbleMenuContainer: {
    position: "absolute",
    backgroundColor: "#2A2A2A", 
    borderRadius: 12, 
    paddingVertical: 4, 
    minWidth: 160,
    elevation: 10,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

  bubbleMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12, 
    paddingHorizontal: 16, 
  },

  bubbleMenuText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12, 
  },

  bubbleMenuDivider: {
    height: 1,
    width: '100%',
    backgroundColor: '#3E3E3E', 
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

  noticeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  noticeText: { color: '#EEE', fontSize: 13 },
  
  replyPreviewBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', padding: 10, borderTopWidth: 1, borderTopColor: '#333' },
  replyPreviewName: { color: theme.primary, fontSize: 12, fontWeight: 'bold' },
  replyPreviewText: { color: '#AAA', fontSize: 12 },
  
  replyInBubble: { 
    flexDirection: 'row',
    padding: 8, 
    borderRadius: 8, 
    marginBottom: 6,
  },
  replyBarLine: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
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
    flexShrink: 1,        
    flexWrap: "wrap",
    lineHeight: 18,
  },
  
  deletedBubble: { backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  deletedText: { color: '#666', fontStyle: 'italic' },

  // ✅ [추가] 스와이프 답장 아이콘 컨테이너
  swipeReplyIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    marginVertical: 6,
  },
});