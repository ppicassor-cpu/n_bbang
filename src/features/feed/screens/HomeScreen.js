// ================================================================================
//  FILE: src/features/feed/screens/HomeScreen.js
// ================================================================================

import React, { useState, useEffect, useMemo, useCallback } from "react";
// ✅ [필수] 화면 표시용 컴포넌트들
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, Alert, Linking  } from "react-native";
import { Text } from "../../../components/MyText";
import { Image } from "expo-image"; 
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons"; 
// ✅ [추가] 화면 포커스 시 갱신을 위한 Hook
import { useFocusEffect } from "@react-navigation/native";

import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import { checkAndGenerateSamples } from "../../../utils/autoSampleGenerator";
// ✅ [추가] 비속어 필터링 함수 임포트
import { hasBadWord } from "../../../utils/badWordFilter";

// ✅ [추가] 닉네임 로직을 위한 Firebase 임포트
import { doc, getDoc, updateDoc, collection, query, where, getDocs, onSnapshot, limit, orderBy } from "firebase/firestore";
// ✅ [추가] AsyncStorage 추가
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../../../firebaseConfig";

const CATEGORIES = ["전체", "마트/식품", "생활용품", "핫플레이스", "무료나눔"];

// ✅ [최적화 핵심] 리스트 아이템을 별도 컴포넌트로 분리하고 React.memo로 감쌈
const PostItem = React.memo(({ item, onPress }) => {
  const isStore = item.type === "store"; // ✅ 가게 여부 확인
  const isFree = item.category === "무료나눔" || item.isFree === true;

  const isNbbangClosed = !isFree && !isStore && item.status === "마감";
  // ✅ 가게(isStore)는 인원수 마감 로직 제외
  const isFull = !isFree && !isStore && (item.currentParticipants >= item.maxParticipants || isNbbangClosed);
  const isClosed = isFree && item.status === "나눔완료";

  // 1. 시간 변환 함수 통합 (_toMsForBoost 삭제하고 이거 하나 씀)
  const _toMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const now = Date.now();
  
  // 2. 통합된 함수로 변수 계산
  const boostUntilMs = _toMs(item?.boostUntil);
  const boostAppliedAtMs = _toMs(item?.boostAppliedAt) || _toMs(item?.createdAt);
  const createdAtMs = _toMs(item?.createdAt || 0);
  const updatedAtMs = _toMs(item?.updatedAt || 0);

  const isBoosted = boostUntilMs > now;
  const hasUpdated = Boolean(updatedAtMs) && (!createdAtMs || updatedAtMs > createdAtMs);

  // 3. 시간 텍스트 함수 통합 (_boostAgoText 삭제하고 이거 하나 씀)
  const _agoText = (baseMs, actionText) => {
    if (!baseMs) return actionText;
    const diff = Math.max(0, now - baseMs);
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return `방금 전 ${actionText}`;
    if (minutes < 60) return `${minutes}분 전 ${actionText}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전 ${actionText}`;

    const days = Math.floor(hours / 24);
    return `${days}일 전 ${actionText}`;
  };

  // 4. 결과 텍스트 (로직 동일)
  const statusSubText = isBoosted
    ? _agoText(boostAppliedAtMs, "부스트됨") 
    : (hasUpdated ? _agoText(updatedAtMs, "수정됨") : _agoText(createdAtMs, "작성됨"));

  const finalPerPerson = (!isFree && !isStore)
    ? Number(item.pricePerPerson || 0) + Number(item.tip || 0)
    : 0;

  const imageSource = item.images && item.images.length > 0
    ? { uri: (typeof item.images[0] === 'string' ? item.images[0] : item.images[0]?.uri) }
    : null;

  return (
    <TouchableOpacity 
      style={[styles.card, isClosed && { opacity: 0.6 }]} 
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.imageBox}>
        {imageSource ? (
          <Image 
            source={imageSource} 
            style={styles.image} 
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <MaterialIcons name={isStore ? "storefront" : "receipt-long"} size={40} color="grey" />
        )}
        {/* ✅ 가게는 마감 오버레이 안 띄움 */}
        {(isClosed || isFull) && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedOverlayText}>{isClosed ? "나눔완료" : "마감"}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        
        {/* ✅ [수정] 스토어일 경우 실제 카테고리 표시 및 거리 삭제 */}
        <Text style={styles.subInfo}>
          {item.location}{isStore ? "" : `  ${item.category}${item.distText}`}
        </Text>

        <View style={styles.row}>
          <Text style={[styles.price, isClosed && { color: "grey" }]}>            
            {isStore ? item.realCategory : (isFree ? "무료" : `${finalPerPerson.toLocaleString()}원`)}
          </Text>
          {item.tip > 0 && !isFree && !isStore && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>수고비 포함</Text>
            </View>
          )}
        </View>

        <View style={styles.statusRow}>
          <Text
            style={[styles.status, { color: (isFull || isClosed) ? theme.danger : theme.primary }]}
          >
            {isStore
              ? "운영중"
              : (isFree
                  ? (item.status || "나눔중")
                  : (isNbbangClosed ? "참여마감" : "참여중")
                )
            }
          </Text>

          <View style={styles.boostRow}>
            <Ionicons
              name={isBoosted ? "rocket" : "time-outline"}
              size={14}
              color={isBoosted ? "rgb(127, 158, 2)": "grey"}
            />
            <Text style={styles.boostText}>{statusSubText}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function HomeScreen({ navigation }) {
    const { 
    user, 
    isPremium, 
    posts, 
    stores, // ✅ stores 데이터 가져오기
    isAdmin, 
    currentLocation, 
    myCoords, 
    getDistanceFromLatLonInKm, 
    loadMorePosts, 
    loadMoreStores,
    refreshPostsAndStores,
    verifyLocation,
    checkSavedVerification,
    isVerified,
    isBooting,
    checkHotplaceEligibility,
    incrementHotplaceCount,
    purchaseHotplaceExtra,
    totalUnreadCount,

    // ✅ [추가] 부스트 만료 자동 정리(포커스 1회 호출용)
    clearExpiredActiveBoostIfNeeded,

    // ✅ [추가] 동네 확정/인증 상태 (뱃지 표기용)
    homeDong,
    homeDongVerified
  } = useAppContext();

  
  const insets = useSafeAreaInsets();
  
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [hotplaceModalVisible, setHotplaceModalVisible] = useState(false);
  const [hotplaceModalType, setHotplaceModalType] = useState(null);
  const [hotplaceModalLoading, setHotplaceModalLoading] = useState(false);

  // ✅ [추가] 닉네임 설정 관련 상태
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [hasNickname, setHasNickname] = useState(false);
  
  // ✅ [수정] 알림 상태 분리 (개인 알림 개수 + 안 읽은 공지 여부)
  const [unreadPersonalCount, setUnreadPersonalCount] = useState(0);
  const [hasUnreadNotice, setHasUnreadNotice] = useState(false);

  // ✅ [추가] 내 알림 실시간 구독
  // ✅ [수정] 통합 알림 구독 (개인 알림 + 전체 공지)
  useEffect(() => {
    if (!user?.uid) return;

    // 1. 개인 알림 개수 실시간 구독
    const qPersonal = query(
      collection(db, "users", user.uid, "notifications"),
      where("isRead", "==", false)
    );
    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      setUnreadPersonalCount(snap.size);
    });

    // 2. 전체 공지(최신 1개) 실시간 구독
    const qSystem = query(
      collection(db, "system_notices"),
      where("isShow", "==", true),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    
    const unsubSystem = onSnapshot(qSystem, async (snap) => {
      if (!snap.empty) {
        const latestId = snap.docs[0].id;
        // 로컬 저장소(AsyncStorage) 확인하여 읽은 글인지 체크
        const readJson = await AsyncStorage.getItem("READ_SYSTEM_NOTICES");
        const readIds = readJson ? JSON.parse(readJson) : [];
        setHasUnreadNotice(!readIds.includes(latestId));
      } else {
        setHasUnreadNotice(false);
      }
    });

    return () => {
      unsubPersonal();
      unsubSystem();
    };
  }, [user?.uid]);
  useFocusEffect(
    useCallback(() => {
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
            // 저장된 ID 목록에 없으면(안 읽었으면) true, 있으면 false
            setHasUnreadNotice(!readIds.includes(latestId));
          }
        } catch (e) {
          console.log("공지 체크 실패:", e);
        }
      };
      checkNoticeReadStatus();
    }, [])
  );

  // ✅ [추가] 커스텀 알림 모달 상태 (Alert 대체용)
   const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertModalConfig, setAlertModalConfig] = useState({ title: "", message: "" });

  // ✅ [추가] 동네 미인증 시 글쓰기 진입 차단 모달
  const [townGuardModalVisible, setTownGuardModalVisible] = useState(false);

  // ✅ [추가] 위치/인증 게이트 무한 방지용 타임아웃 상태
  const [gateTimeoutPassed, setGateTimeoutPassed] = useState(false);

  const showCustomAlert = (title, message) => {
    setAlertModalConfig({ title, message });
    setAlertModalVisible(true);
  };

  const handleTownGuardConfirm = () => {
    setTownGuardModalVisible(false);
    setWriteModalVisible(false);
    if (MY_TOWN_ROUTE) {
      navigation.navigate(MY_TOWN_ROUTE);
    }
  };

  const MEMBERSHIP_ROUTE =
    ROUTES?.MEMBERSHIP ||
    ROUTES?.PREMIUM ||
    ROUTES?.SUBSCRIPTION ||
    ROUTES?.PROFILE;

  const HOTPLACE_WRITE_ROUTE =
    ROUTES?.STORE_WRITE ||
    ROUTES?.HOTPLACE_WRITE ||
    ROUTES?.STORE_WRITE_SCREEN;

  const MY_TOWN_ROUTE = ROUTES?.MY_TOWN;

  // ✅ [수정] (3) 게이트 visible 조건 최소화:
  // - isBooting이 boolean이면 그대로 쓰지 않고, "위치 인증"과 "좌표 존재"만 최소 조건으로 사용
  // - storesLoaded 때문에 영구 봉쇄되는 케이스 차단
  const locationGateVisible = !(myCoords && myCoords.latitude && myCoords.longitude);

  const isPermissionIssue = (currentLocation === "위치 권한 필요" || currentLocation === "위치 확인 불가");
  const gateTitle = isPermissionIssue ? "위치 권한이 필요합니다" : "데이터를 불러오고 있습니다";

  // ✅ [수정] 권한 거부/위치 실패/무한 대기 방지: 일정 시간 지나면 '로딩'만 해제하고 안내 모드로 전환
  useEffect(() => {
    if (!locationGateVisible) {
      setGateTimeoutPassed(false);
      return;
    }

    // 권한/위치 실패 문구가 뜬 경우는 즉시 안내 모드로 전환
    if (isPermissionIssue) {
      setGateTimeoutPassed(true);
      return;
    }

    const t = setTimeout(() => {
      setGateTimeoutPassed(true);
    }, 9000);

    return () => {
      clearTimeout(t);
      // 추가된 예외 처리: 컴포넌트 언마운트 시에도 상태 업데이트 중복 방지
      setGateTimeoutPassed(false);
    };
  }, [locationGateVisible, isPermissionIssue]);

