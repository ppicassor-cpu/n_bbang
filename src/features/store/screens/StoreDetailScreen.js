// FILE: src/features/store/screens/StoreDetailScreen.js 

import React, { useState, useEffect, useCallback } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Linking, 
  Dimensions,
  ActivityIndicator
} from "react-native";
import { useFocusEffect } from "@react-navigation/native"; // ✅ [추가] 화면 포커스 감지

import { Image } from "expo-image";
import ImageDetailModal from "../../../components/ImageDetailModal";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { deleteDoc, doc, getDoc } from "firebase/firestore"; // ✅ [추가] getDoc

import { theme } from "../../../theme";
import { db } from "../../../firebaseConfig";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import { ROUTES } from "../../../app/navigation/routes"; 

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const REPORT_REASONS = [
  "부적절한 홍보물 (도박, 성인 등)",
  "허위 정보 / 사기 의심",
  "도배 및 스팸",
  "욕설 및 비방",
  "기타 사유"
];

export default function StoreDetailScreen({ route, navigation }) {
  // ✅ [수정] 초기 데이터는 params에서 받지만, 화면 표시는 state로 관리
  const initialStore = route.params?.store || {};
  const [store, setStore] = useState(initialStore);

  const insets = useSafeAreaInsets();
  const { user, isAdmin, reportUser, checkBoostEligibility, applyBoostToContent, clearExpiredActiveBoostIfNeeded } = useAppContext();

  const [loading, setLoading] = useState(false);
  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert", 
    onConfirm: null,
  });

  // ✅ [추가] 부스트 모달/로딩 상태
  const [boostModalVisible, setBoostModalVisible] = useState(false);
  const [boostLoading, setBoostLoading] = useState(false);

  // ✅ [핵심 수정] 화면에 들어올 때마다 최신 데이터 새로고침
  useFocusEffect(
    useCallback(() => {
      const fetchLatestData = async () => {
        if (!initialStore?.id) return;
        try {
          const docRef = doc(db, "stores", initialStore.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            // 기존 데이터에 최신 데이터 덮어쓰기
            setStore({ id: docSnap.id, ...docSnap.data() });
          } else {
            // 삭제된 경우 처리
            navigation.goBack();
          }
        } catch (e) {
          console.error("데이터 새로고침 실패:", e);
        }
      };

      fetchLatestData();
    }, [initialStore?.id])
  );

  useEffect(() => {
    if (!store || !store.id) {
      navigation.goBack();
    }
  }, [store]);

  if (!store || !store.id) return null;

  const isOwner = user?.uid === store.ownerId;
  const canDelete = isOwner || isAdmin;

  const showAlert = (title, message) => {
    setModalConfig({
      title,
      message,
      type: "alert",
      onConfirm: () => setModalVisible(false),
    });
    setModalVisible(true);
  };

  const handleCall = () => {
    if (store.phone) {
      Linking.openURL(`tel:${store.phone}`);
    } else {
      showAlert("알림", "등록된 전화번호가 없습니다.");
    }
  };

  const handleLink = () => {
    if (store.homepage) {
      Linking.openURL(store.homepage).catch(() => {
        showAlert("오류", "링크를 열 수 없습니다.");
      });
    } else {
      showAlert("알림", "등록된 홈페이지가 없습니다.");
    }
  };

  const handleEdit = () => {
    navigation.navigate(ROUTES.STORE_WRITE || "StoreWrite", { 
      mode: "edit", 
      storeData: store // 최신 store 상태 전달
    });
  };

  const handleDelete = () => {
    setModalConfig({
      title: "가게 삭제",
      message: "정말로 이 가게 정보를 삭제하시겠습니까?",
      type: "confirm", 
      onConfirm: confirmDelete,
    });
    setModalVisible(true);
  };

  const confirmDelete = async () => {
    setModalVisible(false);
    if (loading) return;
    setLoading(true);

    try {
      await deleteDoc(doc(db, "stores", store.id));
      setModalConfig({
        title: "삭제 완료",
        message: "가게 정보가 삭제되었습니다.",
        type: "alert",
        onConfirm: () => {
          setModalVisible(false);
          navigation.goBack();
        }
      });
      setModalVisible(true);
    } catch (e) {
      console.error(e);
      showAlert("오류", "삭제 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleReportPress = () => {
    setModalConfig({
      title: "신고하기",
      message: "신고 사유를 선택해주세요.",
      type: "report", 
      onConfirm: null, 
    });
    setModalVisible(true);
  };

  const submitReport = (reason) => {
    setModalVisible(false);
    reportUser(store.ownerId, store.id, reason, "store");
  };

  /* =========================
      Boost(부스트) - Store
  ========================= */

  const _toMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const _isBoostActive = () => _toMs(store?.boostUntil) > Date.now();

  const openBoostModal = async () => {
    if (!isOwner) {
      showAlert("알림", "내 가게만 부스트할 수 있습니다.");
      return;
    }

    if (_isBoostActive()) {
      showAlert("알림", "이미 부스트가 진행 중인 가게입니다.");
      return;
    }

    try {
      if (clearExpiredActiveBoostIfNeeded) {
        await clearExpiredActiveBoostIfNeeded();
      }
    } catch {}

    if (_isBoostActive()) {
      showAlert("알림", "이미 부스트가 진행 중인 가게입니다.");
      return;
    }

    setBoostModalVisible(true);
  };

  const _boostErrorMessage = (elig) => {
    const status = String(elig?.status || elig?.code || "");
    if (status === "HAS_ACTIVE_BOOST") return "이미 진행 중인 부스트가 있습니다. (동시에 1개만 가능)";
    if (status === "NOT_OWNER") return "내 가게만 부스트할 수 있습니다.";
    if (status === "NEED_PURCHASE") return "부스트 결제가 필요합니다.";

    // ✅ 줄바꿈(\n) 안 먹는 CustomModal 대비: 구분점으로 3줄 느낌
    const reason = String(elig?.reason || elig?.message || "");
    const codePart = status ? ` · 코드: ${status}` : " · 코드: UNKNOWN";
    const reasonPart = reason ? ` · 사유: ${reason}` : "";

    return `부스트 조건을 만족하지 않습니다.${codePart}${reasonPart}`;
  };

  const runBoost = async (mode) => {
    if (!store?.id) return;

    if (!isOwner) {
      setBoostModalVisible(false);
      showAlert("알림", "내 가게만 부스트할 수 있습니다.");
      return;
    }

    if (_isBoostActive()) {
      setBoostModalVisible(false);
      showAlert("알림", "이미 부스트가 진행 중인 가게입니다.");
      return;
    }

    if (typeof checkBoostEligibility !== "function" || typeof applyBoostToContent !== "function") {
      setBoostModalVisible(false);
      showAlert("오류", "부스트 기능이 아직 준비되지 않았습니다.");
      return;
    }

    setBoostLoading(true);
    try {
      const elig = await checkBoostEligibility({
        contentType: "store",
        contentId: store.id,
        ownerId: store.ownerId, // ✅ [추가] 체크 로직에서 필요할 수 있어 전달
        mode,
      });

      if (!elig?.ok) {
        setBoostModalVisible(false);
        showAlert("알림", _boostErrorMessage(elig));
        return;
      }

      const res = await applyBoostToContent({
        contentType: "store",
        contentId: store.id,
        mode,
        durationHours: 24 * 30,
      });

      if (res?.ok) {
        const fallbackUntil = Date.now() + 24 * 30 * 60 * 60 * 1000;
        const nextBoostUntil = res?.boostUntil ?? res?.data?.boostUntil ?? fallbackUntil;
        const nextBoostAppliedAt = res?.boostAppliedAt ?? res?.data?.boostAppliedAt ?? Date.now();

        setStore((prev) => ({
          ...prev,
          boostUntil: nextBoostUntil,
          boostAppliedAt: nextBoostAppliedAt,
        }));

        setBoostModalVisible(false);
        showAlert("알림", "부스트가 적용되었습니다. (1개월)");
        return;
      }

      setBoostModalVisible(false);
      showAlert("오류", "부스트 적용에 실패했습니다.");
    } catch (e) {
      console.warn("runBoost 실패:", e);
      setBoostModalVisible(false);
      showAlert("오류", "부스트 처리 중 오류가 발생했습니다.");
    } finally {
      setBoostLoading(false);
    }
  };

  const images = store.images && store.images.length > 0 ? store.images : [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        
        <View style={styles.imageContainer}>
          {images.length > 0 ? (
            <ScrollView 
              horizontal 
              pagingEnabled 
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              style={{ width: SCREEN_WIDTH, height: 250 }}
            >
              {images.map((img, index) => {
                const uri = typeof img === 'string' ? img : img?.uri;
                return (
                  <TouchableOpacity 
                    key={index}
                    activeOpacity={0.9} 
                    onPress={() => {
                      setCurrentImageIndex(index);
                      setIsImageViewVisible(true);
                    }}
                    style={{ width: SCREEN_WIDTH, height: 250 }}
                  >
                    <Image 
                      source={{ uri }} 
                      style={styles.mainImage} 
                      contentFit="cover"
                      transition={200}
                      cachePolicy="disk"
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={[styles.mainImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
              <MaterialIcons name="store" size={60} color="#555" />
            </View>
          )}

          {images.length > 1 && (
            <View style={styles.imageCountBadge}>
              <Text style={styles.imageCountText}>
                 사진 옆으로 넘겨보기 <MaterialIcons name="arrow-forward" size={10} color="white"/>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.contentContainer}>
          
          <View style={styles.headerRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.isPremium && (
                <MaterialIcons name="verified" size={20} color={theme.primary} style={{ marginLeft: 6 }} />
              )}
            </View>

            {!isOwner && (
              <TouchableOpacity onPress={handleReportPress} style={{ padding: 4 }}>
                <MaterialIcons name="more-vert" size={24} color="white" />
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.category}>
            {store.category} · {store.location?.dong || store.region_2depth_name || "위치 인증됨"}
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <MaterialIcons name="call" size={20} color="black" />
              <Text style={styles.actionBtnText}>전화하기</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#333' }]} onPress={handleLink}>
              <MaterialIcons name="link" size={20} color="white" />
              <Text style={[styles.actionBtnText, { color: 'white' }]}>홈페이지</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>업체 소개</Text>
          <Text style={styles.description}>{store.description}</Text>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>위치</Text>
          <Text style={styles.addressText}>{store.address || "상세 주소 정보 없음"}</Text>
          
          {store.location && store.location.latitude && (
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: store.location.latitude,
                  longitude: store.location.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <Marker 
                  coordinate={{
                    latitude: store.location.latitude,
                    longitude: store.location.longitude,
                  }}
                />
              </MapView>
            </View>
          )}

          {canDelete && (
            <View style={styles.ownerBtnRow}>
              {isOwner && (
                <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
                  <MaterialIcons name="edit" size={20} color="white" />
                  <Text style={styles.editBtnText}>정보 수정</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <MaterialIcons name="delete-outline" size={20} color={theme.danger} />
                <Text style={styles.deleteBtnText}>삭제하기</Text>
              </TouchableOpacity>
            </View>
          )}

          {isOwner && (
            <View style={styles.boostRow}>
              <TouchableOpacity
                style={styles.boostBtn}
                onPress={openBoostModal}
                disabled={boostLoading || _isBoostActive()}
              >
                {boostLoading ? (
                  <ActivityIndicator size="small" color="black" />
                ) : (
                  <Text style={styles.boostBtnText}>
                    {_isBoostActive() ? "🚀 부스트중" : "🚀 부스트(1개월)"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>

      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)} 
        type={modalConfig.type === "confirm" ? "confirm" : "alert"} 
      >
        {modalConfig.type === "report" && (
          <View style={{ gap: 10, width: '100%', marginTop: 10 }}>
            {REPORT_REASONS.map((reason, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.reasonBtn}
                onPress={() => submitReport(reason)}
              >
                <Text style={styles.reasonText}>{reason}</Text>
                <MaterialIcons name="chevron-right" size={20} color="#666" />
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity
              style={{ marginTop: 10, alignItems: "center", padding: 10 }}
              onPress={() => setModalVisible(false)}
            >
              <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
            </TouchableOpacity>
          </View>
        )}
      </CustomModal>

      <CustomModal
        visible={boostModalVisible}
        title="🚀 부스트"
        message="부스트 방식을 선택해주세요."
        onCancel={() => setBoostModalVisible(false)}
        onConfirm={() => setBoostModalVisible(false)}
      >
        <View style={{ gap: 10, width: '100%', marginTop: 10 }}>
          <TouchableOpacity
            style={styles.boostOptionBtn}
            onPress={() => runBoost("paid")}
            disabled={boostLoading}
          >
            <Text style={styles.boostOptionText}>핫스토어 부스트 (1개월)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boostOptionBtn, { backgroundColor: "#333" }]}
            onPress={() => setBoostModalVisible(false)}
            disabled={boostLoading}
          >
            <Text style={[styles.boostOptionText, { color: "#BBB" }]}>닫기</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      <ImageDetailModal
        visible={isImageViewVisible}
        images={store.images}
        index={currentImageIndex}
        onClose={() => setIsImageViewVisible(false)}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  imageContainer: { width: '100%', height: 250, position: 'relative' },
  mainImage: { width: '100%', height: '100%' },
  imageCountBadge: {
    position: 'absolute',
    bottom: 30,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  imageCountText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  contentContainer: {
    padding: 20,
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24, 
  },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: 4 
  },
  storeName: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  category: { fontSize: 14, color: '#888', marginBottom: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    height: 48,
    backgroundColor: theme.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: { fontSize: 15, fontWeight: 'bold', color: 'black' },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 12 },
  description: { fontSize: 15, color: '#CCC', lineHeight: 24 },
  addressText: { fontSize: 15, color: '#CCC', marginBottom: 12 },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  map: { flex: 1 },
  ownerBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 40,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 12,
    backgroundColor: '#333',
    gap: 8,
  },
  editBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: theme.danger,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    gap: 8,
  },
  deleteBtnText: { color: theme.danger, fontWeight: 'bold', fontSize: 15 },
  reasonBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#222",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333"
  },
  reasonText: { color: "white", fontSize: 14 },

  boostRow: {
    marginTop: 12,
  },
  boostBtn: {
    width: "100%",
    height: 52,
    backgroundColor: theme.primary,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  boostBtnText: { fontSize: 15, fontWeight: "bold", color: "black" },
  boostOptionBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#444",
  },
  boostOptionText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
});
