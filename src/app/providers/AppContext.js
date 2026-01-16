// FILE: src/app/providers/AppContext.js

import React, { createContext, useState, useContext, useEffect, useRef } from "react";
import { Platform, Alert } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../../firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  OAuthProvider,
} from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  limit,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import Purchases from "react-native-purchases";

// ✅ [추가] 커스텀 모달 import (Alert.alert 대체)
import CustomModal from "../../components/CustomModal";

const AppContext = createContext();
const STORAGE_KEY = "user_location_auth_v3";

// ✅ [추가] API BASE URL (cleartext/도메인 분리용)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://152.67.213.225:4000";

// ✅ [추가] Kakao Local REST API Key (좌표→행정동 보조용)
// ※ 반드시 EXPO_PUBLIC_ 로 설정하세요.
const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY || "";

// ✅ [추가] Kakao 보조 지오코딩 캐시/스로틀 키
const KAKAO_DONG_CACHE_KEY = "kakao_dong_cache_v1";
const KAKAO_GEO_META_KEY = "kakao_geo_meta_v1";

// ✅ [추가] Kakao 호출 제한 기본값
const KAKAO_THROTTLE_MS = 45 * 1000; // 30~60초 중간값
const KAKAO_DISTANCE_KM = 0.2; // 150~300m 중간값(200m)
const DONG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const GRID_DECIMALS = 3; // 소수점 3자리 ≈ 100m

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function extractDong(text) {
  if (!text) return null;
  const words = String(text).split(/[\s,()\[\]]+/);
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (w.endsWith("로") || w.endsWith("길") || w.endsWith("대로")) continue;
    if (w.endsWith("시") || w.endsWith("군") || w.endsWith("구") || w.endsWith("도")) continue;
    if (/[가-힣0-9]+(동|읍|면|리|가)$/.test(w)) return w;
  }
  return null;
}

// ✅ [추가] 구 추출(동이 없을 때라도 fallback)
function extractGu(text) {
  if (!text) return null;
  const words = String(text).split(/[\s,()\[\]]+/);
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (/[가-힣0-9]+구$/.test(w)) return w;
  }
  return null;
}

function isValidDongLabel(v) {
  if (!v) return false;
  return /[가-힣0-9]+(동|읍|면|리|가)$/.test(String(v));
}

function roundToDecimals(n, decimals) {
  const p = Math.pow(10, decimals);
  return Math.round(Number(n) * p) / p;
}

function makeGridKey(coords) {
  if (!coords?.latitude || !coords?.longitude) return null;
  const lat = roundToDecimals(coords.latitude, GRID_DECIMALS).toFixed(GRID_DECIMALS);
  const lon = roundToDecimals(coords.longitude, GRID_DECIMALS).toFixed(GRID_DECIMALS);
  return `${lat},${lon}`;
}

// ✅ [추가] reverseGeocode 결과에서 "동" 추출 성공률을 높이기 위한 주소 문자열 생성
function buildAddressText(addr) {
  if (!addr || typeof addr !== "object") return "";
  const parts = [];
  for (const v of Object.values(addr)) {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  }
  return parts.join(" ");
}

function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ✅ [추가] 짧은 watch로 best accuracy 좌표 확보
async function getBestCoordsWithShortWatch() {
  let best = null;
  let watcher = null;

  try {
    watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 350,
        distanceInterval: 0,
      },
      (loc) => {
        const c = loc?.coords;
        if (!c?.latitude || !c?.longitude) return;
        const acc = Number(c.accuracy ?? 9999);
        if (!best) {
          best = c;
          return;
        }
        const bestAcc = Number(best.accuracy ?? 9999);
        if (acc < bestAcc) best = c;
      }
    );

    // 1.6초만 모아서 best 선택
    await sleep(1600);
  } catch {
    // watch 실패 시 아래 getCurrentPosition로 처리
  } finally {
    try {
      if (watcher && watcher.remove) watcher.remove();
    } catch {}
  }

  if (!best) {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    best = loc?.coords || null;
  }

  // 정확도가 너무 크면 Highest로 1회만 보강
  const bestAcc = Number(best?.accuracy ?? 9999);
  if (best && bestAcc > 30) {
    try {
      const loc2 = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const c2 = loc2?.coords;
      if (c2?.latitude && c2?.longitude) {
        const acc2 = Number(c2.accuracy ?? 9999);
        if (acc2 < bestAcc) best = c2;
      }
    } catch {}
  }

  return best;
}

// ✅ [추가] expo reverseGeocode 1~2회 재시도
async function getDongFromExpoReverseGeocode(coords) {
  for (let i = 0; i < 2; i++) {
    const addresses = await Location.reverseGeocodeAsync(coords).catch(() => []);
    for (const addr of addresses) {
      const found = extractDong(buildAddressText(addr));
      if (found) return { dong: found, gu: null };
    }

    // 동이 없으면 구라도 확보(동이 최우선이므로 여기서는 저장만)
    for (const addr of addresses) {
      const gu = extractGu(buildAddressText(addr));
      if (gu) return { dong: null, gu };
    }

    if (i < 1) await sleep(280);
  }
  return { dong: null, gu: null };
}

