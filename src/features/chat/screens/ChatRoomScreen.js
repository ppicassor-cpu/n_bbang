import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import { useAppContext } from "../../../app/providers/AppContext";
import { subscribeMessages, sendMessage, markAsRead } from "../../chat/services/chatService";

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params || {};
  const { user } = useAppContext();
  
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  
  const flatListRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: roomName || "채팅방" });

    const unsubscribe = subscribeMessages(roomId, (newMessages) => {
      setMessages(newMessages);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId]);

  // ✅ [핵심] 메시지가 로드될 때마다 "내가 안 읽은 남의 메시지"를 찾아 읽음 처리
  useEffect(() => {
    if (!user || messages.length === 0) return;

    const unreadMsgIds = messages
      .filter(m => m.senderId !== user.uid) // 내가 보낸 건 제외
      .filter(m => !m.readBy || !m.readBy.includes(user.uid)) // 내 이름이 명단에 없는 것
      .map(m => m.id);

    if (unreadMsgIds.length > 0) {
      markAsRead(roomId, unreadMsgIds);
    }
  }, [messages, user]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const tempText = text;
    setText(""); 
    
    try {
      await sendMessage(roomId, tempText);
    } catch (e) {
      console.error("메시지 전송 실패", e);
      setText(tempText);
    }
  };

  const renderItem = ({ item }) => {
    const isMy = item.senderId === user?.uid;
    const timeString = item.createdAt.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // ✅ 읽음 상태 판별
    // readBy 배열에 나 말고 다른 사람도 있으면 "읽음", 아니면 "전송됨"
    // (1:1 채팅 기준, 그룹 채팅이면 숫자 표시로 변경 가능)
    const readCount = item.readBy ? item.readBy.length : 0;
    const isRead = readCount > 1; // 보낸 사람(1) + 받는 사람(1) = 2명 이상이면 읽은 것
    const statusText = isRead ? "읽음" : "전송됨";

    return (
      <View style={[styles.msgContainer, isMy ? styles.myMsgContainer : styles.otherMsgContainer]}>
        {!isMy && (
             <Text style={styles.senderName}>{item.senderEmail?.split("@")[0] || "알 수 없음"}</Text>
        )}
        <View style={{ flexDirection: isMy ? "row-reverse" : "row", alignItems: "flex-end" }}>
            <View style={[styles.bubble, isMy ? styles.myBubble : styles.otherBubble]}>
                <Text style={[styles.msgText, isMy ? styles.myMsgText : styles.otherMsgText]}>{item.text}</Text>
            </View>
            
            <View style={{ alignItems: isMy ? "flex-end" : "flex-start", marginLeft: isMy ? 0 : 4, marginRight: isMy ? 4 : 0 }}>
                {/* ✅ 내가 보낸 메시지에만 읽음/전송됨 표시 */}
                {isMy && (
                    <Text style={[styles.statusText, isRead ? styles.readText : styles.sentText]}>
                        {statusText}
                    </Text>
                )}
                <Text style={styles.timeText}>{timeString}</Text>
            </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor="grey"
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendBtn} disabled={!text.trim()}>
          <MaterialIcons name="send" size={24} color={text.trim() ? "black" : "#555"} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  msgContainer: { marginVertical: 6 },
  myMsgContainer: { alignItems: "flex-end" },
  otherMsgContainer: { alignItems: "flex-start" },
  
  senderName: { color: "#888", fontSize: 12, marginBottom: 4, marginLeft: 4 },
  
  bubble: { padding: 12, borderRadius: 16, maxWidth: "75%" },
  myBubble: { backgroundColor: theme.primary, borderBottomRightRadius: 2 },
  otherBubble: { backgroundColor: "#333", borderTopLeftRadius: 2 },
  
  msgText: { fontSize: 16, lineHeight: 22 },
  myMsgText: { color: "black" },
  otherMsgText: { color: "white" },
  
  timeText: { color: "#666", fontSize: 10, marginTop: 2 },
  
  // ✅ 상태 텍스트 스타일
  statusText: { fontSize: 10, marginBottom: 2, fontWeight: "bold" },
  readText: { color: theme.primary }, // 읽음 = 노란색(테마색)
  sentText: { color: "#FFCC00" }, // 전송됨 = 노란색

  inputContainer: { flexDirection: "row", padding: 10, paddingBottom: 20, borderTopWidth: 1, borderTopColor: "#222", backgroundColor: theme.cardBg },
  input: { flex: 1, backgroundColor: "#111", color: "white", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, borderWidth: 1, borderColor: "#333" },
  sendBtn: { backgroundColor: theme.primary, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
