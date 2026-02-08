// FILE: src/features/post/screens/DetailScreen.js

import React, { useState, useEffect, useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator, Alert, Modal  } from "react-native";
import { Text } from "../../../components/MyText";
import { Image } from "expo-image";
import ImageView from "react-native-image-viewing"; 
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";

// ✅ [추가] 닉네임 조회 및 숫자 증가를 위해 firebase 관련 모듈 추가
import { doc, getDoc, updateDoc, increment, runTransaction, arrayUnion, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { db } from "../../../firebaseConfig";

import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import { ensureRoom } from "../../chat/services/chatService";
import CustomModal from "../../../components/CustomModal";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ✅ 신고 사유 목록 정의
const REPORT_REASONS = [
  "광고 / 홍보성 게시글",
  "거래 금지 품목",
  "사기 / 허위 정보",
  "욕설 / 비하 발언",
  "기타 부적절한 내용"
];

export default function DetailScreen({ route, navigation }) {
  const { post: initialPost } = route.params || {};
    const { 
    user, deletePost, posts, updatePost, reportUser, blockUser,
    checkBoostEligibility, applyBoostToContent, clearExpiredActiveBoostIfNeeded,
    isPremium, membershipType,
    // ✅ [추가] 부스트 티켓 개수 가져오기
    boostTickets,
    addBoostTicket // 혹시 필요할까봐 가져옴 (여기선 안씀)
  } = useAppContext(); 
 
  const insets = useSafeAreaInsets();
  
  const [post, setPost] = useState(initialPost || null);
  const statusBtnRef = React.useRef(null);
  const [dropdownCoords, setDropdownCoords] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imgPage, setImgPage] = useState(1);

  // ✅ [추가] 작성자 닉네임 상태
  const [ownerNickname, setOwnerNickname] = useState("");

  const [isImageViewVisible, setIsImageViewVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // 기존 모달 상태
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  // 신고, 차단, 샘플 데이터 안내용 모달 상태
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);
  const [boostModalVisible, setBoostModalVisible] = useState(false);
  const [boostLoading, setBoostLoading] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempStatus, setTempStatus] = useState(""); 
  const [loading, setLoading] = useState(false);

  // ✅ 신고 완료 후 홈 이동 플래그
  const [goHomeAfterSuccess, setGoHomeAfterSuccess] = useState(false);

  // ✅ 무료나눔 분기
  const isFree = post?.category === "무료나눔";

  // ✅ [수정] useMemo를 return문 위로 올림 (Hooks 순서 에러 해결)
  const mapRegion = useMemo(() => ({
    latitude: post?.coords?.latitude || 37.5665,
    longitude: post?.coords?.longitude || 126.9780,
    latitudeDelta: post?.coords?.latitudeDelta ?? 0.005,
    longitudeDelta: post?.coords?.longitudeDelta ?? 0.005,
  }), [post]);

  useEffect(() => {
    if (!initialPost?.id) return;
    const updated = posts.find(p => p.id === initialPost.id);
    if (updated) {
      setPost(updated);
      setTempStatus(updated.status || "모집중");
    }
  }, [posts, initialPost?.id]);

  // ✅ [추가] 작성자 닉네임 가져오기 로직
  useEffect(() => {
    const fetchNickname = async () => {
      if (!post?.ownerId) return;

      // 샘플 데이터 처리
      if (post.ownerId === "SAMPLE_DATA") {
        setOwnerNickname("운영팀 (예시)");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", post.ownerId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          // displayName이 없으면 이메일 앞부분 사용
          setOwnerNickname(data.displayName || data.email?.split("@")[0] || "알 수 없음");
        } else {
          setOwnerNickname("탈퇴한 사용자");
        }
      } catch (e) {
        console.error("닉네임 조회 실패:", e);
      }
    };

    fetchNickname();
  }, [post?.ownerId]);

  // ✅ 무료나눔 글이 이 화면으로 들어오면 무료나눔 상세로 리다이렉트
  useEffect(() => {
    if (post?.category === "무료나눔") {
      navigation.replace(ROUTES.FREE_DETAIL, { post });
    }
  }, [post?.category, post, navigation]);

  // ❌ [주의] 이 return 문이 Hooks보다 아래에 있어야 함
  if (!post) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "white" }}>게시글 정보가 없습니다.</Text>
      </View>
    );
  }

  // ✅ 무료나눔은 이 화면에서 렌더하지 않음(리다이렉트 중 화면 깜빡임 방지)
  if (isFree) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="small" color="white" />
      </View>
    );
  }

  const isMyPost = user && user.uid === post.ownerId;
  const isClosed = post.status === "마감";
  const isFull = post.currentParticipants >= post.maxParticipants || isClosed;

  const roomId = `post_${post.id}`;
  const roomName = post.title || "공동구매 채팅방";

  const onPressChat = async () => {
    // 샘플 데이터인지 확인하여 커스텀 모달 띄우기
    if (post.ownerId === "SAMPLE_DATA") {
      setSampleModalVisible(true);
      return;
    }

    if (isFull) return;

    setLoading(true); // 로딩 표시 (선택사항)

    try {
      // 1. 먼저 채팅방을 생성/확인합니다.
      await ensureRoom(roomId, roomName, "group", post.ownerId);

      // 2. ✅ 참여가 DB에 기록되는 순간 카운트 증가
      if (!isMyPost) {
        let didIncrement = false;

        try {
          const roomRef = doc(db, "chatRooms", roomId);
          const postRef = doc(db, "posts", post.id);

                    await runTransaction(db, async (tx) => {
            const roomSnap = await tx.get(roomRef);
            if (!roomSnap.exists()) {
              throw new Error("chatRooms 문서가 존재하지 않습니다.");
            }

            const roomData = roomSnap.data() || {};
            const participants = Array.isArray(roomData.participants) ? roomData.participants : [];

            const joinedKey = `joinedAt_${user.uid}`;
            const hasJoinedAt = !!roomData?.[joinedKey];

            // 이미 참여한 유저면 중복 증가 방지 + joinedAt 누락 보정
            if (participants.includes(user.uid)) {
              if (!hasJoinedAt) {
                tx.update(roomRef, {
                  [joinedKey]: serverTimestamp(),
                });
              }
              return;
            }

            // 참여 기록 + 카운트 증가 (participants 추가와 joinedAt 기록을 같은 트랜잭션에서)
            tx.update(roomRef, {
              participants: arrayUnion(user.uid),
              [joinedKey]: serverTimestamp(),
            });
            tx.update(postRef, {
              currentParticipants: increment(1),
            });

            didIncrement = true;
          });


          // 트랜잭션 성공 시에만 로컬 UI 반영
          if (didIncrement) {
            setPost(prev => ({ ...prev, currentParticipants: Number(prev.currentParticipants || 0) + 1 }));

            try {
              await addDoc(collection(db, "chatRooms", roomId, "messages"), {
                text: "님이 입장했습니다.", // 렌더링 시 닉네임 조합됨
                createdAt: serverTimestamp(),
                senderId: "system",
                type: "system",
                actorId: user.uid,
                // 👇 여기가 핵심! 내 최신 닉네임을 같이 저장
                displayName: user.displayName || "알 수 없음", 
                actorDisplayName: user.displayName || "알 수 없음" 
              });
            } catch (e) {
              console.warn("입장 메시지 생성 실패:", e);
            }
          }
        } catch (e) {
          console.error("참여 트랜잭션 실패:", e);
          // ⚠️ 여기서 에러가 나면 채팅방 입장을 막고 사용자에게 알려야 함
          setAlertMsg("참여 처리 중 오류가 발생했습니다.\n(잠시 후 다시 시도해주세요)");
          setErrorModalVisible(true);
          return; // 함수 종료 (채팅방 이동 안 함)
        }
      }

      // 3. 모든 과정 성공 시 채팅방으로 이동
      navigation.navigate(ROUTES.CHAT_ROOM, { roomId, roomName });

    } catch (e) {
      console.error("채팅방 입장 실패:", e);
      setAlertMsg("채팅방 입장에 실패했습니다.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleDropdown = () => {
    if (isDropdownOpen) {
      setIsDropdownOpen(false);
      return;
    }
    // 버튼의 화면상 위치 측정
    statusBtnRef.current?.measure((fx, fy, width, height, px, py) => {
      setDropdownCoords({ x: px, y: py, width, height });
      setIsDropdownOpen(true);
    });
  };

  const handleEdit = () => {
    navigation.navigate(ROUTES.WRITE, { post });
  };

  const handleStatusUpdate = async () => {
    setLoading(true);
    try {
      await updatePost(post.id, { 
        status: tempStatus,
        updatedAt: new Date().toISOString() 
      });
      
      // ✅ [수정] 로컬 상태 업데이트 (화면 즉시 반영)
      setPost(prev => ({ ...prev, status: tempStatus }));

      setIsDropdownOpen(false);
      setAlertMsg("모집 상태가 성공적으로 변경되었습니다.");
      setSuccessModalVisible(true);
    } catch (error) {
      setAlertMsg("변경에 실패했습니다.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deletePost(post.id);
      setDeleteModalVisible(false); 
      navigation.goBack();
    } catch (error) {
      setDeleteModalVisible(false);
      setAlertMsg("삭제 중 오류가 발생했습니다.");
      setErrorModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // 신고 핸들러
  const handleReport = () => {
    setIsDropdownOpen(false);
    setReportModalVisible(true);
  };

  // ✅ 신고 확정 처리
  const confirmReport = async (selectedReason) => {
    try {
      await reportUser(post.ownerId, post.id, selectedReason, "post", true);
      await blockUser(post.ownerId, true);
    } catch (e) {
      console.warn("report/block failed:", e);
    } finally {
      setReportModalVisible(false);
      setGoHomeAfterSuccess(true);
      setAlertMsg("신고가 접수되었습니다. 검토 후 조치하겠습니다.");
      setSuccessModalVisible(true);
    }
  };

  // 차단 핸들러
  const handleBlock = () => {
    setIsDropdownOpen(false);
    setBlockModalVisible(true);
  };

  // 차단 확정 처리
  const confirmBlock = async () => {
    await blockUser(post.ownerId);
    setBlockModalVisible(false);
    navigation.goBack();
  };

  /* =========================
      Boost(부스트)
  ========================= */

  // ✅ boostUntil 기반 안전 판정
  const _toMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const _isBoostActive = () => _toMs(post?.boostUntil) > Date.now();

  const openBoostModal = async () => {
    if (_isBoostActive()) {
      setAlertMsg("이미 부스트가 진행 중인 글입니다.");
      setErrorModalVisible(true);
      return;
    }

    try {
      if (clearExpiredActiveBoostIfNeeded) {
        await clearExpiredActiveBoostIfNeeded();
      }
    } catch {}

    if (_isBoostActive()) {
      setAlertMsg("이미 부스트가 진행 중인 글입니다.");
      setErrorModalVisible(true);
      return;
    }

    setBoostModalVisible(true);
  };

  const _boostErrorMessage = (elig) => {
    const status = String(elig?.status || "");

    if (status === "HAS_ACTIVE_BOOST") {
      const slot = String(elig?.activeBoost?.slotLabel || elig?.activeBoost?.slot || "").trim();
      return slot
        ? `이미 진행 중인 부스트가 있습니다. (${slot} 카테고리에서는 동시에 1개만 가능)`
        : "이미 진행 중인 부스트가 있습니다. (카테고리별로 동시에 1개만 가능)";
    }

    if (status === "TOO_EARLY") return "작성 후 6시간이 지난 글만 무료/멤버십 부스트가 가능합니다.";
    if (status === "FREE_DAILY_LIMIT") return "오늘 무료 부스트(1회)를 이미 사용하셨습니다.";
    if (status === "NOT_PREMIUM") return "멤버십 부스트는 프리미엄 회원만 가능합니다.";
    if (status === "MEMBERSHIP_LIMIT") return "이번 달 멤버십 부스트 횟수를 모두 사용하셨습니다.";
    if (status === "FAILED" || status === "ERROR") return "부스트 적용에 실패했습니다.";

    return "부스트 조건을 만족하지 않습니다.";
  };

  // ✅ [수정] 티켓 사용 로직 추가된 runBoost
  const runBoost = async (mode) => {
    if (!post?.id) return;

    if (_isBoostActive()) {
      setBoostModalVisible(false);
      setAlertMsg("이미 부스트가 진행 중인 글입니다.");
      setErrorModalVisible(true);
      return;
    }

    if (typeof checkBoostEligibility !== "function" || typeof applyBoostToContent !== "function") {
      setBoostModalVisible(false);
      setAlertMsg("부스트 기능이 아직 준비되지 않았습니다.");
      setErrorModalVisible(true);
      return;
    }

    // 1. 티켓 모드일 경우 선검증 및 차감
    if (mode === "ticket") {
        if (boostTickets < 1) {
            setBoostModalVisible(false);
            setAlertMsg("보유한 부스트 티켓이 없습니다.");
            setErrorModalVisible(true);
            return;
        }
    }

    setBoostLoading(true);
    try {
      const isAdminUser = (user?.isAdmin === true || user?.role === "admin" || membershipType === "admin");

      // 2. 무료/멤버십은 자격 검증 (티켓은 위에서 개수만 확인하고 패스)
      // ✅ 관리자 글(관리자 계정)은 작성 후 6시간 제한(TOO_EARLY) 무시
      if (mode !== "ticket" && !isAdminUser) {
          const elig = await checkBoostEligibility({
            contentType: "post",
            contentId: post.id,
            mode,
          });

          if (!elig?.ok) {
            setBoostModalVisible(false);
            setAlertMsg(_boostErrorMessage(elig));
            setErrorModalVisible(true);
            setBoostLoading(false); 
            return;
          }
      }

      // 3. 실제 부스트 적용 (DB 기록)
      const durationHours = isAdminUser ? 24 : 2;

            const res = await applyBoostToContent({
        contentType: "post",
        contentId: post.id,
        mode,
        durationHours,
      });

      // ✅ 관리자 계정인데 서버/컨텍스트에서 TOO_EARLY로 막는 경우: 이 화면에서 강제 적용(6시간 제한 완전 우회)
      if (!res?.ok && isAdminUser && String(res?.status || "") === "TOO_EARLY") {
        try {
          const untilMs = Date.now() + durationHours * 60 * 60 * 1000;
          const postRef = doc(db, "posts", post.id);

          await updateDoc(postRef, {
            boostUntil: new Date(untilMs),
            boostAppliedAt: serverTimestamp(),
          });

          setPost((prev) => ({
            ...prev,
            boostUntil: untilMs,
            boostAppliedAt: Date.now(),
          }));

          setBoostModalVisible(false);
          setAlertMsg("부스트가 적용되었습니다. (" + durationHours + "시간)");
          setSuccessModalVisible(true);
          return;
        } catch (e) {
          console.error("관리자 TOO_EARLY 강제 부스트 실패:", e);
        }
      }

      if (res?.ok) {
        // 4. 티켓 모드였다면 DB에서 티켓 차감 (트랜잭션 후 처리)
        if (mode === "ticket") {
            try {
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, {
                    boostTickets: increment(-1)
                });
            } catch (e) {
                console.error("티켓 차감 실패:", e);
                // (이미 부스트는 적용되었으므로 에러만 로그)
            }
        }

        const fallbackUntil = Date.now() + durationHours * 60 * 60 * 1000;
        const nextBoostUntil = res?.boostUntil ?? res?.data?.boostUntil ?? fallbackUntil;
        const nextBoostAppliedAt = res?.boostAppliedAt ?? res?.data?.boostAppliedAt ?? Date.now();

        setPost((prev) => ({
          ...prev,
          boostUntil: nextBoostUntil,
          boostAppliedAt: nextBoostAppliedAt,
        }));

        setBoostModalVisible(false);
        setAlertMsg("부스트가 적용되었습니다. (" + durationHours + "시간)");
        setSuccessModalVisible(true);
        return;
      }


      setBoostModalVisible(false);
      setAlertMsg(_boostErrorMessage(res));
      setErrorModalVisible(true);

    } catch (e) {
      console.warn("runBoost 실패:", e);
      setBoostModalVisible(false);
      setAlertMsg("부스트 처리 중 오류가 발생했습니다.");
      setErrorModalVisible(true);
    } finally {
      setBoostLoading(false);
    }
  };


  const handleScroll = (event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setImgPage(Math.round(index) + 1);
  };

  const finalPerPerson = Number(post.pricePerPerson || 0) + Number(post.tip || 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* 이미지 섹션 */}
        <View style={styles.heroContainer}>
          {post.images && post.images.length > 0 ? (
            <>
              <ScrollView horizontal pagingEnabled onScroll={(e) => setImgPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH) + 1)}>
                {post.images.map((img, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    activeOpacity={0.9} 
                    onPress={() => {
                      setCurrentImageIndex(idx);
                      setIsImageViewVisible(true);
                    }}
                  >
                    <Image 
                      source={{ uri: img }} 
                      style={styles.heroImage} 
                      contentFit="cover"
                      transition={200}
                      cachePolicy="disk"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.pageIndicator}>
                <Text style={styles.pageText}>{imgPage} / {post.images.length}</Text>
              </View>
            </>
          ) : (
            <View style={[styles.heroImage, { justifyContent: "center", alignItems: "center", backgroundColor: "#222" }]}>
              <Text style={{ color: "grey", fontSize: 16 }}>이미지 없음</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
            
            <View style={styles.dropdownContainer}>
              {isMyPost ? (
                <TouchableOpacity 
                  ref={statusBtnRef} 
                  style={[
                    styles.statusBtn, 
                    isFull ? { borderColor: theme.danger } : { borderColor: theme.primary }]}                  
                  onPress={toggleDropdown} 
                >                  
                  <Text style={[
                    styles.statusBtnText, 
                    isFull ? { color: theme.danger } : { color: theme.primary }]}>
                    {post.status || "모집중"}
                  </Text>                 
                  <MaterialIcons name={isDropdownOpen ? "arrow-drop-up" : "arrow-drop-down"} size={20} color="white" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  ref={statusBtnRef} // ✅ Ref 연결 (남의 글일 때도)
                  style={{ padding: 5 }} 
                  onPress={toggleDropdown} // ✅ 함수 교체
                >
                  <MaterialIcons name="more-vert" size={24} color="#888" />
                </TouchableOpacity>
              )}
              {/* ❌ 여기서 드롭다운 메뉴 코드 삭제됨 (맨 아래 모달로 이동) */}
            </View>
          </View>

          <Text style={styles.content}>{post.content || "내용 없음"}</Text>

          {/* ✅ [수정] 닉네임과 참여인원을 한 줄에 배치 */}
          <View style={styles.infoRow}>
            {/* 왼쪽: 작성자 정보 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.infoLabel}>작성자</Text>
              <Text style={styles.infoValue}>{ownerNickname || "로딩중"}</Text>
            </View>

            {/* 오른쪽: 참여 인원 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.infoLabel}>참여</Text>
              <Text style={styles.infoValue}>{post.currentParticipants} / {post.maxParticipants}명</Text>
            </View>
          </View>

          {/* 예상 계산서 */}
          <View style={styles.receipt}>
            <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18 }}>🧾 </Text>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "bold" }}>N빵 예상 계산서</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>1인당 물건값</Text>
              <Text style={{ color: "white" }}>{Number(post.pricePerPerson || 0).toLocaleString()}원</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>수고비</Text>
              <Text style={{ color: theme.primary, fontWeight: "bold" }}>+ {Number(post.tip || 0).toLocaleString()}원</Text>
            </View>
            <View style={{ height: 1, backgroundColor: "grey", marginVertical: 12 }} />
            <View style={styles.receiptRow}>
              <Text style={{ color: "white", fontWeight: "bold" }}>최종 1인</Text>
              <Text style={{ color: theme.primary, fontSize: 24, fontWeight: "bold" }}>{finalPerPerson.toLocaleString()}원</Text>
            </View>
          </View>

          <View style={{ marginTop: 30 }}>
            <Text style={styles.label}>만남 장소</Text>
            <View style={styles.mapContainer}>
              <MapView style={styles.map} region={mapRegion} scrollEnabled={false}>
                <Marker coordinate={mapRegion} />
              </MapView>
            </View>
            <Text style={{ color: "grey", fontSize: 13, marginTop: 8 }}>{post.pickup_point || post.location}</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 바 */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        <View>
          <Text style={{ color: "#888", fontSize: 12 }}>1인당 금액</Text>
          <Text style={styles.price}>{finalPerPerson.toLocaleString()}원</Text>
        </View>
        <View style={{ flex: 1 }} />
                {isMyPost ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteModalVisible(true)}>
              <Text style={{ color: "#FF6B6B" }}>삭제</Text>
            </TouchableOpacity>

            {/* ✅ [수정] 배경 제거, 테두리만 연녹색 적용 */}
            <TouchableOpacity 
              style={[
                styles.actionBtn, 
                { 
                  backgroundColor: "#333", // 배경은 어둡게
                  borderWidth: 1, 
                  borderColor: theme.primary // 테두리 연녹색
                }
              ]} 
              onPress={handleEdit}
            >
              {/* 글자색도 연녹색으로 변경하여 통일감 부여 */}
              <Text style={{ color: theme.primary, fontWeight: 'bold' }}>수정</Text>
            </TouchableOpacity>

            <TouchableOpacity
              // ✅ [수정] 부스트중(_isBoostActive)일 때 두꺼운 테두리(borderWidth: 2) 적용
              style={[
                styles.boostBtn,
                _isBoostActive() && { borderWidth: 2, borderColor: theme.primary }
              ]}
              onPress={openBoostModal}
              disabled={boostLoading || _isBoostActive()}
            >
              {boostLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.boostBtnText}>
                  {_isBoostActive() ? "🚀 부스트중" : "🚀 부스트"}
                </Text>
              )}
            </TouchableOpacity>

          </View>
        ) : (

          <TouchableOpacity style={[styles.chatBtn, isFull && { backgroundColor: "#222" }]} onPress={onPressChat} disabled={isFull}>
            <Text style={[styles.chatBtnText, isFull && { color: "#555" }]}>
              {isFull ? (isClosed ? "참여 마감" : "모집 마감") : "N빵 참여"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 기본 모달들 */}
      <CustomModal
        visible={successModalVisible}
        title="알림"
        message={alertMsg}
        onConfirm={() => {
          setSuccessModalVisible(false);
          if (goHomeAfterSuccess) {
            setGoHomeAfterSuccess(false);
            navigation.navigate(ROUTES.HOME);
          }
        }}
      />
      <CustomModal visible={errorModalVisible} title="오류" message={alertMsg} onConfirm={() => setErrorModalVisible(false)} />
      <CustomModal visible={deleteModalVisible} title="삭제" message="정말로 삭제하시겠습니까?" type="confirm" onConfirm={handleDelete} onCancel={() => setDeleteModalVisible(false)} />
        {/* ✅ [수정] 부스트 모달 (티켓 사용 버튼 추가) */}
      <CustomModal
        visible={boostModalVisible}
        title="🚀 부스트"
        message="부스트 방식을 선택해주세요."
        onCancel={() => setBoostModalVisible(false)}
        onConfirm={() => setBoostModalVisible(false)}
      >
        <View style={{ gap: 8, marginTop: 10, width: "100%" }}>
          <TouchableOpacity
            style={styles.boostOptionBtn}
            onPress={() => runBoost("free")}
            disabled={boostLoading}
          >
            <Text style={styles.boostOptionText}>무료 부스트 (일 1회 / 2시간)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.boostOptionBtn}
            onPress={() => runBoost("membership")}
            disabled={boostLoading || !isPremium}
          >
            <Text style={[styles.boostOptionText, !isPremium && { color: "grey" }]}>
              멤버십 부스트 (추가 1회 / 2시간)
            </Text>
          </TouchableOpacity>

          {/* ✅ [추가] 티켓 사용 버튼 */}
          <TouchableOpacity
            style={styles.boostOptionBtn}
            onPress={() => runBoost("ticket")}
            disabled={boostLoading || boostTickets < 1}
          >
            <Text style={[styles.boostOptionText, boostTickets < 1 && { color: "grey" }]}>
              🎫 부스트 티켓 사용 (보유: {boostTickets}장)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boostOptionBtn, { backgroundColor: "#333" }]}
            onPress={() => setBoostModalVisible(false)}
            disabled={boostLoading}
          >
            <Text style={[styles.boostOptionText, { color: "#BBB" }]}>닫기</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* 안내용 모달들 */}
      <CustomModal 
        visible={sampleModalVisible} 
        title="SAMPLE 게시글" 
        message={"이 글은 샘플 데이터입니다.\n실제 참여는 불가능합니다."}
        onConfirm={() => setSampleModalVisible(false)}
      />

      {/* ✅ [수정] 신고 모달 (버튼 목록형) */}
      <CustomModal 
        visible={reportModalVisible} 
        title="신고 사유 선택" 
        message="신고하시는 사유를 선택해주세요."
        onCancel={() => setReportModalVisible(false)}
      >
        <View style={{ gap: 8, marginTop: 10, width: '100%' }}>
          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity 
              key={reason}
              style={styles.reportReasonBtn}
              onPress={() => confirmReport(reason)}
            >
              <Text style={styles.reportReasonText}>{reason}</Text>
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity 
            style={[styles.reportReasonBtn, { backgroundColor: '#333', marginTop: 8 }]}
            onPress={() => setReportModalVisible(false)}
          >
            <Text style={{ color: '#BBB', fontWeight: 'bold' }}>취소</Text>
          </TouchableOpacity>
        </View>
      </CustomModal>

      {/* 차단 모달 */}
      <CustomModal 
        visible={blockModalVisible} 
        title="차단하기" 
        message={"이 사용자를 차단하시겠습니까?\n차단 후에는 이 사용자의 글이 보이지 않습니다."} 
        type="confirm" 
        onConfirm={confirmBlock} 
        onCancel={() => setBlockModalVisible(false)} 
      />
      <Modal visible={isDropdownOpen} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.dropdownBackdrop} 
          activeOpacity={1} 
          onPress={() => setIsDropdownOpen(false)}
        >
          {/* 위치 계산: 버튼 바로 아래, 오른쪽 정렬 */}
          <View 
            style={[
              styles.dropdownMenu, 
              !isMyPost && { width: 160 },
              { 
                top: dropdownCoords.y + dropdownCoords.height + 5, 
                right: SCREEN_WIDTH - (dropdownCoords.x + dropdownCoords.width) 
              }
            ]}
          >
            {isMyPost ? (
              // 1. 내 글일 때: 상태 변경
              <>
                {["모집중", "마감"].map((s) => (
                  <TouchableOpacity key={s} style={styles.menuItem} onPress={() => setTempStatus(s)}>
                    <Text style={[styles.menuText, tempStatus === s && { color: theme.primary }]}>{s}</Text>
                    {tempStatus === s && <MaterialIcons name="check" size={16} color={theme.primary} />}
                  </TouchableOpacity>
                ))}
                {tempStatus !== post.status && (
                  <TouchableOpacity style={styles.saveBtn} onPress={handleStatusUpdate} disabled={loading}>
                    {loading ? <ActivityIndicator size="small" color="black" /> : <Text style={styles.saveBtnText}>변경 확인</Text>}
                  </TouchableOpacity>
                )}
              </>
            ) : (
              // 2. 남의 글일 때: 신고/차단
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Text style={{ color: theme.danger, fontSize: 14 }}>🚨 신고하기</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleBlock}>
                  <Text style={{ color: "#AAA", fontSize: 14 }}>🚫 이 사용자 차단</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ✅ [추가] 이미지 전체화면 확대 모달 */}
      <ImageView
        images={(post.images || []).map(img => ({ 
          uri: (typeof img === "string" ? img : img?.uri) 
        }))}
        imageIndex={currentImageIndex}
        visible={isImageViewVisible}
        onRequestClose={() => setIsImageViewVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  heroContainer: { height: 300, position: "relative" }, 
  heroImage: { width: SCREEN_WIDTH, height: 300 },
  pageIndicator: { position: "absolute", bottom: 15, right: 15, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 15 },
  pageText: { color: "white", fontWeight: "bold", fontSize: 12 },
  body: { padding: 24 },
  dropdownBackdrop: { 
    flex: 1, 
    backgroundColor: 'transparent' 
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { flex: 1, color: "white", fontSize: 22, fontWeight: "bold", marginRight: 10 },
  dropdownContainer: { position: "relative", zIndex: 10, alignItems: "flex-end" },
  statusBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1A", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#333" },
  statusBtnText: { color: theme.primary, fontWeight: "bold", fontSize: 14, marginRight: 4 },
  dropdownMenu: { position: "absolute", top: 45, right: 0, backgroundColor: "#1A1A1A", borderRadius: 12, width: 130, padding: 8, borderWidth: 1, borderColor: "#333", elevation: 5 },
  menuItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: "#333" },
  menuText: { color: "white", fontSize: 14 },
  saveBtn: { backgroundColor: theme.primary, marginTop: 8, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  saveBtnText: { color: "black", fontWeight: "bold", fontSize: 12 },
  content: { color: "#DDD", lineHeight: 24, fontSize: 16, marginBottom: 20 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#222" },
  infoLabel: { color: "#888", fontSize: 14 },
  infoValue: { color: "white", fontSize: 14, fontWeight: "bold" },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
  receipt: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 20, marginTop: 30, borderWidth: 1, borderColor: "rgba(204, 255, 0, 0.5)" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  bottomBar: { padding: 20, backgroundColor: theme.cardBg, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#333" },
  price: { color: "white", fontSize: 20, fontWeight: "bold" },
  chatBtn: { backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, minWidth: 80, alignItems: "center" },
  chatBtnText: { fontWeight: "bold", fontSize: 16, color: "black" },
  actionBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: "#333", minWidth: 70, alignItems: "center" },
  
  // ✅ [추가] 신고 사유 버튼 스타일
  reportReasonBtn: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
    reportReasonText: {
    color: 'white',
    fontSize: 14
  },

  // ✅ [추가] 부스트 버튼/옵션 스타일
  boostBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#333",
    minWidth: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  boostBtnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  boostOptionBtn: {
    backgroundColor: "#2A2A2A",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  boostOptionText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  }
});