const handleGateConfirm = async () => {
    if (isPermissionIssue) {
      Linking.openSettings();
      return;
    }

    setGateTimeoutPassed(false);

    try {
      // ✅ 강제 재시도는 캐시 복구가 아니라 "실제 GPS 재확인"이 맞습니다.
      if (typeof verifyLocation === "function") {
        await verifyLocation();
      } else if (typeof checkSavedVerification === "function") {
        await checkSavedVerification(user?.uid || null);
      }
    } catch (e) {
      console.error("위치 재확인 실패:", e);
      showCustomAlert("오류", "위치 재확인 중 문제가 발생했습니다.");
    }
};


  // ✅ [수정] (1) useFocusEffect에서 refreshPostsAndStores 호출 제거 (loaded 리셋 방지)
  // 상세 화면에서 참여 후 돌아왔을 때 숫자 업데이트는 AppContext의 실시간 스냅샷/상세화면 처리로 해결해야 함
    useFocusEffect(
    useCallback(() => {
      let isActive = true; // 화면이 떠났는지 체크하는 안전장치

      // ✅ [추가] 부스트 만료 자동 정리(포커스 1회)
      (async () => {
        try {
          if (typeof clearExpiredActiveBoostIfNeeded === "function") {
            await clearExpiredActiveBoostIfNeeded();
          }
        } catch (e) {}
      })();

      // ✅ 게이트(좌표 로딩/권한 안내) 끝난 뒤에만 닉네임 체크 실행
      if (locationGateVisible) {
        setNicknameModalVisible(false);
        return () => {
          isActive = false;
        };
      }

      const checkNickname = async () => {
        // 1. 유저 정보가 없으면 검사 안 함
        if (!user?.uid) return;

        try {
          // ✅ 기준: "displayName" (닉네임 = displayName)
          // - Firestore displayName 우선
          // - Firestore가 비었는데 Auth displayName이 있으면 닉네임 있는 것으로 취급
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          let dbName = "";
          if (userSnap.exists()) {
            const userData = userSnap.data();
            dbName = String(userData?.displayName || "").trim();
          }

          const authName = String(user?.displayName || "").trim();
          const ok = Boolean(dbName || authName);

          if (!isActive) return;

          setHasNickname(ok);
          setNicknameModalVisible(!ok);
        } catch (e) {
          console.log("닉네임 확인 실패:", e);

          // ✅ DB 확인 실패 시에는 Auth displayName으로만 판단
          const authName = String(user?.displayName || "").trim();
          const ok = Boolean(authName);

          if (!isActive) return;

          setHasNickname(ok);
          setNicknameModalVisible(!ok);
        }
      };

      checkNickname();

      return () => {
        isActive = false; // 화면 벗어나면 로직 중단
      };
    }, [user, locationGateVisible, clearExpiredActiveBoostIfNeeded]) // ✅ 의존성 추가
  );


  // ✅ [추가] 닉네임 저장 및 유효성 검사 로직 - Alert 대신 CustomModal 사용
