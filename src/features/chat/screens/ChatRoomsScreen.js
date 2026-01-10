// src/features/chat/screens/ChatRoomsScreen.js
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../../theme';
import { ROUTES } from '../../../app/navigation/routes';
import { MaterialIcons } from '@expo/vector-icons';

export default function ChatRoomsScreen({ navigation }) {
  // 임시 데이터
  const chatRooms = [
    { id: 'post_1', title: '코스트코 소고기 소분해요', lastMessage: '네, 시간 맞춰 갈게요!', time: '방금 전' },
  ];

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
        <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
      </View>
      <Text style={styles.time}>{item.time}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={chatRooms}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Text style={{ color: 'grey' }}>참여 중인 채팅방이 없습니다.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  lastMessage: { color: 'grey', fontSize: 14 },
  time: { color: 'grey', fontSize: 12, marginLeft: 8 },
});
