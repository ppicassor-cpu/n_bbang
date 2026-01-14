import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import Purchases from "react-native-purchases";
import CustomModal from "../../../components/CustomModal"; // ✅ 커스텀 모달 import

export default function PremiumScreen({ navigation }) {
  const { activatePremium, refreshPremiumFromRevenueCat, isPremium, restorePurchases } = useAppContext();

  const [selectedPlan, setSelectedPlan] = useState("monthly"); // monthly | yearly
  const [loading, setLoading] = useState(false);

  // ✅ 기본 표시는 기존 문구 그대로 유지 (가격만 나중에 치환)
  const [monthlyPriceText, setMonthlyPriceText] = useState("2,900원 / 월");
  const [yearlyPriceText, setYearlyPriceText] = useState("24,900원 / 년");

  // ✅ [추가] 모달 상태 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "" });

  // ✅ [추가] 모달 띄우기 헬퍼 함수
  const showModal = (title, message) => {
    setModalConfig({ title, message });
    setModalVisible(true);
  };

  useEffect(() => {
    let mounted = true;

    const loadPricesFromRevenueCat = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        const current = offerings?.current;
        if (!current) return;

        const monthlyPkg =
          current.monthly || current.availablePackages?.find((p) => p.packageType === "MONTHLY");
        const annualPkg =
          current.annual || current.availablePackages?.find((p) => p.packageType === "ANNUAL");

        const mPrice = monthlyPkg?.product?.priceString;
        const yPrice = annualPkg?.product?.priceString;

        if (mounted) {
          if (mPrice) setMonthlyPriceText(`${mPrice} / 월`);
          if (yPrice) setYearlyPriceText(`${yPrice} / 년`);
        }
      } catch (e) {
        console.log("RevenueCat 가격 로드 실패", e);
      }
    };

    loadPricesFromRevenueCat();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ [추가] 구독 관리(안드로이드): RevenueCat managementURL 우선, 없으면 Play 구독 페이지로 fallback
  const handleManageSubscription = async () => {
    if (Platform.OS !== "android") {
      showModal("안내", "안드로이드에서만 구독 관리 화면으로 이동할 수 있습니다.");
      return;
    }

    try {
      // 1) RevenueCat이 제공하는 관리 URL 우선
      const info = await Purchases.getCustomerInfo();
      const url = info?.managementURL;
      if (url) {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          return;
        }
      }

      // 2) fallback: Play 구독 관리 페이지
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
      showModal("오류", "구독 관리 화면을 여는 중 문제가 발생했습니다.");
    }
  };

  // ①② 구매 버튼 흐름
  const handlePurchase = async () => {
    if (isPremium) {
      showModal("프리미엄 이용 중", "이미 프리미엄 이용 중입니다."); // ✅ Alert 대체
      return;
    }

    setLoading(true);
    try {
      await activatePremium(selectedPlan);
      await refreshPremiumFromRevenueCat();
      showModal("결제 완료", "프리미엄이 활성화되었습니다."); // ✅ Alert 대체
    } catch (e) {
      if (e?.userCancelled) return;
      showModal("결제 실패", "결제 중 오류가 발생했습니다.\n네트워크 상태를 확인해주세요."); // ✅ Alert 대체
    } finally {
      setLoading(false);
    }
  };

  // ③ 구매 복원 흐름
  const handleRestore = async () => {
    setLoading(true);
    try {
      const result = await restorePurchases();

      if (result === "NO_PURCHASE") {
        showModal("복원 실패", "복원할 구매 내역이 없습니다."); // ✅ Alert 대체
      } else {
        showModal("복원 완료", "프리미엄이 복원되었습니다."); // ✅ Alert 대체
      }
    } catch (e) {
      showModal("오류", "구매 복원 중 문제가 발생했습니다."); // ✅ Alert 대체
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.titleBox}>
        <MaterialIcons name="diamond" size={30} color={theme.primary} style={styles.diamondIcon} />
        <Text style={styles.title}>프리미엄으로 더 자유롭게</Text>
        <Text style={styles.subtitle}>방장 운영부터 글 작성까지 제한 없이 이용하세요</Text>
      </View>

      <View style={styles.benefitBox}>
        <BenefitItem text="하루 글 작성 제한 해제" />
        <BenefitItem text="방장 수고비 상한 15%" />
        <BenefitItem text="부스트 글 우선 노출" />
      </View>

      <View style={styles.planBox}>
        <TouchableOpacity
          style={[styles.planCard, selectedPlan === "monthly" && styles.planCardActive]}
          onPress={() => setSelectedPlan("monthly")}
        >
          <Text style={styles.planTitle}>월간</Text>
          <Text style={styles.planPrice}>{monthlyPriceText}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.planCard, selectedPlan === "yearly" && styles.planCardActive]}
          onPress={() => setSelectedPlan("yearly")}
        >
          <Text style={styles.planTitle}>연간</Text>
          <Text style={styles.planPrice}>{yearlyPriceText}</Text>
          <Text style={styles.planBadge}>할인</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomArea}>
        <TouchableOpacity style={styles.purchaseBtn} onPress={handlePurchase} disabled={loading}>
          {loading ? <ActivityIndicator color="black" /> : <Text style={styles.purchaseText}>프리미엄 시작하기</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
          <Text style={styles.restoreText}>구매 복원</Text>
        </TouchableOpacity>

        {/* ✅ [추가] 구독 관리 버튼 (디자인 톤 유지: restore와 동일한 스타일) */}
        <TouchableOpacity style={styles.manageBtn} onPress={handleManageSubscription} disabled={loading}>
          <Text style={styles.manageText}>구독 관리</Text>
        </TouchableOpacity>
      </View>

      {/* ✅ 커스텀 모달 컴포넌트 추가 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={() => setModalVisible(false)} // 확인 버튼 누르면 닫기
      />
    </SafeAreaView>
  );
}

function BenefitItem({ text }) {
  return (
    <View style={styles.benefitItem}>
      <MaterialIcons name="check-circle" size={20} color={theme.primary} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    padding: 20,
  },
  titleBox: {
    marginBottom: 30,
    alignItems: "center",
  },
  diamondIcon: {
    marginBottom: 10,
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
  },
  benefitBox: {
    marginBottom: 30,
    gap: 14,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefitText: {
    color: "white",
    fontSize: 15,
  },
  planBox: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#111",
  },
  planCardActive: {
    borderColor: theme.primary,
    backgroundColor: "#1a1a1a",
  },
  planTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  planPrice: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: "bold",
  },
  planBadge: {
    marginTop: 6,
    color: "#999",
    fontSize: 12,
  },
  bottomArea: {
    marginTop: "auto",
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
  },
  purchaseBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  purchaseText: {
    color: "black",
    fontSize: 18,
    fontWeight: "bold",
  },
  restoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  restoreText: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "bold",
  },

  // ✅ [추가] 구독 관리 버튼(restore와 동일 톤)
  manageBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  manageText: {
    color: "#aaa",
    fontSize: 14,
    fontWeight: "bold",
  },
});
