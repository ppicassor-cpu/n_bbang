import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from "react-native";
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

export default function FreeDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params || {};
  const { user, deletePost, posts, updatePost, reportUser, blockUser } = useAppContext();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState(initialPost || null);
  const [imgPage, setImgPage] = useState(1);

  // 기존 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // 신고, 차단, 샘플 데이터 안내용 모달 상태
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportSuccessModalVisible, setReportSuccessModalVisible] = useState(false); // ✅ 신고 완료 모달
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);

  // 드롭다운 메뉴 상태 (내 글일 땐 상태변경, 남의 글일 땐 신고/차단 메뉴)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialPost?.id) return;
    const updated = posts.find(p => p.id === initialPost.id);
    if (updated) {
      setPost(updated);
      setTempStatus(updated.status || "나눔중");
    }
  }, [posts, initialPost?.id]);

  if (!post) return null;

  const isMyPost = user && user.uid === post.ownerId;
  const isClosed = post.status === "나눔완료";

  const handleStatusUpdate = async () => {
    setLoading(true);
    try {
      await updatePost(post.id, { status: tempStatus, updatedAt: new Date().toISOString() });
      setIsDropdownOpen(false);
      setStatusModalVisible(true);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    await deletePost(post.id);
    setDeleteModalVisible(false);
    navigation.goBack();
  };

  // 신고 핸들러
  const handleReport = () => {
    setIsDropdownOpen(false);
    setReportModalVisible(true);
  };

  // ✅ 신고 확정 처리 (사유 선택 시 실행 -> 성공 모달 띄움)
  const confirmReport = async (selectedReason) => {
    setReportModalVisible(false);
    if (!post.ownerId) return;

    // ✅ [수정] 상세페이지에서만 silent=true로 호출하여 AppContext 팝업 차단
    await reportUser(post.ownerId, post.id, selectedReason, "post", true);

    setReportSuccessModalVisible(true);
  };

  // ✅ 신고 완료 모달 확인 버튼 -> 차단 후 홈으로 이동
  const handleReportSuccess = async () => {
    setReportSuccessModalVisible(false);

    // 1. 해당 유저 차단 (홈 리스트에서 안 보이게)
    if (post.ownerId && post.ownerId !== user?.uid) {
      try {
        await blockUser(post.ownerId);
      } catch (e) {
        console.log("차단 실패:", e);
      }
    }

    // 2. 홈 화면으로 이동
    navigation.navigate(ROUTES.HOME);
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
    navigation.goBack(); // 차단 후 해당 글 안 보이게 뒤로가기
  };

  const onPressChat = () => {
    // 샘플 데이터인지 확인하여 커스텀 모달 띄우기
    if (post.ownerId === "SAMPLE_DATA") {
      setSampleModalVisible(true);
      return;
    }

    if (isClosed) return;
    const roomId = `post_${post.id}`;
    ensureRoom(roomId, post.title, "free", post.ownerId);
    navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName: post.title });
  };

  const mapRegion = useMemo(() => ({
    latitude: post?.coords?.latitude || 37.5665,
    longitude: post?.coords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  }), [post]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* 이미지 섹션 */}
        <View style={styles.heroContainer}>
          <ScrollView horizontal pagingEnabled onScroll={(e) => setImgPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH) + 1)}>
            {post.images?.map((img, idx) => (
              <Image key={idx} source={{ uri: img }} style={styles.heroImage} />
            ))}
          </ScrollView>
          <View style={styles.pageIndicator}><Text style={styles.pageText}>{imgPage} / {post.images?.length || 0}</Text></View>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{post.title}</Text>

            {/* 내 글이면 상태변경 버튼, 남의 글이면 메뉴(점 세개) 버튼 노출 */}
            {isMyPost ? (
              <TouchableOpacity style={styles.statusBtn} onPress={() => setIsDropdownOpen(!isDropdownOpen)}>
                <Text style={[styles.statusBtnText, isClosed && { color: theme.danger }]}>{post.status || "나눔중"}</Text>
                <MaterialIcons name="arrow-drop-down" size={20} color="white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={{ padding: 5 }} onPress={() => setIsDropdownOpen(!isDropdownOpen)}>
                <MaterialIcons name="more-vert" size={24} color="#888" />
              </TouchableOpacity>
            )}
          </View>

          {/* 드롭다운 메뉴 내용 분기 (내 글 vs 남의 글) */}
          {isDropdownOpen && (
            <View style={styles.dropdown}>
              {isMyPost ? (
                // 1. 내 글일 때: 상태 변경 메뉴
                <>
                  {["나눔중", "나눔완료"].map(s => (
                    <TouchableOpacity key={s} style={styles.dropdownItem} onPress={() => setTempStatus(s)}>
                      <Text style={{ color: tempStatus === s ? theme.primary : "white" }}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                  {tempStatus !== post.status && (
                    <TouchableOpacity style={styles.saveBtn} onPress={handleStatusUpdate}>
                      <Text style={styles.saveBtnText}>변경 확인</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                // 2. 남의 글일 때: 신고/차단 메뉴
                <>
                  <TouchableOpacity style={styles.dropdownItem} onPress={handleReport}>
                    <Text style={{ color: theme.danger }}>🚨 신고하기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dropdownItem, { borderBottomWidth: 0 }]} onPress={handleBlock}>
                    <Text style={{ color: "#888" }}>🚫 이 사용자 차단하기</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          <Text style={styles.content}>{post.content}</Text>

          <View style={styles.mapSection}>
            <Text style={styles.label}>나눔 희망 장소</Text>
            <View style={styles.mapWrap}>
              <MapView style={styles.map} initialRegion={mapRegion} scrollEnabled={false}><Marker coordinate={mapRegion} /></MapView>
            </View>
            <Text style={styles.locationText}>{post.location}</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 바 */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        <Text style={[styles.freeLabel, isClosed && { color: "grey" }]}>{isClosed ? "나눔이 완료되었습니다" : "무료나눔 🎁"}</Text>
        <View style={{ flex: 1 }} />
        {isMyPost ? (
          <View style={styles.row}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteModalVisible(true)}><Text style={{ color: theme.danger }}>삭제</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={() => navigation.navigate(ROUTES.WRITE_FREE, { post })}><Text style={{ color: "black" }}>수정</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.chatBtn, isClosed && { backgroundColor: "#333" }]} onPress={onPressChat} disabled={isClosed}>
            <Text style={[styles.chatBtnText, isClosed && { color: "#888" }]}>{isClosed ? "종료된 나눔" : "채팅하기"}</Text>
          </TouchableOpacity>
        )}
      </View>

      <CustomModal visible={statusModalVisible} title="알림" message="상태가 변경되었습니다." onConfirm={() => setStatusModalVisible(false)} />
      <CustomModal visible={deleteModalVisible} title="삭제" message="정말 삭제하시겠습니까?" type="confirm" onConfirm={handleDelete} onCancel={() => setDeleteModalVisible(false)} />

      {/* 신규 적용된 모달들 */}
      <CustomModal
        visible={sampleModalVisible}
        title="체험용 게시글"
        message={"이 글은 체험용 샘플 데이터입니다.\n실제 참여는 불가능합니다."}
        onConfirm={() => setSampleModalVisible(false)}
      />

      {/* ✅ 신고 모달 (버튼 목록형) */}
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

      {/* ✅ 신고 완료 알림 모달 */}
      <CustomModal
        visible={reportSuccessModalVisible}
        title="신고 완료"
        message={"신고가 접수되었습니다.\n확인을 누르면 홈으로 이동합니다."}
        onConfirm={handleReportSuccess}
      />

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
  heroContainer: { height: 350 },
  heroImage: { width: SCREEN_WIDTH, height: 350, resizeMode: "cover" },
  pageIndicator: { position: "absolute", bottom: 20, right: 20, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  pageText: { color: "white", fontSize: 12, fontWeight: "bold" },
  body: { padding: 20 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { flex: 1, color: "white", fontSize: 22, fontWeight: "bold" },
  statusBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#222", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#444" },
  statusBtnText: { color: theme.primary, fontWeight: "bold", marginRight: 4 },
  dropdown: { backgroundColor: "#222", borderRadius: 10, padding: 10, marginBottom: 20 },
  dropdownItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#333" },
  saveBtn: { backgroundColor: theme.primary, marginTop: 10, padding: 10, borderRadius: 8, alignItems: "center" },
  saveBtnText: { color: "black", fontWeight: "bold" },
  content: { color: "#DDD", fontSize: 16, lineHeight: 26, marginBottom: 30 },
  mapSection: { marginTop: 10 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  mapWrap: { height: 200, borderRadius: 15, overflow: "hidden", marginBottom: 10 },
  map: { flex: 1 },
  locationText: { color: "#888", fontSize: 14 },

  // ✅ bottomBar 스타일
  bottomBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: theme.cardBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20, // 상단 패딩은 고정
    borderTopWidth: 1,
    borderTopColor: "#333"
  },

  freeLabel: { color: theme.primary, fontSize: 18, fontWeight: "bold" },
  chatBtn: { backgroundColor: theme.primary, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  chatBtnText: { color: "black", fontWeight: "bold", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#222" },

  // ✅ 신고 사유 버튼 스타일
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

