// FILE: src/features/post/screens/DetailScreen.js

import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";
import CustomModal from "../../../components/CustomModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ✅ 신고 사유 목록 정의
const REPORT_REASONS = [
  "광고 / 홍보성 게시글",
  "거래 금지 품목",
  "사기 / 허위 정보",
  "욕설 / 비하 발언",
  "기타 부적절한 내용"
];

export default function DetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params || {};
  const { user, deletePost, posts, updatePost, reportUser, blockUser } = useAppContext(); 
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState(initialPost || null);
  const [imgPage, setImgPage] = useState(1);
  
  // 기존 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  // 신고, 차단, 샘플 데이터 안내용 모달 상태
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState(""); 
  const [loading, setLoading] = useState(false);

  // ✅ 신고 완료 후 홈 이동 플래그
  const [goHomeAfterSuccess, setGoHomeAfterSuccess] = useState(false);

  // ✅ 무료나눔 분기
  const isFree = post?.category === "무료나눔";

  // ✅ [수정] useMemo를 return문 위로 올림 (Hooks 순서 에러 해결)
  const mapRegion = useMemo(() => ({
    latitude: post?.coords?.latitude || 37.5665,
    longitude: post?.coords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  }), [post]);

  useEffect(() => {
    if (!initialPost?.id) return;
    const updated = posts.find(p => p.id === initialPost.id);
    if (updated) {
      setPost(updated);
      setTempStatus(updated.status || "모집중");
    }
  }, [posts, initialPost?.id]);

  // ✅ 무료나눔 글이 이 화면으로 들어오면 무료나눔 상세로 리다이렉트
  useEffect(() => {
    if (post?.category === "무료나눔") {
      navigation.replace(ROUTES.FREE_DETAIL, { post });
    }
  }, [post?.category, post, navigation]);

  // ❌ [주의] 이 return 문이 Hooks보다 아래에 있어야 함
  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  // ✅ 무료나눔은 이 화면에서 렌더하지 않음(리다이렉트 중 화면 깜빡임 방지)
  if (isFree) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="small" color="white" />
      </View>
    );
  }

  const isMyPost = user && user.uid === post.ownerId;
  const isClosed = post.status === "마감";
  const isFull = post.currentParticipants >= post.maxParticipants || isClosed;

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = () => {
    // 샘플 데이터인지 확인하여 커스텀 모달 띄우기
    if (post.ownerId === "SAMPLE_DATA") {
      setSampleModalVisible(true);
      return;
    }

    if (isFull) return;
    ensureRoom(roomId, roomName, "group", post.ownerId).catch(() => {});
    navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName });
  };

  const handleEdit = () => {
    navigation.navigate(ROUTES.WRITE, { post });
  };

  const handleStatusUpdate = async () => {
    setLoading(true);
    try {
      await updatePost(post.id, { 
        status: tempStatus,
        updatedAt: new Date().toISOString() 
      });
      setIsDropdownOpen(false);
      setAlertMsg("모집 상태가 성공적으로 변경되었습니다.");
      setSuccessModalVisible(true);
    } catch (error) {
      setAlertMsg("상태 변경에 실패했습니다.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePost(post.id);
      setDeleteModalVisible(false); 
      navigation.goBack();
    } catch (error) {
      setDeleteModalVisible(false);
      setAlertMsg("삭제 중 오류가 발생했습니다.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // 신고 핸들러
  const handleReport = () => {
    setIsDropdownOpen(false);
    setReportModalVisible(true);
  };

  // ✅ 신고 확정 처리
  const confirmReport = async (selectedReason) => {
    try {
      await reportUser(post.ownerId, post.id, selectedReason, "post", true);
      await blockUser(post.ownerId, true);
    } catch (e) {
      console.warn("report/block failed:", e);
    } finally {
      setReportModalVisible(false);
      setGoHomeAfterSuccess(true);
      setAlertMsg("신고가 접수되었습니다. 검토 후 조치하겠습니다.");
      setSuccessModalVisible(true);
    }
  };

  // 차단 핸들러
  const handleBlock = () => {
    setIsDropdownOpen(false);
    setBlockModalVisible(true);
  };

  // 차단 확정 처리
  const confirmBlock = async () => {
    await blockUser(post.ownerId);
    setBlockModalVisible(false);
    navigation.goBack();
  };

  const handleScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setImgPage(Math.round(index) + 1);
  };

  const finalPerPerson = Number(post.pricePerPerson || 0) + Number(post.tip || 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* 이미지 섹션 */}
        <View style={styles.heroContainer}>
          {post.images && post.images.length > 0 ? (
            <>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>
                {post.images.map((img, idx) => (
                  <Image key={idx} source={{ uri: (typeof img === "string" ? img : img.uri) }} style={styles.heroImage} />
                ))}
              </ScrollView>
              <View style={styles.pageIndicator}>
                <Text style={styles.pageText}>{imgPage} / {post.images.length}</Text>
              </View>
            </>
          ) : (
            <View style={[styles.heroImage, { justifyContent: "center", alignItems: "center", backgroundColor: "#222" }]}>
              <Text style={{ color: "grey" }}>이미지 없음</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{post.title}</Text>
            
            <View style={styles.dropdownContainer}>
              {isMyPost ? (
                <TouchableOpacity 
                  style={[styles.statusBtn, isFull && { borderColor: theme.danger }]}
                  onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <Text style={[styles.statusBtnText, isFull && { color: theme.danger }]}>
                    {post.status || "모집중"}
                  </Text>
                  <MaterialIcons name={isDropdownOpen ? "arrow-drop-up" : "arrow-drop-down"} size={20} color="white" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={{ padding: 5 }} onPress={() => setIsDropdownOpen(!isDropdownOpen)}>
                  <MaterialIcons name="more-vert" size={24} color="#888" />
                </TouchableOpacity>
              )}

              {/* 드롭다운 메뉴 */}
              {isDropdownOpen && (
                <View style={[styles.dropdownMenu, !isMyPost && { width: 160 }]}>
                  {isMyPost ? (
                    // 1. 내 글일 때: 상태 변경
                    <>
                      {["모집중", "마감"].map((s) => (
                        <TouchableOpacity key={s} style={styles.menuItem} onPress={() => setTempStatus(s)}>
                          <Text style={[styles.menuText, tempStatus === s && { color: theme.primary }]}>{s}</Text>
                          {tempStatus === s && <MaterialIcons name="check" size={16} color={theme.primary} />}
                        </TouchableOpacity>
                      ))}
                      {tempStatus !== post.status && (
                        <TouchableOpacity style={styles.saveBtn} onPress={handleStatusUpdate} disabled={loading}>
                          {loading ? <ActivityIndicator size="small" color="black" /> : <Text style={styles.saveBtnText}>변경 확인</Text>}
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    // 2. 남의 글일 때: 신고/차단
                    <>
                      <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                        <Text style={{ color: theme.danger, fontSize: 14 }}>🚨 신고하기</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleBlock}>
                        <Text style={{ color: "#AAA", fontSize: 14 }}>🚫 이 사용자 차단</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>

          <Text style={styles.content}>{post.content || "내용 없음"}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>참여 인원</Text>
            <Text style={styles.infoValue}>{post.currentParticipants} / {post.maxParticipants}명</Text>
          </View>

          {/* 예상 계산서 */}
          <View style={styles.receipt}>
            <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18 }}>🧾 </Text>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "bold" }}>N빵 예상 계산서</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>1인당 물건값</Text>
              <Text style={{ color: "white" }}>{Number(post.pricePerPerson || 0).toLocaleString()}원</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>수고비</Text>
              <Text style={{ color: theme.primary, fontWeight: "bold" }}>+ {Number(post.tip || 0).toLocaleString()}원</Text>
            </View>
            <View style={{ height: 1, backgroundColor: "grey", marginVertical: 12 }} />
            <View style={styles.receiptRow}>
              <Text style={{ color: "white", fontWeight: "bold" }}>최종 1인</Text>
              <Text style={{ color: theme.primary, fontSize: 24, fontWeight: "bold" }}>{finalPerPerson.toLocaleString()}원</Text>
            </View>
          </View>

          <View style={{ marginTop: 30 }}>
            <Text style={styles.label}>만남 장소</Text>
            <View style={styles.mapContainer}>
              <MapView style={styles.map} initialRegion={mapRegion} scrollEnabled={false}>
                <Marker coordinate={mapRegion} />
              </MapView>
            </View>
            <Text style={{ color: "grey", fontSize: 13, marginTop: 8 }}>{post.pickup_point || post.location}</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 바 */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        <View>
          <Text style={{ color: "#888", fontSize: 12 }}>1인당 금액</Text>
          <Text style={styles.price}>{finalPerPerson.toLocaleString()}원</Text>
        </View>
        <View style={{ flex: 1 }} />
        {isMyPost ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteModalVisible(true)}><Text style={{ color: "#FF6B6B" }}>삭제</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={handleEdit}><Text style={{ color: "black" }}>수정</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.chatBtn, isFull && { backgroundColor: "#222" }]} onPress={onPressChat} disabled={isFull}>
            <Text style={[styles.chatBtnText, isFull && { color: "#555" }]}>
              {isFull ? (isClosed ? "참여 마감" : "모집 마감") : "N빵 참여"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 기본 모달들 */}
      <CustomModal
        visible={successModalVisible}
        title="알림"
        message={alertMsg}
        onConfirm={() => {
          setSuccessModalVisible(false);
          if (goHomeAfterSuccess) {
            setGoHomeAfterSuccess(false);
            navigation.navigate(ROUTES.HOME);
          }
        }}
      />
      <CustomModal visible={errorModalVisible} title="오류" message={alertMsg} onConfirm={() => setErrorModalVisible(false)} />
      <CustomModal visible={deleteModalVisible} title="삭제" message="정말로 삭제하시겠습니까?" type="confirm" onConfirm={handleDelete} onCancel={() => setDeleteModalVisible(false)} />

      {/* 안내용 모달들 */}
      <CustomModal 
        visible={sampleModalVisible} 
        title="SAMPLE 게시글" 
        message={"이 글은 샘플 데이터입니다.\n실제 참여는 불가능합니다."}
        onConfirm={() => setSampleModalVisible(false)}
      />

      {/* ✅ [수정] 신고 모달 (버튼 목록형) */}
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

      {/* 차단 모달 */}
      <CustomModal 
        visible={blockModalVisible} 
        title="차단하기" 
        message={"이 사용자를 차단하시겠습니까?\n차단 후에는 이 사용자의 글이 보이지 않습니다."} 
        type="confirm" 
        onConfirm={confirmBlock} 
        onCancel={() => setBlockModalVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  heroContainer: { height: 300, position: "relative" }, 
  heroImage: { width: SCREEN_WIDTH, height: 300, resizeMode: "cover" },
  pageIndicator: { position: "absolute", bottom: 15, right: 15, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 15 },
  pageText: { color: "white", fontWeight: "bold", fontSize: 12 },
  body: { padding: 24 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { flex: 1, color: "white", fontSize: 22, fontWeight: "bold", marginRight: 10 },
  dropdownContainer: { position: "relative", zIndex: 10, alignItems: "flex-end" },
  statusBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1A", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#333" },
  statusBtnText: { color: theme.primary, fontWeight: "bold", fontSize: 14, marginRight: 4 },
  dropdownMenu: { position: "absolute", top: 45, right: 0, backgroundColor: "#1A1A1A", borderRadius: 12, width: 130, padding: 8, borderWidth: 1, borderColor: "#333", elevation: 5 },
  menuItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#333" },
  menuText: { color: "white", fontSize: 14 },
  saveBtn: { backgroundColor: theme.primary, marginTop: 8, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  saveBtnText: { color: "black", fontWeight: "bold", fontSize: 12 },
  content: { color: "#DDD", lineHeight: 24, fontSize: 16, marginBottom: 20 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#222" },
  infoLabel: { color: "#888", fontSize: 14 },
  infoValue: { color: "white", fontSize: 14, fontWeight: "bold" },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
  receipt: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 20, marginTop: 30, borderWidth: 1, borderColor: "rgba(204, 255, 0, 0.5)" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  bottomBar: { padding: 20, backgroundColor: theme.cardBg, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#333" },
  price: { color: "white", fontSize: 20, fontWeight: "bold" },
  chatBtn: { backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minWidth: 80, alignItems: "center" },
  chatBtnText: { fontWeight: "bold", fontSize: 16, color: "black" },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: "#333", minWidth: 70, alignItems: "center" },
  
  // ✅ [추가] 신고 사유 버튼 스타일
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