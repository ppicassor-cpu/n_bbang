// FILE: src/features/profile/screens/ProfileScreen.js

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  TextInput,
  Image,
  Keyboard,
  Modal,
  Animated,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { checkNotifications, requestNotifications } from 'react-native-permissions';
import { Text } from "../../../components/MyText";
// ✅ [수정] 탈퇴 처리를 위해 writeBatch, getDocs 추가됨
import { 
  collection, query, where, onSnapshot, doc, getDoc, updateDoc, 
  arrayRemove, deleteDoc, getDocs, writeBatch, limit, orderBy // ✅ limit, orderBy 추가
} from "firebase/firestore";
import { deleteUser } from "firebase/auth"; 
import Purchases from "react-native-purchases";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../../../firebaseConfig"; 
import { theme } from '../../../theme';
import { ROUTES } from '../../../app/navigation/routes';
import { useAppContext } from '../../../app/providers/AppContext';
import CustomModal from '../../../components/CustomModal';
import CustomImagePickerModal from '../../../components/CustomImagePickerModal';
import { hasBadWord } from "../../../utils/badWordFilter";
import * as Haptics from 'expo-haptics';
// ✅ [추가] 이미지 압축/캐시
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Text 
          style={{ 
            fontSize: 23,       
            fontWeight: "bold", 
            color: "white"      
          }} 
          allowFontScaling={false} // ✅ 핵심: 시스템 폰트 크기 무시
        >
          내 정보 
        </Text>
      ),
      headerStyle: {
        backgroundColor: "black", 
        shadowColor: "transparent", 
      },
      headerTitleAlign: "center", 
    });
  }, [navigation]);

  // ✅ Context 데이터
  const {
    user,
    logout,
    currentLocation = "위치 미지정",
    isVerified = false,
    isPremium = false,
    dailyPostCount = 0,
    posts = [],
    isAdmin, // ✅ 관리자 여부
    blockedUsers = [], // ✅ 차단된 사용자 목록 (ID 배열)
    // ✅ [추가] 결제 및 복원 관련 함수 가져오기
    purchaseBoostConsumable,
    purchaseHotplaceConsumable,
    addBoostTicket,
    incrementHotplaceCount,
    restorePurchases
  } = useAppContext();
  
  // ✅ [추가] 로딩 상태 (결제 중복 방지)
  const [loading, setLoading] = useState(false);

  // ✅ [추가] 단건 아이템(부스트/핫스토어) 빠른 결제 핸들러
  const handleQuickPurchase = async (type) => {
    if (loading) return;
    setLoading(true);
    try {
      if (type === "boost") {
        const res = await purchaseBoostConsumable();
        if (res?.status === "PURCHASED") {
          await addBoostTicket(res?.purchaseInfo);
          // ✅ 수정됨
          openModal("구매 완료", "부스트업 티켓이 충전되었습니다.", "alert", () => setModalVisible(false));
        }
      } else if (type === "hotstore") {
        const res = await purchaseHotplaceConsumable();
        if (res?.status === "PURCHASED") {
          await incrementHotplaceCount({ usageType: "paid_extra", purchaseInfo: res?.purchaseInfo });
          // ✅ 수정됨
          openModal("구매 완료", "핫스토어 등록권이 충전되었습니다.", "alert", () => setModalVisible(false));
        }
      }
    } catch (e) {
      if (!e?.userCancelled) {
        // ✅ 수정됨
        openModal("결제 실패", e.message || "결제를 완료하지 못했습니다.", "alert", () => setModalVisible(false));
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ [추가] 구매 복원 핸들러
   const handleRestore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      console.log("구매 복원 시작...");
      // 1. AppContext에 함수가 없으면 직접 Purchases 라이브러리 호출
      let customerInfo;
      if (restorePurchases) {
        customerInfo = await restorePurchases();
      } else {
        customerInfo = await Purchases.restorePurchases();
      }
      console.log("구매 복원 결과:", customerInfo);
      
      openModal(
        "복원 완료",
        "구매 내역이 복원되었습니다.\n(프리미엄 상태가 갱신됩니다.)",
        "alert",
        () => setModalVisible(false)
      );
    } catch (e) {
      console.error("복원 에러:", e);
      openModal("오류", "구매 복원 중 문제가 발생했습니다.\n" + (e.message || ""), "alert", () => setModalVisible(false));
    } finally {
      setLoading(false);
    }
  };
  const [unreadPersonalCount, setUnreadPersonalCount] = useState(0);
  const [hasUnreadNotice, setHasUnreadNotice] = useState(false);
  
  // ✅ [추가] DB에서 내 정보 직접 불러오기 (닉네임 표시 확실하게)
  const [userProfile, setUserProfile] = useState(null);

  // ✅ [추가] 차단 사용자 목록 로컬 캐시 (언블락 즉시 반영용)
  const [blockedUsersLocal, setBlockedUsersLocal] = useState([]);

  useEffect(() => {
    setBlockedUsersLocal(Array.isArray(blockedUsers) ? blockedUsers : []);
  }, [blockedUsers]);

  // ✅ 차단 관리 모달 상태 및 데이터
  const [blockedListModalVisible, setBlockedListModalVisible] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState([]); // {id, nickname} 배열
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // ✅ 차단 해제 성공 알림 모달 상태
  const [unblockSuccessVisible, setUnblockSuccessVisible] = useState(false);

  // ✅ [추가] 프로필 사진/닉네임 수정 모달
  const [profileEditModalVisible, setProfileEditModalVisible] = useState(false);
  const [nicknameEditModalVisible, setNicknameEditModalVisible] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  // ✅ [추가] 갤러리 모달 상태
  const [galleryVisible, setGalleryVisible] = useState(false);

  // ✅ [신규] 정책 메뉴 모달 상태
  const [policyModalVisible, setPolicyModalVisible] = useState(false);

  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleteAccountModalVisible(false); // 모달 닫기

    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const uid = currentUser.uid;

    try {
      // 1. 내가 쓴 게시글(posts) 삭제
      const postsQ = query(collection(db, "posts"), where("ownerId", "==", uid));
      const postsSnap = await getDocs(postsQ);
      const batch1 = writeBatch(db);
      postsSnap.forEach((doc) => {
        batch1.delete(doc.ref);
      });
      await batch1.commit();

      // 2. 내가 등록한 가게(stores) 삭제
      const storesQ = query(collection(db, "stores"), where("ownerId", "==", uid));
      const storesSnap = await getDocs(storesQ);
      const batch2 = writeBatch(db);
      storesSnap.forEach((doc) => {
        batch2.delete(doc.ref);
      });
      await batch2.commit();

      // 3. 내 알림(notifications) 하위 컬렉션 삭제
      const notiQ = query(collection(db, "users", uid, "notifications"));
      const notiSnap = await getDocs(notiQ);
      const batch3 = writeBatch(db);
      notiSnap.forEach((doc) => {
        batch3.delete(doc.ref);
      });
      await batch3.commit();

      // 4. 참여 중인 채팅방에서 나가기 처리 (유령 회원 방지)
      const chatQ = query(collection(db, "chatRooms"), where("participants", "array-contains", uid));
      const chatSnap = await getDocs(chatQ);
      const batch4 = writeBatch(db);
      chatSnap.forEach((chatDoc) => {
        batch4.update(chatDoc.ref, {
          participants: arrayRemove(uid)
        });
      });
      await batch4.commit();

      // 5. 내 유저 정보 문서 삭제
      await deleteDoc(doc(db, "users", uid));

      // 6. Auth 계정 삭제 (최종 탈퇴)
      await deleteUser(currentUser);

    } catch (e) {
      console.error("탈퇴 실패:", e);
      if (e.code === 'auth/requires-recent-login') {
        // ✅ [수정] 4번째 파라미터에 '닫기 함수' 추가
        openModal(
          "인증 필요", 
          "보안을 위해 로그아웃 후 다시 로그인한 뒤 시도해주세요.", 
          "alert", 
          () => setModalVisible(false) // 👈 확인 누르면 닫힘!
        );
      } else {
        // ✅ 여기도 마찬가지로 추가
        openModal(
          "오류", 
          "탈퇴 처리 중 문제가 발생했습니다.\n관리자에게 문의해주세요.", 
          "alert",
          () => setModalVisible(false) // 👈 확인 누르면 닫힘!
        );
      }
    }
  };

  // ✅ [수정] 닉네임 모달만 키보드 올라올 때 "모달 자체"가 위로 이동하도록 (CustomModal 중앙 고정 영향 제거)
  const nicknameModalTranslateY = useRef(new Animated.Value(0)).current;

  // ✅ [추가] 프로필 이미지 압축/캐시 설정
  const PROFILE_IMAGE_CACHE_KEY = "profile_image_cache_v1";
  const PROFILE_IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일
  const PROFILE_IMAGE_TARGET_WIDTH = 400;
  const PROFILE_IMAGE_QUALITY = 0.5;

  // ✅ [추가] 내 동네 인증 상태(AsyncStorage) 로컬 반영용
  const HOME_DONG_NAME = "HOME_DONG_NAME";
  const HOME_DONG_VERIFIED = "HOME_DONG_VERIFIED";

  const [homeDongNameLocal, setHomeDongNameLocal] = useState(null);
  const [homeVerifiedLocal, setHomeVerifiedLocal] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;

      const loadHomeDong = async () => {
        try {
          const name = await AsyncStorage.getItem(HOME_DONG_NAME);
          const verifiedRaw = await AsyncStorage.getItem(HOME_DONG_VERIFIED);

          if (!alive) return;

          setHomeDongNameLocal(name || null);
          setHomeVerifiedLocal(verifiedRaw === "true" || verifiedRaw === "1");
        } catch {
          if (!alive) return;
          setHomeDongNameLocal(null);
          setHomeVerifiedLocal(false);
        }
      };

      loadHomeDong();

      return () => {
        alive = false;
      };
    }, [])
  );


  useEffect(() => {
    const onShow = (e) => {
      const h = e?.endCoordinates?.height || 0;
      // 키보드 높이의 절반 정도만 위로 올리되, 너무 과하게 가지 않도록 캡
      const moveUp = -Math.min(220, Math.floor(h * 0.55));
      Animated.timing(nicknameModalTranslateY, {
        toValue: moveUp,
        duration: 180,
        useNativeDriver: true,
      }).start();
    };

    const onHide = () => {
      Animated.timing(nicknameModalTranslateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    };

    const subShow = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", onShow);
    const subHide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", onHide);

    return () => {
      subShow?.remove?.();
      subHide?.remove?.();
    };
  }, [nicknameModalTranslateY]);

    // 1. 내 DB 정보 실시간 구독 (닉네임 '사용자'로 뜨는 문제 해결)
  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null);
      return;
    }
    const userDocRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);

        // ✅ 닉네임 수정 모달 열 때 초기값으로 쓰기 위해 동기화
        const nextName = data?.displayName || user?.displayName || user?.email?.split('@')[0] || "";
        setNicknameInput(nextName);
      }
    });
    return () => unsubUser();
  }, [user?.uid]);

  // 2. 알림 개수 구독
 useEffect(() => {
    if (!user?.uid) {
      setUnreadPersonalCount(0);
      setHasUnreadNotice(false);
      return;
    }

    // (1) 개인 알림 개수 구독
    const qPersonal = query(
      collection(db, "users", user.uid, "notifications"),
      where("isRead", "==", false)
    );
    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      setUnreadPersonalCount(snap.size || 0);
    });

    // (2) 최신 공지 1개 구독
    const qSystem = query(
      collection(db, "system_notices"),
      where("isShow", "==", true),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const unsubSystem = onSnapshot(qSystem, async (snap) => {
  try {
    if (!snap.empty) {
      const latestId = snap.docs[0].id;

      const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");

      let readIds = [];
      if (readJson) {
        try {
          const parsed = JSON.parse(readJson);
          readIds = Array.isArray(parsed) ? parsed : [];
        } catch {
          readIds = [];
        }
      }

      setHasUnreadNotice(!readIds.includes(latestId));
    } else {
      setHasUnreadNotice(false);
    }
  } catch {
    // ✅ onSnapshot 콜백 내부에서 어떤 예외가 나도 화면 크래쉬 방지
    setHasUnreadNotice(false);
  }
});

    return () => {
      unsubPersonal();
      unsubSystem();
    };
  }, [user?.uid]);

  // ✅ [추가] 화면 포커스 시 공지 읽음 여부 재확인 (알림센터 다녀온 후 갱신용)
  useFocusEffect(
    React.useCallback(() => {
      const checkNoticeReadStatus = async () => {
        try {
          const qSystem = query(
            collection(db, "system_notices"),
            where("isShow", "==", true),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          const snap = await getDocs(qSystem);
          if (!snap.empty) {
            const latestId = snap.docs[0].id;
            const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
            const readIds = readJson ? JSON.parse(readJson) : [];
            setHasUnreadNotice(!readIds.includes(latestId));
          }
        } catch (e) {}
      };
      checkNoticeReadStatus();
    }, [])
  );

  // ✅ [추가] 뱃지에 표시할 총 알림 개수 계산
  const totalUnreadCount = unreadPersonalCount + (hasUnreadNotice ? 1 : 0);

  // ✅ 내가 쓴 글 개수 계산
  const myPosts = Array.isArray(posts) ? posts.filter(p => p.ownerId === user?.uid) : [];
  const myPostsCount = myPosts.length;

  // ✅ 모달 상태 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert", // 'alert' | 'confirm'
    onConfirm: () => {}
  });

  // 공용 모달 열기 함수
  const openModal = (title, message, type = "alert", onConfirm = () => {}) => {
    setModalConfig({ title, message, type, onConfirm });
    setModalVisible(true);
  };

  // ✅ [수정] "확인" 누르면 갤러리 모달 열기
  const handlePickProfileImage = () => {
    setProfileEditModalVisible(false);
    setGalleryVisible(true);
  };

  // ✅ [추가] 프로필 이미지 압축 + 30일 캐시
  const getCompressedProfileImageUri = async (sourceUri) => {
    if (!sourceUri) return null;

    // 1) 캐시 조회
    try {
      const raw = await AsyncStorage.getItem(PROFILE_IMAGE_CACHE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const cached = map?.[sourceUri];

      if (cached?.uri && cached?.ts && (Date.now() - cached.ts) < PROFILE_IMAGE_CACHE_TTL_MS) {
        try {
          const info = await FileSystem.getInfoAsync(cached.uri);
          if (info?.exists) return cached.uri;
        } catch {}
      }
    } catch {}

    // 2) 캐시 없으면 압축
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: PROFILE_IMAGE_TARGET_WIDTH } }],
      { compress: PROFILE_IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );

    const outUri = result?.uri || sourceUri;

    // 3) 캐시 저장(30일)
    try {
      const raw = await AsyncStorage.getItem(PROFILE_IMAGE_CACHE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[sourceUri] = { uri: outUri, ts: Date.now() };
      await AsyncStorage.setItem(PROFILE_IMAGE_CACHE_KEY, JSON.stringify(map));
    } catch {}

    return outUri;
  };

  // ✅ [추가] 갤러리에서 사진 선택 완료 시 호출
  const handleGallerySelect = async (selectedUris) => {
  // 모달 닫기
  setGalleryVisible(false);

  if (!selectedUris || selectedUris.length === 0) return;

  try {
    // 첫 번째 사진만 사용
    const uri = selectedUris[0];

    // ✅ [추가] 압축(400px, quality 0.5) + 30일 캐시
    const compressedUri = await getCompressedProfileImageUri(uri);

    // ✅ [수정] file:// 를 DB에 저장하지 말고, Storage에 업로드 후 https URL 저장
    const response = await fetch(compressedUri);
    const blob = await response.blob();

    const filename = `users/${user.uid}/profile_${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);

    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);

    await updateDoc(doc(db, "users", user.uid), { photoURL: downloadUrl });

  } catch (e) {
    console.error(e);
    openModal("오류", "프로필 사진을 변경하지 못했습니다.", "alert", () => setModalVisible(false));
  }
};

  // ✅ 표시용 닉네임/프로필 사진
  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || "닉네임을 설정해주세요";
  const photoURL = userProfile?.photoURL || null;

  // ✅ [수정] 닉네임 저장 → 검증 추가 → 즉시 DB 저장
  const handleSaveNickname = async () => {
    try {
      const next = (nicknameInput || "").trim();

      // 1. 빈 값 체크
      if (!next) {
        openModal("안내", "닉네임을 입력해주세요.", "alert", () => setModalVisible(false));
        return;
      }

      // 2. 현재 사용 중인 닉네임 체크
      if (next === displayName) {
        openModal("안내", "사용 중인 닉네임입니다.", "alert", () => setModalVisible(false));
        return;
      }

      // ✅ [추가] 3. 비속어 및 금칙어 체크
      if (hasBadWord(next)) {
        openModal("경고", "부적절한 단어(욕설, 관리자 사칭 등)가 포함되어 있습니다.\n바른 말을 사용해주세요.", "alert", () => setModalVisible(false));
        return;
      }

      // 4. 특수문자 체크 (한글, 영문, 숫자만 허용)
      const specialCharRegex = /[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/;
      if (specialCharRegex.test(next)) {
        openModal("안내", "특수문자는 사용할 수 없습니다.", "alert", () => setModalVisible(false));
        return;
      }

      await updateDoc(doc(db, "users", user.uid), { displayName: next });

      // ✅ 키보드/팝업 정리
      Keyboard.dismiss();
      setNicknameEditModalVisible(false);
    } catch (e) {
      console.error(e);
      openModal("오류", "닉네임을 변경하지 못했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ 차단 사용자 관리 버튼 핸들러 (정보 가져오기)
  const handleManageBlockedUsers = async () => {
    if (!blockedUsersLocal || blockedUsersLocal.length === 0) {
      // ✅ [수정] 확인 버튼 누르면 팝업이 닫히도록 수정
      openModal("안내", "차단한 사용자가 없습니다.", "alert", () => setModalVisible(false));
      return;
    }

    setLoadingBlocked(true);
    setBlockedListModalVisible(true);

    try {
      const profiles = [];
      // 차단된 ID 순회하며 닉네임 조회
      for (const targetId of blockedUsersLocal) {
        const docRef = doc(db, "users", targetId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          profiles.push({
            id: targetId,
            nickname: data.displayName || data.email?.split('@')[0] || "닉네임을 설정해주세요"
          });
        } else {
          profiles.push({ id: targetId, nickname: "알 수 없는 사용자" });
        }
      }
      setBlockedProfiles(profiles);
    } catch (e) {
      console.error(e);
      // ✅ 오류 팝업도 닫히도록 수정
      openModal("오류", "차단 목록을 불러오지 못했습니다.", "alert", () => setModalVisible(false));
      setBlockedListModalVisible(false);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // ✅ 차단 해제 핸들러 -> 성공 시 확인 모달 띄우기
  const handleUnblock = async (targetId) => {
    try {
      // 1. Firestore 업데이트 (내 정보의 blockedUsers 배열에서 제거)
      const myUserRef = doc(db, "users", user.uid);
      await updateDoc(myUserRef, {
        blockedUsers: arrayRemove(targetId)
      });

      // ✅ [추가] 로컬 차단 목록도 즉시 제거 (재진입/재조회 시 바로 반영)
      setBlockedUsersLocal((prev) => prev.filter((id) => id !== targetId));

      // 2. 로컬 상태 업데이트 (모달 리스트에서 즉시 제거)
      setBlockedProfiles((prev) => prev.filter((p) => p.id !== targetId));

      // 3. 성공 알림 모달 표시
      setUnblockSuccessVisible(true);

    } catch (e) {
      console.error(e);
      openModal("오류", "차단 해제에 실패했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ 구독 관리(안드로이드)
  const handleManageSubscription = async () => {
    if (Platform.OS !== "android") {
      openModal("안내", "안드로이드에서만 구독 관리 화면으로 이동할 수 있습니다.", "alert", () => {
        setModalVisible(false);
      });
      return;
    }

    try {
      const info = await Purchases.getCustomerInfo();
      const url = info?.managementURL;

      if (url) {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return;
        }
      }

      const pkg =
        Constants?.expoConfig?.android?.package ||
        Constants?.manifest?.android?.package ||
        Constants?.expoConfig?.android?.packageName ||
        Constants?.manifest?.android?.packageName;

      const fallbackUrl = pkg
        ? `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(pkg)}`
        : "https://play.google.com/store/account/subscriptions";

      await Linking.openURL(fallbackUrl);
    } catch (e) {
      openModal("오류", "구독 관리 화면을 여는 중 문제가 발생했습니다.", "alert", () => {
        setModalVisible(false);
      });
    }
  };

  const handleLogoutPress = () => {
    openModal(
      "로그아웃",
      "정말 로그아웃 하시겠습니까?",
      "confirm",
      async () => {
        setModalVisible(false);
        await logout();
      }
    );
  };

  const handleMyPosts = () => {
    navigation.navigate(ROUTES.MY_LISTINGS);
  };

  const [isNotiEnabled, setIsNotiEnabled] = useState(false);
  // ✅ [추가] 묵직한 손맛을 위한 연타 방지 락
  const [switchLock, setSwitchLock] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      checkNotifications()
        .then(({ status }) => setIsNotiEnabled(status === 'granted'))
        .catch(() => setIsNotiEnabled(false));
    }, [])
  );

  const toggleNotificationSwitch = async () => {
    // 1. 연타 방지 (촐랑거림 원천 차단)
    if (switchLock) return;

    // 2. 락 걸기 (0.5초 동안 조작 금지 -> 묵직함)
    setSwitchLock(true);
    setTimeout(() => setSwitchLock(false), 500);

    // 3. 햅틱 진동 (손맛 추가) - 에러 방지 처리 포함
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch (e) {
      // 햅틱이 없는 기기여도 앱이 죽지 않게 조용히 넘어감
    }

    // 4. [핵심] 선조치: 일단 스위치 모양부터 즉시 바꿈 (기다리지 않음!)
    const nextState = !isNotiEnabled;
    setIsNotiEnabled(nextState);

    // 5. 후보고: 켜는 상황이라면, 진짜 권한이 있는지 뒤에서 체크
    if (nextState === true) {
      try {
        const { status } = await checkNotifications();

        // 이미 권한 있으면 OK (아무것도 안 해도 됨)
        if (status === 'granted') return;

        // 권한 없으면 요청
        if (status === 'denied') {
          const res = await requestNotifications(['alert', 'sound', 'badge']);
          if (res.status === 'granted') return; // 승인하면 그대로 유지
        }

        // 여기까지 왔다면 권한 획득 실패 -> 강제 원상복구 (Rollback)
        throw new Error("Permission denied");

      } catch (e) {
        // 권한이 없으므로 스위치를 다시 끔 (Rollback)
        setIsNotiEnabled(false);
        
        openModal(
          "알림 설정 필요",
          "알림을 받으려면 휴대폰 설정에서\n알림을 켜주셔야 합니다.",
          "confirm",
          () => {
            setModalVisible(false);
            Linking.openSettings();
          }
        );
      }
    }
  };
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // ✅ [추가] Profile 화면 표시용(컨텍스트 갱신 지연 대비)
  const effectiveIsVerified = Boolean(isVerified || homeVerifiedLocal);
  const effectiveLocation =
    (currentLocation && currentLocation !== "위치 미지정")
      ? currentLocation
      : (homeDongNameLocal || currentLocation);

  // ✅ [수정] 닉네임 수정 팝업이 키보드에 가리지 않도록(팝업 전체가 위로 올라가게)
  const nicknameKeyboardOffset = Platform.OS === "ios"
    ? (insets?.top || 0) + 160
    : 160;

  return (
    // ✅ [수정] 상단 SafeArea 여백 제거 + 배경 잘림 방지(상단만 배경 채움)
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* ✅ [수정] 내정보(헤더) 밑에 딱 붙게: 상단 filler 높이를 0으로 고정 */}
      <View style={[styles.topBgFill, { height: 0 }]} />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 1. 프로필 + 통계 통합 섹션 */}
        <View style={styles.profileHeader}>
          {/* 상단: 프사 + 이름 */}
          <View style={styles.userInfoRow}>
            {/* ✅ [추가] 프로필 사진 수정 진입 */}
            <TouchableOpacity
              style={styles.avatar}
              activeOpacity={0.8}
              onPress={() => setProfileEditModalVisible(true)}
            >
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={32} color="black" />
              )}

              {/* 👇 여기가 카메라 아이콘 뱃지 부분입니다 */}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={12} color="white" />
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* ✅ [추가] 닉네임 수정 진입 */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setNicknameInput(displayName === "닉네임을 설정해주세요" ? "" : displayName);
                    setNicknameEditModalVisible(true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center' }} // ✅ 가로 정렬 스타일 추가
                >
                  <Text style={styles.nickname} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {/* ✅ 네모난 연필 아이콘 박스 추가 */}
                  <View style={styles.editIconBox}>
                    <MaterialIcons name="edit" size={10} color="#CCC" />
                  </View>
                </TouchableOpacity>

                {isPremium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText}>PREMIUM</Text>
                  </View>
                )}

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                  onPress={() => navigation.navigate(ROUTES.NOTIFICATION)}
                  activeOpacity={0.8}
                  style={styles.notiBtn}
                >
                  <Ionicons name="notifications-outline" size={20} color="#CCC" />
                  {/* ✅ [수정] 계산된 전체 알림 수(totalUnreadCount)로 변경 */}
                  {totalUnreadCount > 0 && (
                    <View style={styles.notiBadge}>
                      <Text style={styles.notiBadgeText} numberOfLines={1}>
                        {totalUnreadCount > 99 ? "99+" : String(totalUnreadCount)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.locationText}>
                {effectiveIsVerified ? `${effectiveLocation} 인증됨` : "위치 미인증"}
              </Text>
            </View>
          </View>

          {/* 하단: 통계 */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>나의 N빵</Text>
              <Text style={styles.statValue}>{myPostsCount}개</Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>오늘 작성</Text>
              <Text style={[
                styles.statValue,
                (!isPremium && dailyPostCount >= 1) && { color: theme.danger }
              ]}>
                {dailyPostCount} / {isPremium ? "∞" : "1"}회
              </Text>
            </View>
          </View>
        </View>

        {/* 2. 프리미엄 배너 OR 아이템 충전 버튼 */}
        {!isPremium ? (
          <TouchableOpacity
            style={styles.premiumOutlineBanner}
            onPress={() => navigation.navigate(ROUTES.PREMIUM)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.outlineBannerTitle}>프리미엄 신청하기</Text>
              <Text style={styles.outlineBannerSub}>무제한으로 N빵하기|부스트업,핫스토어 충전하기</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.primary} />
          </TouchableOpacity>
        ) : (
          // ✅ [추가] 프리미엄일 때는 부스트/핫스토어 충전 버튼 표시
          <View style={styles.quickChargeContainer}>
            <TouchableOpacity 
              style={styles.quickChargeBtn} 
              onPress={() => handleQuickPurchase("boost")}
              disabled={loading}
            >
              <View style={styles.quickIconCircle}>
                 <Ionicons name="flash" size={18} color="#FFD700" />
              </View>
              <View>
                <Text style={styles.quickChargeTitle}>부스트업 1회</Text>
                <Text style={styles.quickChargeSub}>즉시 충전</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickChargeBtn} 
              onPress={() => handleQuickPurchase("hotstore")}
              disabled={loading}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: "rgba(255, 87, 87, 0.15)" }]}>
                 <Ionicons name="storefront" size={16} color="#FF5757" />
              </View>
              <View>
                <Text style={styles.quickChargeTitle}>핫스토어 1회</Text>
                <Text style={styles.quickChargeSub}>즉시 충전</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* 3. 메뉴 리스트 */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>활동</Text>

          <MenuLink
            IconComponent={Ionicons}
            icon="notifications-outline"
            label="알림 센터"
            onPress={() => navigation.navigate(ROUTES.NOTIFICATION)}
          />

          <MenuLink
            IconComponent={Ionicons}
            icon="chatbubble-outline"
            label="채팅 목록"
            onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}
          />
          <MenuLink
            IconComponent={Ionicons}
            icon="receipt-outline"
            label="내가 쓴 글 보기"
            onPress={handleMyPosts}
          />

          {isAdmin && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24, color: '#FF6B6B' }]}>관리자 전용</Text>
              <MenuLink
                IconComponent={Ionicons} // ✅ [수정] 아이콘 깨짐 방지를 위해 Ionicons 명시
                icon="shield-checkmark-outline"
                label="신고 내역 관리"
                color="#FF6B6B"
                onPress={() => navigation.navigate(ROUTES.ADMIN_REPORT)}
              />
            </>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>설정</Text>
          
          <View style={styles.menuItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="settings-outline" size={20} color="#CCC" style={{ marginRight: 12 }} />
              <Text style={{ color: "#CCC", fontSize: 15 }}>알림 설정</Text>
            </View>
            <Switch
              value={isNotiEnabled}
              onValueChange={toggleNotificationSwitch}
              trackColor={{ false: "#444", true: theme.primary }}
              thumbColor={isNotiEnabled ? "#FFF" : "#f4f3f4"}
            />
          </View>
          <MenuLink
            IconComponent={Ionicons}
            icon="person-remove-outline"
            label="차단 사용자 관리"
            onPress={handleManageBlockedUsers}
          />
          <MenuLink
            IconComponent={Ionicons}
            icon="card-outline"
            label="구독 관리"
            onPress={handleManageSubscription}
          />
          <MenuLink
            icon="headset"
            label="고객센터"
            onPress={() => navigation.navigate(ROUTES.CUSTOMER_CENTER)}
          />
          <MenuLink
            IconComponent={Ionicons}
            icon="log-out-outline"
            label="로그아웃"
            color="white"
            onPress={handleLogoutPress}
          />

          {/* ✅ [추가] 로그아웃 밑에 구매 복원 버튼 */}
          <MenuLink
            IconComponent={Ionicons}
            icon="refresh-circle-outline"
            label="구매 내역 복원"
            color="#AAA"
            onPress={handleRestore}
          />

        {/* 👇 [여기] 아래 코드를 추가하세요 (회원 탈퇴 버튼) */}
          {/* ================================================= */}
          <View style={{ marginTop: 20, marginBottom: 10 }}>
            <MenuLink
              IconComponent={Ionicons}
              icon="trash-outline"
              label="회원 탈퇴"
              color="#666" // 너무 튀지 않게 회색 처리
              onPress={() => setDeleteAccountModalVisible(true)}
            />
          </View>
          {/* ================================================= */}

        </View>

        {/* ✅ [신규] 서비스 이용약관 및 정책 버튼 */}
        <TouchableOpacity 
          style={styles.policyBtn} 
          onPress={() => setPolicyModalVisible(true)}
        >
          <Text style={styles.policyBtnText}>서비스 이용약관 및 정책</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>v{appVersion}</Text>

      </ScrollView>

      {/* ✅ 기존 공용 모달 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)}
      />

      {/* ✅ [수정] 프로필 사진 수정 모달 (상단 시스템과 겹치지 않게: CustomModal 내부에서 처리) */}
      <CustomModal
        visible={profileEditModalVisible}
        title="프로필 사진 수정"
        message="내 앨범에서 이미지를 선택하시겠습니까?"
        type="confirm"
        onConfirm={handlePickProfileImage}
        onCancel={() => setProfileEditModalVisible(false)}
      />

      {/* ✅ [추가] 커스텀 이미지 피커 모달 */}
      <CustomImagePickerModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        onSelect={handleGallerySelect}
        maxImages={1} // 프로필 사진은 1장만
        currentCount={0}
      />

      {/* ✅ [신규] 정책 메뉴 선택 모달 */}
      <CustomModal
        visible={policyModalVisible}
        title="서비스 이용약관 및 정책"
        message="확인하고 싶은 항목을 선택해주세요."
        onConfirm={() => {}} 
      >
        <View style={{ gap: 12, width: '100%' }}>
          <TouchableOpacity 
            style={styles.modalMenuBtn} 
            onPress={() => {
              setPolicyModalVisible(false);
              navigation.navigate(ROUTES.TERMS_OF_SERVICE);
            }}
          >
            <Text style={styles.modalMenuText}>서비스 이용약관</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.modalMenuBtn} 
            onPress={() => {
              setPolicyModalVisible(false);
              navigation.navigate(ROUTES.PRIVACY_POLICY);
            }}
          >
            <Text style={styles.modalMenuText}>개인정보 처리방침</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.modalMenuBtn} 
            onPress={() => {
              setPolicyModalVisible(false);
              navigation.navigate(ROUTES.OPERATION_POLICY);
            }}
          >
            <Text style={styles.modalMenuText}>운영정책</Text>
            <MaterialIcons name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ marginTop: 10, alignItems: "center", padding: 10 }}
            onPress={() => setPolicyModalVisible(false)}
          >
            <Text style={{ color: "#888", fontWeight: "bold" }}>닫기</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* ✅ [수정] 닉네임 수정 모달만: 키보드 올라올 때 "모달 자체"를 위로 이동 */}
      <Modal transparent={true} visible={nicknameEditModalVisible} animationType="fade">
        <View style={styles.nicknameOverlay}>
          <Animated.View style={[styles.nicknameModalContainer, { transform: [{ translateY: nicknameModalTranslateY }] }]}>
            <Text style={styles.nicknameModalTitle}>닉네임 수정</Text>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={nicknameKeyboardOffset}
              style={{ width: "100%" }}
            >
              <View style={{ width: '100%', marginTop: 8 }}>
                <TextInput
                  value={nicknameInput}
                  onChangeText={setNicknameInput}
                  placeholder="닉네임을 입력하세요"
                  placeholderTextColor="#666"
                  style={styles.nicknameInput}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveNickname}
                />

                <View style={styles.nicknameBtnRow}>
                  <TouchableOpacity
                    style={styles.nicknameBtnCancel}
                    activeOpacity={0.85}
                    onPress={() => {
                      Keyboard.dismiss();
                      setNicknameEditModalVisible(false);
                    }}
                  >
                    <Text style={styles.nicknameBtnCancelText}>취소</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.nicknameBtnConfirm}
                    activeOpacity={0.85}
                    onPress={handleSaveNickname}
                  >
                    <Text style={styles.nicknameBtnConfirmText}>확인</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>

      {/* ✅ 차단 관리 리스트 모달 */}
      <CustomModal
        visible={blockedListModalVisible}
        title="차단 사용자 관리"
        message={null}
        onConfirm={() => setBlockedListModalVisible(false)}
        confirmText="닫기"
        onCancel={() => setBlockedListModalVisible(false)}
      >
        <View style={{ width: '100%', maxHeight: 300, marginTop: 10 }}>
          {loadingBlocked ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : blockedProfiles.length === 0 ? (
            <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>차단된 사용자가 없습니다.</Text>
          ) : (
            <ScrollView style={{ width: '100%' }}>
              {blockedProfiles.map((item) => (
                <View key={item.id} style={styles.blockedItemRow}>
                  <Text style={styles.blockedUserText} numberOfLines={1}>
                    {item.nickname}
                  </Text>
                  <TouchableOpacity
                    style={styles.unblockBtn}
                    onPress={() => handleUnblock(item.id)}
                  >
                    <Text style={styles.unblockBtnText}>해제</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </CustomModal>

      {/* ✅ 차단 해제 성공 알림 모달 */}
      <CustomModal
        visible={unblockSuccessVisible}
        title="알림"
        message="차단이 해제되었습니다."
        onConfirm={() => {
          setUnblockSuccessVisible(false);
          // ✅ [수정] 확인 버튼을 누르면 관리 팝업도 함께 닫아버림 (요청 사항 반영)
          setBlockedListModalVisible(false);
        }}
        confirmText="확인"
      />
      {/* 👇 [여기] 아래 코드를 추가하세요 (탈퇴 경고 모달) */}
      {/* ================================================= */}
      <CustomModal
        visible={deleteAccountModalVisible}
        title="회원 탈퇴"
        // 줄바꿈(\n)을 사용하여 경고 내용을 명확히 전달
        message={"탈퇴 시 계정 및 모든 데이터가 삭제되며\n복구할 수 없습니다.\n\n남은 유료 기간에 대한 환불은 불가능합니다.\n정말 탈퇴하시겠습니까?"}
        type="confirm"
        onConfirm={handleDeleteAccount} // 확인 버튼 (기본 테마색, 빨간색 아님)
        onCancel={() => setDeleteAccountModalVisible(false)} // 취소 버튼
        confirmText="탈퇴하기" // 버튼 텍스트 변경
   />
   {/* ================================================= */}

   {/* ✅ [추가] 로딩 인디케이터 모달 (결제/복원 시 반응용) */}
   <Modal
    transparent={true}
    animationType="none"
    visible={loading}
    onRequestClose={() => {}}
   >
    <View style={styles.loadingOverlay}>
     <View style={styles.loadingBox}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={styles.loadingText}>처리 중입니다...</Text>
     </View>
    </View>
   </Modal>

  </SafeAreaView>
 );
}

// 메뉴 아이템 컴포넌트
function MenuLink({ IconComponent = MaterialIcons, icon, label, onPress, color = "#CCC" }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconComponent name={icon} size={20} color={color} style={{ marginRight: 12 }} />
        <Text style={{ color: color, fontSize: 15 }}>{label}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#555" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // ✅ [추가] 상단 배경 채움(상단 여백 제거 시 배경 잘림 방지)
  topBgFill: {
    width: "100%",
    backgroundColor: theme.background,
  },

  // ✅ [수정] 상단 여백 줄임
  scrollContent: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 10 },

  // 1. 프로필 섹션
  profileHeader: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },

  // ✅ [수정] 카메라 아이콘 뱃지
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000',
  },

  nickname: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 6,
  },
  premiumBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  premiumText: {
    color: 'black',
    fontSize: 10,
    fontWeight: 'bold',
  },
  locationText: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },

  notiBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notiBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notiBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  // ✅ [추가] 연필 아이콘 박스 스타일
  editIconBox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: '#666', // 박스 테두리 색상
    borderRadius: 4,     // 모서리 둥글기 (0으로 하면 완전 직각)
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,       // 닉네임과의 간격
  },

  // 통계 행
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  verticalDivider: {
    width: 1,
    height: '60%',
    backgroundColor: '#444',
  },

  // 2. 프리미엄 배너
  premiumOutlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  outlineBannerTitle: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  outlineBannerSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },

  // 3. 메뉴 리스트
  menuContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },

  // ✅ [신규] 정책 버튼 스타일
  policyBtn: {
    alignSelf: 'center',
    padding: 10,
    marginBottom: 10,
  },
  policyBtnText: {
    color: '#666',
    fontSize: 12,
    textDecorationLine: 'underline', // 밑줄 추가
  },

  versionText: {
    color: '#444',
    textAlign: 'center',
    fontSize: 11,
    marginBottom: 20,
  },

  // ✅ [추가] 닉네임 수정 입력/버튼
  nicknameInput: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: 'white',
  },
  nicknameBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  nicknameBtnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameBtnCancelText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  nicknameBtnConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameBtnConfirmText: {
    color: 'black',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ✅ [추가] 닉네임 모달(이 화면 전용) - 다른 모달은 그대로 CustomModal 사용
  nicknameOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  nicknameModalContainer: {
    width: "80%",
    backgroundColor: theme.cardBg,
    borderRadius: 15,
    padding: 25,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3.84,
    borderWidth: 1,
    borderColor: "#333",
  },
  nicknameModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.primary,
    marginBottom: 15,
    textAlign: "center",
  },

  // ✅ [신규] 정책 모달 메뉴 버튼 스타일
  modalMenuBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#222",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333"
  },
  modalMenuText: {
    color: "white",
    fontSize: 14,
  },

  // 차단 목록 모달 스타일
  blockedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  blockedUserText: {
    color: 'white',
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  unblockBtn: {
    backgroundColor: '#444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  unblockBtnText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // ✅ [추가] 퀵 충전 버튼 스타일 (프리미엄 전용)
  quickChargeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickChargeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  quickIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  quickChargeTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  quickChargeSub: {
  color: theme.primary,
  fontSize: 11,
  marginTop: 2,
 },

 // ✅ [추가] 로딩 모달 스타일
 loadingOverlay: {
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  justifyContent: "center",
  alignItems: "center",
 },
 loadingBox: {
  width: 150,
  height: 120,
  backgroundColor: "#333",
  borderRadius: 12,
  justifyContent: "center",
  alignItems: "center",
  gap: 15,
 },
 loadingText: {
  color: "white",
  fontSize: 14,
  fontWeight: "bold",
 },
});