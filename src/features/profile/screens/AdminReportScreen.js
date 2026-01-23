// FILE: src/features/admin/screens/AdminReportScreen.js

import React, { useState, useEffect } from "react";
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator  } from "react-native";
import { Text } from "../../../components/MyText";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";

import { db } from "../../../firebaseConfig";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal"; 

// ✅ 정지 사유 목록 정의
const BAN_REASONS = [
  "욕설 및 비하 발언",
  "스팸 / 도배 / 홍보",
  "사기 및 거래 불이행",
  "음란물 / 부적절한 콘텐츠",
  "기타 운영 정책 위반"
];

export default function AdminReportScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAppContext();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ [기존] 정지 사유 선택 모달용 상태
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // ✅ [추가] 일반 Alert/Confirm 대체용 범용 모달 상태
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: "",
    message: "",
    type: "alert", // 'alert' (확인만) or 'confirm' (취소/확인)
    confirmText: "확인",
    onConfirm: null, // 확인 버튼 눌렀을 때 실행할 함수
  });

  // ✅ [추가] 탭 및 유저별 상세보기 모달 상태
  const [activeTab, setActiveTab] = useState("list"); // 'list' | 'users'
  const [userDetailModalVisible, setUserDetailModalVisible] = useState(false);
  const [selectedUserForDetail, setSelectedUserForDetail] = useState(null);

  // 🔹 모달 닫기 헬퍼
  const closeAlertModal = () => {
    setAlertModal(prev => ({ ...prev, visible: false }));
  };

  // 🔹 알림창 띄우기 헬퍼 (단순 메시지)
  const showAlert = (title, message, onConfirm = null) => {
    setAlertModal({
      visible: true,
      title,
      message,
      type: "alert",
      confirmText: "확인",
      onConfirm: onConfirm || closeAlertModal
    });
  };

  // 🔹 확인창 띄우기 헬퍼 (실행 여부 묻기)
  const showConfirm = (title, message, onConfirm, confirmText = "확인") => {
    setAlertModal({
      visible: true,
      title,
      message,
      type: "confirm",
      confirmText,
      onConfirm: async () => {
        closeAlertModal();
        if (onConfirm) await onConfirm();
      }
    });
  };

  // ✅ [추가] 신고 내역을 '대상자별'로 그룹화하는 함수
  const getAggregatedUsers = () => {
    const userMap = {};
    reports.forEach((r) => {
      const uid = r.targetUserId;
      if (!uid) return;

      if (!userMap[uid]) {
        userMap[uid] = {
          userId: uid,
          nickname: r.targetNickname,
          count: 0,
          reportHistory: [] // 해당 유저가 받은 신고들
        };
      }
      userMap[uid].count += 1;
      userMap[uid].reportHistory.push(r);
    });

    // 신고 횟수가 많은 순서로 정렬
    return Object.values(userMap).sort((a, b) => b.count - a.count);
  };

  // ✅ 신고 내역 불러오기
  const fetchReports = async () => {
    try {
      const q = query(collection(db, "reports")); 
      const querySnapshot = await getDocs(q);
      
      const loadedData = await Promise.all(
        querySnapshot.docs.map(async (reportDoc) => {
          const data = reportDoc.data();
          const reportId = reportDoc.id;

          let reporterNickname = data.reporterEmail || `(ID: ${data.reporterId?.slice(0,5)}...)`;
          let targetNickname = `(ID: ${data.targetUserId?.slice(0,5)}...)`;
          let contentTitle = `(ID: ${data.contentId?.slice(0,5)}...)`;

          // 신고자 닉네임 조회
          if (data.reporterId) {
            try {
              const uRef = doc(db, "users", data.reporterId);
              const uSnap = await getDoc(uRef);
              if (uSnap.exists()) reporterNickname = uSnap.data().displayName || reporterNickname;
            } catch (e) {}
          }
          // 대상자 닉네임 조회
          if (data.targetUserId) {
            try {
              const tRef = doc(db, "users", data.targetUserId);
              const tSnap = await getDoc(tRef);
              if (tSnap.exists()) targetNickname = tSnap.data().displayName || targetNickname;
            } catch (e) {}
          }
          // 콘텐츠 제목 조회
          if (data.contentId && data.type) {
            try {
              const collectionName = data.type === 'chat' ? 'chatRooms' : 'posts';
              const cSnap = await getDoc(doc(db, collectionName, data.contentId));
              if (cSnap.exists()) {
                const cData = cSnap.data();
                contentTitle = cData.title || cData.roomName || "제목 없음";
              } else {
                contentTitle = "(삭제된 콘텐츠)";
              }
            } catch (e) {}
          }

          return { 
            id: reportId, 
            ...data,
            reporterNickname, 
            targetNickname,   
            contentTitle      
          };
        })
      );

      loadedData.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA; 
      });

      setReports(loadedData);
    } catch (e) {
      console.error("신고 내역 로드 실패:", e);
      showAlert("오류", "데이터를 불러오지 못했습니다.\n" + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      // ✅ Alert -> CustomModal (onConfirm에 뒤로가기 연결)
      showAlert("접근 거부", "관리자만 접근할 수 있습니다.", () => navigation.goBack());
      return;
    }
    fetchReports();
  }, [isAdmin]);

  const sendNotificationToReporter = async (reporterId, title, body) => {
    if (!reporterId) return;
    try {
      await addDoc(collection(db, "users", reporterId, "notifications"), {
        title,
        body,
        type: "report_result",
        isRead: false,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("알림 발송 실패:", e);
    }
  };

  const handleGoToContent = async (report) => {
    if (!report.contentId) {
      showAlert("오류", "콘텐츠 ID가 존재하지 않습니다.");
      return;
    }
    setLoading(true); 
    try {
      if (report.type === 'post') {
        const postSnap = await getDoc(doc(db, "posts", report.contentId));
        if (postSnap.exists()) {
          const postData = { id: postSnap.id, ...postSnap.data() };
          navigation.navigate(ROUTES.DETAIL, { post: postData });
        } else {
          showAlert("알림", "이미 삭제된 게시글입니다.");
        }
      } else if (report.type === 'chat') {
        navigation.navigate(ROUTES.CHAT_ROOM, {
          roomId: report.contentId,
          roomName: report.contentTitle || "신고된 채팅방",
          isGhost: true 
        });
      }
    } catch (e) {
      console.error("이동 실패:", e);
      showAlert("오류", "콘텐츠 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false); 
    }
  };

  const markAsResolved = async (reportId) => {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "resolved",
        resolvedAt: new Date().toISOString()
      });
      setReports(prev => prev.map(item => 
        item.id === reportId ? { ...item, status: "resolved" } : item
      ));
    } catch (e) {
      console.error("상태 업데이트 실패:", e);
    }
  };

  // ✅ [수정] 단순 처리 완료 핸들러
  const handleResolve = (report) => {
    if (report.status === "resolved") return;

    showConfirm(
      "처리 완료",
      "추가 조치 없이 '처리 완료' 상태로 변경하시겠습니까?",
      async () => {
        await markAsResolved(report.id);
        await sendNotificationToReporter(
          report.reporterId,
          "신고 처리 안내",
          "접수하신 신고가 확인되었으나, 위반 사항이 발견되지 않아 종결 처리되었습니다."
        );
      }
    );
  };
  const handleConfirmDeleted = (report) => {
    if (report.status === "resolved") return;

    showConfirm(
      "신고 종결",
      "이미 삭제된 콘텐츠입니다. 신고를 종결 처리하시겠습니까?",
      async () => {
        await markAsResolved(report.id);
        await sendNotificationToReporter(
          report.reporterId,
          "신고 처리 완료",
          "신고하신 콘텐츠는 이미 삭제된 것으로 확인되어 종결 처리되었습니다." // ⚪️ 삭제됨 알림
        );
      }
    );
  };

  // ✅ [수정] 콘텐츠 삭제 핸들러
  const handleDeleteContent = (report) => {
    if (report.status === "resolved") return;

    const targetCollection = report.type === "chat" ? "chatRooms" : "posts";
    const targetName = report.type === "chat" ? "채팅방" : "게시글";

    showConfirm(
      "콘텐츠 강제 삭제",
      `정말 이 ${targetName}을(를) 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`,
      async () => {
        try {
          if (!report.contentId) throw new Error("Content ID Missing");
          await deleteDoc(doc(db, targetCollection, report.contentId));
          
          // 성공 알림 (여기선 연달아 모달을 띄우기 위해 약간 딜레이를 주거나 바로 띄움)
          // CustomModal 구조상 하나 닫히고 띄우는게 자연스러움 -> showConfirm 내부에서 closeAlertModal 호출됨.
          
          // 약간의 딜레이 후 성공 메시지 출력
          setTimeout(async () => {
             showAlert("삭제 완료", "해당 콘텐츠가 삭제되었습니다.");
             await markAsResolved(report.id);
             await sendNotificationToReporter(
               report.reporterId,
               "신고 처리 완료",
               `신고하신 ${targetName}이(가) 운영 정책 위반으로 삭제 조치되었습니다. 깨끗한 커뮤니티를 위해 힘써주셔서 감사합니다.`
             );
          }, 300);

        } catch (e) {
          setTimeout(() => showAlert("오류", "이미 삭제되었거나 존재하지 않는 문서입니다."), 300);
        }
      },
      "삭제 및 처리완료"
    );
  };

  const handleBanButtonPress = (report) => {
    if (report.status === "resolved") return;
    setSelectedReport(report);
    setBanModalVisible(true);
  };

  const executeBanUser = async (selectedReason) => {
    setBanModalVisible(false);
    const report = selectedReport;
    if (!report) return;

    try {
      const userRef = doc(db, "users", report.targetUserId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        showAlert("오류", "사용자가 존재하지 않습니다.");
        return;
      }

      const userData = userSnap.data();
      const banCount = userData.banCount || 0;
      
      let updateData = {};
      let alertMessage = "";
      let notificationBody = "";
      
      const reasonText = selectedReason;

      if (banCount > 0) {
        updateData = {
          isBanned: true,
          bannedAt: new Date().toISOString(),
          banCount: banCount + 1,
          suspendedUntil: null,
          banReason: reasonText 
        };
        alertMessage = `[${reasonText}] 사유로 누적 정지되어 '영구 정지' 처리되었습니다.`;
        notificationBody = `[영구 정지 안내] 누적 신고 접수로 인해 영구 정지 처리되었습니다.\n사유: ${reasonText}`;
      } else {
        const today = new Date();
        today.setDate(today.getDate() + 7);
        
        updateData = {
          suspendedUntil: today.toISOString(),
          banCount: 1,
          banReason: reasonText
        };
        alertMessage = `[${reasonText}] 사유로 '7일간 이용 정지' 처리되었습니다.`;
        notificationBody = `[이용 제재 안내] 운영 정책 위반으로 7일간 서비스 이용이 정지됩니다.\n해제일: ${today.toLocaleDateString()}\n사유: ${reasonText}`;
      }

      await updateDoc(userRef, updateData);

      await addDoc(collection(db, "users", report.targetUserId, "notifications"), {
        title: "서비스 이용 제재 안내",
        body: notificationBody,
        type: "admin_notice",
        isRead: false,
        createdAt: new Date().toISOString()
      });

      // 결과 알림
      showAlert("처리 완료", alertMessage);
      
      await markAsResolved(report.id);

      await sendNotificationToReporter(
        report.reporterId,
        "신고 처리 완료",
        "신고하신 사용자는 운영 정책 위반으로 이용 제재 조치되었습니다. 감사합니다."
      );

    } catch (e) {
      console.error(e);
      showAlert("오류", "처리 중 문제가 발생했습니다.");
    } finally {
      setSelectedReport(null);
    }
  };

  const renderItem = ({ item }) => {
    const isResolved = item.status === "resolved";
    
    let dateStr = "";
    if (item.createdAt) {
      const d = item.createdAt.toDate ? item.createdAt.toDate() : 
                (item.createdAt.seconds ? new Date(item.createdAt.seconds * 1000) : new Date(item.createdAt));
      
      if (!isNaN(d.getTime())) {
        const ymd = d.toISOString().slice(0, 10);
        const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
        dateStr = `${ymd} ${time}`;
      }
    }
    
    let typeIcon = "error-outline";
    let typeColor = "#AAA";
    if (item.type === "post") { typeIcon = "article"; typeColor = theme.primary; }
    if (item.type === "chat") { typeIcon = "chat"; typeColor = "#FFD700"; }
    if (item.type === "user") { typeIcon = "person"; typeColor = "#FF6B6B"; }

    return (
      <View style={[styles.card, isResolved && { opacity: 0.5 }]}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialIcons name={typeIcon} size={18} color={typeColor} style={{ marginRight: 6 }} />
            <Text style={[styles.typeText, { color: typeColor }]}>{item.type ? item.type.toUpperCase() : "알수없음"}</Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        <Text style={styles.reasonLabel}>신고 사유:</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>신고자: <Text style={{fontWeight:'bold', color:'white'}}>{item.reporterNickname}</Text></Text>
          <Text style={styles.infoText}>대상자: <Text style={{fontWeight:'bold', color:'white'}}>{item.targetNickname}</Text></Text>
          <Text style={styles.infoText} numberOfLines={1}>콘텐츠: {item.contentTitle}</Text>
          
          {(item.type === 'post' || item.type === 'chat') && (
            <TouchableOpacity 
              style={styles.inspectBtn} 
              onPress={() => handleGoToContent(item)}
            >
              <MaterialIcons name="search" size={16} color="white" style={{ marginRight: 4 }} />
              <Text style={styles.inspectBtnText}>
                {item.type === 'chat' ? "채팅방 감시 입장" : "게시글 확인"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isResolved ? (
          <View style={styles.actionRow}>
            {(item.type === "post" || item.type === "chat") && (
              item.contentTitle === "(삭제된 콘텐츠)" ? (
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: "#666" }]} 
                  onPress={() => handleConfirmDeleted(item)} 
                >
                  <Text style={styles.actionBtnText}>확인</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: "#FF4444" }]} 
                  onPress={() => handleDeleteContent(item)}
                >
                  <Text style={styles.actionBtnText}>삭제</Text>
                </TouchableOpacity>
              )
            )}

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: "#CC0000" }]} 
              onPress={() => handleBanButtonPress(item)}
            >
              <Text style={styles.actionBtnText}>회원정지</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: theme.primary }]} 
              onPress={() => handleResolve(item)}
            >
              <Text style={[styles.actionBtnText, { color: "black" }]}>처리완료</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.resolvedBadge}>
            <MaterialIcons name="check-circle" size={16} color="#AAA" />
            <Text style={styles.resolvedText}>조치 완료됨</Text>
          </View>
        )}
      </View>
    );
  };

  // ✅ [추가] 오른쪽 탭(신고 대상자 리스트) 렌더링 함수
  const renderUserItem = ({ item }) => {
    return (
      <TouchableOpacity 
        style={styles.card} 
        onPress={() => {
          setSelectedUserForDetail(item);
          setUserDetailModalVisible(true);
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.targetNameText}>{item.nickname}</Text>
            <Text style={{ color: '#888', fontSize: 12 }}>ID: {item.userId.slice(0, 8)}...</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{item.count}회 신고됨</Text>
          </View>
        </View>
        <Text style={{ color: '#AAA', fontSize: 12, marginTop: 8 }}>
          최근 사유: {item.reportHistory[0]?.reason}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <MaterialIcons name="arrow-back-ios-new" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚨 신고 내역 관리</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ✅ [추가] 상단 탭 (신고 내역 / 대상자 명단) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'list' && styles.activeTabButton]} 
          onPress={() => setActiveTab('list')}
        >
          <Text style={[styles.tabText, activeTab === 'list' && styles.activeTabText]}>신고 내역</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'users' && styles.activeTabButton]} 
          onPress={() => setActiveTab('users')}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.activeTabText]}>신고 대상자 TOP</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        // ✅ [수정] 탭에 따라 다른 리스트 보여주기
        <FlatList
          data={activeTab === 'list' ? reports : getAggregatedUsers()}
          renderItem={activeTab === 'list' ? renderItem : renderUserItem}
          keyExtractor={item => activeTab === 'list' ? (item.id || Math.random().toString()) : item.userId} 
          contentContainerStyle={{ padding: 16 }}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchReports(); }}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="check-circle-outline" size={60} color="#444" />
              <Text style={{ color: "#888", marginTop: 10 }}>데이터가 없습니다.</Text>
            </View>
          }
        />
      )}
      

      {/* ✅ [기존] 정지 사유 선택용 모달 */}
      <CustomModal
        visible={banModalVisible}
        title="회원 제재 사유 선택"
        message={`대상: ${selectedReport?.targetNickname}\n\n제재 사유를 선택하면 즉시 7일(첫회) 또는 영구(재범) 정지 처리됩니다.`}
        onCancel={() => {
            setBanModalVisible(false);
            setSelectedReport(null);
        }}
      >
        <View style={{ width: '100%', marginTop: 10, gap: 8 }}>
            {BAN_REASONS.map((reason, index) => (
                <TouchableOpacity 
                    key={index}
                    style={styles.reasonSelectBtn}
                    onPress={() => executeBanUser(reason)}
                >
                    <Text style={styles.reasonSelectText}>{reason}</Text>
                </TouchableOpacity>
            ))}
             <TouchableOpacity 
                    style={[styles.reasonSelectBtn, { backgroundColor: '#333', marginTop: 8 }]}
                    onPress={() => {
                        setBanModalVisible(false);
                        setSelectedReport(null);
                    }}
                >
                    <Text style={{color:'#BBB', fontWeight:'bold'}}>취소</Text>
                </TouchableOpacity>
        </View>
      </CustomModal>
      

      {/* ✅ [추가] 범용 알림/컨펌 모달 (Alert.alert 대체) */}
      <CustomModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type === 'confirm' ? 'confirm' : undefined} // 'alert'타입은 default로 처리됨
        onConfirm={alertModal.onConfirm}
        onCancel={alertModal.type === 'confirm' ? closeAlertModal : undefined} // confirm일때만 취소 버튼 활성
        confirmText={alertModal.confirmText}
      />

      {/* ✅ [추가] 유저별 신고 상세 내역 모달 */}
      <CustomModal
        visible={userDetailModalVisible}
        title={`${selectedUserForDetail?.nickname}님 신고 이력`}
        message="" // 리스트로 커스텀 렌더링
        onConfirm={() => setUserDetailModalVisible(false)}
        confirmText="닫기"
      >
        <View style={{ width: '100%', maxHeight: 400 }}>
          <FlatList
            data={selectedUserForDetail?.reportHistory || []}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <View style={styles.historyItem}>
                <Text style={styles.historyReason}>🛑 {item.reason}</Text>
                <Text style={styles.historyContent}>대상: {item.contentTitle}</Text>
                <Text style={styles.historyDate}>
                  {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : '날짜 없음'}
                </Text>
                {/* 바로가기 기능 재사용 */}
                {(item.type === 'post' || item.type === 'chat') && (
                  <TouchableOpacity onPress={() => {
                      setUserDetailModalVisible(false); // 모달 닫고 이동
                      handleGoToContent(item);
                  }}>
                    <Text style={{ color: theme.primary, fontSize: 12, marginTop: 4 }}>👉 콘텐츠 확인하기</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      </CustomModal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333" },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", marginTop: 50 },
  
  card: { backgroundColor: theme.cardBg, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#333" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  typeText: { fontSize: 12, fontWeight: "bold" },
  dateText: { color: "#666", fontSize: 12 },
  
  reasonLabel: { color: "#888", fontSize: 12, marginBottom: 4 },
  reasonText: { color: "white", fontSize: 15, fontWeight: "bold", marginBottom: 12 },
  
  infoBox: { backgroundColor: "#222", padding: 10, borderRadius: 8, marginBottom: 12 },
  infoText: { color: "#AAA", fontSize: 11, marginBottom: 2 },
  
  inspectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#444',
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6
  },
  inspectBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },
  
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 5 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minWidth: 60, alignItems: 'center' },
  actionBtnText: { color: "white", fontSize: 12, fontWeight: "bold" },

  resolvedBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", backgroundColor: "#333", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  resolvedText: { color: "#AAA", fontSize: 12, fontWeight: "bold", marginLeft: 4 },

  reasonSelectBtn: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
  reasonSelectText: {
    color: 'white',
    fontSize: 14
  },

  // ✅ [추가] 탭 및 상세 모달 스타일
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: theme.primary,
  },
  tabText: {
    color: '#888',
    fontSize: 15,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: 'white',
  },
  
  // 유저 리스트 스타일
  targetNameText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2
  },
  countBadge: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12
  },

  // 상세 내역 스타일
  historyItem: {
    backgroundColor: '#222',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333'
  },
  historyReason: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 2
  },
  historyContent: {
    color: '#CCC',
    fontSize: 12,
  },
  historyDate: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
    alignSelf: 'flex-end'
  }
});