// FILE: src/features/post/screens/FreeDetailScreen.js

import React, { useState, useEffect, useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions  } from "react-native";
import { Text } from "../../../components/MyText";
import { Image } from "expo-image";
import ImageDetailModal from "../../../components/ImageDetailModal";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

// ✅ [추가] 닉네임 조회를 위해 firebase 관련 모듈 추가
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

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

  // ✅ [추가] 작성자 닉네임 상태
  const [ownerNickname, setOwnerNickname] = useState("");

  // 기존 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // 신고, 차단, 샘플 데이터 안내용 모달 상태
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportSuccessModalVisible, setReportSuccessModalVisible] = useState(false); 
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);

  // 드롭다운 메뉴 상태
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // 1. 게시글 데이터 동기화
  useEffect(() => {
    if (!initialPost?.id) return;
    const updated = posts.find(p => p.id === initialPost.id);
    if (updated) {
      setPost(updated);
      setTempStatus(updated.status || "나눔중");
    }
  }, [posts, initialPost?.id]);

  // ✅ [추가] 2. 작성자 닉네임 가져오기 로직
  useEffect(() => {
    const fetchNickname = async () => {
      if (!post?.ownerId) return;

      // 샘플 데이터 처리
      if (post.ownerId === "SAMPLE_DATA") {
        setOwnerNickname("운영팀 (예시)");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", post.ownerId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          // displayName이 없으면 이메일 앞부분 사용
          setOwnerNickname(data.displayName || data.email?.split("@")[0] || "알 수 없음");
        } else {
          setOwnerNickname("탈퇴한 사용자");
        }
      } catch (e) {
        console.error("닉네임 조회 실패:", e);
      }
    };

    fetchNickname();
  }, [post?.ownerId]);

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

  const confirmReport = async (selectedReason) => {
    setReportModalVisible(false);
    if (!post.ownerId) return;
    await reportUser(post.ownerId, post.id, selectedReason, "post", true);
    setReportSuccessModalVisible(true);
  };

  const handleReportSuccess = async () => {
    setReportSuccessModalVisible(false);
    if (post.ownerId && post.ownerId !== user?.uid) {
      try {
        await blockUser(post.ownerId);
      } catch (e) {
        console.log("차단 실패:", e);
      }
    }
    navigation.navigate(ROUTES.HOME);
  };

  const handleBlock = () => {
    setIsDropdownOpen(false);
    setBlockModalVisible(true);
  };

  const confirmBlock = async () => {
    await blockUser(post.ownerId);
    setBlockModalVisible(false);
    navigation.goBack(); 
  };

  const onPressChat = async () => {
    if (post.ownerId === "SAMPLE_DATA") {
      setSampleModalVisible(true);
      return;
    }
    if (isClosed) return;
    if (!user?.uid) return;

    // ✅ 무료나눔은 1:1 방이 여러 개 열리는 구조이므로 "post_단일방" 금지
    // ✅ (postId + 두 uid 조합)으로 1:1 고유 방 생성
    const pairKey = [user.uid, post.ownerId].sort().join("_");
    const roomId = `free_${post.id}_${pairKey}`;

    try {
      await ensureRoom(roomId, post.title, "free", post.ownerId);
      navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName: post.title });
    } catch (e) {
      console.error("채팅방 생성/입장 실패:", e);
    }
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
          {post.images && post.images.length > 0 ? (
            <>
              <ScrollView horizontal pagingEnabled onScroll={(e) => setImgPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH) + 1)}>
                {post.images.map((img, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    activeOpacity={0.9} 
                    onPress={() => {
                      setCurrentImageIndex(idx);
                      setIsImageViewVisible(true);
                    }}
                  >
                    <Image 
                      source={{ uri: img }} 
                      style={styles.heroImage} 
                      contentFit="cover"
                      transition={200}
                      cachePolicy="disk"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.pageIndicator}>
                <Text style={styles.pageText}>{imgPage} / {post.images.length}</Text>
              </View>
            </>
          ) : (
            <View style={[styles.heroImage, { justifyContent: "center", alignItems: "center", backgroundColor: "#222" }]}>
              <Text style={{ color: "grey", fontSize: 16 }}>이미지 없음</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{post.title}</Text>

            {isMyPost ? (
              <View style={{ position: 'relative', zIndex: 100 }}>
                <TouchableOpacity style={styles.statusBtn} onPress={() => setIsDropdownOpen(!isDropdownOpen)}>
                  <Text style={[styles.statusBtnText, isClosed && { color: theme.danger }]}>{post.status || "나눔중"}</Text>
                  <MaterialIcons name={isDropdownOpen ? "arrow-drop-up" : "arrow-drop-down"} size={20} color="white" />
                </TouchableOpacity>

                {isDropdownOpen && (
                  <View style={styles.dropdown}>
                    {["나눔중", "예약중", "나눔완료"].map(s => (
                      <TouchableOpacity key={s} style={styles.dropdownItem} onPress={() => setTempStatus(s)}>
                        <Text style={{ color: tempStatus === s ? theme.primary : "white", fontSize: 13 }}>{s}</Text>
                        {tempStatus === s && <MaterialIcons name="check" size={14} color={theme.primary} />}
                      </TouchableOpacity>
                    ))}
                    {tempStatus !== post.status && (
                      <TouchableOpacity style={styles.saveBtn} onPress={handleStatusUpdate} disabled={loading}>
                        <Text style={styles.saveBtnText}>{loading ? "..." : "확인"}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ position: 'relative', zIndex: 100 }}>
                <TouchableOpacity style={{ padding: 5 }} onPress={() => setIsDropdownOpen(!isDropdownOpen)}>
                  <MaterialIcons name="more-vert" size={24} color="#888" />
                </TouchableOpacity>
                {isDropdownOpen && (
                  <View style={[styles.dropdown, { width: 140, right: 0 }]}>
                    <TouchableOpacity style={styles.dropdownItem} onPress={handleReport}>
                      <Text style={{ color: theme.danger, fontSize: 13 }}>🚨 신고하기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.dropdownItem, { borderBottomWidth: 0 }]} onPress={handleBlock}>
                      <Text style={{ color: "#888", fontSize: 13 }}>🚫 차단하기</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>

          <Text style={styles.content}>{post.content}</Text>

          <View style={styles.mapSection}>
            {/* ✅ [수정] 닉네임 표시 영역 추가 (Flex Row) */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>나눔 희망 장소</Text>
              <View style={styles.writerInfo}>
                <Text style={styles.writerLabel}>작성자: </Text>
                <Text style={styles.writerName}>{ownerNickname || "로딩중..."}</Text>
              </View>
            </View>

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

      <CustomModal
        visible={sampleModalVisible}
        title="체험용 게시글"
        message={"이 글은 체험용 샘플 데이터입니다.\n실제 참여는 불가능합니다."}
        onConfirm={() => setSampleModalVisible(false)}
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
        visible={blockModalVisible}
        title="차단하기"
        message={"이 사용자를 차단하시겠습니까?\n차단 후에는 이 사용자의 글이 보이지 않습니다."}
        type="confirm"
        onConfirm={confirmBlock}
        onCancel={() => setBlockModalVisible(false)} 
      />

      <ImageDetailModal
        visible={isImageViewVisible}
        images={post.images}
        index={currentImageIndex}
        onClose={() => setIsImageViewVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  heroContainer: { height: 350 },
  heroImage: { width: SCREEN_WIDTH, height: 350 },
  pageIndicator: { position: "absolute", bottom: 20, right: 20, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  pageText: { color: "white", fontSize: 12, fontWeight: "bold" },
  body: { padding: 20 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, zIndex: 999 }, // ✅ zIndex 추가
  title: { flex: 1, color: "white", fontSize: 22, fontWeight: "bold", marginRight: 10 },
  
  // ✅ [수정] 상태 버튼 및 드롭다운 스타일
  statusBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#222", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#444", minWidth: 90, justifyContent: 'space-between' },
  statusBtnText: { color: theme.primary, fontWeight: "bold", fontSize: 13 },
  
  dropdown: { 
    position: 'absolute', 
    top: 38, // 버튼 바로 아래
    right: 0, 
    width: 100, // 버튼 폭과 비슷하게
    backgroundColor: "#222", 
    borderRadius: 8, 
    padding: 5, 
    borderWidth: 1, 
    borderColor: "#444",
    elevation: 5,
    zIndex: 1000, // 최상단
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5, borderBottomWidth: 0.5, borderBottomColor: "#333" },
  
  saveBtn: { backgroundColor: theme.primary, marginTop: 5, padding: 8, borderRadius: 6, alignItems: "center" },
  saveBtnText: { color: "black", fontWeight: "bold", fontSize: 12 },
  
  content: { color: "#DDD", fontSize: 16, lineHeight: 26, marginBottom: 30, zIndex: 1 }, // ✅ 본문 zIndex 낮춤
  
  mapSection: { marginTop: 10 },
  
  // ✅ [추가] 라벨과 닉네임을 가로로 배치하기 위한 스타일
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold" },
  
  // ✅ [추가] 작성자 정보 스타일
  writerInfo: { flexDirection: 'row', alignItems: 'center' },
  writerLabel: { color: '#888', fontSize: 13, marginRight: 4 },
  writerName: { color: 'white', fontSize: 14, fontWeight: "bold" },

  mapWrap: { height: 200, borderRadius: 15, overflow: "hidden", marginBottom: 10 },
  map: { flex: 1 },
  locationText: { color: "#888", fontSize: 14 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: theme.cardBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#333"
  },

  freeLabel: { color: theme.primary, fontSize: 18, fontWeight: "bold" },
  chatBtn: { backgroundColor: theme.primary, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  chatBtnText: { color: "black", fontWeight: "bold", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#222" },

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