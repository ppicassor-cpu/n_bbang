// FILE: src/features/admin/screens/AdminReportScreen.js

import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";

import { db } from "../../../firebaseConfig";
import { theme } from "../../../theme";
import { ROUTES } from "../../../app/navigation/routes";
import { useAppContext } from "../../../app/providers/AppContext";

export default function AdminReportScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAppContext();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ [수정] 신고 내역 + 닉네임 + 제목 불러오기 (안전장치 강화)
  const fetchReports = async () => {
    try {
      const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      
      const loadedData = await Promise.all(
        querySnapshot.docs.map(async (reportDoc) => {
          const data = reportDoc.data();
          const reportId = reportDoc.id;

          // ✅ 1. 기본값 설정 (ID라도 보이게 수정)
          // DB에 reporterEmail 필드가 있다면 그걸 쓰고, 없다면 ID를 괄호에 넣어 표시
          let reporterNickname = data.reporterEmail || `(ID: ${data.reporterId?.slice(0,5)}...)`;
          let targetNickname = `(ID: ${data.targetUserId?.slice(0,5)}...)`;
          let contentTitle = `(ID: ${data.contentId?.slice(0,5)}...)`;

          // ✅ 2. 신고자 닉네임 조회 시도
          if (data.reporterId) {
            try {
              const uRef = doc(db, "users", data.reporterId);
              const uSnap = await getDoc(uRef);
              if (uSnap.exists()) {
                const uData = uSnap.data();
                // 닉네임 > 이메일 앞자리 > 기존ID 순으로 적용
                reporterNickname = uData.displayName || uData.email?.split("@")[0] || reporterNickname;
              } else {
                console.log(`❌ 신고자 문서 없음: ${data.reporterId}`);
              }
            } catch (e) {
              console.warn(`⚠️ 신고자 조회 권한/에러: ${e.message}`);
            }
          }

          // ✅ 3. 대상자(신고당한 사람) 닉네임 조회 시도
          if (data.targetUserId) {
            try {
              const tRef = doc(db, "users", data.targetUserId);
              const tSnap = await getDoc(tRef);
              if (tSnap.exists()) {
                const tData = tSnap.data();
                targetNickname = tData.displayName || tData.email?.split("@")[0] || targetNickname;
              }
            } catch (e) {}
          }

          // ✅ 4. 콘텐츠 제목 조회 (게시글 or 채팅방)
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

      setReports(loadedData);
    } catch (e) {
      console.error("신고 내역 로드 실패:", e);
      Alert.alert("오류", "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert("접근 거부", "관리자만 접근할 수 있습니다.");
      navigation.goBack();
      return;
    }
    fetchReports();
  }, [isAdmin]);

  // ✅ 신고자 알림 발송
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
      console.log(`알림 발송 성공: ${reporterId}`);
    } catch (e) {
      console.error("알림 발송 실패:", e);
    }
  };

  // ✅ 콘텐츠 바로가기
  const handleGoToContent = (report) => {
    if (!report.contentId) {
      Alert.alert("오류", "콘텐츠 ID가 존재하지 않습니다.");
      return;
    }

    if (report.type === 'post') {
      navigation.navigate(ROUTES.DETAIL, { 
        post: { id: report.contentId, ownerId: report.targetUserId } 
      });
    } else if (report.type === 'chat') {
      navigation.navigate(ROUTES.CHAT_ROOM, {
        roomId: report.contentId,
        roomName: report.contentTitle || "신고된 채팅방",
        isGhost: true 
      });
    } else {
      Alert.alert("알림", "이동할 수 없는 콘텐츠 유형입니다.");
    }
  };

  // ✅ 상태 변경 (처리 완료)
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

  const handleResolve = (report) => {
    if (report.status === "resolved") return;

    Alert.alert("처리 완료", "추가 조치 없이 '처리 완료' 상태로 변경하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { 
        text: "확인", 
        onPress: async () => {
          await markAsResolved(report.id);
          await sendNotificationToReporter(
            report.reporterId,
            "신고 처리 안내",
            "접수하신 신고가 확인되었으나, 위반 사항이 발견되지 않아 종결 처리되었습니다."
          );
        } 
      }
    ]);
  };

  const handleDeleteContent = (report) => {
    if (report.status === "resolved") return;

    const targetCollection = report.type === "chat" ? "chatRooms" : "posts";
    const targetName = report.type === "chat" ? "채팅방" : "게시글";

    Alert.alert(
      "콘텐츠 강제 삭제", 
      `정말 이 ${targetName}을(를) 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`, 
      [
        { text: "취소", style: "cancel" },
        { 
          text: "삭제 및 처리완료", 
          style: "destructive",
          onPress: async () => {
            try {
              if (!report.contentId) throw new Error("Content ID Missing");
              
              await deleteDoc(doc(db, targetCollection, report.contentId));
              Alert.alert("삭제 완료", "해당 콘텐츠가 삭제되었습니다.");
              
              await markAsResolved(report.id);
              
              await sendNotificationToReporter(
                report.reporterId,
                "신고 처리 완료",
                `신고하신 ${targetName}이(가) 운영 정책 위반으로 삭제 조치되었습니다. 깨끗한 커뮤니티를 위해 힘써주셔서 감사합니다.`
              );

            } catch (e) {
              Alert.alert("오류", "이미 삭제되었거나 존재하지 않는 문서입니다.");
            }
          }
        }
      ]
    );
  };

  const handleBanUser = (report) => {
    if (report.status === "resolved") return;

    Alert.alert(
      "회원 영구 정지", 
      `대상 사용자(${report.targetNickname})를 정지하시겠습니까?\n해당 유저는 더 이상 앱을 사용할 수 없습니다.`,
      [
        { text: "취소", style: "cancel" },
        { 
          text: "정지 및 처리완료", 
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "users", report.targetUserId), {
                isBanned: true,
                bannedAt: new Date().toISOString()
              });
              Alert.alert("정지 완료", "해당 사용자가 정지 처리되었습니다.");
              
              await markAsResolved(report.id);

              await sendNotificationToReporter(
                report.reporterId,
                "신고 처리 완료",
                "신고하신 사용자는 운영 정책 위반으로 이용 정지 조치되었습니다. 감사합니다."
              );

            } catch (e) {
              Alert.alert("오류", "사용자 정보를 찾을 수 없습니다.");
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const isResolved = item.status === "resolved";
    
    let dateStr = "";
    if (item.createdAt) {
      if (typeof item.createdAt === 'string') {
        dateStr = item.createdAt.slice(0, 10);
      } else if (item.createdAt.toDate) {
        dateStr = item.createdAt.toDate().toISOString().slice(0, 10);
      } else if (item.createdAt.seconds) {
        dateStr = new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10);
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
          {/* 닉네임 표시 (없으면 ID 일부라도 표시) */}
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
              <TouchableOpacity 
                style={[styles.actionBtn, { backgroundColor: "#FF4444" }]} 
                onPress={() => handleDeleteContent(item)}
              >
                <Text style={styles.actionBtnText}>삭제</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: "#CC0000" }]} 
              onPress={() => handleBanUser(item)}
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <MaterialIcons name="arrow-back-ios-new" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚨 신고 내역 관리</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <FlatList
          data={reports}
          renderItem={renderItem}
          keyExtractor={item => item.id || Math.random().toString()} 
          contentContainerStyle={{ padding: 16 }}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchReports(); }}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialIcons name="check-circle-outline" size={60} color="#444" />
              <Text style={{ color: "#888", marginTop: 10 }}>접수된 신고가 없습니다.</Text>
            </View>
          }
        />
      )}
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
  resolvedText: { color: "#AAA", fontSize: 12, fontWeight: "bold", marginLeft: 4 }
});