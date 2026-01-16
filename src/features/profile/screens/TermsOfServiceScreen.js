// FILE: src/features/profile/screens/TermsOfServiceScreen.js

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../theme";

export default function TermsOfServiceScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* === 섹션 1: 서비스 이용약관 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 1장 서비스 이용약관</Text>
          
          <Text style={styles.articleTitle}>제 1 조 (목적)</Text>
          <Text style={styles.text}>
            본 약관은 'N빵' (이하 "회사"라 함)이 제공하는 위치기반 공동구매 및 커뮤니티 서비스(이하 "서비스"라 함)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </Text>

          <Text style={styles.articleTitle}>제 2 조 (용어의 정의)</Text>
          <Text style={styles.text}>
            1. "서비스"라 함은 단말기(PC, 휴대형 단말기 등 각종 유무선 장치를 포함)와 상관없이 회원이 이용할 수 있는 N빵 및 관련 제반 서비스를 의미합니다.{'\n'}
            2. "회원"이라 함은 서비스에 접속하여 본 약관에 따라 회사와 이용계약을 체결하고 회사가 제공하는 서비스를 이용하는 고객을 말합니다.{'\n'}
            3. "N빵"이라 함은 물품 구매 비용을 나누거나 공동으로 구매하기 위해 회원이 게시물을 올리고 참여하는 행위를 의미합니다.{'\n'}
            4. "핫플레이스"라 함은 회사가 승인한 사업자 회원이 자신의 매장을 홍보하기 위해 등록한 장소 정보를 의미합니다.{'\n'}
            5. "포인트" 또는 "캐시"라 함은 서비스의 효율적 이용을 위해 회사가 임의로 책정하거나 지급, 조정할 수 있는 재산적 가치가 없는 가상의 데이터를 의미합니다.
          </Text>

          <Text style={styles.articleTitle}>제 3 조 (약관의 게시와 개정)</Text>
          <Text style={styles.text}>
            1. 회사는 본 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 초기 화면 또는 설정 메뉴에 게시합니다.{'\n'}
            2. 회사는 '약관의 규제에 관한 법률', '정보통신망 이용촉진 및 정보보호 등에 관한 법률' 등 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.{'\n'}
            3. 회사가 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 현행약관과 함께 제1항의 방식에 따라 개정 약관의 적용일자 7일 전부터 공지합니다. 다만, 회원에게 불리한 내용으로 약관을 개정하는 경우에는 30일 전부터 공지합니다.
          </Text>

          <Text style={styles.articleTitle}>제 4 조 (이용계약 체결)</Text>
          <Text style={styles.text}>
            1. 이용계약은 회원이 되고자 하는 자(이하 "가입신청자")가 약관의 내용에 대하여 동의를 한 다음 회원가입 신청을 하고 회사가 이러한 신청에 대하여 승낙함으로써 체결됩니다.{'\n'}
            2. 회사는 가입신청자의 신청에 대하여 서비스 이용을 승낙함을 원칙으로 합니다. 다만, 실명이 아니거나 타인의 명의를 이용한 경우, 허위 정보를 기재한 경우 등에는 승낙을 하지 않거나 사후에 이용계약을 해지할 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>제 5 조 (회원정보의 변경)</Text>
          <Text style={styles.text}>
            회원은 개인정보관리 화면을 통하여 언제든지 본인의 개인정보를 열람하고 수정할 수 있습니다. 다만, 서비스 관리를 위해 필요한 실명, 아이디(이메일) 등은 수정이 불가능할 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>제 6 조 (개인정보보호 의무)</Text>
          <Text style={styles.text}>
            회사는 "정보통신망법" 등 관계 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위해 노력합니다. 개인정보의 보호 및 사용에 대해서는 관련 법령 및 회사의 개인정보처리방침이 적용됩니다.
          </Text>

          <Text style={styles.articleTitle}>제 7 조 (회원의 의무)</Text>
          <Text style={styles.text}>
            회원은 다음 행위를 하여서는 안 됩니다.{'\n'}
            1. 신청 또는 변경 시 허위 내용의 등록{'\n'}
            2. 타인의 정보 도용{'\n'}
            3. 회사가 게시한 정보의 변경{'\n'}
            4. 회사 및 기타 제3자의 저작권 등 지적재산권에 대한 침해{'\n'}
            5. 회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위{'\n'}
            6. 외설 또는 폭력적인 메시지, 화상, 음성, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위{'\n'}
            7. 영리를 목적으로 서비스를 이용하는 행위 (단, 핫플레이스 등 회사가 승인한 경우 제외){'\n'}
            8. 기타 불법적이거나 부당한 행위
          </Text>

          <Text style={styles.articleTitle}>제 8 조 (서비스의 제공 및 변경)</Text>
          <Text style={styles.text}>
            1. 회사는 회원에게 아래와 같은 서비스를 제공합니다.{'\n'}
            - 위치 기반 공동구매(N빵) 중개 서비스{'\n'}
            - 핫플레이스 정보 제공 및 홍보 서비스{'\n'}
            - 커뮤니티 및 채팅 서비스{'\n'}
            - 기타 회사가 추가 개발하거나 제휴 등을 통해 제공하는 일체의 서비스{'\n'}
            2. 회사는 서비스의 내용, 이용방법, 이용시간에 대하여 변경이 있는 경우 변경사유, 변경내용 및 제공일자 등을 변경 전에 서비스 내에 공지합니다.
          </Text>

          <Text style={styles.articleTitle}>제 9 조 (유료 서비스 및 결제)</Text>
          <Text style={styles.text}>
            1. 회사가 제공하는 서비스는 기본적으로 무료입니다. 단, 별도의 유료 서비스(프리미엄 멤버십, 핫플레이스 추가 등록 등)를 이용하는 경우 해당 요금을 납부해야 합니다.{'\n'}
            2. 유료 서비스의 이용 요금 및 결제 방식은 해당 서비스 화면에 명시된 바에 따릅니다.{'\n'}
            3. 회원은 결제와 관련하여 정당한 대가를 지급할 의무가 있으며, 부당한 방법으로 결제를 취소하거나 환불을 요구해서는 안 됩니다.
          </Text>

          <Text style={styles.articleTitle}>제 10 조 (계약 해지 및 이용 제한)</Text>
          <Text style={styles.text}>
            1. 회원은 언제든지 서비스 내 "탈퇴하기" 화면을 통하여 이용계약 해지 신청을 할 수 있으며, 회사는 관련 법령 등이 정하는 바에 따라 이를 즉시 처리하여야 합니다.{'\n'}
            2. 회원이 계약을 해지할 경우, 관련 법령 및 개인정보처리방침에 따라 회사가 회원정보를 보유하는 경우를 제외하고는 해지 즉시 회원의 모든 데이터는 소멸됩니다.{'\n'}
            3. 회사는 회원이 본 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우, 경고, 일시정지, 영구이용정지 등으로 서비스 이용을 단계적으로 제한할 수 있습니다.
          </Text>
        </View>

        {/* 구분선 */}
        <View style={styles.divider} />

        {/* === 섹션 2: 위치기반 서비스 이용약관 === */}
        <View style={styles.section}>
          <Text style={styles.mainTitle}>제 2장 위치기반 서비스 이용약관</Text>

          <Text style={styles.articleTitle}>제 1 조 (목적)</Text>
          <Text style={styles.text}>
            본 약관은 회사가 제공하는 위치기반 서비스와 관련하여 회사와 개인위치정보주체와의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </Text>

          <Text style={styles.articleTitle}>제 2 조 (서비스 내용 및 요금)</Text>
          <Text style={styles.text}>
            1. 회사는 위치정보사업자로부터 수집한 위치정보를 이용하여 아래와 같은 위치기반 서비스를 제공합니다.{'\n'}
            - 현재 위치를 기반으로 한 주변 공동구매(N빵) 게시글 검색 및 추천{'\n'}
            - 이용자의 현재 위치를 기준으로 한 주변 핫플레이스(상점) 정보 제공{'\n'}
            - 게시물 작성 시 위치 인증 및 지역 설정 기능 제공{'\n'}
            2. 회사가 제공하는 위치기반 서비스는 무료입니다. 단, 무선 서비스 이용 시 발생하는 데이터 통신료는 별도입니다.
          </Text>

          <Text style={styles.articleTitle}>제 3 조 (위치정보의 수집 방법)</Text>
          <Text style={styles.text}>
            회사는 다음과 같은 방식으로 개인위치정보를 수집합니다.{'\n'}
            1. 휴대폰 단말기를 이용한 기지국 기반(Cell ID) 방식{'\n'}
            2. GPS 칩이 내장된 전용 단말기를 이용한 GPS 방식{'\n'}
            3. Wi-Fi 무선랜을 이용한 방식
          </Text>

          <Text style={styles.articleTitle}>제 4 조 (개인위치정보주체의 권리)</Text>
          <Text style={styles.text}>
            1. 개인위치정보주체는 개인위치정보 수집 범위 및 이용약관의 내용 중 일부 또는 개인위치정보의 이용ㆍ제공 목적, 제공받는 자의 범위 및 위치기반서비스의 일부에 대하여 동의를 유보할 수 있습니다.{'\n'}
            2. 개인위치정보주체는 개인위치정보의 수집ㆍ이용ㆍ제공에 대한 동의의 전부 또는 일부를 철회할 수 있습니다.{'\n'}
            3. 개인위치정보주체는 언제든지 개인위치정보의 수집ㆍ이용ㆍ제공의 일시적인 중지를 요구할 수 있습니다.
          </Text>

          <Text style={styles.articleTitle}>제 5 조 (위치정보의 보유 및 이용기간)</Text>
          <Text style={styles.text}>
            1. 회사는 위치기반서비스를 제공하기 위해 필요한 최소한의 기간 동안 개인위치정보를 보유 및 이용합니다.{'\n'}
            2. 회사는 대부분의 위치기반서비스를 제공함에 있어 개인위치정보를 일회적으로 이용하며, 이용 목적 달성 시 즉시 파기합니다. 단, '위치정보의 보호 및 이용 등에 관한 법률' 제16조 제2항에 따라 기록 보존이 필요한 경우 해당 자료를 6개월간 보존합니다.
          </Text>

          <Text style={styles.articleTitle}>제 6 조 (위치정보 관리책임자)</Text>
          <Text style={styles.text}>
            회사의 위치정보 관리책임자는 다음과 같습니다.{'\n'}
            - 직위 : 개인정보 보호책임자 (CPO){'\n'}
            - 문의 : 앱 내 고객센터 또는 1:1 문의 이용
          </Text>

          <Text style={styles.articleTitle}>부칙</Text>
          <Text style={styles.text}>
            본 약관은 2025년 1월 16일부터 시행됩니다.
          </Text>
        </View>

        {/* 하단 여백 */}
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
  section: {
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
    marginBottom: 20,
    marginTop: 10,
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
    paddingBottom: 10,
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
    textAlign: "justify", // 양쪽 정렬로 깔끔하게
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 40,
  },
});