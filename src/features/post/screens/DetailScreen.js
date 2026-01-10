import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";

const SCREEN_WIDTH = Dimensions.get("window").width;

export default function DetailScreen({ route, navigation }) {
  const { post } = route.params || {};
  const { user } = useAppContext();
  const insets = useSafeAreaInsets();
  
  const [imgPage, setImgPage] = useState(1);

  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  // ✅ 내가 쓴 글인지 확인
  const isMyPost = user && user.uid === post.ownerId;
  const isFree = post.category === "무료나눔";

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = () => {
    ensureRoom(roomId, roomName, "group").catch(() => {});
    navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName });
  };

  // ✅ 수정 버튼 클릭 핸들러
  const handleEdit = () => {
    if (isFree) {
      navigation.navigate(ROUTES.WRITE_FREE, { post });
    } else {
      navigation.navigate(ROUTES.WRITE, { post });
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

      {/* 하단 바 */}
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

        {/* ✅ 내가 쓴 글이면 '수정하기', 아니면 '참여/채팅' */}
        {isMyPost ? (
          <TouchableOpacity style={[styles.chatBtn, { backgroundColor: "#444" }]} onPress={handleEdit}>
             <Text style={[styles.chatBtnText, { color: "white" }]}>글 수정하기</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.chatBtn} onPress={onPressChat}>
            <Text style={styles.chatBtnText}>
              {isFree ? "채팅하기" : "N빵 참여"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  chatBtnText: { 
    fontWeight: "bold", 
    fontSize: 16,
    color: "black" 
  },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
});
