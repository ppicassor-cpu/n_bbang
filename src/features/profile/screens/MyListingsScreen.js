import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // ✅ 안전 영역 훅 추가

import { theme } from '../../../theme';
import { useAppContext } from '../../../app/providers/AppContext';
import { ROUTES } from '../../../app/navigation/routes';

export default function MyListingsScreen() {
  const navigation = useNavigation();
  const { user, posts } = useAppContext();
  const insets = useSafeAreaInsets(); // ✅ 상단 여백 값 가져오기
  
  // 탭 상태: 'nbbang' | 'free'
  const [activeTab, setActiveTab] = useState('nbbang');

  // ✅ 내가 쓴 글만 필터링 + 최신순 정렬
  const myPosts = posts
    .filter(p => p.ownerId === user?.uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 탭에 따라 데이터 분리
  const nbbangPosts = myPosts.filter(p => p.category !== '무료나눔');
  const freePosts = myPosts.filter(p => p.category === '무료나눔');

  // 현재 탭에 보여줄 데이터
  const displayData = activeTab === 'nbbang' ? nbbangPosts : freePosts;

  const renderItem = ({ item }) => {
    const isClosed = item.status === '마감' || item.status === '나눔완료';
    
    return (
      <TouchableOpacity 
        style={[styles.card, isClosed && styles.cardClosed]}
        activeOpacity={0.7}
        onPress={() => {
          // 카테고리에 따라 상세 페이지 이동 분기
          if (item.category === '무료나눔') {
            navigation.navigate(ROUTES.FREE_DETAIL, { post: item });
          } else {
            navigation.navigate(ROUTES.DETAIL, { post: item });
          }
        }}
      >
        {/* 이미지 썸네일 */}
        <View style={styles.imageBox}>
          {item.images && item.images.length > 0 ? (
            <Image source={{ uri: item.images[0] }} style={styles.image} />
          ) : (
            <MaterialIcons name="image-not-supported" size={30} color="#555" />
          )}
          {isClosed && (
            <View style={styles.closedOverlay}>
              <Text style={styles.closedText}>종료됨</Text>
            </View>
          )}
        </View>

        {/* 텍스트 정보 */}
        <View style={styles.infoBox}>
          <View style={styles.headerRow}>
            <View style={[
              styles.badge, 
              { backgroundColor: item.status === '모집중' || item.status === '나눔중' ? theme.primary : '#444' }
            ]}>
              <Text style={[
                styles.badgeText,
                { color: item.status === '모집중' || item.status === '나눔중' ? 'black' : '#AAA' }
              ]}>
                {item.status || '진행중'}
              </Text>
            </View>
            <Text style={styles.dateText}>
              {item.createdAt ? item.createdAt.slice(0, 10) : ''}
            </Text>
          </View>

          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          
          <View style={styles.footerRow}>
            {activeTab === 'nbbang' ? (
              <>
                <Text style={styles.price}>
                  {Number(item.pricePerPerson || 0).toLocaleString()}원/인
                </Text>
                <View style={styles.participantInfo}>
                  <Ionicons name="people" size={14} color="#888" />
                  <Text style={styles.participantText}>
                    {item.currentParticipants}/{item.maxParticipants}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.locationText}>
                <Ionicons name="location-sharp" size={12} color="#888" /> {item.location}
              </Text>
            )}
          </View>
        </View>

        <MaterialIcons name="chevron-right" size={24} color="#444" style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
    );
  };

  return (
    // ✅ 최상위 컨테이너에 상단 패딩(insets.top)을 적용하여 시스템 영역 침범 방지
    <View style={[styles.container, { paddingTop: insets.top }]}>
      
      {/* 커스텀 헤더 (뒤로가기 포함) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back-ios-new" size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내가 쓴 글 관리</Text>
        <View style={{ width: 40 }} /> 
      </View>

      {/* 상단 탭 버튼 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'nbbang' && styles.activeTab]}
          onPress={() => setActiveTab('nbbang')}
        >
          <Text style={[styles.tabText, activeTab === 'nbbang' && styles.activeTabText]}>
            N빵 공구 ({nbbangPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'free' && styles.activeTab]}
          onPress={() => setActiveTab('free')}
        >
          <Text style={[styles.tabText, activeTab === 'free' && styles.activeTabText]}>
            무료나눔 ({freePosts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 리스트 */}
      <FlatList
        data={displayData}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialIcons name="post-add" size={48} color="#333" />
            <Text style={styles.emptyText}>작성된 글이 없습니다.</Text>
            <Text style={styles.emptySubText}>
              {activeTab === 'nbbang' ? '공동구매를 시작해보세요!' : '안쓰는 물건을 나눠보세요!'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222'
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  backButton: { padding: 5 },

  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.primary,
  },
  tabText: {
    color: '#888',
    fontSize: 15,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: theme.primary,
  },

  listContent: { padding: 20 },
  
  card: {
    flexDirection: 'row',
    backgroundColor: theme.cardBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  cardClosed: {
    opacity: 0.5, // 마감된 글은 흐리게
  },
  
  imageBox: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#222',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  image: { width: '100%', height: '100%' },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  infoBox: { flex: 1, justifyContent: 'center' },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  dateText: { color: '#666', fontSize: 11 },

  title: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },

  footerRow: { flexDirection: 'row', alignItems: 'center' },
  price: { color: 'white', fontSize: 14, fontWeight: 'bold', marginRight: 10 },
  participantInfo: { flexDirection: 'row', alignItems: 'center' },
  participantText: { color: '#888', fontSize: 12, marginLeft: 4 },
  locationText: { color: '#888', fontSize: 12 },

  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#888', fontSize: 16, marginTop: 15, fontWeight: 'bold' },
  emptySubText: { color: '#555', fontSize: 13, marginTop: 5 },
});