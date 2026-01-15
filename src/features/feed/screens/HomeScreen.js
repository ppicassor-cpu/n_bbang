// FILE: src/features/feed/screens/HomeScreen.js

import React, { useState, useEffect } from "react";
// ✅ [필수] 화면 표시용 컴포넌트들
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons"; 
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import { checkAndGenerateSamples } from "../../../utils/autoSampleGenerator";

const CATEGORIES = ["전체", "마트/식품", "생활용품", "핫플레이스", "무료나눔"];

export default function HomeScreen({ navigation }) {
  const { 
    posts, 
    currentLocation, 
    myCoords, 
    getDistanceFromLatLonInKm, 
    loadMorePosts,
    verifyLocation,
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

  const MEMBERSHIP_ROUTE =
    ROUTES?.MEMBERSHIP ||
    ROUTES?.PREMIUM ||
    ROUTES?.SUBSCRIPTION ||
    ROUTES?.PROFILE;

  const HOTPLACE_WRITE_ROUTE =
    ROUTES?.STORE_WRITE ||
    ROUTES?.HOTPLACE_WRITE ||
    ROUTES?.STORE_WRITE_SCREEN;

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

  // ✅ [복구완료] 위치 갱신 핸들러
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

  // ✅ [복구완료] 앱이 켜지자마자(마운트 될 때) 자동으로 위치 찾기 실행
  useEffect(() => {
    handleRefreshLocation();
  }, []);

  // ✅ 좌표가 잡히면 샘플 데이터 생성 체크
  useEffect(() => {
    if (myCoords && myCoords.latitude) {
      checkAndGenerateSamples(myCoords);
    }
  }, [myCoords]);

  /* =========================
      1시간 부스트 최상단 정렬 로직
   ========================= */
  const now = Date.now();

  const boostedPosts = [];
  const normalPosts = [];

  posts.forEach((post) => {
    if (post.boostUntil && new Date(post.boostUntil).getTime() > now) {
      boostedPosts.push(post);
    } else {
      normalPosts.push(post);
    }
  });

  const sortedPosts = [...boostedPosts, ...normalPosts];

  const filteredPosts = sortedPosts.filter(post => {
    if (!myCoords || !post.coords) return true;

    const dist = getDistanceFromLatLonInKm(
      myCoords.latitude, myCoords.longitude,
      post.coords.latitude, post.coords.longitude
    );
    if (dist > 5) return false;

    if (selectedCategory !== "전체" && post.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  const renderItem = ({ item }) => {
    const isFree = item.category === "무료나눔";

    const isNbbangClosed = !isFree && item.status === "마감";
    const isFull = !isFree && (item.currentParticipants >= item.maxParticipants || isNbbangClosed);
    const isClosed = isFree && item.status === "나눔완료";

    let distText = "";
    if (myCoords && item.coords) {
      const d = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );
      distText = `  ${d.toFixed(1)}km`;
    }

    const finalPerPerson = !isFree
      ? Number(item.pricePerPerson || 0) + Number(item.tip || 0)
      : 0;

    // ✅ [수정] 이미지 URI 안전 처리 (문자열/객체 구분)
    const imageSource = item.images && item.images.length > 0
      ? { uri: (typeof item.images[0] === 'string' ? item.images[0] : item.images[0]?.uri) }
      : null;

    return (
      <TouchableOpacity 
        style={[styles.card, isClosed && { opacity: 0.6 }]} 
        activeOpacity={0.7}
        onPress={() => {
          if (item.category === "무료나눔") {
            navigation.navigate(ROUTES.FREE_DETAIL, { post: item });
          } else {
            navigation.navigate(ROUTES.DETAIL, { post: item });
          }
        }}
      >
        <View style={styles.imageBox}>
          {imageSource ? (
            <Image 
              source={imageSource} 
              style={styles.image} 
              resizeMode="cover"
            />
          ) : (
            <MaterialIcons name="receipt-long" size={40} color="grey" />
          )}
          {(isClosed || isFull) && (
            <View style={styles.closedOverlay}>
              <Text style={styles.closedOverlayText}>{isClosed ? "나눔완료" : "마감"}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.subInfo}>{item.location}  {item.category}{distText}</Text>

          <View style={styles.row}>
            <Text style={[styles.price, isClosed && { color: "grey" }]}>{isFree ? "무료" : `${finalPerPerson.toLocaleString()}원`}</Text>
            {item.tip > 0 && !isFree && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>수고비 포함</Text>
              </View>
            )}
          </View>

          <Text
            style={[styles.status, { color: (isFull || isClosed) ? theme.danger : theme.primary }]}
          >
            {isFree 
              ? (item.status || "나눔중")
              : (isNbbangClosed ? "참여마감" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ✅ 화면 새로고침 기능
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMorePosts(); 
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={handleRefreshLocation} 
          style={{ flexDirection: "row", alignItems: "center" }}
          activeOpacity={0.7}
        >
          <Text style={styles.location}>{currentLocation} </Text>
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

      {/* 카테고리 탭 */}
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
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 게시글 리스트 */}
      <FlatList
        data={filteredPosts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id || Math.random().toString()} // ✅ 키 안전 처리
        // ✅ [수정] 하단 여백 확보 (FAB 가림 방지)
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "#333", marginVertical: 16 }} />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Text style={{ color: "grey" }}>해당 카테고리의 글이 없습니다.</Text>
          </View>
        }
        onEndReached={() => {
          if (selectedCategory === "전체") {
            loadMorePosts();
          }
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={6}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />

      {/* 글쓰기 버튼 */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: 20 + insets.bottom }]} 
        onPress={() => setWriteModalVisible(true)}
      >
        <MaterialIcons name="post-add" size={30} color="black" />
      </TouchableOpacity>

      {/* 글쓰기 선택 모달 */}
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
            <Text style={[styles.selectBtnText, { color: "white" }]}>핫플레이스 등록</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={{ marginTop: 10, alignItems: "center", padding: 10 }}
            onPress={() => setWriteModalVisible(false)}
          >
            <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* 핫플레이스 권한/결제 모달 */}
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
            ? "핫플레이스 등록은 프리미엄 회원만 가능합니다."
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
  
  // ✅ [수정] 카드 스타일 보완 (배경색, 둥글기 등)
  card: { 
    flexDirection: "row", 
    backgroundColor: theme.cardBg, // 배경색 추가
    borderRadius: 16, // 둥글기 추가
    padding: 12, // 내부 여백 추가
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
