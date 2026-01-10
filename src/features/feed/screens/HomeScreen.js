import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal"; // 모달 추가

const CATEGORIES = ["전체", "마트/식품", "생활용품", "기타", "무료나눔"];

export default function HomeScreen({ navigation }) {
  const { posts, currentLocation, myCoords, getDistanceFromLatLonInKm } = useAppContext();
  const insets = useSafeAreaInsets();
  
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [writeModalVisible, setWriteModalVisible] = useState(false); // 글쓰기 선택 모달

  const filteredPosts = posts.filter(post => {
    if (!myCoords || !post.coords) return true;
    const dist = getDistanceFromLatLonInKm(
      myCoords.latitude, myCoords.longitude,
      post.coords.latitude, post.coords.longitude
    );
    if (dist > 5) return false;

    if (selectedCategory !== "전체" && post.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  const renderItem = ({ item }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    let distText = "";
    if (myCoords && item.coords) {
      const d = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );
      // ✅ 문법 오류 수정됨
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
            <Text style={styles.price}>
                {item.category === "무료나눔" ? "무료" : `${parseInt(item.pricePerPerson || 0).toLocaleString()}원`}
            </Text>
            {item.tip > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>수고비 포함</Text>
              </View>
            )}
          </View>

          <Text style={[styles.status, { color: isFull ? theme.danger : "grey" }]}>
            {isFull ? "마감" : item.category === "무료나눔" ? "나눔중" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`}
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

      <View style={styles.categoryRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity 
            key={cat} 
            onPress={() => setSelectedCategory(cat)}
            style={[
              styles.categoryBtn, 
              selectedCategory === cat && styles.categoryBtnActive
            ]}
          >
            <Text style={[
              styles.categoryText, 
              selectedCategory === cat && styles.categoryTextActive
            ]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredPosts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#333", marginVertical: 16 }} />}
        ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 50 }}>
                <Text style={{ color: "grey" }}>해당 카테고리의 글이 없습니다.</Text>
            </View>
        }
      />

      <TouchableOpacity 
        style={[styles.fab, { bottom: 20 + insets.bottom }]} 
        onPress={() => setWriteModalVisible(true)}
      >
        <MaterialIcons name="post-add" size={30} color="black" />
      </TouchableOpacity>

      {/* ✅ 글쓰기 선택 모달 */}
      <CustomModal
        visible={writeModalVisible}
        title="글쓰기 선택"
        message="어떤 글을 작성하시겠습니까?"
        onConfirm={() => {}} // 버튼 커스텀이므로 사용 안 함
      >
        <View style={{ gap: 12 }}>
            <TouchableOpacity 
                style={[styles.selectBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                    setWriteModalVisible(false);
                    navigation.navigate(ROUTES.WRITE);
                }}
            >
                <MaterialIcons name="shopping-cart" size={20} color="black" />
                <Text style={styles.selectBtnText}>N빵 모집하기</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.selectBtn, { backgroundColor: "#444" }]}
                onPress={() => {
                    setWriteModalVisible(false);
                    navigation.navigate(ROUTES.WRITE_FREE);
                }}
            >
                <MaterialIcons name="volunteer-activism" size={20} color="white" />
                <Text style={[styles.selectBtnText, { color: "white" }]}>무료나눔 하기</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={{ marginTop: 10, alignItems: "center", padding: 10 }}
                onPress={() => setWriteModalVisible(false)}
            >
                <Text style={{ color: "#888", fontWeight: "bold" }}>취소</Text>
            </TouchableOpacity>
        </View>
      </CustomModal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 16, alignItems: "center" },
  location: { color: "white", fontSize: 20, fontWeight: "bold" },
  
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: theme.background,
  },
  categoryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: "transparent",
  },
  categoryBtnActive: {
    backgroundColor: theme.primary,
  },
  categoryText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
  },
  categoryTextActive: {
    color: "black",
    fontWeight: "bold",
  },

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
  fab: { 
    position: "absolute", right: 20, backgroundColor: theme.primary, 
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center",
    elevation: 5, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
  },

  // 모달 버튼 스타일
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8
  },
  selectBtnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "black"
  }
});
