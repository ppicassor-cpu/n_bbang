// FILE: src/features/profile/screens/ProfileScreen.js

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  TextInput,
  Image,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { checkNotifications, requestNotifications } from 'react-native-permissions';
// ✅ [수정] arrayRemove, doc, getDoc, updateDoc 추가 (차단 해제 및 정보 조회용)
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, arrayRemove } from "firebase/firestore";
import Purchases from "react-native-purchases";
import * as ImagePicker from "expo-image-picker";

import { theme } from '../../../theme';
import { ROUTES } from '../../../app/navigation/routes';
import { useAppContext } from '../../../app/providers/AppContext';
import CustomModal from '../../../components/CustomModal';
import { db } from "../../../firebaseConfig";

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // ✅ Context 데이터
  const {
    user,
    logout,
    currentLocation = "위치 미지정",
    isVerified = false,
    isPremium = false,
    dailyPostCount = 0,
    posts = [],
    isAdmin, // ✅ 관리자 여부
    blockedUsers = [] // ✅ 차단된 사용자 목록 (ID 배열)
  } = useAppContext();

  const [unreadNotiCount, setUnreadNotiCount] = useState(0);

  // ✅ [추가] DB에서 내 정보 직접 불러오기 (닉네임 표시 확실하게)
  const [userProfile, setUserProfile] = useState(null);

  // ✅ 차단 관리 모달 상태 및 데이터
  const [blockedListModalVisible, setBlockedListModalVisible] = useState(false);
  const [blockedProfiles, setBlockedProfiles] = useState([]); // {id, nickname} 배열
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // ✅ 차단 해제 성공 알림 모달 상태
  const [unblockSuccessVisible, setUnblockSuccessVisible] = useState(false);

  // ✅ [추가] 프로필 사진/닉네임 수정 모달
  const [profileEditModalVisible, setProfileEditModalVisible] = useState(false);
  const [nicknameEditModalVisible, setNicknameEditModalVisible] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  // 1. 내 DB 정보 실시간 구독 (닉네임 '사용자'로 뜨는 문제 해결)
  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null);
      return;
    }
    const userDocRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);

        // ✅ 닉네임 수정 모달 열 때 초기값으로 쓰기 위해 동기화
        const nextName = data?.displayName || user?.displayName || user?.email?.split('@')[0] || "";
        setNicknameInput(nextName);
      }
    });
    return () => unsubUser();
  }, [user?.uid]);

  // 2. 알림 개수 구독
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

  // ✅ [추가] 프로필 사진 선택 → 즉시 DB 저장 → 팝업 닫힘 → 실시간 구독으로 화면 반영
  const handlePickProfileImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm?.granted) {
        openModal("권한 필요", "앨범 접근 권한이 필요합니다.\n설정에서 권한을 허용해주세요.", "alert", () => setModalVisible(false));
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (res?.canceled) return;

      const uri = res?.assets?.[0]?.uri;
      if (!uri) return;

      // ✅ 즉시 저장 (photoURL 필드)
      await updateDoc(doc(db, "users", user.uid), { photoURL: uri });

      // ✅ 확인 팝업 닫힘
      setProfileEditModalVisible(false);
    } catch (e) {
      console.error(e);
      openModal("오류", "프로필 사진을 변경하지 못했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ [추가] 닉네임 저장 → 즉시 DB 저장 → 팝업 닫힘 → 실시간 구독으로 화면 반영
  const handleSaveNickname = async () => {
    try {
      const next = (nicknameInput || "").trim();
      if (!next) {
        openModal("안내", "닉네임을 입력해주세요.", "alert", () => setModalVisible(false));
        return;
      }

      await updateDoc(doc(db, "users", user.uid), { displayName: next });

      // ✅ 키보드/팝업 정리
      Keyboard.dismiss();
      setNicknameEditModalVisible(false);
    } catch (e) {
      console.error(e);
      openModal("오류", "닉네임을 변경하지 못했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ 차단 사용자 관리 버튼 핸들러 (정보 가져오기)
  const handleManageBlockedUsers = async () => {
    if (!blockedUsers || blockedUsers.length === 0) {
      // ✅ [수정] 확인 버튼 누르면 팝업이 닫히도록 수정
      openModal("안내", "차단한 사용자가 없습니다.", "alert", () => setModalVisible(false));
      return;
    }

    setLoadingBlocked(true);
    setBlockedListModalVisible(true);

    try {
      const profiles = [];
      // 차단된 ID 순회하며 닉네임 조회
      for (const targetId of blockedUsers) {
        const docRef = doc(db, "users", targetId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          profiles.push({
            id: targetId,
            nickname: data.displayName || data.email?.split('@')[0] || "사용자"
          });
        } else {
          profiles.push({ id: targetId, nickname: "알 수 없는 사용자" });
        }
      }
      setBlockedProfiles(profiles);
    } catch (e) {
      console.error(e);
      // ✅ 오류 팝업도 닫히도록 수정
      openModal("오류", "차단 목록을 불러오지 못했습니다.", "alert", () => setModalVisible(false));
      setBlockedListModalVisible(false);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // ✅ 차단 해제 핸들러 -> 성공 시 확인 모달 띄우기
  const handleUnblock = async (targetId) => {
    try {
      // 1. Firestore 업데이트 (내 정보의 blockedUsers 배열에서 제거)
      const myUserRef = doc(db, "users", user.uid);
      await updateDoc(myUserRef, {
        blockedUsers: arrayRemove(targetId)
      });

      // 2. 로컬 상태 업데이트 (모달 리스트에서 즉시 제거)
      setBlockedProfiles((prev) => prev.filter((p) => p.id !== targetId));

      // 3. 성공 알림 모달 표시
      setUnblockSuccessVisible(true);

    } catch (e) {
      console.error(e);
      openModal("오류", "차단 해제에 실패했습니다.", "alert", () => setModalVisible(false));
    }
  };

  // ✅ 구독 관리(안드로이드)
  const handleManageSubscription = async () => {
    if (Platform.OS !== "android") {
      openModal("안내", "안드로이드에서만 구독 관리 화면으로 이동할 수 있습니다.", "alert", () => {
        setModalVisible(false);
      });
      return;
    }

    try {
      const info = await Purchases.getCustomerInfo();
      const url = info?.managementURL;

      if (url) {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return;
        }
      }

      const pkg =
        Constants?.expoConfig?.android?.package ||
        Constants?.manifest?.android?.package ||
        Constants?.expoConfig?.android?.packageName ||
        Constants?.manifest?.android?.packageName;

      const fallbackUrl = pkg
        ? `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(pkg)}`
        : "https://play.google.com/store/account/subscriptions";

      await Linking.openURL(fallbackUrl);
    } catch (e) {
      openModal("오류", "구독 관리 화면을 여는 중 문제가 발생했습니다.", "alert", () => {
        setModalVisible(false);
      });
    }
  };

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

  const handleMyPosts = () => {
    navigation.navigate(ROUTES.MY_LISTINGS);
  };

  const requestNotiPermission = async () => {
    try {
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

  const handleNotificationSettings = async () => {
    let status = null;

    try {
      const res = await checkNotifications();
      status = res?.status || null;
    } catch {
      status = null;
    }

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

  // ✅ 표시용 닉네임/프로필 사진
  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || "알 수 없음";
  const photoURL = userProfile?.photoURL || null;

  // ✅ [수정] 상단 SafeArea 여백을 “줄여서” 적용 (배경 잘림 방지)
  const reducedTopInset = Math.max((insets?.top || 0) - 12, 0);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={[styles.topSafeBg, { height: reducedTopInset }]} />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* 1. 프로필 + 통계 통합 섹션 */}
        <View style={styles.profileHeader}>
          {/* 상단: 프사 + 이름 */}
          <View style={styles.userInfoRow}>
            {/* ✅ [추가] 프로필 사진 수정 진입 */}
            <TouchableOpacity
              style={styles.avatar}
              activeOpacity={0.8}
              onPress={() => setProfileEditModalVisible(true)}
            >
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.avatarImg} />
              ) : (
                <>
                  <Ionicons name="person" size={32} color="black" />
                  {/* ✅ [추가] 기본 프로필(사진 없음) 우측하단 이미지 아이콘 오버레이 */}
                  <View style={styles.avatarOverlay}>
                    <Ionicons name="image-outline" size={16} color="black" />
                  </View>
                </>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* ✅ [추가] 닉네임 수정 진입 */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setNicknameInput(displayName === "알 수 없음" ? "" : displayName);
                    setNicknameEditModalVisible(true);
                  }}
                >
                  <Text style={styles.nickname} numberOfLines={1}>
                    {displayName}
                  </Text>
                </TouchableOpacity>

                {/* ✅ [추가] 닉네임 옆 편집(연필) 아이콘 */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setNicknameInput(displayName === "알 수 없음" ? "" : displayName);
                    setNicknameEditModalVisible(true);
                  }}
                  style={styles.nicknameEditBtn}
                >
                  <Ionicons name="pencil" size={16} color="#CCC" />
                </TouchableOpacity>

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

          {/* 하단: 통계 */}
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

        {/* 2. 프리미엄 배너 */}
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

          {/* ✅ 차단 사용자 관리 버튼 */}
          <MenuLink
            icon="person-remove-outline"
            label="차단 사용자 관리"
            onPress={handleManageBlockedUsers}
          />

          <MenuLink
            icon="card-outline"
            label="구독 관리"
            onPress={handleManageSubscription}
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

      {/* ✅ 기존 공용 모달 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalVisible(false)}
      />

      {/* ✅ [추가] 프로필 사진 수정 모달 (상단 시스템과 겹치지 않게: CustomModal 내부에서 처리) */}
      <CustomModal
        visible={profileEditModalVisible}
        title="프로필 사진 수정"
        message="내 앨범에서 이미지를 선택하시겠습니까?"
        type="confirm"
        onConfirm={async () => {
          // ✅ 확인 누르면: 앨범 열기 → 저장 성공 시 닫힘
          await handlePickProfileImage();
        }}
        onCancel={() => setProfileEditModalVisible(false)}
      />

      {/* ✅ [추가] 닉네임 수정 모달 (키보드가 입력창 가리지 않게) */}
      <CustomModal
        visible={nicknameEditModalVisible}
        title="닉네임 수정"
        message={null}
        onConfirm={undefined}
        onCancel={() => {
          Keyboard.dismiss();
          setNicknameEditModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <View style={{ width: '100%', marginTop: 8 }}>
            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="닉네임을 입력하세요"
              placeholderTextColor="#666"
              style={styles.nicknameInput}
              returnKeyType="done"
              onSubmitEditing={handleSaveNickname}
            />

            <View style={styles.nicknameBtnRow}>
              <TouchableOpacity
                style={styles.nicknameBtnCancel}
                activeOpacity={0.85}
                onPress={() => {
                  Keyboard.dismiss();
                  setNicknameEditModalVisible(false);
                }}
              >
                <Text style={styles.nicknameBtnCancelText}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.nicknameBtnConfirm}
                activeOpacity={0.85}
                onPress={handleSaveNickname}
              >
                <Text style={styles.nicknameBtnConfirmText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </CustomModal>

      {/* ✅ 차단 관리 리스트 모달 */}
      <CustomModal
        visible={blockedListModalVisible}
        title="차단 사용자 관리"
        message={null}
        onConfirm={() => setBlockedListModalVisible(false)}
        confirmText="닫기"
        onCancel={() => setBlockedListModalVisible(false)}
      >
        <View style={{ width: '100%', maxHeight: 300, marginTop: 10 }}>
          {loadingBlocked ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : blockedProfiles.length === 0 ? (
            <Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>차단된 사용자가 없습니다.</Text>
          ) : (
            <ScrollView style={{ width: '100%' }}>
              {blockedProfiles.map((item) => (
                <View key={item.id} style={styles.blockedItemRow}>
                  <Text style={styles.blockedUserText} numberOfLines={1}>
                    {item.nickname}
                  </Text>
                  <TouchableOpacity
                    style={styles.unblockBtn}
                    onPress={() => handleUnblock(item.id)}
                  >
                    <Text style={styles.unblockBtnText}>해제</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </CustomModal>

      {/* ✅ 차단 해제 성공 알림 모달 */}
      <CustomModal
        visible={unblockSuccessVisible}
        title="알림"
        message="차단이 해제되었습니다."
        onConfirm={() => {
          setUnblockSuccessVisible(false);
          // ✅ [수정] 확인 버튼을 누르면 관리 팝업도 함께 닫아버림 (요청 사항 반영)
          setBlockedListModalVisible(false);
        }}
        confirmText="확인"
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

  // ✅ [추가] 상단 배경 잘림 방지용(상단 여백 줄이기와 분리 처리)
  topSafeBg: {
    width: "100%",
    backgroundColor: theme.background,
  },

  // ✅ [수정] 상단 여백 줄임 (요청사항 3)
  scrollContent: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 60 },

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
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },

  // ✅ [추가] 기본 프로필 우측하단 이미지 아이콘 오버레이
  avatarOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  nickname: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 6,
  },

  // ✅ [추가] 닉네임 편집 아이콘 버튼
  nicknameEditBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  premiumBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
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

  // ✅ [추가] 닉네임 수정 입력/버튼
  nicknameInput: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: 'white',
  },
  nicknameBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  nicknameBtnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameBtnCancelText: {
    color: '#CCC',
    fontSize: 14,
    fontWeight: 'bold',
  },
  nicknameBtnConfirm: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameBtnConfirmText: {
    color: 'black',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // 차단 목록 모달 스타일
  blockedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  blockedUserText: {
    color: 'white',
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  unblockBtn: {
    backgroundColor: '#444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  unblockBtnText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: 'bold',
  }
});
