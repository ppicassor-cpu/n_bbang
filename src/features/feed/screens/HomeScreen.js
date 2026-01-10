import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";

export default function HomeScreen({ navigation }) {
  const { posts, currentLocation, myCoords, getDistanceFromLatLonInKm } = useAppContext();
  
  // 5km 이내 필터링
  const filteredPosts = posts.filter(post => {
    if (!myCoords || !post.coords) return true; // 좌표 없으면 다 보여줌 (안전장치)
    const dist = getDistanceFromLatLonInKm(
      myCoords.latitude, myCoords.longitude,
      post.coords.latitude, post.coords.longitude
    );
    return dist <= 5; // 5km 이내
  });

  const renderItem = ({ item }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    
    // 거리 계산해서 표시
    let distText = "";
    if (myCoords && item.coords) {
      const d = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );
      distText = `  ${d.toFixed(1)}km`;
    }

    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate(ROUTES.DETAIL, { post: item })}>
        <View style={styles.imageBox}>
          {item.images && item.images.length > 0 ? (
            <Image source={{ uri: item.images[0] }} style={styles.image} />
          ) : (
            <MaterialIcons name="receipt-long" size={40} color="grey" />
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.subInfo}>{item.location}  {item.category}{distText}</Text>

          <View style={styles.row}>
            <Text style={styles.price}>{item.pricePerPerson.toLocaleString()}원</Text>
            {item.tip > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>수고비 포함</Text>
              </View>
            )}
          </View>

          <Text style={[styles.status, { color: isFull ? theme.danger : "grey" }]}>
            {isFull ? "마감" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.location}>{currentLocation} </Text>

        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}>
            <MaterialIcons name="chat-bubble-outline" size={26} color="white" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.PROFILE)}>
            <MaterialIcons name="people-outline" size={28} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredPosts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#333", marginVertical: 16 }} />}
        ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 50 }}>
                <Text style={{ color: "grey" }}>5km 이내에 진행 중인 N빵이 없습니다.</Text>
            </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate(ROUTES.WRITE)}>
        <MaterialIcons name="post-add" size={24} color="black" />
        <Text style={styles.fabText}>글쓰기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" },
  location: { color: "white", fontSize: 20, fontWeight: "bold" },
  card: { flexDirection: "row" },
  imageBox: { width: 100, height: 100, backgroundColor: "#222", borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  infoBox: { flex: 1, marginLeft: 16, justifyContent: "center" },
  title: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subInfo: { color: "grey", fontSize: 13, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  price: { color: "white", fontSize: 18, fontWeight: "bold", marginRight: 8 },
  badge: { backgroundColor: "rgba(204, 255, 0, 0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: theme.primary, fontSize: 11, fontWeight: "bold" },
  status: { fontSize: 12, fontWeight: "bold", marginTop: 4 },
  fab: { position: "absolute", bottom: 20, right: 20, backgroundColor: theme.primary, flexDirection: "row", padding: 16, borderRadius: 30, alignItems: "center", elevation: 5 },
  fabText: { fontWeight: "bold", marginLeft: 8 },
});
