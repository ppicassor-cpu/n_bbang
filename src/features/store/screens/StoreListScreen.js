// FILE: src/features/store/screens/StoreListScreen.js

import React, { useState, useEffect, useMemo, useCallback } from "react";
// ✅ [수정] react-native의 Image 대신 expo-image 사용
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons"; 
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";

// ✅ 리스트 아이템 컴포넌트 (최적화)
const StoreItem = React.memo(({ item, onPress }) => {
  // 이미지가 있으면 첫 번째 것 사용, 없으면 기본 아이콘
  const imageSource = item.images && item.images.length > 0
    ? { uri: (typeof item.images[0] === 'string' ? item.images[0] : item.images[0]?.uri) }
    : null;

  return (
    <TouchableOpacity 
      style={styles.card} 
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.imageBox}>
        {imageSource ? (
          <Image 
            source={imageSource} 
            style={styles.image} 
            // ✅ [수정] expo-image 속성 적용 (캐싱 및 부드러운 전환)
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />
        ) : (
          <MaterialIcons name="storefront" size={40} color="grey" />
        )}
      </View>

      <View style={styles.infoBox}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title || item.storeName}</Text>
          {item.isPremiumStore && (
            <MaterialIcons name="verified" size={16} color={theme.primary} style={{ marginLeft: 4 }} />
          )}
        </View>
        
        <Text style={styles.subInfo} numberOfLines={1}>
          {item.category || "기타"} · {item.location}
        </Text>
        
        {/* 거리 표시 */}
        <View style={styles.bottomRow}>
          <View style={styles.badge}>
            <Ionicons name="location-sharp" size={12} color={theme.primary} />
            <Text style={styles.distText}>{item.distText || "거리 계산 중"}</Text>
          </View>
          
          {/* 평점이나 리뷰 수가 있다면 표시 (예시) */}
          {item.rating > 0 && (
            <View style={[styles.badge, { backgroundColor: '#333', marginLeft: 6 }]}>
              <MaterialIcons name="star" size={12} color="#FFD700" />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>

      <MaterialIcons name="chevron-right" size={24} color="#444" />
    </TouchableOpacity>
  );
});

