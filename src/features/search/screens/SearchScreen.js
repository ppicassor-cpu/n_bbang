// FILE: src/features/search/screens/SearchScreen.js

import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView, 
  Keyboard,
  Animated,
  Easing,
  TouchableWithoutFeedback 
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../../../components/MyText";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
// ✅ [추가] 파이어베이스 Firestore 관련 임포트
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../../../firebaseConfig"; 
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme"; 
import CustomModal from "../../../components/CustomModal"; 

const SEARCH_HISTORY_KEY = "SEARCH_HISTORY_V1";
const AUTO_SAVE_KEY = "SEARCH_AUTO_SAVE_V1";

// ✅ [수정] homeDong을 props나 전역 상태에서 받아오도록 설정
export default function SearchScreen() {
  const { homeDong, myCoords, getDistanceFromLatLonInKm } = useAppContext();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomSafePadding = Math.max(insets.bottom, 12);

  // ✅ [수정] 검색 프로세스 및 데이터 관리를 위한 상태들
  const [keyword, setKeyword] = useState("");
  const [history, setHistory] = useState([]);
  const [isAutoSave, setIsAutoSave] = useState(true);
  const [searchMode, setSearchMode] = useState("INITIAL"); // INITIAL | SUGGESTING | RESULT
  const [suggestions, setSuggestions] = useState([]); 
  const [results, setResults] = useState([]);     
  const [activeTab, setActiveTab] = useState("ALL"); 
  const [sourceData, setSourceData] = useState([]); 

  // ✅ 모달 관리
  const [modalType, setModalType] = useState(null); 

  // ✅ 토글 애니메이션 값
  const toggleAnim = useRef(new Animated.Value(1)).current; 

  // 🔹 네비게이션 헤더 숨기기
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // 🔹 초기 로드 및 동네 변경 감지 (데이터 누락 방지)
  useEffect(() => {
    loadSettings();
    if (homeDong && homeDong !== "내 동네 설정") {
      fetchSourceData(); 
    }
  }, [homeDong]); // ✅ homeDong이 확정되는 순간 다시 불러오도록 구조 수정

  // ✅ [추가] 파이어베이스에서 우리 동네 전체 게시글 로드
  const fetchSourceData = async () => {
  // 구조적 핵심: homeDong이 유효한 문자열(동네이름)일 때만 Firebase 호출 허용
  if (!homeDong || typeof homeDong !== "string" || homeDong === "내 동네 설정") return;

  try {
    // 1) posts: location==homeDong + dong==homeDong 두 케이스 모두 커버
    const postsRef = collection(db, "posts");
    const q1 = query(postsRef, where("location", "==", homeDong));
    const q2 = query(postsRef, where("dong", "==", homeDong));

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const postsMap = new Map();
    snap1.docs.forEach((d) => postsMap.set(d.id, { id: d.id, ...d.data() }));
    snap2.docs.forEach((d) => postsMap.set(d.id, { id: d.id, ...d.data() }));

    const postsData = Array.from(postsMap.values());

    // 2) stores: stores 컬렉션 로드 → Search용으로 posts 형태로 정규화
    const storesRef = collection(db, "stores");
    const qs = query(storesRef, orderBy("createdAt", "desc"), limit(500));
    const storesSnap = await getDocs(qs);

    const storesData = storesSnap.docs.map((d) => {
      const s = d.data() || {};
      return {
        id: d.id,
        ...s,

        // ✅ Search/탭필터/표시 통일용 필드
        type: "store",
        title: s.name,
        storeName: s.name,
        name: s.name,

        // ✅ 홈에서 보이던 주소 표시용(동+상세주소가 address에 들어있으면 그대로 노출)
        location: s.address,
        address: s.address,

        // ✅ 거리 계산용 좌표 통일
        coords: s.location,

        // ✅ 홈처럼 “핫플레이스/실카테고리” 구분 가능하게
        category: "핫플레이스",
        realCategory: s.category,
      };
    });

    const merged = [...postsData, ...storesData];

    setSourceData(merged);
    console.log(`[${homeDong}] posts:${postsData.length} / stores:${storesData.length} / total:${merged.length} 로드 완료`);
  } catch (e) {
    console.error("DB 데이터 로딩 실패:", e);
  }
};


  // 🔹 토글 애니메이션 효과
  useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: isAutoSave ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isAutoSave]);

  const loadSettings = async () => {
    try {
      const savedAutoSave = await AsyncStorage.getItem(AUTO_SAVE_KEY);
      if (savedAutoSave !== null) {
        const isActive = savedAutoSave === "true";
        setIsAutoSave(isActive);
        toggleAnim.setValue(isActive ? 1 : 0);
      }

      const savedHistory = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error("검색 설정 로드 실패:", e);
    }
  };

  // ✅ [추가] 검색어 정규화 (띄어쓰기 무시, 소문자 변환)
  const normalizeString = (str) => {
    if (!str) return "";
    return String(str).replace(/\s/g, "").toLowerCase();
  };

  // ✅ [핵심] 탭 필터용 카테고리 정규화 (NBANG / STORE / OTHER)
  const getItemCategory = (item) => {
    const raw = normalizeString(item?.type || item?.postType || item?.category || item?.kind);

    if (raw.includes("nbang") || raw.includes("n빵") || raw.includes("나눔")) return "NBANG";
    if (raw.includes("store") || raw.includes("핫스토어") || raw.includes("hotstore") || raw.includes("핫플") || raw.includes("hotplace")) return "STORE";

    return "OTHER";
  };

  // ✅ [핵심] 검색 대상 텍스트(상호 포함) 구성
  const getSearchText = (item) => {
    return [
      item?.title,
      item?.storeName,
      item?.shopName,
      item?.name,
      item?.brandName,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const matchSearch = (item, text) => {
    return normalizeString(getSearchText(item)).includes(normalizeString(text));
  };

  // ✅ (표시용) 제목/상호 우선순위
  // ✅ (표시용) 제목/상호 우선순위
const getDisplayTitle = (item) => {
  return item?.title || item?.storeName || item?.shopName || item?.name || "제목 없음";
};

// ✅ [추가] 주소(동+상세주소) 표기
const getDisplayLocation = (item) => {
  return item?.location || item?.address || item?.dong || "";
};

// ✅ [추가] 시간/거리 표기(홈 로직과 동일한 방식)
const _toMs = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const _agoText = (baseMs, actionText) => {
  if (!baseMs) return actionText;
  const now = Date.now();
  const diff = Math.max(0, now - baseMs);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return `방금 전 ${actionText}`;
  if (minutes < 60) return `${minutes}분 전 ${actionText}`;

  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours}시간 전 ${actionText}`;
  }

  const days = Math.floor(minutes / 1440);
  return `${days}일 전 ${actionText}`;
};

const getTimeStatusText = (item) => {
  const createdAtMs = _toMs(item?.createdAt || 0);
  const updatedAtMs = _toMs(item?.updatedAt || 0);
  const hasUpdated = Boolean(updatedAtMs) && (!createdAtMs || updatedAtMs > createdAtMs);
  return hasUpdated ? _agoText(updatedAtMs, "수정") : _agoText(createdAtMs, "작성");
};

const getItemCoords = (item) => {
  const c = item?.coords || null;
  const lat = c?.latitude ?? c?._latitude ?? c?.lat ?? null;
  const lng = c?.longitude ?? c?._longitude ?? c?.lng ?? null;

  const nLat = Number(lat);
  const nLng = Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  return { latitude: nLat, longitude: nLng };
};

const getDistanceText = (item) => {
  try {
    if (!myCoords || typeof getDistanceFromLatLonInKm !== "function") return "";

    const aLat = Number(myCoords?.latitude);
    const aLng = Number(myCoords?.longitude);
    const c = getItemCoords(item);

    if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !c) return "";

    const km = getDistanceFromLatLonInKm(aLat, aLng, c.latitude, c.longitude);
    if (!Number.isFinite(km)) return "";

    if (km < 1) return ` · ${Math.round(km * 1000)}m`;
    return ` · ${km.toFixed(1)}km`;
  } catch {
    return "";
  }
};


  // ✅ [추가] 입력 시 자동 추천 로직
  const handleTextChange = (text) => {
    setKeyword(text);
    if (text.trim().length > 0) {
      setSearchMode("SUGGESTING"); 
      const filtered = sourceData.filter(item => 
        matchSearch(item, text)
      );
      setSuggestions(filtered.slice(0, 10)); 
    } else {
      setSearchMode("INITIAL");
    }
  };

  // ✅ [수정] 통합 검색 실행 함수 (결과 모드 전환 및 결과 도출)
  const handleSearch = async (targetKeyword) => {
    const text = (typeof targetKeyword === 'string' ? targetKeyword : keyword).trim();
    if (!text) return;

    Keyboard.dismiss();
    setSearchMode("RESULT"); 

    const filteredResults = sourceData.filter(item => 
      matchSearch(item, text)
    );
    setResults(filteredResults);

    if (!isAutoSave) return; 

    const newHistory = [text, ...history.filter((t) => t !== text)].slice(0, 20); 
    setHistory(newHistory);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };

  // ✅ [추가] 취소 버튼 핸들러 (모드에 따라 뒤로가기 혹은 초기화)
  const handleCancelBtn = () => {
    if (searchMode !== "INITIAL") {
      setSearchMode("INITIAL");
      setKeyword("");
    } else {
      navigation.goBack();
    }
  };

  const handleDeleteItem = async (targetText) => {
    const newHistory = history.filter((t) => t !== targetText);
    setHistory(newHistory);
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  };

  const executeDeleteAll = async () => {
    setHistory([]);
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    setModalType(null);
  };

  const executeToggleAutoSave = async () => {
    const nextState = !isAutoSave;
    setIsAutoSave(nextState);
    await AsyncStorage.setItem(AUTO_SAVE_KEY, nextState ? "true" : "false");
    setModalType(null);
  };
  
  const toggleBgColor = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#555", "#6ba138"] 
  });

  const toggleCircleTranslate = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22] 
  });

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        
        {/* ====================================
            1. 상단 헤더 (입력 이벤트 연결)
           ==================================== */}
        <View style={styles.header}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={22} color="#AAA" style={{ marginLeft: 10 }} />
            <TextInput
              style={styles.input}
              placeholder="검색어를 입력해주세요"
              placeholderTextColor="#777"
              value={keyword}
              onChangeText={handleTextChange} 
              onSubmitEditing={() => handleSearch()} 
              returnKeyType="search"
              autoFocus={true}
              allowFontScaling={false}
            />
            {keyword.length > 0 && (
              <TouchableOpacity 
                onPress={() => {setKeyword(""); setSearchMode("INITIAL");}} 
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={20} color="#777" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity 
            style={styles.cancelBtn} 
            onPress={handleCancelBtn} // ✅ [수정] 커스텀 핸들러 연결
          >
            <Text style={styles.cancelText}>취소</Text>
          </TouchableOpacity>
        </View>

        {/* ====================================
            2. 컨트롤 영역 (초기 상태일 때만 노출)
           ==================================== */}
        {searchMode === "INITIAL" && ( 
          <View style={styles.controlRow}>
            <Text style={styles.recentLabel}>최근 검색</Text>

            <View style={styles.controlRightGroup}>            
                <>
                  <TouchableOpacity 
                      onPress={() => setModalType('DELETE_ALL')}
                      disabled={history.length === 0}
                  >
                  <Text style={[
                      styles.deleteAllText, 
                      history.length === 0 && { color: "#333" } 
                   ]}>
                      전체삭제
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.vDivider} />
                </>           

              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => setModalType('TOGGLE_AUTO_SAVE')}
                style={styles.toggleBtn}
              >
                <Text style={[styles.toggleText, !isAutoSave && { color: '#888' }]}>자동저장</Text>
                <Animated.View style={[styles.toggleTrack, { backgroundColor: toggleBgColor }]}>
                  <Animated.View 
                    style={[
                      styles.toggleCircle, 
                      { transform: [{ translateX: toggleCircleTranslate }] }
                    ]} 
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ====================================
            3. 컨텐츠 영역 (구조적 분기)
           ==================================== */}

        {/* --- A. 초기 상태: 최근 검색어 목록 --- */}
        {searchMode === "INITIAL" && (
          history.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {isAutoSave ? "최근 검색 내역이 없습니다." : "자동저장 기능이 꺼져있습니다."}
              </Text>
            </View>
          ) : (
            <ScrollView 
              style={{ flex: 1 }}
              contentContainerStyle={styles.historyList}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
            >
              {history.map((item, index) => (
                <TouchableOpacity 
                  key={`history_${index}`} 
                  style={styles.historyBox}
                  activeOpacity={0.7}
                  onPress={() => handleSearch(item)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.rowCloseBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item);
                    }}
                  >
                    <Ionicons name="close" size={18} color="#999" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        )}

        {/* --- B. 입력 중: 자동 추천 목록 (SUGGESTING) --- */}
        {searchMode === "SUGGESTING" && (
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {suggestions.map((item, index) => (
              <TouchableOpacity 
                key={item.id || `suggest_${index}`} 
                style={styles.suggestionRow}
                onPress={() => handleSearch(getDisplayTitle(item))}
              >
                <Ionicons name="search-outline" size={18} color="#666" style={{ marginRight: 12 }} />
                <Text style={styles.suggestionText}>{getDisplayTitle(item)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* --- C. 검색 완료: 결과 화면 (레이아웃 수정됨) --- */}
        {searchMode === "RESULT" && (
          <View style={{ flex: 1 }}>
            {/* 탭 바 영역 */}
            <View style={styles.tabBarContainer}>
              {[
                { id: 'ALL', label: '전체' },
                { id: 'NBANG', label: 'N빵/나눔' },
                { id: 'STORE', label: '핫스토어' }
              ].map((tab) => (
              <TouchableOpacity 
                  key={tab.id}
                  style={[
                    styles.tabItem, 
                    activeTab === tab.id && styles.tabItemActive,
                    tab.id === 'STORE' && { marginRight: 30 } // ✅ [수정] 이 숫자(30)를 키울수록 왼쪽으로 더 이동합니다.
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {results.filter(item => activeTab === 'ALL' || getItemCategory(item) === activeTab).length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>검색 결과가 없습니다.</Text>
                </View>
              ) : (
                results
                  .filter(item => activeTab === 'ALL' || getItemCategory(item) === activeTab)
                  .map((item, index) => (
                    // ✅ [수정] 클릭 시 게시물 상세로 연결 (N빵: Detail, 스토어: StoreDetail)
                    <TouchableOpacity 
                      key={item.id || `result_${index}`} 
                      style={styles.resultCardPlaceholder}
                      onPress={() => {
                        if (item.type === 'store') {
                          navigation.navigate('StoreDetail', { store: item });
                        } else {
                          navigation.navigate('Detail', { post: item });
                        }
                      }}
                    >
                      <View style={styles.resultItemLayout}>
                        {/* 1. 왼쪽: 제목 (한 줄) */}
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {getDisplayTitle(item)}
                        </Text>

                        {/* 2. 오른쪽: 주소+거리(상단) & 시간(하단) - 두 줄 구성 */}
                        <View style={styles.resultInfoGroup}>
                          <Text style={styles.resultSubInfo} numberOfLines={1}>
                            {(getDisplayLocation(item) || "지역 정보 없음")}{getDistanceText(item)}
                          </Text>
                          <Text style={styles.resultMeta}>
                            {getTimeStatusText(item)}
                          </Text>
                        </View>

                        {/* 3. 맨 오른쪽: 바로가기 아이콘 (두 줄 높이 중앙 배치) */}
                        <View style={styles.resultActionIcon}>
                          <Ionicons name="chevron-forward" size={18} color="#666" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </View>
        )}

        {/* ====================================
            4. 하단 레이아웃 및 모달
           ==================================== */}
        <TouchableOpacity 
          style={styles.adMobPlaceholder} 
          activeOpacity={0.9}
          onPress={() => setModalType('ADMOB')}
        >
          <View style={styles.adTag}>
            <Text style={styles.adTagText}>AD</Text>
          </View>
          <Text style={styles.adText}>광고 문의</Text>
        </TouchableOpacity>
        <View style={{ height: insets.bottom }} />
        <View style={{ height: bottomSafePadding }} />

        <CustomModal
          visible={modalType === 'DELETE_ALL'}
          title="검색 기록 삭제"
          message="최근 검색 내역을 모두 삭제하시겠습니까?"
          onConfirm={executeDeleteAll}
          onCancel={() => setModalType(null)}
          confirmText="삭제"
          type="confirm"
        />

        <CustomModal
          visible={modalType === 'TOGGLE_AUTO_SAVE'}
          title={isAutoSave ? "자동저장 끄기" : "자동저장 켜기"}
          message={isAutoSave 
            ? "최근 검색 저장 기능을 사용을 중지하시겠습니까?\n기존 내역은 유지됩니다." 
            : "최근 검색 저장 기능을 다시 켜시겠습니까?"
          }
          onConfirm={executeToggleAutoSave}
          onCancel={() => setModalType(null)}
          confirmText="확인"
          type="confirm"
        />

        <CustomModal
          visible={modalType === 'ADMOB'}
          title="준비 중입니다"
          message="광고 기능은 추후 업데이트될 예정입니다."
          onConfirm={() => setModalType(null)}
          confirmText="확인"
          type="alert"
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: "white",
    fontSize: 14,
    marginLeft: 8,
    height: "100%",
  },
  cancelBtn: { paddingVertical: 10, paddingLeft: 4, paddingRight: 16 },
  cancelText: { color: "white", fontSize: 16, fontWeight: "600" },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  controlRightGroup: { flexDirection: 'row', alignItems: 'center' },
  recentLabel: { color: "white", fontSize: 20, fontWeight: "bold", marginLeft: 10 },
  deleteAllText: { color: "#AAA", fontSize: 15 },
  vDivider: { width: 1, height: 12, backgroundColor: "#2A2A2A", marginHorizontal: 12 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center' },
  toggleText: { color: "#AAA", fontSize: 15, marginRight: 8 },
  toggleTrack: { width: 46, height: 24, borderRadius: 12, justifyContent: 'center', padding: 2 },
  toggleCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },
  historyList: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  historyBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#222",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  historyText: { color: "#EEE", fontSize: 15, fontWeight: "500", flex: 1 },
  rowCloseBtn: { padding: 4, marginLeft: 8 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222',
  },
  suggestionText: { color: '#CCC', fontSize: 15 },
  
  tabBarContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: theme.background,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: theme.primary, 
  },
  tabLabel: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: 'white',
    fontWeight: 'bold',
  },

  resultCardPlaceholder: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  // ✅ [수정] 전체 3단 정렬 레이아웃
  resultItemLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultTitle: { 
    color: 'white', 
    fontWeight: 'bold',
    fontSize: 15,
    flex: 1, // 왼쪽에서 최대 공간 차지
    marginRight: 12,
  },
  resultInfoGroup: {
    alignItems: 'flex-end', // 오른쪽 텍스트들을 우측 정렬
    justifyContent: 'center',
  },
  resultSubInfo: { 
    color: '#AAA', 
    fontSize: 12,
    marginBottom: 2, // 위아래 간격 조절
  },
  resultMeta: { 
    color: '#666', 
    fontSize: 11,
  },
  resultActionIcon: {
    marginLeft: 10,
    justifyContent: 'center',
  },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyText: { color: "#5a5a5ad8", fontSize: 14 },
  adMobPlaceholder: {
    height: 60,
    backgroundColor: "#202020",
    borderTopWidth: 1,
    borderTopColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  adTag: { position: "absolute", left: 10, top: 6, backgroundColor: "#FFD700", paddingHorizontal: 3, borderRadius: 2 },
  adTagText: { fontSize: 9, fontWeight: "bold", color: "black" },
  adText: { color: "#666", fontSize: 12, marginTop: 4 },
});