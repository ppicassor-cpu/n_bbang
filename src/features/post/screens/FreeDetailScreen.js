import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";
import CustomModal from "../../../components/CustomModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function FreeDetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params || {};
  // ✅ [수정] 신고(reportUser), 차단(blockUser) 함수 추가 가져오기
  const { user, deletePost, posts, updatePost, reportUser, blockUser } = useAppContext(); 
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState(initialPost || null);
  const [imgPage, setImgPage] = useState(1);
  
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  
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

  // ✅ [신규] 신고 핸들러
  const handleReport = () => {
    setIsDropdownOpen(false);
    Alert.alert("신고하기", "이 게시글을 부적절한 콘텐츠로 신고하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { 
        text: "신고", 
        onPress: () => reportUser(post.ownerId, post.id, "부적절한 게시글(무료나눔)", "post") 
      }
    ]);
  };

  // ✅ [신규] 차단 핸들러
  const handleBlock = () => {
    setIsDropdownOpen(false);
    Alert.alert("차단하기", "이 사용자를 차단하시겠습니까?\n차단 후에는 이 사용자의 글이 보이지 않습니다.", [
      { text: "취소", style: "cancel" },
      { 
        text: "차단", 
        style: "destructive",
        onPress: async () => {
          await blockUser(post.ownerId);
          navigation.goBack(); // 차단 후 해당 글 안 보이게 뒤로가기
        }
      }
    ]);
  };

  const onPressChat = () => {
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
            
            {/* ✅ [수정] 내 글이면 상태변경 버튼, 남의 글이면 메뉴(점 세개) 버튼 노출 */}
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

          {/* ✅ [수정] 드롭다운 메뉴 내용 분기 (내 글 vs 남의 글) */}
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
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
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
  bottomBar: { position: "absolute", bottom: 0, width: "100%", backgroundColor: theme.cardBg, flexDirection: "row", alignItems: "center", padding: 20, borderTopWidth: 1, borderTopColor: "#333" },
  freeLabel: { color: theme.primary, fontSize: 18, fontWeight: "bold" },
  chatBtn: { backgroundColor: theme.primary, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 10 },
  chatBtnText: { color: "black", fontWeight: "bold", fontSize: 16 },
  row: { flexDirection: "row", gap: 10 },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#222" }
});