export default function StoreListScreen({ navigation }) {
  const { 
    user, 
    stores, // ✅ AppContext에서 가게 목록(stores)을 가져온다고 가정 (없으면 posts에서 필터링)
    posts,  // (만약 stores가 따로 없고 posts 안에 섞여 있다면 이걸 씁니다)
    isAdmin, // ✅ 관리자 권한 확인
    currentLocation, 
    myCoords, 
    getDistanceFromLatLonInKm, 
    loadMoreStores, // ✅ 가게 목록 더 불러오기 함수 (없으면 loadMorePosts 사용)
    checkHotplaceEligibility,
    purchaseHotplaceExtra,
    isPremium
  } = useAppContext();
  
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  // 핫플레이스 등록 관련 모달 상태
  const [hotplaceModalVisible, setHotplaceModalVisible] = useState(false);
  const [hotplaceModalType, setHotplaceModalType] = useState(null);
  const [hotplaceModalLoading, setHotplaceModalLoading] = useState(false);

  // ✅ 라우트 상수
  const MEMBERSHIP_ROUTE = ROUTES?.MEMBERSHIP || ROUTES?.PREMIUM || ROUTES?.SUBSCRIPTION || ROUTES?.PROFILE;
  const HOTPLACE_WRITE_ROUTE = ROUTES?.STORE_WRITE || ROUTES?.HOTPLACE_WRITE || ROUTES?.STORE_WRITE_SCREEN;

  // =================================================================
  // 1. 데이터 가공 및 필터링 (관리자 권한 & 거리 계산 적용)
  // =================================================================
  const formattedStores = useMemo(() => {
    // Context에 stores가 없으면 posts에서 '핫플레이스' 카테고리만 추출해서 사용
    const sourceData = (stores && stores.length > 0) ? stores : (posts || []).filter(p => p.type === 'store');

    if (!sourceData) return [];

    // ✅ [추가] stores 원본 필드(location: {lat,lng} / address / name 등)와 화면에서 기대하는 필드(title/location(string)/coords)를 useMemo 내부에서만 정규화
    const normalized = (sourceData || []).map((item) => {
      const hasLatLngObj =
        item?.location &&
        typeof item.location === "object" &&
        item.location !== null &&
        typeof item.location.latitude === "number" &&
        typeof item.location.longitude === "number";

      const coords = item?.coords || (hasLatLngObj ? item.location : null);

      const displayLocation =
        typeof item?.location === "string"
          ? item.location
          : (item?.address || "위치 정보 없음");

      const title = item?.title || item?.name || item?.storeName;

      return {
        ...item,
        type: item?.type || "store",
        title,
        storeName: item?.storeName || item?.name,
        location: displayLocation,
        coords: coords || item?.coords,
      };
    });

    const processed = normalized.reduce((acc, item) => {
      // 내 위치나 가게 위치 정보가 없으면 목록 뒤쪽으로 보내거나(거리 표시X) 처리
      if (!myCoords || !item.coords) {
         acc.push({ ...item, distText: "", distVal: 99999 });
         return acc;
      }

      // 거리 계산
      const dist = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );

      // ✅ [핵심] 관리자(isAdmin)이거나, ownerIsAdmin이면 거리 무제한, 아니면 10km 이내만 표시
      if (isAdmin || item.ownerIsAdmin || dist <= 10) {
        acc.push({ 
          ...item, 
          distText: `${dist.toFixed(1)}km`, 
          distVal: dist 
        });
      }
      return acc;
    }, []);

    // 거리순 정렬 (가까운 순)
    return processed.sort((a, b) => a.distVal - b.distVal);

  }, [stores, posts, myCoords, isAdmin]); // isAdmin이 바뀌면 목록도 바뀜

  // =================================================================
  // 2. 핫플레이스 등록 로직 (HomeScreen과 동일하게 적용)
  // =================================================================
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

  const handleRegisterPress = async () => {
    // 1. 프리미엄 유저면 즉시 통과
    if (user && isPremium) {
       goHotplaceWrite({ paymentType: "membership", purchaseInfo: null });
       return;
    }

    // 2. 자격 확인 로직
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

  // =================================================================
  // 3. UI 렌더링
  // =================================================================
  const renderItem = useCallback(({ item }) => {
    return (
      <StoreItem 
        item={item} 
        onPress={() => navigation.navigate(ROUTES.STORE_DETAIL || "StoreDetail", { store: item })} 
      />
    );
  }, [navigation]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (loadMoreStores) {
      await loadMoreStores();
    }
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>핫플레이스</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="location-sharp" size={14} color="#888" />
            <Text style={styles.headerLocation}>
              {currentLocation} {isAdmin ? "(관리자 모드: 거리 무제한)" : "(반경 10km)"}
            </Text>
          </View>
        </View>
        {/* 우측 상단 아이콘 등 필요시 추가 */}
      </View>

      {/* 리스트 */}
      <FlatList
        data={formattedStores}
        renderItem={renderItem}
        keyExtractor={(item) => item.id || Math.random().toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />} // 카드 간격
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome5 name="store-alt-slash" size={50} color="#333" />
            <Text style={styles.emptyText}>근처에 등록된 핫플레이스가 없습니다.</Text>
            {isAdmin && <Text style={{color: theme.primary, marginTop: 8}}>관리자님, 직접 등록해보세요!</Text>}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="white" />
        }
      />

      {/* 등록 버튼 (FAB) */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: 20 + insets.bottom }]} 
        onPress={handleRegisterPress}
        activeOpacity={0.8}
      >
        <MaterialIcons name="add-business" size={28} color="black" />
        <Text style={styles.fabText}>가게 등록</Text>
      </TouchableOpacity>

      {/* 모달 (결제/알림용) */}
      <CustomModal
        visible={hotplaceModalVisible}
        title={
          hotplaceModalType === "NOT_PREMIUM" ? "프리미엄 전용" :
          hotplaceModalType === "NEED_PURCHASE" ? "추가 등록 결제" :
          hotplaceModalType === "PAYMENT_FAILED" ? "결제 실패" : "알림"
        }
        message={
          hotplaceModalType === "NOT_PREMIUM" ? "핫플레이스 등록은 프리미엄 회원만 가능합니다." :
          hotplaceModalType === "NEED_PURCHASE" ? "이번 달 무료 등록 횟수를 모두 사용했습니다.\n추가 등록하시겠습니까?" :
          hotplaceModalType === "PAYMENT_FAILED" ? "결제에 실패했습니다." :
          "처리 중 문제가 발생했습니다."
        }
        onConfirm={() => {}}
      >
        <View style={{ gap: 12 }}>
          {hotplaceModalType === "NOT_PREMIUM" && (
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                closeHotplaceModal();
                navigation.navigate(MEMBERSHIP_ROUTE);
              }}
            >
              <Text style={styles.modalBtnText}>멤버십 가입하기</Text>
            </TouchableOpacity>
          )}

          {hotplaceModalType === "NEED_PURCHASE" && (
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.primary }]}
              onPress={handlePurchaseHotplaceExtra}
              disabled={hotplaceModalLoading}
            >
              {hotplaceModalLoading ? (
                 <ActivityIndicator color="black" />
              ) : (
                 <Text style={styles.modalBtnText}>결제하기</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={{ marginTop: 10, alignItems: "center", padding: 10 }}
            onPress={closeHotplaceModal}
          >
            <Text style={{ color: "#888", fontWeight: "bold" }}>닫기</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { 
    paddingHorizontal: 20, 
    paddingVertical: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#222',
    backgroundColor: theme.background,
  },
  headerTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  headerLocation: { color: '#888', fontSize: 13, marginLeft: 4 },

  // 카드 스타일
  card: { 
    flexDirection: 'row', 
    backgroundColor: theme.cardBg, 
    borderRadius: 16, 
    padding: 12, 
    alignItems: 'center',
    marginBottom: 4,
  },
  imageBox: { 
    width: 80, 
    height: 80, 
    borderRadius: 12, 
    backgroundColor: '#222', 
    alignItems: 'center', 
    justifyContent: 'center', 
    overflow: 'hidden',
    marginRight: 16 
  },
  image: { width: '100%', height: '100%' },
  
  infoBox: { flex: 1, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold', flexShrink: 1 },
  subInfo: { color: '#888', fontSize: 13, marginBottom: 8 },
  
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  badge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(204,255,0,0.1)', 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4 
  },
  distText: { color: theme.primary, fontSize: 11, fontWeight: 'bold', marginLeft: 3 },
  ratingText: { color: 'white', fontSize: 11, fontWeight: 'bold', marginLeft: 3 },

  // Empty State
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, padding: 20 },
  emptyText: { color: '#666', fontSize: 15, marginTop: 16, textAlign: 'center' },

  // FAB (등록 버튼)
  fab: { 
    position: 'absolute', 
    right: 20, 
    backgroundColor: theme.primary, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  fabText: { color: 'black', fontWeight: 'bold', fontSize: 15, marginLeft: 8 },

  // 모달 버튼
  modalBtn: { 
    paddingVertical: 14, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  modalBtnText: { fontSize: 16, fontWeight: 'bold', color: 'black' }
});
