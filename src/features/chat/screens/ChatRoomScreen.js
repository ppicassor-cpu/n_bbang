// src/features/chat/screens/ChatRoomScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { theme } from '../../../theme';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  useEffect(() => {
    // 헤더 제목 설정
    navigation.setOptions({ title: roomName || "채팅방" });
    
    // 임시 초기 메시지
    setMessages([
      { id: '1', text: '안녕하세요! 공구 참여 감사합니다.', isMy: false },
    ]);
  }, [roomName]);

  const handleSend = () => {
    if (!text.trim()) return;
    const newMsg = { id: Date.now().toString(), text, isMy: true };
    setMessages(prev => [newMsg, ...prev]);
    setText("");
  };

  const renderItem = ({ item }) => (
    <View style={[styles.msgContainer, item.isMy ? styles.myMsgContainer : styles.otherMsgContainer]}>
      <View style={[styles.bubble, item.isMy ? styles.myBubble : styles.otherBubble]}>
        <Text style={[styles.msgText, item.isMy ? styles.myMsgText : styles.otherMsgText]}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        inverted // 최신 메시지가 아래에 오도록 역순 정렬 효과
        contentContainerStyle={{ padding: 16 }}
      />
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor="grey"
        />
        <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
          <MaterialIcons name="send" size={24} color="black" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  msgContainer: { marginVertical: 4, flexDirection: 'row' },
  myMsgContainer: { justifyContent: 'flex-end' },
  otherMsgContainer: { justifyContent: 'flex-start' },
  bubble: { padding: 12, borderRadius: 16, maxWidth: '70%' },
  myBubble: { backgroundColor: theme.primary, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#333', borderTopLeftRadius: 4 },
  msgText: { fontSize: 16 },
  myMsgText: { color: 'black' },
  otherMsgText: { color: 'white' },
  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#333', backgroundColor: theme.cardBg },
  input: { flex: 1, backgroundColor: '#222', color: 'white', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  sendBtn: { backgroundColor: theme.primary, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
