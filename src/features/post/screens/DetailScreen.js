import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { theme } from '../theme';

export default function DetailScreen({ route }) {
  const { post } = route.params;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView>
        <View style={{ height: 250, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center' }}>
          {post.images && post.images.length > 0 ? (
            <Image source={{ uri: post.images[0] }} style={{ width: '100%', height: '100%' }} />
          ) : (
             <Text style={{ color: 'grey' }}>이미지 없음</Text>
          )}
        </View>
        <View style={{ padding: 24 }}>
           <Text style={{ color: 'white', fontSize: 22, fontWeight: 'bold' }}>{post.title}</Text>
           <Text style={{ color: theme.primary, marginTop: 10 }}>참여 현황: {post.currentParticipants}/{post.maxParticipants}</Text>
           <Text style={{ color: 'white', marginTop: 20, lineHeight: 24 }}>{post.content || "내용 없음"}</Text>
        </View>
      </ScrollView>
      <View style={{ padding: 20, backgroundColor: theme.cardBg, flexDirection: 'row', alignItems: 'center' }}>
         <View>
            <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold' }}>{post.pricePerPerson.toLocaleString()}원</Text>
            <Text style={{ color: 'grey', fontSize: 12 }}>1인당 예상 금액</Text>
         </View>
         <View style={{ flex: 1 }} />
         <TouchableOpacity style={{ backgroundColor: theme.primary, paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 }}>
            <Text style={{ fontWeight: 'bold' }}>채팅하기</Text>
         </TouchableOpacity>
      </View>
    </View>
  );
}
