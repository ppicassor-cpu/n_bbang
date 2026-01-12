import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons"; // ✅ Ionicons 추가

import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { subscribeMyRooms } from "../../chat/services/chatService";

// 날짜 포맷 유틸
function __safeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d.toDate === "function") return d.toDate();
  return null;
}

export default function ChatRoomsScreen({ navigation }) {
  const [chatRooms, setChatRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ 내 채팅방 목록 실시간 구독
    const unsubscribe = subscribeMyRooms((rooms) => {
      setChatRooms(rooms);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatTime = (date) => {
    if (!date) return "";
    const now = new Date();
    const d = __safeDate(date);
    if (!d) return "";

    const diff = now - d;
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (diff < oneDay) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } else {
      return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    }
  };

  const renderItem = ({ item }) => {
    // ✅ 무료나눔 타입('free')인지 확인
    const isFree = item.type === 'free';

    return (
      <TouchableOpacity 
        style={styles.item}
        onPress={() => navigation.navigate(ROUTES.CHAT_ROOM, { roomId: item.id, roomName: item.title })}
      >
        {/* ✅ 아이콘 분기 처리: 무료나눔이면 선물(gift), 아니면 그룹(group) */}
        <View style={[styles.avatar, isFree && { backgroundColor: "#e2a603" }]}> 
          {isFree ? (
            <Ionicons name="gift" size={24} color="white" />
          ) : (
            <MaterialIcons name="group" size={24} color="black" />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || "대화를 시작해보세요!"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
        <View style={[styles.container, { justifyContent: "center" }]}>
            <ActivityIndicator size="large" color={theme.primary} />
        </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chatRooms}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 50 }}>
            <Ionicons name="chatbubbles-outline" size={48} color="#333" />
            <Text style={{ color: "grey", marginTop: 10 }}>참여 중인 채팅방이 없습니다.</Text>
            <Text style={{ color: "#555", fontSize: 12, marginTop: 5 }}>게시글에서 '채팅하기'를 눌러보세요!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#222" },
  // N빵(기본)은 테마색 배경, 무료나눔은 위에서 붉은 계열(#FF6B6B) 등으로 덮어씀
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", marginRight: 16 },
  title: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  lastMessage: { color: "#888", fontSize: 14 },
  time: { color: "#666", fontSize: 12, marginLeft: 8 },
});