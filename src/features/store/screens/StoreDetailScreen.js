// FILE: src/features/store/screens/StoreDetailScreen.js

import React, { useState, useEffect } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Linking, 
  Platform,
  Dimensions
} from "react-native";

import { Image } from "expo-image";
import ImageDetailModal from "../../../components/ImageDetailModal";


import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { deleteDoc, doc } from "firebase/firestore";

import { theme } from "../../../theme";
import { db } from "../../../firebaseConfig";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";

const { width } = Dimensions.get("window");

// ✅ 신고 사유 목록 정의
const REPORT_REASONS = [
  "부적절한 홍보물 (도박, 성인 등)",
  "허위 정보 / 사기 의심",
  "도배 및 스팸",
  "욕설 및 비방",
  "기타 사유"
];

export default function StoreDetailScreen({ route, navigation }) {
  const { store } = route.params || {};
  const insets = useSafeAreaInsets();
  
  const { user, isAdmin, reportUser } = useAppContext();

  const [loading, setLoading] = useState(false);

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // ✅ 모달 통합 관리 상태
  // type: 'alert' (단순알림), 'confirm' (삭제확인), 'report' (신고사유선택)
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert", 
    onConfirm: null,
  });

  // 데이터가 없으면 뒤로가기
  useEffect(() => {
    if (!store) {
      navigation.goBack();
    }
  }, [store]);

  if (!store) return null;

  const isOwner = user?.uid === store.ownerId;
  const canDelete = isOwner || isAdmin;

  // ✅ 헬퍼 함수: 커스텀 알림창 띄우기
  const showAlert = (title, message) => {
    setModalConfig({
      title,
      message,
      type: "alert",
      onConfirm: () => setModalVisible(false),
    });
    setModalVisible(true);
  };

  // 전화 걸기
  const handleCall = () => {
    if (store.phone) {
      Linking.openURL(`tel:${store.phone}`);
    } else {
      showAlert("알림", "등록된 전화번호가 없습니다.");
    }
  };

  // 홈페이지/배달앱 연결
  const handleLink = () => {
    if (store.homepage) {
      Linking.openURL(store.homepage).catch(() => {
        showAlert("오류", "링크를 열 수 없습니다.");
      });
    } else {
      showAlert("알림", "등록된 홈페이지가 없습니다.");
    }
  };

  // ✅ 가게 삭제 로직 (커스텀 모달 적용)
  const handleDelete = () => {
    setModalConfig({
      title: "가게 삭제",
      message: "정말로 이 가게 정보를 삭제하시겠습니까?",
      type: "confirm", // 확인/취소 버튼이 뜨는 모달
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
      // 삭제 성공 후 알림 -> 확인 누르면 뒤로가기
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

  // ✅ 신고 버튼 클릭 (사유 선택 모달 띄우기)
  const handleReportPress = () => {
    setModalConfig({
      title: "신고하기",
      message: "신고 사유를 선택해주세요.",
      type: "report", // ✅ 사유 선택용 타입
      onConfirm: null, 
    });
    setModalVisible(true);
  };

  // ✅ 실제 신고 접수 로직
  const submitReport = (reason) => {
    setModalVisible(false);
    // reportUser(targetUserId, contentId, reason, type)
    reportUser(store.ownerId, store.id, reason, "store");
  };

  // 대표 이미지
  const mainImage = (store.images && store.images.length > 0) 
    ? { uri: (typeof store.images[0] === 'string' ? store.images[0] : store.images[0]?.uri) }
    : null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* 상단 이미지 */}
        <View style={styles.imageContainer}>
          {mainImage ? (
            <TouchableOpacity 
              activeOpacity={0.9} 
              onPress={() => {
                setCurrentImageIndex(0); // 상세페이지 대표 이미지는 0번 인덱스
                setIsImageViewVisible(true);
              }}
            >
              <Image 
                source={mainImage} 
                style={styles.mainImage} 
                contentFit="cover"
                transition={200}
                cachePolicy="disk"
              />
            </TouchableOpacity>
          ) : (
            <View style={[styles.mainImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
              <MaterialIcons name="store" size={60} color="#555" />
            </View>
          )}
          
          {/* 뒤로가기 버튼 */}
          <TouchableOpacity 
            style={[styles.backBtn, { top: insets.top + 10 }]} 
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>

          {/* ✅ 신고 버튼 (본인 아니면 노출) */}
          {!isOwner && (
            <TouchableOpacity 
              style={[styles.reportBtn, { top: insets.top + 10 }]} 
              onPress={handleReportPress}
            >
              <MaterialIcons name="report-problem" size={24} color="#FF6B6B" />
            </TouchableOpacity>
          )}
        </View>

        {/* 컨텐츠 영역 */}
        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.storeName}>{store.name}</Text>
            {store.isPremium && (
              <MaterialIcons name="verified" size={20} color={theme.primary} style={{ marginLeft: 6 }} />
            )}
          </View>
          
          <Text style={styles.category}>{store.category} · {store.location?.dong || "위치 정보 없음"}</Text>

          {/* 전화/링크 버튼 */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <MaterialIcons name="call" size={20} color="black" />
              <Text style={styles.actionBtnText}>전화하기</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#333' }]} onPress={handleLink}>
              <MaterialIcons name="link" size={20} color="white" />
              <Text style={[styles.actionBtnText, { color: 'white' }]}>홈페이지/배달</Text>
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

          {/* 삭제 버튼 (관리자/본인) */}
          {canDelete && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <MaterialIcons name="delete-outline" size={20} color={theme.danger} />
              <Text style={styles.deleteBtnText}>이 가게 삭제하기</Text>
            </TouchableOpacity>
          )}

        </View>
      </ScrollView>

      {/* ✅ 통합 커스텀 모달 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)} // 취소 버튼용
        // confirm 타입일 때만 취소 버튼 보이기
        type={modalConfig.type === "confirm" ? "confirm" : "alert"} 
      >
        {/* ✅ 신고 사유 선택 UI (type이 report일 때만 렌더링) */}
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
  
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  reportBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  contentContainer: {
    padding: 20,
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24, 
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
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

  deleteBtn: {
    marginTop: 40,
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

  // ✅ 신고 사유 버튼 스타일
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
});