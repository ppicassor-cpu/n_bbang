function __safeDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d.toDate === "function") return d.toDate();
  return null;
}
import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { MaterialIcons } from "@expo/vector-icons";
import { subscribeMyRooms } from "../../chat/services/chatService";

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
    const diff = now - date;
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay) {
      return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } else {
      return __safeDate(date)?.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.item}
      onPress={() => navigation.navigate(ROUTES.CHAT_ROOM, { roomId: item.id, roomName: item.title })}
    >
      <View style={styles.avatar}>
        <MaterialIcons name="group" size={24} color="black" />
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
            <MaterialIcons name="chat-bubble-outline" size={48} color="#333" />
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
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", marginRight: 16 },
  title: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  lastMessage: { color: "#888", fontSize: 14 },
  time: { color: "#666", fontSize: 12, marginLeft: 8 },
});
