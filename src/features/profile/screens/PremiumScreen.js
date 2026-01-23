import React, { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Linking, ScrollView  } from "react-native";
import { Text } from "../../../components/MyText";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons"; 
import Purchases from "react-native-purchases";
import CustomModal from "../../../components/CustomModal";

export default function PremiumScreen({ navigation }) {
  const { activatePremium, refreshPremiumFromRevenueCat, isPremium, restorePurchases, addBoostTicket, incrementHotplaceCount } = useAppContext();

  const [selectedPlan, setSelectedPlan] = useState("monthly"); // monthly | yearly
  const [loading, setLoading] = useState(false);

  // ✅ 가격 설정 (핫스토어 2,000원 반영)
  const [prices, setPrices] = useState({
    monthly: "2,900원",
    yearly: "24,900원",
    boost: "1,000원",     
    hotstore: "2,000원",  
  });
  
  const [discountText, setDiscountText] = useState("28% 할인"); 

  // ✅ 모달 상태 관리
  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "" });

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
        
        if (current && mounted) {
          const monthlyPkg = current.monthly || current.availablePackages?.find(p => p.identifier === 'nbbang_sub_monthly');
          const annualPkg = current.annual || current.availablePackages?.find(p => p.identifier === 'nbbang_sub_yearly');
          const boostPkg = current.availablePackages?.find(p => p.identifier === 'nbbang_consumable_boost');
          const hotstorePkg = current.availablePackages?.find(p => p.identifier === 'nbbang_consumable_hotstore');

          setPrices(prev => ({
            monthly: monthlyPkg?.product?.priceString || prev.monthly,
            yearly: annualPkg?.product?.priceString || prev.yearly,
            boost: boostPkg?.product?.priceString || prev.boost,
            hotstore: hotstorePkg?.product?.priceString || prev.hotstore,
          }));

          const mPriceNum = monthlyPkg?.product?.price;
          const yPriceNum = annualPkg?.product?.price;

          if (mPriceNum && yPriceNum) {
            const yearlyCostIfMonthly = mPriceNum * 12;
            const discountPercent = Math.round((1 - (yPriceNum / yearlyCostIfMonthly)) * 100);
            setDiscountText(`${discountPercent}% 할인`);
          }
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

  // --- [핸들러] ---
  const handleManageSubscription = async () => {
    if (Platform.OS !== "android") {
      showModal("안내", "안드로이드에서만 구독 관리 화면으로 이동할 수 있습니다.");
      return;
    }
    try {
      const info = await Purchases.getCustomerInfo();
      const url = info?.managementURL;
      if (url && await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
      const pkg = Constants?.expoConfig?.android?.package || Constants?.manifest?.android?.package;
      const fallbackUrl = pkg
        ? `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(pkg)}`
        : "https://play.google.com/store/account/subscriptions";
      await Linking.openURL(fallbackUrl);
    } catch (e) {
      showModal("오류", "설정 화면 이동 실패");
    }
  };

  const handleSubscriptionPurchase = async () => {
    if (isPremium) {
      showModal("이용 중", "이미 프리미엄 멤버십을 이용 중입니다.");
      return;
    }
    setLoading(true);
    try {
      await activatePremium(selectedPlan); 
      await refreshPremiumFromRevenueCat();
      showModal("환영합니다!", "프리미엄 멤버십이 시작되었습니다.");
    } catch (e) {
      if (!e?.userCancelled) {
        showModal("결제 실패", "결제 중 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  

  const handleConsumablePurchase = async (type) => {
    setLoading(true);
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings?.current;
      
      let packageToBuy;
      if (type === 'boost') {
        packageToBuy = current?.availablePackages?.find(p => p.identifier === 'nbbang_consumable_boost');
      } else if (type === 'hotstore') {
        packageToBuy = current?.availablePackages?.find(p => p.identifier === 'nbbang_consumable_hotstore');
      }

      // 1. 상품이 없을 때 (테스트용 가짜 지급)
      if (!packageToBuy) {
        if (type === 'boost') {
           // ✅ 부스트 티켓 지급 (가짜)
           await addBoostTicket({ test: true }); 
           showModal("테스트 성공", "부스트 티켓 1개가 지급되었습니다. (테스트)");
        } else {
           // ✅ 핫스토어 등록권 지급 (가짜)
           await incrementHotplaceCount({ usageType: 'paid_extra', purchaseInfo: { test: true } }); 
           showModal("테스트 성공", "핫스토어 등록권 1개가 지급되었습니다. (테스트)");
        }
        setLoading(false);
        return; 
      }

      // 2. 실제 결제 진행
      const { customerInfo, productIdentifier } = await Purchases.purchasePackage(packageToBuy);
      
      // 3. 결제 성공 시 DB 아이템 지급
      const purchaseInfo = {
        productIdentifier,
        purchasedAt: new Date().toISOString(),
        transactionId: customerInfo?.originalAppUserId // 또는 트랜잭션 ID
      };

      if (type === 'boost') {
        // ✅ 부스트 티켓 지급 (실제)
        await addBoostTicket(purchaseInfo);
        showModal("구매 완료", "부스트업 티켓이 지급되었습니다.\n글 작성/수정 시 사용할 수 있습니다.");
      } else {
        // ✅ 핫스토어 등록권 지급 (실제)
        await incrementHotplaceCount({ usageType: 'paid_extra', purchaseInfo });
        showModal("구매 완료", "핫스토어 등록권이 지급되었습니다.");
      }

    } catch (e) {
      if (!e?.userCancelled) {
        showModal("결제 실패", "결제를 완료하지 못했습니다.\n" + (e.message || ""));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      const result = await restorePurchases();
      if (result === "NO_PURCHASE") {
        showModal("복원 실패", "복원할 구매 내역이 없습니다.");
      } else {
        showModal("복원 완료", "구매 내역이 복원되었습니다.");
      }
    } catch (e) {
      showModal("오류", "복원 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ✅ [헤더 수정] 
        기존 헤더 박스 삭제, 뒤로가기 버튼만 남기고 상단에 배치
        전체 내용을 위로 끌어올림
      */}
      <View style={styles.simpleHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <MaterialIcons name="arrow-back-ios" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* 상단 타이틀 (프리미엄 멤버십 - 유지) */}
        <View style={styles.titleBox}>
          <MaterialIcons name="diamond" size={32} color={theme.primary} style={styles.diamondIcon} />
          <Text style={styles.title}>프리미엄 멤버십</Text>
          <Text style={styles.subtitle}>제한 없는 N빵 생활을 시작하세요</Text>
        </View>

        {/* 혜택 리스트 */}
        <View style={styles.benefitBox}>
          <BenefitItem text="하루 글 작성 무제한" />
          <BenefitItem text="방장 수고비 상한 15%로 상향" />
          <BenefitItem text="부스트 글 우선 노출" />
          <BenefitItem text="핫스토어 등록 월 2회 무료" />
        </View>

        {/* 1. 구독 상품 선택 */}
        <Text style={styles.sectionLabel}>멤버십 선택</Text>
        <View style={styles.planBox}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === "monthly" && styles.planCardActive]}
            onPress={() => setSelectedPlan("monthly")}
          >
            <Text style={[styles.planTitle, selectedPlan === "monthly" && styles.textActive]}>월간</Text>
            <Text style={styles.planPrice}>{prices.monthly} / 월</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === "yearly" && styles.planCardActive]}
            onPress={() => setSelectedPlan("yearly")}
          >
            <View style={styles.badgeContainer}>
               <Text style={[styles.planTitle, selectedPlan === "yearly" && styles.textActive]}>연간</Text>
               <View style={styles.discountBadge}>
                 <Text style={styles.discountText}>{discountText}</Text>
               </View>
            </View>
            <Text style={styles.planPrice}>{prices.yearly} / 년</Text>
          </TouchableOpacity>
        </View>

        {/* ✅ [디자인 변경] 부스트/핫스토어 
          아이콘 왼쪽 + 텍스트 오른쪽 배치 (Row)
        */}
        <Text style={styles.sectionLabel}>필요할 때만 쏙! 추가 구매</Text>
        <View style={styles.addOnContainer}>
          {/* 부스트업 버튼 */}
          <TouchableOpacity style={styles.addOnCard} onPress={() => handleConsumablePurchase('boost')}>
            <View style={styles.iconCircle}>
              <Ionicons name="flash" size={20} color="#FFD700" />
            </View>
            <View style={styles.addOnInfo}>
              <Text style={styles.addOnTitle}>부스트업 1회</Text>
              <Text style={styles.addOnPrice}>{prices.boost}</Text>
            </View>
          </TouchableOpacity>

          {/* 핫스토어 버튼 */}
          <TouchableOpacity style={styles.addOnCard} onPress={() => handleConsumablePurchase('hotstore')}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 87, 87, 0.15)' }]}>
              <FontAwesome5 name="store" size={16} color="#FF5757" />
            </View>
            <View style={styles.addOnInfo}>
              <Text style={styles.addOnTitle}>핫스토어 1회</Text>
              <Text style={styles.addOnPrice}>{prices.hotstore}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 하단 버튼 */}
        <View style={styles.bottomArea}>
          <TouchableOpacity style={styles.purchaseBtn} onPress={handleSubscriptionPurchase} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="black" />
            ) : (
              <Text style={styles.purchaseText}>프리미엄 시작하기</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={handleRestore} disabled={loading} style={styles.linkBtn}>
              <Text style={styles.linkText}>구매 복원</Text>
            </TouchableOpacity>
            <Text style={styles.divider}>|</Text>
            <TouchableOpacity onPress={handleManageSubscription} disabled={loading} style={styles.linkBtn}>
              <Text style={styles.linkText}>구독 관리</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* 모달 */}
      <CustomModal
        visible={modalVisible}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

function BenefitItem({ text }) {
  return (
    <View style={styles.benefitItem}>
      <MaterialIcons name="check-circle" size={18} color={theme.primary} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  // ✅ 헤더 대체용 스타일 (뒤로가기 버튼만 존재)
  simpleHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0, // 간격 최소화
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 5,
    marginLeft: -5, // 왼쪽 여백 보정
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10, // 상단 여백 줄임
    paddingBottom: 40,
  },
  titleBox: {
    marginTop: 0,
    marginBottom: 30,
    alignItems: "center",
  },
  diamondIcon: {
    marginBottom: 10,
    textShadowColor: theme.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
  },
  benefitBox: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    gap: 12,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefitText: {
    color: "#E0E0E0",
    fontSize: 14,
  },
  sectionLabel: {
    color: "#888",
    fontSize: 13,
    marginBottom: 10,
    marginLeft: 4,
    fontWeight: "600",
  },
  planBox: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 30,
  },
  planCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#333",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "#111",
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
  },
  planCardActive: {
    borderColor: theme.primary,
    backgroundColor: "rgba(0, 255, 127, 0.05)",
  },
  planTitle: {
    color: "#AAA",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  textActive: {
    color: "white",
  },
  planPrice: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: "bold",
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  discountBadge: {
    backgroundColor: "#FF4500",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  
  // --- [수정] 좌우 배치 스타일 (Row Layout) ---
  addOnContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 30,
  },
  addOnCard: {
    flex: 1,
    backgroundColor: "#222",
    borderRadius: 12,
    paddingHorizontal: 16, // 좌우 여백
    paddingVertical: 14,   // 상하 여백
    flexDirection: "row",  // ✅ 가로 배치 핵심
    alignItems: "center",  // 세로 중앙 정렬
    justifyContent: "flex-start", // 왼쪽 정렬
    borderWidth: 1,
    borderColor: "#333",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12, // ✅ 아이콘 오른쪽 여백 (글자와의 간격)
    marginBottom: 0, // 기존 하단 여백 제거
  },
  addOnInfo: {
    flexDirection: "column", // 글자는 세로로 쌓임
    alignItems: "flex-start",
  },
  addOnTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  addOnPrice: {
    color: "#CCC",
    fontSize: 13,
  },

  // --- 하단 ---
  bottomArea: {
    marginTop: 10,
  },
  purchaseBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  purchaseText: {
    color: "black",
    fontSize: 18,
    fontWeight: "bold",
  },
  footerLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
  },
  linkBtn: {
    padding: 5,
  },
  linkText: {
    color: "#666",
    fontSize: 13,
  },
  divider: {
    color: "#333",
  },
});