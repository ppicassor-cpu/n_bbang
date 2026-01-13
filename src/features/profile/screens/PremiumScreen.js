import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import Purchases from "react-native-purchases";

export default function PremiumScreen({ navigation }) {
  const { activatePremium, refreshPremiumFromRevenueCat, isPremium, restorePurchases } = useAppContext();

  const [selectedPlan, setSelectedPlan] = useState("monthly"); // monthly | yearly
  const [loading, setLoading] = useState(false);

  // ✅ 기본 표시는 기존 문구 그대로 유지 (가격만 나중에 치환)
  const [monthlyPriceText, setMonthlyPriceText] = useState("2,900원 / 월");
  const [yearlyPriceText, setYearlyPriceText] = useState("24,900원 / 년");

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

  // ①② 구매 버튼 흐름
  const handlePurchase = async () => {
    if (isPremium) {
      Alert.alert("프리미엄 이용 중", "이미 프리미엄 이용 중입니다.");
      return;
    }

    setLoading(true);
    try {
      await activatePremium(selectedPlan);
      await refreshPremiumFromRevenueCat();
      Alert.alert("결제 완료", "프리미엄이 활성화되었습니다.");
    } catch (e) {
      if (e?.userCancelled) return;
      Alert.alert("결제 실패", "결제 중 오류가 발생했습니다.\n네트워크 상태를 확인해주세요.");
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
        Alert.alert("복원 실패", "복원할 구매 내역이 없습니다.");
      } else {
        Alert.alert("복원 완료", "프리미엄이 복원되었습니다.");
      }
    } catch (e) {
      Alert.alert("오류", "구매 복원 중 문제가 발생했습니다.");
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
      </View>
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
});
