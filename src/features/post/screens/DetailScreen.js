import React, { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions, ActivityIndicator } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";
import CustomModal from "../../../components/CustomModal";
import { MaterialIcons } from "@expo/vector-icons";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function DetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params || {};
  const { user, deletePost, posts, updatePost } = useAppContext(); 
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState(initialPost || null);
  const [imgPage, setImgPage] = useState(1);
  
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState(""); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialPost?.id) return;
    const updated = posts.find(p => p.id === initialPost.id);
    if (updated) {
      setPost(updated);
      setTempStatus(updated.status || "모집중");
    }
  }, [posts, initialPost?.id]);

  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  const isMyPost = user && user.uid === post.ownerId;

  // ✅ 추가: 방장이 status를 "마감"으로 바꾸면 다른 사람은 참여 버튼 비활성화/텍스트 변경
  const isClosed = post.status === "마감";

  // ✅ 수정: 기존 인원 마감 조건 + status 마감 조건을 함께 반영
  const isFull = post.currentParticipants >= post.maxParticipants || isClosed;

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = () => {
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

  const handleScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setImgPage(Math.round(index) + 1);
  };

  const mapRegion = useMemo(() => ({
    latitude: post?.coords?.latitude || 37.5665,
    longitude: post?.coords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  }), [post]);

  const finalPerPerson = Number(post.pricePerPerson || 0) + Number(post.tip || 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
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
              <TouchableOpacity 
                style={[styles.statusBtn, isFull && { borderColor: theme.danger }]}
                onPress={() => isMyPost && setIsDropdownOpen(!isDropdownOpen)}
                disabled={!isMyPost}
              >
                <Text style={[styles.statusBtnText, isFull && { color: theme.danger }]}>
                  {post.status || "모집중"}
                </Text>
                {isMyPost && <MaterialIcons name={isDropdownOpen ? "arrow-drop-up" : "arrow-drop-down"} size={20} color="white" />}
              </TouchableOpacity>

              {isDropdownOpen && (
                <View style={styles.dropdownMenu}>
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
                </View>
              )}
            </View>
          </View>

          <Text style={styles.content}>{post.content || "내용 없음"}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>참여 인원</Text>
            <Text style={styles.infoValue}>{post.currentParticipants} / {post.maxParticipants}명</Text>
          </View>

          {/* 예상 계산서 - 만남 장소 위 */}
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

      <CustomModal visible={successModalVisible} title="알림" message={alertMsg} onConfirm={() => setSuccessModalVisible(false)} />
      <CustomModal visible={errorModalVisible} title="오류" message={alertMsg} onConfirm={() => setErrorModalVisible(false)} />
      <CustomModal visible={deleteModalVisible} title="삭제" message="정말로 삭제하시겠습니까?" type="confirm" onConfirm={handleDelete} onCancel={() => setDeleteModalVisible(false)} />
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
  actionBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: "#333", minWidth: 70, alignItems: "center" }
});
