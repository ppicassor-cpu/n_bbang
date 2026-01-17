// ================================================================================
//  FILE: src/features/feed/screens/HomeScreen.js
// ================================================================================

import React, { useState, useEffect, useMemo, useCallback } from "react";
// ✅ [필수] 화면 표시용 컴포넌트들
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, Alert, Linking } from "react-native";
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
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

const CATEGORIES = ["전체", "마트/식품", "생활용품", "핫플레이스", "무료나눔"];

// ✅ [최적화 핵심] 리스트 아이템을 별도 컴포넌트로 분리하고 React.memo로 감쌈
const PostItem = React.memo(({ item, onPress }) => {
  const isStore = item.type === 'store'; // ✅ 가게 여부 확인
  const isFree = item.category === "무료나눔";
  
  const isNbbangClosed = !isFree && !isStore && item.status === "마감";
  // ✅ 가게(isStore)는 인원수 마감 로직 제외
  const isFull = !isFree && !isStore && (item.currentParticipants >= item.maxParticipants || isNbbangClosed);
  const isClosed = isFree && item.status === "나눔완료";

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

        <Text
          style={[styles.status, { color: (isFull || isClosed) ? theme.danger : theme.primary }]}
        >
          {isStore 
            ? "운영중" // ✅ 가게일 때 표시 문구
            : (isFree 
                ? (item.status || "나눔중")
                : (isNbbangClosed ? "참여마감" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`)
              )
          }
        </Text>
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
    isVerified,
    isBooting,
    checkHotplaceEligibility,
    incrementHotplaceCount,
    purchaseHotplaceExtra
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

  // ✅ [추가] 커스텀 알림 모달 상태 (Alert 대체용)
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertModalConfig, setAlertModalConfig] = useState({ title: "", message: "" });

  // ✅ [추가] 위치/인증 게이트 무한 방지용 타임아웃 상태
  const [gateTimeoutPassed, setGateTimeoutPassed] = useState(false);

  const showCustomAlert = (title, message) => {
    setAlertModalConfig({ title, message });
    setAlertModalVisible(true);
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

  // ✅ [수정] (3) 게이트 visible 조건 최소화:
  // - isBooting이 boolean이면 그대로 쓰지 않고, "위치 인증"과 "좌표 존재"만 최소 조건으로 사용
  // - storesLoaded 때문에 영구 봉쇄되는 케이스 차단
  const locationGateVisible = !(isVerified && myCoords && myCoords.latitude && myCoords.longitude);

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

    return () => clearTimeout(t);
  }, [locationGateVisible, isPermissionIssue]);

  const handleGateConfirm = async () => {
    if (isPermissionIssue) {
      Linking.openSettings();
      return;
    }

    // ✅ [수정] (2) 게이트 확인 버튼에서 refreshPostsAndStores로 loaded 리셋하지 않음
    // - 여기서는 위치 재검증만 수행 (필요 시 좌표 갱신)
    setGateTimeoutPassed(false);

    if (typeof verifyLocation === "function") {
      try {
        await verifyLocation();
      } catch (e) {}
    }
  };

  // ✅ [수정] (1) useFocusEffect에서 refreshPostsAndStores 호출 제거 (loaded 리셋 방지)
  // 상세 화면에서 참여 후 돌아왔을 때 숫자 업데이트는 AppContext의 실시간 스냅샷/상세화면 처리로 해결해야 함
  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, [])
  );

  // ✅ [추가] 닉네임 미설정 여부 확인 (앱 실행 시) - displayName 필드 확인
  useEffect(() => {
    const checkNickname = async () => {
      if (!user?.uid) return;
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          // ✅ [수정] nickname -> displayName (필드명 변경)
          if (!userData.displayName || userData.displayName.trim() === "") {
            setNicknameModalVisible(true);
          }
        }
      } catch (e) {
        console.log("닉네임 확인 실패:", e);
      }
    };
    checkNickname();
  }, [user]);

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
      await updateDoc(doc(db, "users", user.uid), {
        displayName: trimmed
      });

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
      await verifyLocation(); 
    } catch (e) {
      console.error(e);
    } finally {
      setIsLocationLoading(false);
    }
  };

  useEffect(() => {
    handleRefreshLocation();
  }, []);

  useEffect(() => {
    if (myCoords && myCoords.latitude) {
      checkAndGenerateSamples(myCoords);
    }
  }, [myCoords]);

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

    // 3. 날짜순 정렬 (최신순)
    const now = Date.now();

    // 1) 전체 데이터를 먼저 '생성일자' 기준으로 완벽하게 역순 정렬
    const sortedByDate = allData.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // 2) 정렬된 데이터에서 끌올(Boosted)과 일반(Normal)을 분리 (이미 최신순인 상태)
    const boosted = sortedByDate.filter(
      (item) => item.boostUntil && new Date(item.boostUntil).getTime() > now
    );
    const normal = sortedByDate.filter(
      (item) => !(item.boostUntil && new Date(item.boostUntil).getTime() > now)
    );

    // 3) 최종 합치기: [최신순 끌올] + [최신순 일반] 순서로 배치 (새 글은 normal의 맨 위로 감)
    const finalSorted = [...boosted, ...normal];

    return finalSorted.reduce((acc, item) => {
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
  }, [posts, stores, myCoords, selectedCategory, isAdmin, getDistanceFromLatLonInKm]);

  // ✅ 렌더링 함수
  const renderItem = useCallback(({ item }) => {
    return (
      <PostItem 
        item={item} 
        onPress={() => {
          if (item.type === 'store') {
             navigation.navigate(ROUTES.STORE_DETAIL || "StoreDetail", { store: item });
          } else if (item.category === "무료나눔") {
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
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={handleRefreshLocation} 
          style={{ flexDirection: "row", alignItems: "center" }}
          activeOpacity={0.7}
        >
          <Text style={styles.location}>{currentLocation} {isAdmin ? "(관리자)" : ""}</Text>
          {isLocationLoading ? (
            <ActivityIndicator size="small" color="white" style={{ marginLeft: 4 }} />
          ) : (
            <MaterialIcons name="keyboard-arrow-down" size={24} color="white" />
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}>
            <Ionicons name="chatbubbles-outline" size={26} color="white" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.PROFILE)}>
            <MaterialIcons name="account-circle" size={30} color="white" />
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
        keyExtractor={(item, index) => String(item.id ?? `${item.type ?? "post"}_${index}`)} 
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
        onPress={() => setWriteModalVisible(true)}
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

      {/* ✅ [수정] 위치/인증/데이터 완료 전 덮는 모달 */}
      <CustomModal
        visible={locationGateVisible}
        title={gateTitle}
        message={gateMessage}
        onConfirm={handleGateConfirm}
        loading={!gateTimeoutPassed && !isPermissionIssue}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" },
  location: { color: "white", fontSize: 20, fontWeight: "bold" },
  categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333", backgroundColor: theme.background },
  categoryBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 15 },
  categoryBtnActive: { backgroundColor: theme.primary },
  categoryText: { color: "#888", fontSize: 14, fontWeight: "600" },
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
  title: { color: "white", fontSize: 16, fontWeight: "bold" },
  subInfo: { color: "grey", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center" },
  price: { color: "white", fontSize: 18, fontWeight: "bold" },
  badge: { backgroundColor: "rgba(204,255,0,0.15)", paddingHorizontal: 6, borderRadius: 4 },
  badgeText: { color: theme.primary, fontSize: 11 },
  status: { fontSize: 12, fontWeight: "bold" },
  fab: { position: "absolute", right: 20, backgroundColor: theme.primary, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 8, gap: 8 },
  selectBtnText: { fontSize: 16, fontWeight: "bold", color: "black" }
});
