import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons"; 
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
// ✅ [추가] 샘플 데이터 생성기 가져오기
import { checkAndGenerateSamples } from "../../../utils/autoSampleGenerator";

const CATEGORIES = ["전체", "마트/식품", "생활용품", "기타", "무료나눔"];

export default function HomeScreen({ navigation }) {
  // ✅ loadMorePosts 함수 가져오기
  const { posts, currentLocation, myCoords, getDistanceFromLatLonInKm, loadMorePosts } = useAppContext();
  const insets = useSafeAreaInsets();
  
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [writeModalVisible, setWriteModalVisible] = useState(false);

  // ✅ [추가] 내 위치(myCoords)가 잡히면 -> 주변에 샘플 데이터 생성 시도 (최초 1회만 동작)
  useEffect(() => {
    if (myCoords && myCoords.latitude) {
      checkAndGenerateSamples(myCoords);
    }
  }, [myCoords]);

  /* =========================
     ✅ 1시간 부스트 최상단 정렬 로직
  ========================= */
  const now = Date.now();

  const boostedPosts = [];
  const normalPosts = [];

  posts.forEach((post) => {
    if (post.boostUntil && new Date(post.boostUntil).getTime() > now) {
      boostedPosts.push(post);
    } else {
      normalPosts.push(post);
    }
  });

  const sortedPosts = [...boostedPosts, ...normalPosts];

  const filteredPosts = sortedPosts.filter(post => {
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
    const isFree = item.category === "무료나눔";

    const isNbbangClosed = !isFree && item.status === "마감";
    const isFull = !isFree && (item.currentParticipants >= item.maxParticipants || isNbbangClosed);
    const isClosed = isFree && item.status === "나눔완료";

    let distText = "";
    if (myCoords && item.coords) {
      const d = getDistanceFromLatLonInKm(
        myCoords.latitude, myCoords.longitude,
        item.coords.latitude, item.coords.longitude
      );
      distText = `  ${d.toFixed(1)}km`;
    }

    const finalPerPerson = !isFree
      ? Number(item.pricePerPerson || 0) + Number(item.tip || 0)
      : 0;

    return (
      <TouchableOpacity 
        style={[styles.card, isClosed && { opacity: 0.6 }]} 
        activeOpacity={0.7}
        onPress={() => {
          if (item.category === "무료나눔") {
            navigation.navigate(ROUTES.FREE_DETAIL, { post: item });
          } else {
            navigation.navigate(ROUTES.DETAIL, { post: item });
          }
        }}
      >
        <View style={styles.imageBox}>
          {item.images && item.images.length > 0 ? (
            <Image 
              source={{ uri: item.images[0] }} 
              style={styles.image} 
              // ✅ [이미지 최적화] 리사이징 및 메모리 관리
              resizeMode="cover"
              resizeMethod="resize" // 안드로이드 메모리 최적화
              fadeDuration={0} // 리스트 스크롤 시 깜빡임 줄이기
            />
          ) : (
            <MaterialIcons name="receipt-long" size={40} color="grey" />
          )}
          {(isClosed || isFull) && (
            <View style={styles.closedOverlay}>
              <Text style={styles.closedOverlayText}>{isClosed ? "나눔완료" : "마감"}</Text>
            </View>
          )}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.subInfo}>{item.location}  {item.category}{distText}</Text>

          <View style={styles.row}>
            <Text style={[styles.price, isClosed && { color: "grey" }]}>
              {isFree ? "무료" : `${finalPerPerson.toLocaleString()}원`}
            </Text>
            {item.tip > 0 && !isFree && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>수고비 포함</Text>
              </View>
            )}
          </View>

          <Text
            style={[
              styles.status,
              { color: (isFull || isClosed) ? theme.danger : theme.primary }
            ]}
          >
            {isFree 
              ? (item.status || "나눔중")
              : (isNbbangClosed ? "참여마감" : `${item.currentParticipants}/${item.maxParticipants}명 참여중`)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.location}>{currentLocation} </Text>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          
          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}>
            <Ionicons name="chatbubbles-outline" size={26} color="white" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate(ROUTES.PROFILE)}>
            <MaterialIcons name="account-circle" size={30} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 카테고리 탭 */}
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
            <Text
              style={[
                styles.categoryText, 
                selectedCategory === cat && styles.categoryTextActive
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 게시글 리스트 (최적화 적용) */}
      <FlatList
        data={filteredPosts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: "#333", marginVertical: 16 }} />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Text style={{ color: "grey" }}>해당 카테고리의 글이 없습니다.</Text>
          </View>
        }
        // ✅ [핵심] 무한 스크롤 및 성능 최적화 옵션
        onEndReached={() => {
          // '전체' 보기일 때만 더 불러오기 (필터링 중에는 헷갈릴 수 있음)
          if (selectedCategory === "전체") {
             loadMorePosts();
          }
        }}
        onEndReachedThreshold={0.5} // 스크롤이 절반 남았을 때 미리 로딩
        initialNumToRender={6}      // 처음에 렌더링할 아이템 수 (화면 높이 고려)
        windowSize={5}              // 렌더링 창 크기 (작을수록 메모리 절약)
        removeClippedSubviews={true} // 화면 밖 아이템 메모리 해제 (안드로이드 필수)
      />

      {/* 글쓰기 버튼 */}
      <TouchableOpacity 
        style={[styles.fab, { bottom: 20 + insets.bottom }]} 
        onPress={() => setWriteModalVisible(true)}
      >
        <MaterialIcons name="post-add" size={30} color="black" />
      </TouchableOpacity>

      {/* 글쓰기 선택 모달 */}
      <CustomModal
        visible={writeModalVisible}
        title="글쓰기 선택"
        message="어떤 글을 작성하시겠습니까?"
        onConfirm={() => {}}
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
  categoryRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333", backgroundColor: theme.background },
  categoryBtn: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 15 },
  categoryBtnActive: { backgroundColor: theme.primary },
  categoryText: { color: "#888", fontSize: 14, fontWeight: "600" },
  categoryTextActive: { color: "black", fontWeight: "bold" },
  card: { flexDirection: "row" },
  imageBox: { width: 100, height: 100, backgroundColor: "#222", borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  closedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  closedOverlayText: { color: "white", fontWeight: "bold" },
  infoBox: { flex: 1, marginLeft: 16, justifyContent: "center" },
  title: { color: "white", fontSize: 16, fontWeight: "bold" },
  subInfo: { color: "grey", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center" },
  price: { color: "white", fontSize: 18, fontWeight: "bold" },
  badge: { backgroundColor: "rgba(204,255,0,0.15)", paddingHorizontal: 6, borderRadius: 4 },
  badgeText: { color: theme.primary, fontSize: 11 },
  status: { fontSize: 12, fontWeight: "bold" },
  fab: { position: "absolute", right: 20, backgroundColor: theme.primary, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 8, gap: 8 },
  selectBtnText: { fontSize: 16, fontWeight: "bold", color: "black" }
});