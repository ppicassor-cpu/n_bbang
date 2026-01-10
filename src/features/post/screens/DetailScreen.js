import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";
import CustomModal from "../../../components/CustomModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function DetailScreen({ route, navigation }) {
  const { post } = route.params || {};
  const { user, deletePost } = useAppContext();
  const insets = useSafeAreaInsets();
  
  const [imgPage, setImgPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // ✅ [수정] 모달 상태 하나로 통합 (확인/성공/실패 모두 처리)
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
    type: "alert", // "confirm" or "alert"
    onConfirm: () => {},
  });

  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  const isMyPost = user && user.uid === post.ownerId;
  const isFree = post.category === "무료나눔";

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = () => {
    ensureRoom(roomId, roomName, "group").catch(() => {});
    navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName });
  };

  const handleEdit = () => {
    if (isFree) {
      navigation.navigate(ROUTES.WRITE_FREE, { post });
    } else {
      navigation.navigate(ROUTES.WRITE, { post });
    }
  };

  // ✅ 삭제 버튼 클릭 시 (삭제 확인 모달 띄우기)
  const onPressDelete = () => {
    setModalConfig({
      visible: true,
      title: "게시글 삭제",
      message: "정말로 이 게시글을 삭제하시겠습니까?\n삭제 후에는 되돌릴 수 없습니다.",
      type: "confirm",
      onConfirm: processDelete, // 확인 누르면 진짜 삭제 함수 실행
    });
  };

  // ✅ 진짜 삭제 로직 (로딩 -> 성공/실패 모달로 전환)
  const processDelete = async () => {
    setLoading(true);

    try {
      // 15초 타임아웃
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("NetworkTimeout")), 15000)
      );

      console.log(`[삭제 시도] 게시글 ID: ${post.id}`);
      await Promise.race([deletePost(post.id), timeoutPromise]);
      console.log("[삭제 성공]");

      setLoading(false);

      // ✅ [성공] 시스템 Alert 대신 커스텀 모달 내용 변경
      setModalConfig({
        visible: true,
        title: "삭제 완료",
        message: "게시글이 안전하게 삭제되었습니다.",
        type: "alert",
        onConfirm: () => {
          setModalConfig({ ...modalConfig, visible: false });
          navigation.goBack();
        },
      });

    } catch (error) {
      console.log("[삭제 실패 원인]", error);
      setLoading(false);
      
      let errorMsg = "게시글 삭제 중 오류가 발생했습니다.";
      if (error.message === "NetworkTimeout") {
        errorMsg = "서버 응답이 지연되고 있습니다.\n인터넷 연결을 확인해주세요.";
      } else if (error.code === "permission-denied") {
        errorMsg = "삭제 권한이 없습니다.";
      }

      // ✅ [실패] 시스템 Alert 대신 커스텀 모달 내용 변경
      setModalConfig({
        visible: true,
        title: "삭제 실패",
        message: errorMsg,
        type: "alert",
        onConfirm: () => setModalConfig({ ...modalConfig, visible: false }), // 그냥 닫기
      });
    }
  };

  const price = Number(post.pricePerPerson || 0);

  const mapRegion = {
    latitude: post.coords?.latitude || 37.5665,
    longitude: post.coords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  const handleScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    setImgPage(roundIndex + 1);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        
        <View style={styles.heroContainer}>
          {post.images && post.images.length > 0 ? (
            <>
                <ScrollView 
                    horizontal 
                    pagingEnabled 
                    showsHorizontalScrollIndicator={false}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                >
                    {post.images.map((img, idx) => (
                        <Image key={idx} source={{ uri: img }} style={styles.heroImage} />
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
          <Text style={styles.title}>{post.title}</Text>

          <Text style={styles.progress}>
            {isFree ? "나눔 상태: " : "참여 현황: "} 
            <Text style={{ fontWeight: "bold", color: isFree ? theme.primary : "white" }}>
               {isFree ? post.status : `${post.currentParticipants}/${post.maxParticipants}`}
            </Text>
          </Text>

          <Text style={styles.content}>{post.content || "내용 없음"}</Text>

          <View style={{ marginTop: 30 }}>
            <Text style={styles.label}>만남 장소</Text>
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    initialRegion={mapRegion}
                    scrollEnabled={false}
                >
                    <Marker coordinate={mapRegion} />
                </MapView>
            </View>
            <Text style={{ color: "grey", fontSize: 13, marginTop: 8 }}>{post.pickup_point || post.location}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        <View>
          {!isFree ? (
            <>
              <Text style={styles.price}>{price.toLocaleString()}원</Text>
              <Text style={styles.priceSub}>1인당 예상 금액</Text>
            </>
          ) : (
            <Text style={{ color: theme.primary, fontSize: 18, fontWeight: "bold" }}>따뜻한 무료나눔 🎁</Text>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {isMyPost ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity 
                style={[styles.chatBtn, { backgroundColor: "#333", borderWidth: 1, borderColor: "#555" }]} 
                onPress={onPressDelete}
            >
               <Text style={[styles.chatBtnText, { color: "#FF6B6B" }]}>삭제</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.chatBtn, { backgroundColor: theme.primary }]} 
                onPress={handleEdit}
            >
               <Text style={[styles.chatBtnText, { color: "black" }]}>수정</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.chatBtn} onPress={onPressChat}>
            <Text style={styles.chatBtnText}>
              {isFree ? "채팅하기" : "N빵 참여"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ✅ 디자인 통일된 커스텀 모달 */}
      <CustomModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        loading={loading}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => !loading && setModalConfig({ ...modalConfig, visible: false })}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  heroContainer: { height: 300, position: "relative" }, 
  heroImage: { width: SCREEN_WIDTH, height: 300, resizeMode: "cover" },
  pageIndicator: {
    position: "absolute", bottom: 15, right: 15,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 15
  },
  pageText: { color: "white", fontWeight: "bold", fontSize: 12 },
  body: { padding: 24 },
  title: { color: "white", fontSize: 22, fontWeight: "bold" },
  progress: { color: "grey", marginTop: 10, fontSize: 14 },
  content: { color: "#DDD", marginTop: 20, lineHeight: 24, fontSize: 16 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  bottomBar: {
    padding: 20,
    backgroundColor: theme.cardBg,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 20,
  },
  price: { color: "white", fontSize: 20, fontWeight: "bold" },
  priceSub: { color: "grey", fontSize: 12, marginTop: 2 },
  chatBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 80,
    alignItems: "center"
  },
  chatBtnText: { 
    fontWeight: "bold", 
    fontSize: 16,
    color: "black" 
  },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
});
