import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { ensureRoom } from "../../chat/services/chatService";

export default function DetailScreen({ route, navigation }) {
  const { post } = route.params || {};
  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = () => {
    ensureRoom(roomId, roomName, "group").catch(() => {});
    navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName });
  };

  const price = Number(post.pricePerPerson || 0);

  // 지도 좌표 (없으면 서울 시청 기본값)
  const mapRegion = {
    latitude: post.coords?.latitude || 37.5665,
    longitude: post.coords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.hero}>
          {post.images && post.images.length > 0 ? (
            <Image source={{ uri: post.images[0] }} style={styles.heroImage} />
          ) : (
            <Text style={{ color: "grey" }}>이미지 없음</Text>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{post.title}</Text>

          <Text style={styles.progress}>
            참여 현황: {post.currentParticipants}/{post.maxParticipants}
          </Text>

          <Text style={styles.content}>{post.content || "내용 없음"}</Text>

          {/* 지도 표시 */}
          <View style={{ marginTop: 30 }}>
            <Text style={styles.label}>만남 장소</Text>
            <View style={styles.mapContainer}>
                <MapView
                    style={styles.map}
                    initialRegion={mapRegion}
                    scrollEnabled={false} // 상세화면에서는 스크롤 방지 (지도만 보이게)
                >
                    <Marker coordinate={mapRegion} />
                </MapView>
            </View>
            <Text style={{ color: "grey", fontSize: 13, marginTop: 8 }}>{post.pickup_point || post.location}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.price}>{price.toLocaleString()}원</Text>
          <Text style={styles.priceSub}>1인당 예상 금액</Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity style={styles.chatBtn} onPress={onPressChat}>
          <Text style={styles.chatBtnText}>채팅하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  hero: { height: 250, backgroundColor: "#222", justifyContent: "center", alignItems: "center" },
  heroImage: { width: "100%", height: "100%" },

  body: { padding: 24 },
  title: { color: "white", fontSize: 22, fontWeight: "bold" },
  progress: { color: theme.primary, marginTop: 10 },
  content: { color: "white", marginTop: 20, lineHeight: 24 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 10 },

  bottomBar: {
    padding: 20,
    backgroundColor: theme.cardBg,
    flexDirection: "row",
    alignItems: "center",
  },
  price: { color: "white", fontSize: 20, fontWeight: "bold" },
  priceSub: { color: "grey", fontSize: 12 },

  chatBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  chatBtnText: { fontWeight: "bold" },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
});
