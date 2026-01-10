import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import { useAppContext } from "../providers/AppContext";
import { Ionicons } from "@expo/vector-icons";
import CustomModal from "../../components/CustomModal";

export default function MainScreen() {
  const router = useRouter();
  const { user, posts, currentLocation, logout, deletePost } = useAppContext();
  
  const [deleteId, setDeleteId] = useState(null); // 삭제할 글 ID 임시 저장
  const [modalVisible, setModalVisible] = useState(false);

  // 삭제 버튼 클릭 시 모달 띄우기
  const confirmDelete = (id) => {
    setDeleteId(id);
    setModalVisible(true);
  };

  // 진짜 삭제 수행
  const handleDelete = async () => {
    if (deleteId) {
      await deletePost(deleteId);
      setModalVisible(false);
      setDeleteId(null);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <View style={styles.avatar} />
          <View>
            <Text style={styles.category}>{item.category}</Text>
            <Text style={styles.ownerText}>{item.ownerEmail ? item.ownerEmail.split("@")[0] : "익명"}</Text>
          </View>
        </View>
        
        {/* 내가 쓴 글이면 삭제 버튼 표시 */}
        {user && user.uid === item.ownerId && (
          <TouchableOpacity onPress={() => confirmDelete(item.id)}>
            <Ionicons name="trash-outline" size={20} color="#FF4444" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardContent} numberOfLines={2}>{item.content}</Text>
      
      <View style={styles.cardFooter}>
        <Text style={styles.location}>📍 {item.location}</Text>
        <Text style={styles.price}>{parseInt(item.pricePerPerson || 0).toLocaleString()}원/인</Text>
      </View>
      
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>{item.status || "모집중"}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.locationText}>📍 {currentLocation}</Text>
          <Text style={styles.welcomeText}>{user?.email?.split("@")[0]}님 환영합니다!</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={() => { logout(); router.replace("/"); }}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      {/* 게시글 리스트 */}
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>아직 등록된 공구가 없어요.</Text>
            <Text style={styles.emptySubText}>첫 번째 공구를 시작해보세요!</Text>
          </View>
        }
      />

      {/* 글쓰기 버튼 (플로팅) */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push("/screens/WriteScreen")}>
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      {/* 삭제 확인 모달 */}
      <CustomModal 
        visible={modalVisible}
        type="confirm"
        title="게시글 삭제"
        message="정말로 이 게시글을 삭제하시겠습니까?"
        onConfirm={handleDelete}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9F9F9" },
  header: { padding: 20, paddingTop: 60, backgroundColor: "white", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EEE" },
  locationText: { fontSize: 18, fontWeight: "bold", color: "#333" },
  welcomeText: { fontSize: 12, color: "#888", marginTop: 4 },
  logoutButton: { padding: 8, backgroundColor: "#EEE", borderRadius: 5 },
  logoutText: { fontSize: 12, color: "#555" },
  listContent: { padding: 15, paddingBottom: 80 },
  card: { backgroundColor: "white", borderRadius: 12, padding: 15, marginBottom: 15, elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  userInfo: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#DDD", marginRight: 10 },
  category: { fontSize: 12, color: "#FF6B00", fontWeight: "bold" },
  ownerText: { fontSize: 10, color: "#999" },
  cardTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  cardContent: { fontSize: 14, color: "#666", marginBottom: 10 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  location: { fontSize: 12, color: "#888" },
  price: { fontSize: 16, fontWeight: "bold", color: "#333" },
  statusBadge: { position: "absolute", top: 15, right: 50, backgroundColor: "#E3F2FD", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, color: "#2196F3", fontWeight: "bold" },
  fab: { position: "absolute", bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: "#FF6B00", justifyContent: "center", alignItems: "center", elevation: 5 },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyText: { fontSize: 18, color: "#CCC", fontWeight: "bold" },
  emptySubText: { fontSize: 14, color: "#DDD", marginTop: 5 },
});
