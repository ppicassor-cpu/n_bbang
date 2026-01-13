// FILE: src\features\profile\screens\ProfileScreen.js

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { checkNotifications, requestNotifications } from 'react-native-permissions';
import { collection, query, where, onSnapshot } from "firebase/firestore";

// ✅ 프로젝트 파일 구조에 맞춘 import
import { theme } from '../../../theme';
import { ROUTES } from '../../../app/navigation/routes';
import { useAppContext } from '../../../app/providers/AppContext';
import CustomModal from '../../../components/CustomModal';
import { db } from "../../../firebaseConfig";

export default function ProfileScreen() {
  const navigation = useNavigation();

  // ✅ Context 데이터
  const {
    user,
    logout,
    currentLocation = "위치 미지정",
    isVerified = false,
    isPremium = false,
    dailyPostCount = 0,
    posts = [],
    isAdmin // ✅ 관리자 여부
  } = useAppContext();

  const [unreadNotiCount, setUnreadNotiCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setUnreadNotiCount(0);
      return;
    }

    const q = query(
      collection(db, "users", user.uid, "notifications"),
      where("isRead", "==", false)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setUnreadNotiCount(snap.size || 0);
      },
      () => {
        setUnreadNotiCount(0);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  // ✅ 내가 쓴 글 개수 계산
  const myPosts = Array.isArray(posts) ? posts.filter(p => p.ownerId === user?.uid) : [];
  const myPostsCount = myPosts.length;

  // ✅ 모달 상태 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: "",
    message: "",
    type: "alert", // 'alert' | 'confirm'
    onConfirm: () => {}
  });

  // 공용 모달 열기 함수
  const openModal = (title, message, type = "alert", onConfirm = () => {}) => {
    setModalConfig({ title, message, type, onConfirm });
    setModalVisible(true);
  };

  // 1. 로그아웃 핸들러
  const handleLogoutPress = () => {
    openModal(
      "로그아웃",
      "정말 로그아웃 하시겠습니까?",
      "confirm",
      async () => {
        setModalVisible(false);
        await logout();
      }
    );
  };

  // 2. 내가 쓴 글 보기 핸들러
  const handleMyPosts = () => {
    navigation.navigate(ROUTES.MY_LISTINGS);
  };

  // ✅ 알림 권한 요청(런타임) + 설정 이동 처리
  const requestNotiPermission = async () => {
    try {
      // iOS는 옵션 전달, Android는 무시되어도 문제 없음
      const res = await requestNotifications(['alert', 'sound', 'badge']);
      const nextStatus = res?.status || null;

      if (nextStatus === "granted") {
        openModal(
          "알림 설정",
          "알림이 허용되었습니다.\n이제 새로운 채팅 알림이나 소식을 받을 수 있습니다.",
          "alert",
          () => setModalVisible(false)
        );
        return;
      }

      // denied/blocked/기타면 설정으로 안내
      openModal(
        "알림 설정",
        "알림 허용이 필요합니다.\n기기 설정 화면으로 이동하시겠습니까?",
        "confirm",
        () => {
          setModalVisible(false);
          Linking.openSettings();
        }
      );
    } catch {
      openModal(
        "알림 설정",
        "알림 권한 요청 중 문제가 발생했습니다.\n기기 설정 화면으로 이동하시겠습니까?",
        "confirm",
        () => {
          setModalVisible(false);
          Linking.openSettings();
        }
      );
    }
  };

  // 3. 알림 설정 핸들러 (check → 필요 시 request → 그래도 안되면 settings)
  const handleNotificationSettings = async () => {
    let status = null;

    try {
      const res = await checkNotifications();
      status = res?.status || null;
    } catch {
      status = null;
    }

    // granted면: 설정으로 안 보내고 커스텀 확인 모달
    if (status === "granted") {
      openModal(
        "알림 설정",
        "현재 알림이 허용되어 있습니다.\n새로운 채팅 알림이나 소식을 받으시겠습니까?",
        "confirm",
        () => {
          setModalVisible(false);
        }
      );
      return;
    }

    // denied면: 런타임 요청 먼저
    if (status === "denied") {
      openModal(
        "알림 설정",
        Platform.OS === "android"
          ? "현재 알림이 허용되지 않았습니다.\n지금 알림을 허용하시겠습니까?"
          : "현재 알림이 허용되지 않았습니다.\n지금 알림을 허용하시겠습니까?",
        "confirm",
        async () => {
          setModalVisible(false);
          await requestNotiPermission();
        }
      );
      return;
    }

    // blocked/limited/unavailable/null 등: 설정으로 이동
    openModal(
      "알림 설정",
      "알림이 꺼져 있거나(또는 차단됨)\n설정에서 변경이 필요합니다.\n기기 설정 화면으로 이동하시겠습니까?",
      "confirm",
      () => {
        setModalVisible(false);
        Linking.openSettings();
      }
    );
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 1. 프로필 + 통계 통합 섹션 (슬림형) */}
        <View style={styles.profileHeader}>
          {/* 상단: 프사 + 이름 */}
          <View style={styles.userInfoRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color="black" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.nickname} numberOfLines={1}>
                  {user?.displayName || user?.email?.split('@')[0] || "사용자"}
                </Text>

                {isPremium && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumText}>PREMIUM</Text>
                  </View>
                )}

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                  onPress={() => navigation.navigate(ROUTES.NOTIFICATION)}
                  activeOpacity={0.8}
                  style={styles.notiBtn}
                >
                  <Ionicons name="notifications-outline" size={20} color="#CCC" />
                  {unreadNotiCount > 0 && (
                    <View style={styles.notiBadge}>
                      <Text style={styles.notiBadgeText} numberOfLines={1}>
                        {unreadNotiCount > 99 ? "99+" : String(unreadNotiCount)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.locationText}>
                {isVerified ? `${currentLocation} 인증됨` : "위치 미인증"}
              </Text>
            </View>
          </View>

          {/* 하단: 통계 (작게 배치) */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>나의 N빵</Text>
              <Text style={styles.statValue}>{myPostsCount}개</Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>오늘 작성</Text>
              <Text style={[
                styles.statValue,
                (!isPremium && dailyPostCount >= 1) && { color: theme.danger }
              ]}>
                {dailyPostCount} / {isPremium ? "∞" : "1"}회
              </Text>
            </View>
          </View>
        </View>

        {/* 2. 프리미엄 배너 (연녹색 테두리 + 투명 배경) */}
        {!isPremium && (
          <TouchableOpacity
            style={styles.premiumOutlineBanner}
            onPress={() => navigation.navigate(ROUTES.PREMIUM)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.outlineBannerTitle}>무제한으로 N빵하기</Text>
              <Text style={styles.outlineBannerSub}>작성 제한 해제하기</Text>
            </View>
            <MaterialIcons name="arrow-forward" size={20} color={theme.primary} />
          </TouchableOpacity>
        )}

        {/* 3. 메뉴 리스트 */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>활동</Text>

          {/* ✅ [추가] 알림 센터 버튼 */}
          <MenuLink
            icon="notifications-outline"
            label="알림 센터"
            onPress={() => navigation.navigate(ROUTES.NOTIFICATION)}
          />

          <MenuLink
            icon="chatbubble-outline"
            label="채팅 목록"
            onPress={() => navigation.navigate(ROUTES.CHAT_ROOMS)}
          />
          <MenuLink
            icon="receipt-outline"
            label="내가 쓴 글 보기"
            onPress={handleMyPosts}
          />

          {/* 관리자 전용 메뉴 */}
          {isAdmin && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24, color: '#FF6B6B' }]}>관리자 전용</Text>
              <MenuLink
                icon="shield-checkmark-outline"
                label="신고 내역 관리"
                color="#FF6B6B"
                onPress={() => navigation.navigate(ROUTES.ADMIN_REPORT)}
              />
            </>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>설정</Text>
          <MenuLink
            icon="settings-outline"
            label="알림 설정"
            onPress={handleNotificationSettings}
          />
          <MenuLink
            icon="log-out-outline"
            label="로그아웃"
            color="white"
            onPress={handleLogoutPress}
          />
        </View>

        <Text style={styles.versionText}>v{appVersion}</Text>

      </ScrollView>

      {/* ✅ 커스텀 모달 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// 메뉴 아이템 컴포넌트
function MenuLink({ icon, label, onPress, color = "#CCC" }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={20} color={color} style={{ marginRight: 12 }} />
        <Text style={{ color: color, fontSize: 15 }}>{label}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#555" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scrollContent: { padding: 20, paddingBottom: 60 },

  // 1. 프로필 섹션
  profileHeader: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  nickname: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 6,
  },
  premiumBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  premiumText: {
    color: 'black',
    fontSize: 10,
    fontWeight: 'bold',
  },
  locationText: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },

  notiBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notiBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notiBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },

  // 통계 행
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  verticalDivider: {
    width: 1,
    height: '60%',
    backgroundColor: '#444',
  },

  // 2. 프리미엄 배너
  premiumOutlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  outlineBannerTitle: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  outlineBannerSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },

  // 3. 메뉴 리스트
  menuContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#666',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },

  versionText: {
    color: '#333',
    textAlign: 'center',
    fontSize: 11,
    marginBottom: 20,
  },
});
