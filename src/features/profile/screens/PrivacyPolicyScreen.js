// FILE: src/features/profile/screens/PrivacyPolicyScreen.js

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../theme";

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Text style={styles.headerTitle}>개인정보 처리방침</Text>
        <Text style={styles.introText}>
          'N빵' (이하 "회사")은 이용자의 개인정보를 중요시하며, "정보통신망 이용촉진 및 정보보호 등에 관한 법률", "개인정보보호법" 등 관련 법령을 준수하고 있습니다.
          회사는 본 방침을 통하여 이용자가 제공하는 개인정보가 어떠한 용도와 방식으로 이용되고 있으며, 개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
        </Text>

        <View style={styles.divider} />

        {/* === 섹션 1: 일반 이용자 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 1장 개인정보 수집 및 이용</Text>
          
          <Text style={styles.articleTitle}>1. 수집하는 개인정보의 항목</Text>
          <Text style={styles.text}>
            회사는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 최초 회원가입 당시 아래와 같은 개인정보를 수집하고 있습니다.{'\n\n'}
            [일반 회원]{'\n'}
            - 필수항목: 이메일 주소, 비밀번호, 닉네임, 기기식별번호(Device ID){'\n'}
            - 선택항목: 프로필 사진{'\n'}
            - 자동수집항목: 서비스 이용기록, 접속 로그, 쿠키, 접속 IP 정보, 결제 기록{'\n'}
            - 위치정보: 이용자의 현재 위치 좌표 (위도, 경도), 행정동 정보{'\n\n'}
            [비즈니스 회원 (핫플레이스 등록자)]{'\n'}
            - 필수항목: 상호명, 매장 전화번호, 매장 주소(좌표 포함), 업종 카테고리{'\n'}
            - 선택항목: 매장 홈페이지/SNS 주소, 매장 설명, 대표 이미지
          </Text>

          <Text style={styles.articleTitle}>2. 개인정보의 수집 및 이용 목적</Text>
          <Text style={styles.text}>
            회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.{'\n'}
            1. 회원 관리: 회원제 서비스 이용에 따른 본인확인, 개인식별, 불량회원의 부정 이용 방지와 비인가 사용 방지, 가입 의사 확인, 불만처리 등 민원처리{'\n'}
            2. 서비스 제공: 위치 기반 공동구매(N빵) 매칭, 내 주변 핫플레이스 정보 제공, 지도 서비스 구현{'\n'}
            3. 마케팅 및 광고: 신규 서비스 개발 및 맞춤 서비스 제공, 이벤트 등 광고성 정보 전달 (동의 시){'\n'}
            4. 유료 서비스: 프리미엄 멤버십 및 핫플레이스 등록 결제 처리
          </Text>

          <Text style={styles.articleTitle}>3. 개인정보의 보유 및 이용기간</Text>
          <Text style={styles.text}>
            원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관계법령의 규정에 의하여 보존할 필요가 있는 경우 회사는 아래와 같이 관계법령에서 정한 일정한 기간 동안 회원정보를 보관합니다.{'\n'}
            - 계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률){'\n'}
            - 대금결제 및 재화 등의 공급에 관한 기록: 5년{'\n'}
            - 소비자의 불만 또는 분쟁처리에 관한 기록: 3년{'\n'}
            - 표시/광고에 관한 기록: 6개월{'\n'}
            - 웹사이트 방문기록: 3개월 (통신비밀보호법)
          </Text>
        </View>

        {/* === 섹션 2: 비즈니스 및 제3자 제공 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 2장 비즈니스 정보 및 제3자 제공</Text>

          <Text style={styles.articleTitle}>4. 비즈니스 개인정보 처리 특례</Text>
          <Text style={styles.text}>
            핫플레이스(가게) 등록을 위해 수집된 정보(상호명, 위치, 전화번호 등)는 서비스의 본질적인 목적(홍보 및 정보 제공)에 따라 앱 내 지도 및 리스트를 통해 **불특정 다수의 이용자에게 공개**됩니다. 비즈니스 회원은 이에 동의한 것으로 간주하며, 공개를 원하지 않을 경우 가게 정보를 삭제하거나 등록을 철회할 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>5. 개인정보의 제3자 제공</Text>
          <Text style={styles.text}>
            회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.{'\n'}
            1. 이용자들이 사전에 동의한 경우{'\n'}
            2. 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우{'\n'}
            3. 유료 결제를 위해 결제 대행사(PG사) 또는 앱 마켓(Google Play, App Store)에 결제 정보를 제공해야 하는 경우
          </Text>

          <Text style={styles.articleTitle}>6. 이용자 및 법정대리인의 권리와 행사방법</Text>
          <Text style={styles.text}>
            {/* ✅ 수정된 부분: > 기호를 {' > '} 로 변경하여 에러 해결 */}
            이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며 가입해지를 요청할 수 있습니다. 앱 내 "설정 {' > '} 내 정보 수정" 또는 "회원 탈퇴" 메뉴를 이용하거나 고객센터에 요청하면 지체 없이 조치하겠습니다.
          </Text>

          <Text style={styles.articleTitle}>7. 개인정보 자동 수집 장치의 설치/운영 및 거부에 관한 사항</Text>
          <Text style={styles.text}>
            회사는 이용자에게 특화된 맞춤서비스를 제공하기 위해서 이용자들의 정보를 수시로 저장하고 찾아내는 '쿠키(cookie)' 또는 모바일 기기 식별값 등을 운용합니다. 이용자는 이에 대한 설치 거부권을 가지고 있으나, 거부 시 로그인이 필요한 일부 서비스 이용에 어려움이 있을 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>8. 개인정보 보호책임자</Text>
          <Text style={styles.text}>
            회사는 고객의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여 아래와 같이 관련 부서 및 개인정보 보호책임자를 지정하고 있습니다.{'\n'}
            - 책임자: 손씨네 가족{'\n'}
            - 연락처: 앱 내 1:1 문의 또는 고객센터{'\n'}
            귀하께서는 회사의 서비스를 이용하시며 발생하는 모든 개인정보보호 관련 민원을 개인정보 보호책임자 혹은 담당 부서로 신고하실 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>부칙</Text>
          <Text style={styles.text}>
            본 방침은 2025년 1월 16일부터 시행됩니다.
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
    color: theme.primary, // 강조 색상
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