// ✅ [추가] Kakao 로컬: 좌표→행정동 (실패 시에만 호출)
async function getDongFromKakao(coords) {
  if (!KAKAO_REST_API_KEY) return null;
  if (!coords?.latitude || !coords?.longitude) return null;

  const x = coords.longitude;
  const y = coords.latitude;

  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(
    x
  )}&y=${encodeURIComponent(y)}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.documents?.length) return null;

    const docs = data.documents || [];
    const pick =
      docs.find((d) => d?.region_type === "H") ||
      docs.find((d) => d?.region_type === "B") ||
      docs[0];

    const d3 = pick?.region_3depth_name || "";
    const dong = extractDong(d3);
    return dong || null;
  } catch {
    return null;
  }
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentLocation, setCurrentLocation] = useState("위치 찾는 중...");
  const [myCoords, setMyCoords] = useState(null);
  
  // =================================================================
  // ✅ [수정] Posts 및 Stores(가게) 상태 관리
  // =================================================================
  const [posts, setPosts] = useState([]);
  const [postLimit, setPostLimit] = useState(20);

  const [stores, setStores] = useState([]); // ✅ [추가] 가게 목록 상태
  const [storeLimit, setStoreLimit] = useState(20); // ✅ [추가] 가게 목록 제한

  const [blockedUsers, setBlockedUsers] = useState([]);

  const [isVerified, setIsVerified] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState(null);
  const [dailyPostCount, setDailyPostCount] = useState(0);
  const [dailyPostCountDate, setDailyPostCountDate] = useState(null);

  // ✅ [추가] 핫플레이스 멤버십/월 카운트 상태
  const [membershipType, setMembershipType] = useState("free"); // free/monthly/yearly
  const [hotplaceMonthKey, setHotplaceMonthKey] = useState(null); // YYYY-MM
  const [hotplaceCount, setHotplaceCount] = useState(0);
  const [hotplacePaidExtraMonthKey, setHotplacePaidExtraMonthKey] = useState(null); // YYYY-MM
  const [hotplacePaidExtraCount, setHotplacePaidExtraCount] = useState(0);

  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // ✅ [추가] Alert.alert 대체용 커스텀 모달 상태/헬퍼
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const openModal = (title, message) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  // ✅ [점검 1] 프리미엄 판별은 "entitlements.active"로만 통일
  // ✅ [확정] RevenueCat Entitlement Identifier: "Nbbang Premium"
  const ENTITLEMENT_IDS = ["Nbbang Premium"];

  // ✅ (통일) Public SDK Key는 EXPO_PUBLIC 하나만 사용
  const REVENUECAT_PUBLIC_SDK_KEY = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY || "";

  const getRevenueCatApiKey = () => {
    // 공용 키만 사용 (App.js에서 configure에 사용)
    return REVENUECAT_PUBLIC_SDK_KEY || "";
  };

  // ✅ [추가] $0.99 단건(Consumable) 식별자 (RevenueCat 상품/패키지 ID)
  // - 가능한 값:
  //   1) EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PACKAGE_ID (Offerings의 custom package identifier)
  //   2) EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PRODUCT_ID (Store product identifier)
  // - 둘 다 없으면 아래 fallback 리스트로 매칭 시도
  const HOTPLACE_CONSUMABLE_PACKAGE_ID = process.env.EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PACKAGE_ID || "";
  const HOTPLACE_CONSUMABLE_PRODUCT_ID = process.env.EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PRODUCT_ID || "";
  const HOTPLACE_CONSUMABLE_FALLBACK_IDS = [
    "hotplace_single_099",
    "hotplace_099",
    "hotplace_single",
    "hotplace_one_time",
  ];

  // ✅ [점검 2] AppContext에서는 절대 configure 하지 않음 (유지)
  const rcLoggedInUidRef = useRef(null);

  const getActiveEntitlement = (customerInfo) => {
    try {
      const active = customerInfo?.entitlements?.active || {};
      for (const id of ENTITLEMENT_IDS) {
        if (active?.[id]) return active[id];
      }
      return null;
    } catch {
      return null;
    }
  };

  const initRevenueCatForUser = async (uid) => {
    try {
      const apiKey = getRevenueCatApiKey();
      if (!apiKey) {
        rcLoggedInUidRef.current = null;
        return;
      }

      // ✅ 로그인(identify) 연결: uid가 있고, 현재 로그인 uid와 다르면 logIn
      // (configure는 App.js에서 선행되어야 함)
      if (uid && rcLoggedInUidRef.current !== uid && Purchases.logIn) {
        try {
          await Purchases.logIn(uid);
          rcLoggedInUidRef.current = uid;
        } catch (e) {
          console.warn("RevenueCat logIn 실패(무시 가능):", e);
        }
      }
    } catch (e) {
      rcLoggedInUidRef.current = null;
      console.warn("RevenueCat logIn 실패:", e);
    }
  };

  const applyCustomerInfoToStateAndDb = async (uid, customerInfo) => {
    try {
      if (isAdminRef.current) {
        setPremiumUntil("2099-12-31T23:59:59.999Z");
        setIsPremium(true);
        setMembershipType("yearly"); // ✅ [추가] 관리자는 연간 회원 대우
        return;
      }

      const entitlement = getActiveEntitlement(customerInfo);
      const nextPremiumUntil = entitlement?.expirationDate || null;
      const nextIsPremium = !!entitlement || !!isAdminRef.current;

      // ✅ [수정] 멤버십 타입 판별 로직 추가
      let nextMembershipType = "free";
      if (nextIsPremium) {
        const pid = entitlement?.productIdentifier || "";
        // RevenueCat 상품 ID에 'year'나 'annual'이 포함되면 연간권으로 간주
        if (pid.toLowerCase().includes("year") || pid.toLowerCase().includes("annual")) {
          nextMembershipType = "yearly";
        } else {
          nextMembershipType = "monthly";
        }
      }

      setPremiumUntil(nextPremiumUntil);
      setIsPremium(nextIsPremium);
      setMembershipType(nextMembershipType); // ✅ 상태 업데이트

      if (uid) {
        await updateDoc(doc(db, "users", uid), {
          premiumUntil: nextPremiumUntil,
          isPremium: nextIsPremium,
          membershipType: nextMembershipType, // ✅ DB 업데이트
          premiumUpdatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("applyCustomerInfoToStateAndDb 실패:", e);
    }
  };

  // ✅ [점검 3] 갱신 타이밍 보강: 가능한 경우에만 syncPurchases -> getCustomerInfo
  const refreshPremiumFromRevenueCat = async () => {
    try {
      if (!user?.uid) return;

      if (isAdminRef.current) {
        setPremiumUntil("2099-12-31T23:59:59.999Z");
        setIsPremium(true);
        return;
      }

      // ✅ 혹시 아직 logIn 안 된 상태면 먼저 보장 (configure는 App.js에서만)
      await initRevenueCatForUser(user.uid);

      // ✅ 안드로이드에서 테스트/해지/만료 반영 지연 케이스 완화 (지원될 때만)
      if (Platform.OS === "android" && Purchases.syncPurchases) {
        try {
          await Purchases.syncPurchases();
        } catch (e) {
          console.warn("RevenueCat syncPurchases 실패(무시 가능):", e);
        }
      }

      const info = await Purchases.getCustomerInfo();
      await applyCustomerInfoToStateAndDb(user.uid, info);
    } catch (e) {
      console.warn("refreshPremiumFromRevenueCat 실패:", e);
    }
  };

  const restorePurchases = async () => {
    try {
      if (isAdminRef.current) return "RESTORE_OK";

      if (user?.uid) {
        await initRevenueCatForUser(user.uid);
      }

      // ✅ restore 전에도 sync를 한 번 시도 (지원될 때만)
      if (Platform.OS === "android" && Purchases.syncPurchases) {
        try {
          await Purchases.syncPurchases();
        } catch (e) {
          console.warn("RevenueCat syncPurchases 실패(무시 가능):", e);
        }
      }

      const info = await Purchases.restorePurchases();
      const entitlement = getActiveEntitlement(info);
      if (!entitlement) return "NO_PURCHASE";
      if (user?.uid) await applyCustomerInfoToStateAndDb(user.uid, info);
      return "RESTORE_OK";
    } catch (e) {
      throw e;
    }
  };

  const activatePremium = async (selectedPlan = "monthly") => {
    if (isAdminRef.current) return true;

    if (!user?.uid) throw new Error("NO_USER");
    const apiKey = getRevenueCatApiKey();
    if (!apiKey) throw new Error("NO_REVENUECAT_API_KEY");

    await initRevenueCatForUser(user.uid);

    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) throw new Error("NO_OFFERINGS");

    let targetPackage = null;

    if (selectedPlan === "yearly") {
      targetPackage = current.annual || current.availablePackages?.find((p) => p.packageType === "ANNUAL");
    } else if (selectedPlan === "lifetime") {
      targetPackage = current.lifetime || current.availablePackages?.find((p) => p.packageType === "LIFETIME");
    } else {
      targetPackage = current.monthly || current.availablePackages?.find((p) => p.packageType === "MONTHLY");
    }

    if (!targetPackage) throw new Error("NO_MATCHED_PACKAGE");

    const purchaseResult = await Purchases.purchasePackage(targetPackage);
    const customerInfo = purchaseResult?.customerInfo || null;
    if (customerInfo) {
      await applyCustomerInfoToStateAndDb(user.uid, customerInfo);
    } else {
      await refreshPremiumFromRevenueCat();
    }
    return true;
  };

  // ✅ [추가] Offerings에서 핫플레이스 단건(Consumable) 패키지 찾기
  const findHotplaceConsumablePackage = (offerings) => {
    try {
      const current = offerings?.current;
      const packs = current?.availablePackages || [];
      if (!packs.length) return null;

      if (HOTPLACE_CONSUMABLE_PACKAGE_ID) {
        const hit = packs.find((p) => String(p?.identifier || "") === String(HOTPLACE_CONSUMABLE_PACKAGE_ID));
        if (hit) return hit;
      }

      const allIds = [];
      if (HOTPLACE_CONSUMABLE_PRODUCT_ID) allIds.push(String(HOTPLACE_CONSUMABLE_PRODUCT_ID));
      for (const v of HOTPLACE_CONSUMABLE_FALLBACK_IDS) allIds.push(String(v));

      // 1) storeProduct.identifier 매칭
      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.product?.identifier || "") === id);
        if (hit) return hit;
      }

      // 2) package identifier 매칭(커스텀 패키지 identifier가 id랑 같게 써놓은 경우)
      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.identifier || "") === id);
        if (hit) return hit;
      }

      // 3) 마지막 fallback: $0.99 가격대 패키지 추정 (가격 문자열에 0.99가 포함된 경우)
      const priceHit = packs.find((p) => {
        const priceStr = String(p?.product?.priceString || "");
        return priceStr.includes("0.99") || priceStr.includes("0,99");
      });
      if (priceHit) return priceHit;

      return null;
    } catch {
      return null;
    }
  };

  // ✅ [추가] $0.99 단건(Consumable) 구매 함수
  // - "글쓰기 버튼"에서 결제유도 시 호출
  // - 실제 사용(카운트 +1 / DB 반영)은 "글 등록 성공 후" incrementHotplaceCount({usageType:"paid_extra", purchaseInfo}) 로 처리
  const purchaseHotplaceConsumable = async () => {
    if (isAdminRef.current) {
      return { status: "PURCHASED", purchaseInfo: { admin: true } };
    }

    if (!user?.uid) throw new Error("NO_USER");
    const apiKey = getRevenueCatApiKey();
    if (!apiKey) throw new Error("NO_REVENUECAT_API_KEY");

    await initRevenueCatForUser(user.uid);

    const offerings = await Purchases.getOfferings();
    const targetPackage = findHotplaceConsumablePackage(offerings);
    if (!targetPackage) throw new Error("NO_CONSUMABLE_PACKAGE");

    try {
      const result = await Purchases.purchasePackage(targetPackage);

      const purchaseInfo = {
        packageIdentifier: String(targetPackage?.identifier || ""),
        productIdentifier: String(targetPackage?.product?.identifier || ""),
        priceString: String(targetPackage?.product?.priceString || ""),
        purchasedAt: new Date().toISOString(),
        customerInfo: result?.customerInfo || null,
        transaction: result?.transaction || null,
      };

      return { status: "PURCHASED", purchaseInfo };
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("user_cancel")) {
        return { status: "CANCELLED", purchaseInfo: null };
      }
      return { status: "FAILED", purchaseInfo: null, error: e };
    }
  };

  useEffect(() => {
    checkSavedVerification();

    let customerInfoListener = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (customerInfoListener && Purchases.removeCustomerInfoUpdateListener) {
        try {
          Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
        } catch {}
        customerInfoListener = null;
      }

      if (!currentUser) {
        setIsPremium(false);
        setPremiumUntil(null);
        setDailyPostCount(0);
        setDailyPostCountDate(null);
        setIsAdmin(false);
        isAdminRef.current = false;
        setBlockedUsers([]); // 차단된 사용자는 초기화
        setPostLimit(20);
        setStoreLimit(20); // ✅ [추가] Store limit 초기화

        // ✅ [추가] 핫플레이스 멤버십/월 카운트 초기화
        setMembershipType("free");
        setHotplaceMonthKey(null);
        setHotplaceCount(0);
        setHotplacePaidExtraMonthKey(null);
        setHotplacePaidExtraCount(0);

        rcLoggedInUidRef.current = null;
        return;
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          const adminFlag = !!data.isAdmin;

          setIsAdmin(adminFlag);
          isAdminRef.current = adminFlag;

          setBlockedUsers(data.blockedUsers || []); // 차단된 사용자는 불러오기

          setPremiumUntil(data.premiumUntil || null);
          setIsPremium(!!data.isPremium);
          const todayKST = getTodayKST();
          const savedDate = data.dailyPostCountDate || null;

          if (savedDate !== todayKST) {
            // 날짜가 오늘이 아니면: 0으로 리셋 + 날짜도 오늘로 저장
            setDailyPostCount(0);
            setDailyPostCountDate(todayKST);

            try {
              await updateDoc(doc(db, "users", currentUser.uid), {
                dailyPostCount: 0,
                dailyPostCountDate: todayKST,
              });
            } catch (e) {
              console.warn("dailyPostCount reset 실패(무시 가능):", e);
            }
          } else {
            // 오늘이면 그대로 사용
            setDailyPostCount(data.dailyPostCount || 0);
            setDailyPostCountDate(savedDate);
          }

          // ✅ [추가] 핫플레이스 멤버십/월 카운트 불러오기
          setMembershipType(data.membershipType || "free");
          setHotplaceMonthKey(data.hotplaceMonthKey || null);
          setHotplaceCount(typeof data.hotplaceCount === "number" ? data.hotplaceCount : 0);
          setHotplacePaidExtraMonthKey(data.hotplacePaidExtraMonthKey || null);
          setHotplacePaidExtraCount(typeof data.hotplacePaidExtraCount === "number" ? data.hotplacePaidExtraCount : 0);

          if (adminFlag) {
            setPremiumUntil("2099-12-31T23:59:59.999Z");
            setIsPremium(true);
          }
        } else {
          await setDoc(userRef, {
            premiumUntil: null,
            isPremium: false,
            isAdmin: false,
            dailyPostCount: 0,
            dailyPostCountDate: getTodayKST(),
            createdAt: new Date().toISOString(),
            blockedUsers: [],
            email: currentUser.email,

            // ✅ [추가] 핫플레이스 멤버십/월 카운트 기본값
            membershipType: "free",
            hotplaceMonthKey: null,
            hotplaceCount: 0,
            hotplacePaidExtraMonthKey: null,
            hotplacePaidExtraCount: 0,
          });

          setIsAdmin(false);
          isAdminRef.current = false;
          setBlockedUsers([]);

          // ✅ [추가] 핫플레이스 멤버십/월 카운트 기본값
          setMembershipType("free");
          setHotplaceMonthKey(null);
          setHotplaceCount(0);
          setHotplacePaidExtraMonthKey(null);
          setHotplacePaidExtraCount(0);
        }
      } catch (e) {
        console.warn("User DB Init Error:", e);
        setIsAdmin(false);
        isAdminRef.current = false;
      }

      await initRevenueCatForUser(currentUser.uid);

      customerInfoListener = (info) => applyCustomerInfoToStateAndDb(currentUser.uid, info);
      if (Purchases.addCustomerInfoUpdateListener) {
        try {
          Purchases.addCustomerInfoUpdateListener(customerInfoListener);
        } catch {}
      }

      await refreshPremiumFromRevenueCat();
    });

    return () => {
      unsubscribe();

      if (customerInfoListener && Purchases.removeCustomerInfoUpdateListener) {
        try {
          Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let unsubUser = null;

    if (user?.uid) {
      const userRef = doc(db, "users", user.uid);

      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setBlockedUsers(data.blockedUsers || []);

            // ✅ [추가] 핫플레이스 멤버십/월 카운트 실시간 반영
            setMembershipType(data.membershipType || "free");
            setHotplaceMonthKey(data.hotplaceMonthKey || null);
            setHotplaceCount(typeof data.hotplaceCount === "number" ? data.hotplaceCount : 0);
            setHotplacePaidExtraMonthKey(data.hotplacePaidExtraMonthKey || null);
            setHotplacePaidExtraCount(typeof data.hotplacePaidExtraCount === "number" ? data.hotplacePaidExtraCount : 0);
          } else {
            setBlockedUsers([]);

            // ✅ [추가] 핫플레이스 멤버십/월 카운트 기본값
            setMembershipType("free");
            setHotplaceMonthKey(null);
            setHotplaceCount(0);
            setHotplacePaidExtraMonthKey(null);
            setHotplacePaidExtraCount(0);
          }
        },
        (e) => {
          console.warn("blockedUsers onSnapshot Error:", e);
        }
      );
    }

    return () => {
      if (unsubUser) unsubUser();
    };
  }, [user?.uid]);

  useEffect(() => {
    let unsub = null;
    if (user) {
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(postLimit));

      unsub = onSnapshot(q, (querySnapshot) => {
        const loaded = [];
        querySnapshot.forEach((d) => {
          const postData = d.data();
          if (!blockedUsers.includes(postData.ownerId)) {
            loaded.push({ ...postData, id: d.id });
          }
        });

        // ✅ 데이터를 저장할 때 'createdAt' 기준 내림차순(최신순) 정렬 강제
        const sorted = loaded.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        setPosts(sorted);
      });
    } else {
      setPosts([]);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user, postLimit, blockedUsers]);

  // =================================================================
  // ✅ [추가] Stores(가게) 데이터 실시간 구독 로직
  // =================================================================
  useEffect(() => {
    let unsub = null;
    if (user) {
      // 가게 목록도 최신순 정렬 + limit 적용
      const q = query(collection(db, "stores"), orderBy("createdAt", "desc"), limit(storeLimit));

      unsub = onSnapshot(q, (querySnapshot) => {
        const loaded = [];
        querySnapshot.forEach((d) => {
          const storeData = d.data();
          // 차단된 유저의 가게는 제외
          if (!blockedUsers.includes(storeData.ownerId)) {
            // type: 'store'를 추가해서 나중에 합칠 때 구분
            loaded.push({ ...storeData, id: d.id, type: 'store' });
          }
        });

        // ✅ 가게 데이터도 날짜 기준 최신순 정렬 보장
        const sorted = loaded.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        setStores(sorted);
      });
    } else {
      setStores([]);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user, storeLimit, blockedUsers]);

  const loadMorePosts = () => {
    setPostLimit((prev) => prev + 5);
  };

  // ✅ [추가] 가게 목록 더 불러오기 함수
  const loadMoreStores = () => {
    setStoreLimit((prev) => prev + 5);
  };

  /* =========================
      신고 / 차단 / 알림
  ========================= */

  const sendNotificationToReporter = async (reporterId, title, body) => {
    if (!reporterId) return;
    try {
      await addDoc(collection(db, "users", reporterId, "notifications"), {
        title,
        body,
        type: "report_result",
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("알림 발송 실패:", e);
    }
  };

  // ✅ [수정] 중복 팝업 방지용 옵션 추가 (기본값 false)
  const reportUser = async (targetUserId, contentId, reason, type = "post", silent = false) => {
    if (!user) {
      if (!silent) openModal("알림", "로그인이 필요합니다.");
      return;
    }
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: user.uid,
        reporterEmail: user.email,
        targetUserId,
        contentId,
        reason,
        type,
        createdAt: serverTimestamp(),
        status: "pending",
      });
      if (!silent) openModal("신고 완료", "신고가 접수되었습니다. 검토 후 조치하겠습니다.");
    } catch (e) {
      console.error("신고 실패:", e);
      if (!silent) openModal("오류", "신고 처리 중 문제가 발생했습니다.");
    }
  };

  // ✅ [수정] 차단 저장이 앱 재시작 후에도 유지되도록 merge setDoc + silent 옵션
  const blockUser = async (targetUserId, silent = false) => {
    if (!user) return;
    if (targetUserId === user.uid) {
      if (!silent) openModal("알림", "자기 자신은 차단할 수 없습니다.");
      return;
    }

    try {
      // ✅ 중복 차단 방지
      if (blockedUsers.includes(targetUserId)) {
        if (!silent) openModal("알림", "이미 차단된 사용자입니다.");
        return;
      }

      // ✅ users 문서가 없더라도 저장되도록 merge setDoc 사용
      await setDoc(
        doc(db, "users", user.uid),
        { blockedUsers: arrayUnion(targetUserId) },
        { merge: true }
      );

      // ✅ 즉시 UI 반영 (중복 제거)
      setBlockedUsers((prev) => [...new Set([...prev, targetUserId])]);
    } catch (e) {
      console.error("차단 실패:", e);
      if (!silent) openModal("오류", "차단 처리 중 문제가 발생했습니다.");
    }
  };

  /* =========================
      위치 인증
  ========================= */
  const checkSavedVerification = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { dong, coords, timestamp } = JSON.parse(saved);
        if (
          Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000 &&
          dong &&
          dong !== "내 동네"
        ) {
          setCurrentLocation(dong);
          setMyCoords(coords);
          setIsVerified(true);
          return;
        }
      }
      verifyLocation();
    } catch {
      verifyLocation();
    }
  };

  const verifyLocation = async () => {
    setCurrentLocation("위치 확인 중...");
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setCurrentLocation("위치 권한 필요");
      return;
    }

    try {
      // ✅ 1) 짧은 watch로 best accuracy 좌표 확보
      const coords = await getBestCoordsWithShortWatch();
      if (!coords?.latitude || !coords?.longitude) {
        setCurrentLocation("위치 확인 불가");
        return;
      }

      // ✅ 현재 좌표는 항상 최신으로 갱신
      setMyCoords(coords);

      const nowTs = Date.now();
      const gridKey = makeGridKey(coords);

      // ✅ 3) 기존 성공값 유지(동이 없으면 저장값 유지) + 성공시에만 캐시 저장
      let savedDong = null;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const d = parsed?.dong;
          const ts = parsed?.timestamp;
          if (d && d !== "내 동네" && ts && nowTs - ts < DONG_CACHE_TTL_MS) {
            savedDong = d;
          }
        }
      } catch {}

      // ✅ 1차: expo-location reverseGeocodeAsync()로 동 추출 시도 (1~2회 재시도)
      let dong = null;
      let gu = null;
      const expoResult = await getDongFromExpoReverseGeocode(coords);
      dong = expoResult?.dong || null;
      gu = expoResult?.gu || null;

      // ✅ expo에서 동 성공이면 즉시 저장/표시
      if (dong && isValidDongLabel(dong)) {
        const authData = { dong, coords, timestamp: nowTs };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

        setCurrentLocation(dong);
        setIsVerified(true);
        return;
      }

      // ✅ 2차: expo에서 동 실패 시, "그리드 캐시" 먼저 확인 (같은 좌표 근처 재호출 금지)
      if (gridKey) {
        try {
          const cacheStr = await AsyncStorage.getItem(KAKAO_DONG_CACHE_KEY);
          if (cacheStr) {
            const cache = JSON.parse(cacheStr) || {};
            const hit = cache?.[gridKey];
            if (hit?.dong && hit?.ts && nowTs - hit.ts < DONG_CACHE_TTL_MS) {
              // ✅ 캐시 hit는 성공으로 간주(표시만) + 원본 STORAGE_KEY에도 저장해둠
              const cachedDong = hit.dong;
              if (isValidDongLabel(cachedDong)) {
                const authData = { dong: cachedDong, coords, timestamp: nowTs };
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

                setCurrentLocation(cachedDong);
                setIsVerified(true);
                return;
              }
            }
          }
        } catch {}
      }

      // ✅ 3차: 동/구 fallback + 기존 성공값 유지
      // (동이 없고 저장된 dong가 있으면 그걸 유지)
      if (savedDong) {
        setCurrentLocation(savedDong);
      } else if (gu) {
        setCurrentLocation(gu);
      } else {
        setCurrentLocation("내 동네");
      }
      setIsVerified(true);

      // ✅ 4) 카카오 로컬(좌표→행정동) : "동 추출 실패할 때만" 호출
      // ✅ 호출 빈도 제한(스로틀) + 거리 제한(150~300m) + 그리드 캐시로 반복 방지
      // ※ 동을 찾으면 성공으로 간주하고 캐시에 저장 + STORAGE_KEY에도 저장
      if (gridKey && KAKAO_REST_API_KEY) {
        let canCall = true;

        try {
          const metaStr = await AsyncStorage.getItem(KAKAO_GEO_META_KEY);
          if (metaStr) {
            const meta = JSON.parse(metaStr) || {};
            const lastTs = meta?.lastTs || 0;
            const lastCoords = meta?.coords || null;
            const lastGrid = meta?.gridKey || null;

            // 같은 그리드에서 연타 방지
            if (lastGrid && lastGrid === gridKey && nowTs - lastTs < KAKAO_THROTTLE_MS) {
              canCall = false;
            }

            // 거리 기준 + 시간 기준 연타 방지
            if (canCall && lastCoords?.latitude && lastCoords?.longitude && nowTs - lastTs < KAKAO_THROTTLE_MS) {
              const dist = getDistanceFromLatLonInKm(
                lastCoords.latitude,
                lastCoords.longitude,
                coords.latitude,
                coords.longitude
              );
              if (dist < KAKAO_DISTANCE_KM) {
                canCall = false;
              }
            }
          }
        } catch {
          // meta 파싱 실패해도 호출은 허용
          canCall = true;
        }

        if (canCall) {
          // meta 업데이트(호출 직전에 기록)
          try {
            await AsyncStorage.setItem(
              KAKAO_GEO_META_KEY,
              JSON.stringify({ lastTs: nowTs, coords: { latitude: coords.latitude, longitude: coords.longitude }, gridKey })
            );
          } catch {}

          const kakaoDong = await getDongFromKakao(coords);

          if (kakaoDong && isValidDongLabel(kakaoDong)) {
            // ✅ Kakao 성공: 그리드 캐시에 저장
            try {
              const cacheStr = await AsyncStorage.getItem(KAKAO_DONG_CACHE_KEY);
              const cache = cacheStr ? JSON.parse(cacheStr) || {} : {};

              // 간단한 사이즈 제한(너무 커지는 것 방지): 250개 초과 시 오래된 것부터 제거
              const nextCache = { ...cache, [gridKey]: { dong: kakaoDong, ts: nowTs } };

              const keys = Object.keys(nextCache);
              if (keys.length > 250) {
                const sorted = keys
                  .map((k) => ({ k, ts: Number(nextCache[k]?.ts || 0) }))
                  .sort((a, b) => a.ts - b.ts);
                const removeCount = keys.length - 250;
                for (let i = 0; i < removeCount; i++) {
                  delete nextCache[sorted[i].k];
                }
              }

              await AsyncStorage.setItem(KAKAO_DONG_CACHE_KEY, JSON.stringify(nextCache));
            } catch {}

            // ✅ 성공시에만 STORAGE_KEY 캐시 저장
            const authData = { dong: kakaoDong, coords, timestamp: nowTs };
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

            setCurrentLocation(kakaoDong);
            setIsVerified(true);
            return;
          }
        }
      }

      // ✅ Kakao도 실패 시: 저장된 dong가 있으면 유지, 아니면 현재 표시 유지(내 동네/구)
      // (여기서는 저장 덮어쓰기 금지)
      if (savedDong) {
        setCurrentLocation(savedDong);
      }
    } catch (e) {
      setCurrentLocation("위치 확인 불가");
    }
  };

  /* =========================
      Auth
  ========================= */
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = async (idToken) => {
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  };

  // ✅ [수정] API_BASE_URL 사용
  const loginWithKakao = async (accessToken) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/nbbang/auth/kakao`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accessToken }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data?.customToken) {
        const msg = data?.error ? String(data.error) : "KAKAO_SERVER_LOGIN_FAILED";
        const err = new Error(msg);
        err.status = resp.status;
        throw err;
      }

      return await signInWithCustomToken(auth, data.customToken);
    } catch (e) {
      console.error("Kakao Server Login Error:", e);
      throw e;
    }
  };

  const signup = async (email, password, nickname) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    if (nickname) {
      await updateProfile(userCredential.user, { displayName: nickname });
      setUser({ ...userCredential.user, displayName: nickname });
    }

    await setDoc(doc(db, "users", userCredential.user.uid), {
      premiumUntil: null,
      isPremium: false,
      isAdmin: false,
      dailyPostCount: 0,
      dailyPostCountDate: getTodayKST(),
      createdAt: new Date().toISOString(),
      blockedUsers: [],
      email: email,

      // ✅ [추가] 핫플레이스 멤버십/월 카운트 기본값
      membershipType: "free",
      hotplaceMonthKey: null,
      hotplaceCount: 0,
      hotplacePaidExtraMonthKey: null,
      hotplacePaidExtraCount: 0,
    });

    await initRevenueCatForUser(userCredential.user.uid);
    await refreshPremiumFromRevenueCat();

    return userCredential;
  };

  const logout = async () => {
    try {
      // ✅ RevenueCat user detach
      if (Purchases.logOut) {
        await Purchases.logOut();
      }
    } catch (e) {
      console.warn("RevenueCat logOut 실패(무시 가능):", e);
    }
    rcLoggedInUidRef.current = null;
    return signOut(auth);
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  /* =========================
      작성 카운트 증가
  ========================= */
  const incrementDailyPostCount = async () => {
    if (!user) return;

    const today = getTodayKST();
    let nextCount = 1;

    if (dailyPostCountDate === today) {
      nextCount = dailyPostCount + 1;
    }

    await updateDoc(doc(db, "users", user.uid), {
      dailyPostCount: nextCount,
      dailyPostCountDate: today,
    });

    setDailyPostCount(nextCount);
    setDailyPostCountDate(today);
  };

  // ✅ [추가] KST 기준 monthKey(YYYY-MM)
  const getCurrentMonthKeyKST = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 7);
  };

  // ✅ [추가] 핫플레이스 eligibility enum + 데이터 반환
  // - 글쓰기 버튼에서 입구 컷 용도:
  //   - decision: "ALLOW" | "DENY" | "PROMPT_PURCHASE"
  //   - recommendedUsageType: "membership" | "paid_extra"
  const checkHotplaceEligibility = () => {
    const monthKey = getCurrentMonthKeyKST();
    const type = membershipType || "free";

    if (!isPremium) {
      return {
        status: "NOT_PREMIUM",
        decision: "DENY",
        recommendedUsageType: null,
        membershipType: type,
        monthKey,
        limit: 0,
        used: 0,
        remaining: 0,
      };
    }

    const limit = type === "yearly" ? 2 : type === "monthly" ? 1 : 0;

    if (limit <= 0) {
      return {
        status: "NOT_PREMIUM",
        decision: "DENY",
        recommendedUsageType: null,
        membershipType: type,
        monthKey,
        limit: 0,
        used: 0,
        remaining: 0,
      };
    }

    const used = hotplaceMonthKey === monthKey ? (typeof hotplaceCount === "number" ? hotplaceCount : 0) : 0;
    const remaining = Math.max(limit - used, 0);

    if (remaining > 0) {
      return {
        status: "ELIGIBLE",
        decision: "ALLOW",
        recommendedUsageType: "membership",
        membershipType: type,
        monthKey,
        limit,
        used,
        remaining,
      };
    }

    return {
      status: "NEED_PURCHASE",
      decision: "PROMPT_PURCHASE",
      recommendedUsageType: "paid_extra",
      membershipType: type,
      monthKey,
      limit,
      used,
      remaining: 0,
    };
  };

  // ✅ [추가] 핫플레이스 카운트 증가 (usageType: "membership" | "paid_extra")
  // - 글 등록 성공 후 호출 (사후 처리)
  // - paid_extra 인 경우, purchaseInfo가 있으면 결제 기록도 저장
  const incrementHotplaceCount = async ({ usageType, purchaseInfo } = {}) => {
    if (!user?.uid) return;

    const monthKey = getCurrentMonthKeyKST();

    if (usageType === "paid_extra") {
      const baseCount = hotplacePaidExtraMonthKey === monthKey ? (typeof hotplacePaidExtraCount === "number" ? hotplacePaidExtraCount : 0) : 0;
      const nextCount = baseCount + 1;

      await updateDoc(doc(db, "users", user.uid), {
        hotplacePaidExtraMonthKey: monthKey,
        hotplacePaidExtraCount: nextCount,
      });

      setHotplacePaidExtraMonthKey(monthKey);
      setHotplacePaidExtraCount(nextCount);

      try {
        await addDoc(collection(db, "users", user.uid, "hotplaceConsumablePurchases"), {
          monthKey,
          usageType: "paid_extra",
          purchaseInfo: purchaseInfo || null,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("hotplaceConsumablePurchases 기록 실패(무시 가능):", e);
      }
      return;
    }

    const baseCount = hotplaceMonthKey === monthKey ? (typeof hotplaceCount === "number" ? hotplaceCount : 0) : 0;
    const nextCount = baseCount + 1;

    await updateDoc(doc(db, "users", user.uid), {
      hotplaceMonthKey: monthKey,
      hotplaceCount: nextCount,
    });

    setHotplaceMonthKey(monthKey);
    setHotplaceCount(nextCount);
  };

  /* =========================
      posts CRUD
  ========================= */
  const addPost = async (newPostData) => {
    if (!user) return;
    await addDoc(collection(db, "posts"), {
      ...newPostData,
      // ✅ [수정] 업종(category)을 포함한 모든 데이터가 무조건 DB에 박히도록 처리
      category: newPostData.category, 
      ownerId: user.uid,
      ownerEmail: user.email,
      createdAt: new Date().toISOString(),
      location: currentLocation,
    });
  };

  const updatePost = async (postId, updatedData) => {
    if (!postId) return;
    await updateDoc(doc(db, "posts", postId), updatedData);
  };

  const deletePost = async (postId) => {
    await deleteDoc(doc(db, "posts", postId));
  };

  return (
    <AppContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        loginWithKakao,
        signup,
        logout,
        resetPassword,

        currentLocation,
        setCurrentLocation,
        myCoords,
        setMyCoords,
        
        posts,
        stores, // ✅ [추가] stores 내보내기
        addPost,
        updatePost,
        deletePost,

        loadMorePosts,
        loadMoreStores, // ✅ [추가] loadMoreStores 내보내기

        getDistanceFromLatLonInKm,
        verifyLocation,
        isVerified,

        isPremium,
        premiumUntil,
        dailyPostCount,
        dailyPostCountDate,
        incrementDailyPostCount,

        // ✅ [추가] 핫플레이스 멤버십/월 카운트/eligibility/카운트 증가 함수
        membershipType,
        hotplaceMonthKey,
        hotplaceCount,
        hotplacePaidExtraMonthKey,
        hotplacePaidExtraCount,
        getCurrentMonthKeyKST,
        checkHotplaceEligibility,
        incrementHotplaceCount,

        // ✅ [추가] $0.99 단건(Consumable) 결제 구매 함수
        purchaseHotplaceConsumable,
        purchaseHotplaceExtra: purchaseHotplaceConsumable,

        isAdmin,

        blockedUsers,
        reportUser,
        blockUser,
        sendNotificationToReporter,

        activatePremium,
        refreshPremiumFromRevenueCat,
        restorePurchases,
      }}
    >
      {children}

      {/* ✅ Alert.alert 대체 커스텀 모달 (문구/제목 동일 유지) */}
      <CustomModal
        visible={modalVisible}
        title={modalTitle}
        message={modalMessage}
        type="alert"
        onConfirm={() => setModalVisible(false)}
        onCancel={() => setModalVisible(false)}
      />
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);