const handleSaveNickname = async () => {
    const trimmed = newNickname.trim();
    if (!trimmed) {
      showCustomAlert("알림", "닉네임을 입력해주세요.");
      return;
    }

    // ✅ [추가] 비속어 및 금칙어 체크
    if (hasBadWord(trimmed)) {
      showCustomAlert("경고", "부적절한 단어(욕설, 관리자 사칭 등)가 포함되어 있습니다.\n바른 말을 사용해주세요.");
      return;
    }

    // 특수문자/공백 체크 (한글, 영문, 숫자만 허용)
    const specialCharPattern = /[^a-zA-Z0-9가-힣]/;
    if (specialCharPattern.test(trimmed)) {
      showCustomAlert("알림", "특수문자나 공백은 사용할 수 없습니다.\n(한글, 영문, 숫자만 가능)");
      return;
    }

    try {
      // ✅ [수정] 중복 검사: nickname -> displayName
      const q = query(collection(db, "users"), where("displayName", "==", trimmed));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        showCustomAlert("알림", "이미 사용 중인 닉네임입니다.\n다른 닉네임을 입력해주세요.");
        return;
      }

      // ✅ [수정] 저장: nickname -> displayName
      if (!user?.uid) {
        showCustomAlert("오류", "사용자 정보가 누락되었습니다.");
        return;
      }

      await updateDoc(doc(db, "users", user.uid), {
        displayName: trimmed
      });

      setHasNickname(true);
      setNicknameModalVisible(false);
      showCustomAlert("환영합니다!", "닉네임이 설정되었습니다.");

    } catch (e) {
      console.error("닉네임 저장 오류:", e);
      showCustomAlert("오류", "닉네임 저장 중 문제가 발생했습니다.");
    }
};


  const openHotplaceModal = (type) => {
    setHotplaceModalType(type);
    setHotplaceModalVisible(true);
  };

  const closeHotplaceModal = () => {
    if (hotplaceModalLoading) return;
    setHotplaceModalVisible(false);
    setHotplaceModalType(null);
  };

  const goHotplaceWrite = (params) => {
    if (!HOTPLACE_WRITE_ROUTE) return;
    navigation.navigate(HOTPLACE_WRITE_ROUTE, params);
  };

  const handleHotplacePress = async () => {
    setWriteModalVisible(false);

    if (isPremium) {
       goHotplaceWrite({ paymentType: "membership", purchaseInfo: null });
       return;
    }

    try {
      const res = (typeof checkHotplaceEligibility === "function") ? await checkHotplaceEligibility() : null;
      const status = typeof res === "string" ? res : (res?.status || res?.code || null);

      if (status === "ELIGIBLE") {
        goHotplaceWrite({ paymentType: "membership", purchaseInfo: null });
        return;
      }

      if (status === "NOT_PREMIUM") {
        openHotplaceModal("NOT_PREMIUM");
        return;
      }

      if (status === "NEED_PURCHASE") {
        openHotplaceModal("NEED_PURCHASE");
        return;
      }

      openHotplaceModal("UNKNOWN");
    } catch (e) {
      openHotplaceModal("UNKNOWN");
    }
  };

  const handlePurchaseHotplaceExtra = async () => {
    if (hotplaceModalLoading) return;
    setHotplaceModalLoading(true);

    try {
      if (typeof purchaseHotplaceExtra !== "function") {
        openHotplaceModal("PAYMENT_NOT_READY");
        return;
      }

      const purchaseInfo = await purchaseHotplaceExtra();

      closeHotplaceModal();
      goHotplaceWrite({ paymentType: "single", purchaseInfo: purchaseInfo ?? null });
    } catch (e) {
      openHotplaceModal("PAYMENT_FAILED");
    } finally {
      setHotplaceModalLoading(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (isLocationLoading) return;
    setIsLocationLoading(true);
    try {
      // ✅ 강제 재인증(재시도)은 verifyLocation이 정답
      if (typeof verifyLocation === "function") {
        await verifyLocation();
      } else if (typeof checkSavedVerification === "function") {
        await checkSavedVerification(user?.uid || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLocationLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // ✅ 캐시 복구는 uid 기반으로만
        if (typeof checkSavedVerification === "function") {
          await checkSavedVerification(user?.uid || null);
        } else if (typeof verifyLocation === "function") {
          await verifyLocation(); // fallback
        }
      } catch (e) {}
    })();
  }, [user?.uid]);

  useEffect(() => {
    if (myCoords && myCoords.latitude) {
      checkAndGenerateSamples(myCoords);
    }
  }, [myCoords]);

  // ✅ 스크롤 최적화를 위한 데이터 가공 (useMemo)
   const _toMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const _ownerKey = (item) => {
    return String(
      item?.userId ??
      item?.ownerId ??
      item?.uid ??
      item?.authorId ??
      item?.writerId ??
      ""
    );
  };

  const _createdAtMs = (item) => item?.createdAt ? _toMs(item.createdAt) : Date.now();

  const _stableItemKey = (item) => {
    return String(
      item?.id ??
      item?.postId ??
      item?.storeId ??
      item?.docId ??
      `${item?.type ?? "item"}_${_ownerKey(item)}_${_createdAtMs(item)}`
    );
  };

  // ✅ 스크롤 최적화를 위한 데이터 가공 (useMemo)
  const formattedPosts = useMemo(() => {
    // 1. stores 데이터를 posts 형식에 맞게 변환 (⚠️ 중요 수정)
    const normalizedStores = (stores || []).map(s => ({
      ...s,
      type: 'store',
      title: s.name, 
      realCategory: s.category, // ✅ [추가] 실제 업종(예: 맛집) 보존
      category: "핫플레이스", // 탭 필터링용
      // ✅ [중요] 좌표 객체 충돌 방지: 화면 표시용 주소는 'address' 사용
      location: s.address || "위치 정보 없음", 
      // ✅ [중요] 거리 계산용 좌표: 원래 'location'에 있던 좌표를 'coords'로 복사
      coords: s.location, 
      
      currentParticipants: 0,
      maxParticipants: 9999, // 마감 안 뜨게 임의 설정
      status: "운영중" 
    }));

    // 2. 게시글과 가게 합치기
    const allData = [...(posts || []), ...normalizedStores];

        // 3. 거리/카테고리 필터 + distText 부여
    const filtered = allData.reduce((acc, item) => {
      // ✅ item.coords가 있어야 거리 계산 가능 (위에서 매핑해줌)
      if (!myCoords || !item.coords) {
        if (selectedCategory === "전체" || item.category === selectedCategory) {
          acc.push({ ...item, distText: "" });
        }
        return acc;
      }

      const dist = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );

      // ✅ 관리자(isAdmin)이면 거리 제한 무시, 아니면 5km 제한
      if (isAdmin || item.ownerIsAdmin || dist <= 5) {
        if (selectedCategory === "전체" || item.category === selectedCategory) {
          acc.push({ ...item, distText: ` ${dist.toFixed(1)}km` });
        }
      }
      return acc;
    }, []);

        // 4. 부스트 후보/일반 후보 분리 + 정렬 (updatedAt 끌올 악용 방지: updatedAt 사용 안 함)
    const now = Date.now();

    const _boostUntilMs = (item) => _toMs(item?.boostUntil);
    const _boostAppliedAtMs = (item) => _toMs(item?.boostAppliedAt);

    const _isBoosted = (item) => _boostUntilMs(item) > now;

    // ✅ 부스트 정렬: boostUntil(유효성/강도) → boostAppliedAt(최근 부스트) → createdAt
    const _sortBoosted = (a, b) => {
      const endA = _boostUntilMs(a);
      const endB = _boostUntilMs(b);
      if (endB !== endA) return endB - endA;

      const apA = _boostAppliedAtMs(a);
      const apB = _boostAppliedAtMs(b);
      if (apB !== apA) return apB - apA;

      return _createdAtMs(b) - _createdAtMs(a);
    };

    // ✅ 일반 정렬: createdAt 최신순 유지
    const _sortNormal = (a, b) => _createdAtMs(b) - _createdAtMs(a);

    const boostedCandidates = filtered.filter(_isBoosted).sort(_sortBoosted);
    const normalCandidates = filtered.filter((item) => !_isBoosted(item)).sort(_sortNormal);

    // 5. 상단 3슬롯 구성:
    // - 1~2위: 최근 N빵 부스트 우선 보장
    // - (N빵 부스트가 3개 이상일 경우) 3위: 최근 핫스토어 부스트 보장
    // - 1~2위에 들어갈 N빵 부스트가 없으면 스토어 부스트가 1~2위도 가능
    const SLOT_TOTAL = 3;
    const isHotplaceTab = selectedCategory === "핫플레이스";
    const capPerUser = 1;

    const _isStoreItem = (item) => item?.type === "store";

    // ✅ boostedCandidates에서 "일반부스트(post) 우선 → 핫스토어부스트(store) 후순위"
    const boostedPost = boostedCandidates.filter((x) => !_isStoreItem(x)).sort(_sortBoosted);
    const boostedStore = boostedCandidates.filter((x) => _isStoreItem(x)).sort(_sortBoosted);

    const capStore = SLOT_TOTAL; // 기존 로직 유지(상단 3슬롯 내에서 최대 3개)

    const _keyed = (list) => {
      return (list || []).map((item) => ({
        key: _stableItemKey(item),
        owner: _ownerKey(item),
        item,
        isStore: _isStoreItem(item),
      }));
    };

    const keyedBoostedPost = _keyed(boostedPost);
    const keyedBoostedStore = _keyed(boostedStore);
    const keyedNormal = _keyed(normalCandidates);

    const keyedCombined = [...keyedBoostedPost, ...keyedBoostedStore, ...keyedNormal];

    const picked = [];
    const usedKeys = new Set();
    // ✅ [수정 1] '가게 주인'만 따로 기억하는 명단 생성
    const usedStoreOwners = new Set(); 
    let storeCount = 0;
    let postCount = 0;

    const _canPick = (row) => {
      if (!row?.key) return false;
      if (usedKeys.has(row.key)) return false;

      // ✅ [수정 2] 가게(isStore)일 때만 주인 중복을 체크! (글은 체크 안 함)
      if (row.isStore) {
        if (capPerUser === 1 && row.owner && usedStoreOwners.has(row.owner)) {
          return false; // 이미 이 주인의 가게가 올라갔으면 스킵
        }
        if (storeCount >= capStore) return false;
      }

      return true;
    };

    const _pick = (row) => {
      usedKeys.add(row.key);
      
      if (row.isStore) {
        storeCount += 1;
        // ✅ [수정 3] 가게일 때만 '가게 주인 명단'에 추가
        if (row.owner) usedStoreOwners.add(row.owner); 
      } else {
        postCount += 1;
      }

      picked.push(row);
    };

    const _pickFrom = (rows, need) => {
      let cnt = 0;
      for (let i = 0; i < rows.length; i++) {
        if (picked.length >= SLOT_TOTAL) break;
        if (cnt >= need) break;

        const row = rows[i];
        if (!_canPick(row)) continue;

        _pick(row);
        cnt += 1;
      }
    };

    // ✅ (1) 1~2위: 최근 N빵 부스트 우선 보장, 부족하면 스토어 부스트도 가능, 그래도 부족하면 일반으로 채움
    _pickFrom(keyedBoostedPost, 2);

    if (picked.length < 2) {
      _pickFrom(keyedBoostedStore, 2 - picked.length);
    }

    if (picked.length < 2) {
      _pickFrom(keyedNormal, 2 - picked.length);
    }

    // ✅ (2) 3위:
    // - 엔빵 부스트가 3개 이상일 때, 스토어 부스트가 있으면 3위 보장
    // - 그 외에는: 엔빵 부스트 → 스토어 부스트 → 일반 순으로 채움
    if (picked.length < SLOT_TOTAL) {
      const shouldGuaranteeStoreAt3 = (boostedPost.length >= 3 && boostedStore.length > 0);

      if (shouldGuaranteeStoreAt3) {
        _pickFrom(keyedBoostedStore, 1);

        if (picked.length < SLOT_TOTAL) {
          _pickFrom(keyedBoostedPost, 1);
        }

        if (picked.length < SLOT_TOTAL) {
          _pickFrom(keyedNormal, 1);
        }
      } else {
        _pickFrom(keyedBoostedPost, 1);

        if (picked.length < SLOT_TOTAL) {
          _pickFrom(keyedBoostedStore, 1);
        }

        if (picked.length < SLOT_TOTAL) {
          _pickFrom(keyedNormal, 1);
        }
      }
    }

    // (3) 상단 슬롯에 뽑힌 아이템은 목록에서 제거하고, 나머지를 이어붙임 (동일 key로 정확히 제거)
    const pickedKeySet = new Set(picked.map((r) => r.key));
    const rest = keyedCombined.filter((r) => !pickedKeySet.has(r.key));

    return [...picked.map((r) => r.item), ...rest.map((r) => r.item)];

  }, [posts, stores, myCoords, selectedCategory, isAdmin, getDistanceFromLatLonInKm]);

  // ✅ 렌더링 함수
  const renderItem = useCallback(({ item }) => {
  return (
    <PostItem
      item={item}
      onPress={() => {
        const isFreeItem = item?.category === "무료나눔" || item?.isFree === true;

        if (item?.type === "store") {
          navigation.navigate(ROUTES.STORE_DETAIL || "StoreDetail", { store: item });
        } else if (isFreeItem) {
          navigation.navigate(ROUTES.FREE_DETAIL, { post: item });
        } else {
          navigation.navigate(ROUTES.DETAIL, { post: item });
        }
      }}
    />
  );
}, [navigation]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (typeof refreshPostsAndStores === "function") {
      await refreshPostsAndStores();
    }
    setRefreshing(false);
  };

  const gateMessage = isPermissionIssue
    ? "위치 권한을 허용해야 홈을 볼 수 있습니다.\n설정에서 위치 권한을 허용해주세요."
    : (gateTimeoutPassed
        ? "로딩이 지연되고 있습니다.\n아래 버튼을 눌러 다시 시도해주세요."
        : "데이터를 불러오고 있습니다.\n잠시만 기다려주세요."
      );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* ✅ 수정된 헤더: 클릭 시 내 동네 설정 화면으로 이동 */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => MY_TOWN_ROUTE && navigation.navigate(MY_TOWN_ROUTE)}  
          style={{ flexDirection: "row", alignItems: "center" }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.location}>{homeDong ? (currentLocation || "내 동네") : "내 동네 설정"}</Text>
            {/* ✅ 동네 뱃지 (기존 코드 유지) */}
            <View style={[
              styles.miniBadge, 
              { backgroundColor: (homeDong && homeDongVerified) ? theme.primary : "rgba(255, 68, 68, 0.2)" },
              { borderColor: (homeDong && homeDongVerified) ? theme.primary : "#FF4444", borderWidth: 1 }
            ]}>
              <Text style={[
                styles.miniBadgeText, 
                { color: (homeDong && homeDongVerified) ? "black" : "#FF4444" }
              ]}>
                {(homeDong && homeDongVerified) ? "동네인증" : "동네미인증"}
              </Text>
            </View>
            <MaterialIcons name="keyboard-arrow-down" size={22} color="white" style={{ marginLeft: 2 }} />
          </View>
        </TouchableOpacity>

        {/* ✅ [수정] 우측 아이콘 그룹 (돋보기 / 채팅 / 프로필) */}
        {/* gap을 14 -> 10으로 줄이고, marginRight를 4정도 줘서 벽에서 살짝 뗌 */}
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginRight: 12 }}>
          
          {/* 🔍 [추가] 검색(돋보기) 아이콘 */}
          <TouchableOpacity
            onPress={() => navigation.navigate(ROUTES.SEARCH || "SearchScreen")}
            activeOpacity={0.7}
            style={{ padding: 4 }} // 터치 영역 확보
          >
            <Ionicons name="search" size={24} color="white" />
          </TouchableOpacity>

          {/* 💬 기존 채팅 아이콘 */}
          <TouchableOpacity
            onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}
            activeOpacity={0.7}
            style={{ padding: 4 }}
          >
            <View style={{ position: "relative" }}>
              <Ionicons name="chatbubbles-outline" size={24} color="white" />
              {Number(totalUnreadCount || 0) > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {Number(totalUnreadCount) > 99 ? "99+" : String(totalUnreadCount)}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* 👤 기존 프로필 아이콘 */}
          <TouchableOpacity
            onPress={() => navigation.navigate(ROUTES?.PROFILE || "Profile")}
            activeOpacity={0.7}
            style={{ padding: 4 }}
          >
            <View>
              <Ionicons name="person-circle-outline" size={28} color="white" />
              {/* ✅ [수정] 개인 알림이 있거나 OR 안 읽은 공지가 있으면 빨간 점 표시 */}
              {(unreadPersonalCount > 0 || hasUnreadNotice) && <View style={styles.profileRedDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity 
            key={cat} 
            onPress={() => setSelectedCategory(cat)}
            style={[styles.categoryBtn, selectedCategory === cat && styles.categoryBtnActive]}
          >
            <Text
              style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}
            >
              {cat === "핫플레이스" ? "핫스토어" : cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={formattedPosts}
        renderItem={renderItem}
        keyExtractor={(item) => _stableItemKey(item)}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "#333", marginVertical: 12 }} />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Text style={{ color: "grey" }}>해당 카테고리의 글이 없습니다.</Text>
          </View>
        }
        onEndReached={() => {
          if (selectedCategory === "전체") {
            loadMorePosts();
            if (typeof loadMoreStores === "function") {
              loadMoreStores();
            }
            return;
          }

          if (selectedCategory === "핫플레이스") {
            if (typeof loadMoreStores === "function") {
              loadMoreStores();
            }
            return;
          }
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7} 
        removeClippedSubviews={true} 
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />

       <TouchableOpacity 
        style={[styles.fab, { bottom: 20 + insets.bottom }]} 
        onPress={() => {
          // ✅ 글쓰기 버튼 눌렀을 때도 displayName(닉네임) 없으면 강제 모달
          // - hasNickname은 DB 체크 결과
          // - DB 체크 타이밍 전이라면 Auth displayName으로 한 번 더 안전판
          const authName = String(user?.displayName || "").trim();
          const ok = Boolean(hasNickname || authName);

          if (!ok) {
            setNicknameModalVisible(true);
            return;
          }

          // ✅ 동네미인증이면 글쓰기 선택팝업보다 먼저 안내 모달 → 확인 시 내동네 설정 화면으로 이동
          if (!(homeDong && homeDongVerified)) {
            setTownGuardModalVisible(true);
            return;
          }

          setWriteModalVisible(true);
        }}
      >
        <MaterialIcons name="post-add" size={30} color="black" />
      </TouchableOpacity>

      <CustomModal
        visible={writeModalVisible}
        title="글쓰기 선택"
        message="어떤 글을 작성하시겠습니까?"
        onConfirm={() => {}}
      >
        <View style={{ gap: 12 }}>
          <TouchableOpacity 
            style={[styles.selectBtn, { backgroundColor: theme.primary }]}
            onPress={() => {
              setWriteModalVisible(false);
              navigation.navigate(ROUTES.WRITE);
            }}
          >
            <MaterialIcons name="shopping-cart" size={20} color="black" />
            <Text style={styles.selectBtnText}>N빵 모집하기</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.selectBtn, { backgroundColor: "#444" }]}
            onPress={() => {
              setWriteModalVisible(false);
              navigation.navigate(ROUTES.WRITE_FREE);
            }}
          >
            <MaterialIcons name="volunteer-activism" size={20} color="white" />
            <Text style={[styles.selectBtnText, { color: "white" }]}>무료나눔 하기</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.selectBtn, { backgroundColor: "#222" }]}
            onPress={() => {
              handleHotplacePress();
            }}
            disabled={hotplaceModalLoading}
          >
            <MaterialIcons name="place" size={20} color="white" />
            <Text style={[styles.selectBtnText, { color: "white" }]}>핫스토어 등록</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ marginTop: 10, alignItems: "center", padding: 10 }}
            onPress={() => setWriteModalVisible(false)}
          >
            <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      <CustomModal
        visible={townGuardModalVisible}
        title="동네 설정 필요"
        message={"글쓰기는 동네 인증 후\n이용할 수 있습니다.\n내 동네를 먼저 설정해주세요.\n\n동네 설정 화면으로 이동합니다."}
        onConfirm={handleTownGuardConfirm}
        confirmText="내 동네 설정"
      />

      <CustomModal
        visible={hotplaceModalVisible}
        title={
          hotplaceModalType === "NOT_PREMIUM"
            ? "프리미엄 전용"
            : hotplaceModalType === "NEED_PURCHASE"
            ? "추가 등록 결제"
            : hotplaceModalType === "PAYMENT_FAILED"
            ? "결제 실패"
            : hotplaceModalType === "PAYMENT_NOT_READY"
            ? "결제 준비 필요"
            : "알림"
        }
        message={
          hotplaceModalType === "NOT_PREMIUM"
            ? "핫스토어 등록은 프리미엄 회원만 가능합니다."
            : hotplaceModalType === "NEED_PURCHASE"
            ? "이번 달 무료 등록 횟수를 모두 사용했습니다.\n0.99달러에 추가 등록하시겠습니까?"
            : hotplaceModalType === "PAYMENT_FAILED"
            ? "결제에 실패했습니다.\n잠시 후 다시 시도해주세요."
            : hotplaceModalType === "PAYMENT_NOT_READY"
            ? "결제 기능이 아직 준비되지 않았습니다."
            : "처리 중 문제가 발생했습니다."
        }
        onConfirm={() => {}}
      >
        <View style={{ gap: 12 }}>
          {hotplaceModalType === "NOT_PREMIUM" && (
            <>
              <TouchableOpacity
                style={[styles.selectBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  closeHotplaceModal();
                  if (MEMBERSHIP_ROUTE) {
                    navigation.navigate(MEMBERSHIP_ROUTE);
                  }
                }}
              >
                <MaterialIcons name="workspace-premium" size={20} color="black" />
                <Text style={styles.selectBtnText}>멤버십 페이지로 이동</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 10, alignItems: "center", padding: 10 }}
                onPress={() => closeHotplaceModal()}
              >
                <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
              </TouchableOpacity>
            </>
          )}

          {hotplaceModalType === "NEED_PURCHASE" && (
            <>
              <TouchableOpacity
                style={[styles.selectBtn, { backgroundColor: theme.primary }]}
                onPress={handlePurchaseHotplaceExtra}
                disabled={hotplaceModalLoading}
              >
                {hotplaceModalLoading ? (
                  <>
                    <ActivityIndicator size="small" color="black" style={{ marginRight: 8 }} />
                    <Text style={styles.selectBtnText}>결제 처리 중...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="payments" size={20} color="black" />
                    <Text style={styles.selectBtnText}>결제하기</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 10, alignItems: "center", padding: 10 }}
                onPress={() => closeHotplaceModal()}
                disabled={hotplaceModalLoading}
              >
                <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
              </TouchableOpacity>
            </>
          )}

          {(hotplaceModalType === "PAYMENT_FAILED" ||
            hotplaceModalType === "PAYMENT_NOT_READY" ||
            hotplaceModalType === "UNKNOWN") && (
            <TouchableOpacity
              style={{ marginTop: 10, alignItems: "center", padding: 10 }}
              onPress={() => closeHotplaceModal()}
            >
              <Text style={{ color: "#888", fontWeight: "bold" }}>확인</Text>
            </TouchableOpacity>
          )}
        </View>
      </CustomModal>

      {/* ✅ [추가] 닉네임 설정 모달 (강제) */}
      <CustomModal
        visible={nicknameModalVisible}
        title="닉네임 설정"
        message="앱 사용을 위해 닉네임을 설정해주세요."
        // 버튼 동작을 비워두거나 onConfirm만 연결해서 강제성 부여
        onConfirm={handleSaveNickname}
      >
        <View style={{ width: '100%', marginTop: 10 }}>
          <TextInput
            style={{
              backgroundColor: '#eee',
              padding: 10,
              borderRadius: 8,
              color: 'black',
              width: '100%'
            }}
            placeholder="닉네임 입력 (예: 행복한망고)"
            placeholderTextColor="#888"
            value={newNickname}
            onChangeText={setNewNickname}
            maxLength={10}
            autoCapitalize="none"
            allowFontScaling={false}
          />
          
          <TouchableOpacity 
            style={{ 
              backgroundColor: theme.primary, 
              padding: 12, 
              borderRadius: 8, 
              marginTop: 15,
              alignItems: 'center' 
            }}
            onPress={handleSaveNickname}
          >
            <Text style={{ fontWeight: 'bold', color: 'black' }}>등록하기</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* ✅ [추가] 일반 알림용 커스텀 모달 (Alert 대체) */}
      <CustomModal
        visible={alertModalVisible}
        title={alertModalConfig.title}
        message={alertModalConfig.message}
        onConfirm={() => setAlertModalVisible(false)}
        confirmText="확인"
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" },
  location: { color: "white", fontSize: 25, fontWeight: "bold" },
  miniBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    // 살짝 빛나는 효과를 위한 그림자 (iOS)
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: "900", // 아주 두껍게
    letterSpacing: 0.5,
  },
  categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333", backgroundColor: theme.background },
  categoryBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 15 },
  categoryBtnActive: { backgroundColor: theme.primary },
  categoryText: { color: "#888", fontSize: 15, fontWeight: "700" },
  categoryTextActive: { color: "black", fontWeight: "bold" },
  
  card: { 
    flexDirection: "row", 
    backgroundColor: theme.cardBg, 
    borderRadius: 16, 
    padding: 12, 
  },
  
  imageBox: { width: 100, height: 100, backgroundColor: "#222", borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  closedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  closedOverlayText: { color: "white", fontWeight: "bold" },
  infoBox: { flex: 1, marginLeft: 16, justifyContent: "center" },
  title: { color: "white", fontSize: 18, fontWeight: "bold" }, // ✅ [수정] 리스트 제목 크기
  subInfo: { color: "grey", fontSize: 13 }, // ✅ [수정] 동네명, 카테고리 크기
  row: { flexDirection: "row", alignItems: "center" },
  price: { color: "white", fontSize: 17, fontWeight: "bold" }, // ✅ [수정] 가격 숫자 크기
  badge: { backgroundColor: "rgba(204,255,0,0.15)", paddingHorizontal: 6, borderRadius: 4 },
  badgeText: { color: theme.primary, fontSize: 12 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  boostRow: { flexDirection: "row", alignItems: "center", marginLeft: 8, gap: 4 },
  boostText: { color: "grey", fontSize: 12, fontWeight: "700" }, // ✅ [수정] 'N분 전 부스트됨' 크기

  status: { fontSize: 12, fontWeight: "bold" }, // ✅ [수정] '참여중/마감' 텍스트 크기
  fab: { position: "absolute", right: 20, backgroundColor: theme.primary, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
    selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 8, gap: 8 },
  selectBtnText: { fontSize: 16, fontWeight: "bold", color: "black" },

  // ✅ [추가] 안읽은 메세지 합계 뱃지(녹색)
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.primary,
  },
  unreadBadgeText: {
    color: "black",
    fontSize: 10,
    fontWeight: "900",
  },
  profileRedDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.danger,
  },
});
