// FILE: src/features/profile/screens/OperationPolicyScreen.js

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../theme";

export default function OperationPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Text style={styles.headerTitle}>서비스 운영정책</Text>
        <Text style={styles.introText}>
          N빵(이하 "서비스")은 회원님들께 쾌적하고 안전한 공동구매 및 커뮤니티 환경을 제공하기 위해 아래와 같은 운영정책을 시행하고 있습니다. 
          본 정책을 위반할 경우 서비스 이용이 제한될 수 있습니다.
        </Text>

        <View style={styles.divider} />

        {/* === 섹션 1: 기본 원칙 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 1장 기본 운영 원칙</Text>
          
          <Text style={styles.articleTitle}>1. 건전한 커뮤니티 지향</Text>
          <Text style={styles.text}>
            회사는 회원 간의 존중과 배려를 바탕으로 한 건전한 커뮤니티 문화를 지향합니다. 타인에게 불쾌감을 주거나 사회적 통념에 어긋나는 행위는 엄격히 금지됩니다.
          </Text>

          <Text style={styles.articleTitle}>2. 신뢰 기반의 거래</Text>
          <Text style={styles.text}>
            N빵(공동구매)은 회원 간의 신뢰를 바탕으로 이루어집니다. 약속 파기(노쇼), 금전적 부정행위 등 신뢰를 저버리는 행위에 대해서는 무관용 원칙을 적용합니다.
          </Text>
        </View>

        {/* === 섹션 2: 금지 행위 및 제재 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 2장 금지 행위 및 제재 기준</Text>

          <Text style={styles.articleTitle}>3. 주요 금지 행위</Text>
          <Text style={styles.text}>
            다음 각 호에 해당하는 행위는 적발 즉시 게시물 삭제 및 이용 제재 조치가 취해질 수 있습니다.{'\n'}
            ① **[사기 및 부정행위]** 허위 매물 등록, 대금 수령 후 잠적, 입금 지연 및 미입금{'\n'}
            ② **[노쇼 (No-Show)]** 모임 시간 미준수, 사전 연락 없는 불참, 현장 이탈{'\n'}
            ③ **[비매너 행위]** 욕설, 비방, 차별적 발언, 성희롱, 스토킹, 위협 행위{'\n'}
            ④ **[홍보 및 도배]** 핫플레이스 등록 외의 상업적 광고, 동일 내용 반복 게시{'\n'}
            ⑤ **[불법 물품 거래]** 현행법상 거래가 금지된 물품(술, 담배, 의약품, 모의총포 등) 거래 시도
          </Text>

          <Text style={styles.articleTitle}>4. 이용 제한 단계 (제재 수위)</Text>
          <Text style={styles.text}>
            회원의 위반 행위 경중에 따라 다음과 같이 단계별로 이용을 제한합니다.{'\n\n'}
            🛑 **1단계: 경고 및 게시물 삭제**{'\n'}
            - 경미한 운영정책 위반, 비매너 신고 누적 시{'\n'}
            - 해당 게시물 삭제 및 경고 메시지 발송{'\n\n'}
            🛑 **2단계: 기간 이용 정지 (3일 / 7일 / 30일)**{'\n'}
            - 경고 후 재발 시, 또는 중대한 비매너 행위(노쇼 등) 발생 시{'\n'}
            - 해당 기간 동안 글쓰기, 채팅, N빵 참여 불가{'\n\n'}
            🛑 **3단계: 영구 이용 정지 (강제 탈퇴)**{'\n'}
            - 사기, 성범죄 등 범죄 행위 확인 시{'\n'}
            - 상습적인 운영정책 위반 및 서비스 방해 행위{'\n'}
            - 재가입 불가 및 보유 포인트/데이터 소멸
          </Text>
        </View>

        {/* === 섹션 3: 핫플레이스 및 게시물 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 3장 핫플레이스 및 게시물 관리</Text>

          <Text style={styles.articleTitle}>5. 핫플레이스(가게) 운영 정책</Text>
          <Text style={styles.text}>
            1. 등록된 가게 정보는 실제와 일치해야 하며, 허위 정보 기재 시 등록이 취소될 수 있습니다.{'\n'}
            2. 과도한 선정성, 불법 업소, 사행성 업소 등은 등록이 불가하며 발견 즉시 삭제 조치됩니다.{'\n'}
            3. 이용자들의 정당한 신고가 누적될 경우, 사실 확인을 거쳐 노출이 중단될 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>6. 게시물의 관리 및 권리</Text>
          <Text style={styles.text}>
            1. 회원이 작성한 게시물에 대한 책임은 회원 본인에게 있습니다.{'\n'}
            2. 회사는 명예훼손, 저작권 침해 등 권리 침해 주장이 접수된 게시물에 대해 임시조치(블라인드)를 취할 수 있습니다.{'\n'}
            3. 1년 이상 활동하지 않은 휴면 회원의 게시물은 데이터 관리 차원에서 삭제되거나 분리 보관될 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>부칙</Text>
          <Text style={styles.text}>
            본 운영정책은 2025년 1월 16일부터 시행됩니다. 공지사항을 통해 변경 내용을 확인하시기 바랍니다.
          </Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 12,
  },
  introText: {
    fontSize: 14,
    color: "#AAA",
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 24,
  },
  section: {
    marginBottom: 30,
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.primary,
    marginBottom: 16,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    marginTop: 20,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: "#CCC",
    lineHeight: 22,
    textAlign: "justify",
  },
});