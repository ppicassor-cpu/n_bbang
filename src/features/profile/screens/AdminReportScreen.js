import React, { useState, useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";

import { db } from "../../../firebaseConfig";
import { theme } from "../../../theme";
import { useAppContext } from "../../../app/providers/AppContext";

export default function AdminReportScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAppContext();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ 신고 내역 불러오기
  const fetchReports = async () => {
    try {
      const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      
      const loadedData = [];
      querySnapshot.forEach((doc) => {
        loadedData.push({ id: doc.id, ...doc.data() });
      });
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

  // ✅ [핵심 기능] 신고자에게 알림 발송 함수
  const sendNotificationToReporter = async (reporterId, title, body) => {
    if (!reporterId) return;
    try {
      await addDoc(collection(db, "users", reporterId, "notifications"), {
        title,
        body,
        type: "report_result", // 아이콘 구분용
        isRead: false,
        createdAt: new Date().toISOString()
      });
      console.log(`알림 발송 성공: ${reporterId}`);
    } catch (e) {
      console.error("알림 발송 실패:", e);
    }
  };

  // ✅ 공통: 신고 상태 '처리 완료'로 변경
  const markAsResolved = async (reportId) => {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: "resolved",
        resolvedAt: new Date().toISOString()
      });
      // 로컬 상태 업데이트
      setReports(prev => prev.map(item => 
        item.id === reportId ? { ...item, status: "resolved" } : item
      ));
    } catch (e) {
      console.error("상태 업데이트 실패:", e);
    }
  };

  // 1️⃣ [단순 처리] 별도 조치 없이 완료 처리
  const handleResolve = (report) => {
    if (report.status === "resolved") return;

    Alert.alert("처리 완료", "추가 조치 없이 '처리 완료' 상태로 변경하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { 
        text: "확인", 
        onPress: async () => {
          await markAsResolved(report.id);
          // 🔔 알림 발송
          await sendNotificationToReporter(
            report.reporterId,
            "신고 처리 안내",
            "접수하신 신고가 확인되었으나, 위반 사항이 발견되지 않아 종결 처리되었습니다."
          );
        } 
      }
    ]);
  };

  // 2️⃣ [강제 삭제] 게시글/채팅방 삭제
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
              
              // 🔔 알림 발송
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

  // 3️⃣ [회원 정지] 유저 Ban 처리
  const handleBanUser = (report) => {
    if (report.status === "resolved") return;

    Alert.alert(
      "회원 영구 정지", 
      `대상 사용자(${report.targetUserId})를 정지하시겠습니까?\n해당 유저는 더 이상 앱을 사용할 수 없습니다.`,
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

              // 🔔 알림 발송
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
    const dateStr = item.createdAt ? item.createdAt.slice(0, 10) : "";
    
    // 유형에 따른 아이콘/색상
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
            <Text style={[styles.typeText, { color: typeColor }]}>{item.type?.toUpperCase()}</Text>
          </View>
          <Text style={styles.dateText}>{dateStr}</Text>
        </View>

        <Text style={styles.reasonLabel}>신고 사유:</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>신고자: {item.reporterEmail}</Text>
          <Text style={styles.infoText}>대상ID: {item.targetUserId}</Text>
          <Text style={styles.infoText} numberOfLines={1}>콘텐츠ID: {item.contentId || "없음"}</Text>
        </View>

        {/* ✅ 관리자 조치 버튼 영역 */}
        {!isResolved ? (
          <View style={styles.actionRow}>
            {/* 1. 콘텐츠 삭제 (post/chat 일 때만) */}
            {(item.type === "post" || item.type === "chat") && (
              <TouchableOpacity 
                style={[styles.actionBtn, { backgroundColor: "#FF4444" }]} 
                onPress={() => handleDeleteContent(item)}
              >
                <Text style={styles.actionBtnText}>삭제</Text>
              </TouchableOpacity>
            )}

            {/* 2. 유저 정지 (모든 경우 가능) */}
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: "#CC0000" }]} 
              onPress={() => handleBanUser(item)}
            >
              <Text style={styles.actionBtnText}>회원정지</Text>
            </TouchableOpacity>

            {/* 3. 단순 처리 (반려/확인) */}
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
          keyExtractor={item => item.id}
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
  
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 5 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minWidth: 60, alignItems: 'center' },
  actionBtnText: { color: "white", fontSize: 12, fontWeight: "bold" },

  resolvedBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end", backgroundColor: "#333", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  resolvedText: { color: "#AAA", fontSize: 12, fontWeight: "bold", marginLeft: 4 }
});