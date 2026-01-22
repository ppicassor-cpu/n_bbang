// FILE: src/app/providers/AppContext.js

import React, { createContext, useState, useContext, useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
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
} from "firebase/auth";
import {
  collection,
  addDoc,
  getDocs, // ✅ 추가됨
  query,
  where,   // ✅ 추가됨 (이미 있다면 확인)
  orderBy,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  limit,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import Purchases from "react-native-purchases";
import { subscribeMyRooms } from "../../features/chat/services/chatService";
// ✅ [추가] 커스텀 모달 import (Alert.alert 대체)
import CustomModal from "../../components/CustomModal";

const AppContext = createContext();
const STORAGE_KEY = "user_location_auth_v3";

// ✅ [추가] 홈 동 저장 키
const HOME_DONG_STORAGE_KEY = "home_dong_v1";
const HOME_DONG_NAME_KEY = "HOME_DONG_NAME";
const HOME_DONG_CODE_KEY = "HOME_DONG_CODE";
const HOME_DONG_VERIFIED_KEY = "HOME_DONG_VERIFIED";
const HOME_DONG_VERIFIED_AT_KEY = "HOME_DONG_VERIFIED_AT";
const BOOST_DAILY_KEY_FIELD = "boostDailyKey";              // YYYY-MM-DD
const BOOST_DAILY_FREE_USED_FIELD = "boostDailyFreeUsed";   // number
const BOOST_MONTH_KEY_FIELD = "boostMonthKey";              // YYYY-MM
const BOOST_MEMBERSHIP_USED_FIELD = "boostMembershipUsed";  // number
const BOOST_ACTIVE_FIELD = "activeBoost";                   // { type, contentId, until, appliedAt }

// ✅ [추가] API BASE URL (cleartext/도메인 분리용)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://152.67.213.225:4000";

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

// ✅ [추가] Point-in-Polygon (GeoJSON)
function pointInRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(lon, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return false;
  const type = geometry.type;
  const coords = geometry.coordinates;

  if (!coords) return false;

  if (type === "Polygon") {
    const rings = coords;
    if (!Array.isArray(rings) || !rings.length) return false;

    const outer = rings[0];
    if (!pointInRing(lon, lat, outer)) return false;

    // holes
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lon, lat, rings[i])) return false;
    }
    return true;
  }

  if (type === "MultiPolygon") {
    const polys = coords;
    if (!Array.isArray(polys) || !polys.length) return false;

    for (const poly of polys) {
      const rings = poly;
      if (!Array.isArray(rings) || !rings.length) continue;

      const outer = rings[0];
      if (!pointInRing(lon, lat, outer)) continue;

      let inHole = false;
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(lon, lat, rings[i])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
    return false;
  }

  return false;
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);

  // ✅ 동 표시 정책: homeDong 우선 (없으면 "내 동네 설정")
  const [currentLocation, setCurrentLocation] = useState("내 동네 설정");
  const [myCoords, setMyCoords] = useState(null);

  // ✅ [추가] 홈 동 상태
  const [homeDong, setHomeDong] = useState(null);
  const [homeDongCode, setHomeDongCode] = useState(null);
  const [homeDongPolygonId, setHomeDongPolygonId] = useState(null);
  const [homeDongVerified, setHomeDongVerified] = useState(false);
  const [homeDongVerifiedAt, setHomeDongVerifiedAt] = useState(null);

  // ✅ [추가] HOME_DONG_* 변경 감지/동기화용 ref
  const homeDongLastNameRef = useRef(null);
  const homeDongSyncTimerRef = useRef(null);

  // ✅ [추가] 초기 로딩 게이팅용 상태(홈 모달에서 사용)
  const [authChecked, setAuthChecked] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [storesLoaded, setStoresLoaded] = useState(false);

  // ✅ [추가] "최초 진입" 전용 준비 완료 신호 (한 번 true가 되면 다시 false로 내려가지 않게 고정)
  // - postsLoaded/storesLoaded가 refresh로 false가 되어도, 최초 진입 로더가 다시 뜨는 루프 방지용
  const [initialReady, setInitialReady] = useState(false);

useEffect(() => {
  // ✅ [수정] 스플래시 유지 조건 강화: "좌표(myCoords)가 잡혔거나" or "권한거부 등으로 실패했거나"
  // 이렇게 해야 홈 화면 진입 시점에 무조건 좌표가 준비되어 있어 깜빡임이 없습니다.
  const isLocationReady = !!myCoords || (currentLocation === "위치 권한 필요" || currentLocation === "위치 확인 불가");

  if (!initialReady && authChecked && locationChecked && postsLoaded && storesLoaded && isLocationReady) {
    setInitialReady(true);
  }
}, [initialReady, authChecked, locationChecked, postsLoaded, storesLoaded, myCoords, currentLocation]);

// ✅ 최초 부팅 게이팅은 initialReady만 본다 (루프 방지)
const isBooting = !initialReady;

  // =================================================================
  // ✅ [수정] Posts 및 Stores(가게) 상태 관리
  // =================================================================
  const [posts, setPosts] = useState([]);
  const [postLimit, setPostLimit] = useState(20);

  const [stores, setStores] = useState([]); // ✅ [추가] 가게 목록 상태
  const [storeLimit, setStoreLimit] = useState(20); // ✅ [추가] 가게 목록 제한

  // ✅ [추가] 새로고침 트리거(구독 재시작용)
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const [storesRefreshKey, setStoresRefreshKey] = useState(0);

  // ✅ [수정] 원본 데이터(로그인 무관 구독) + 차단 필터 분리
  const [rawPosts, setRawPosts] = useState([]);
  const [rawStores, setRawStores] = useState([]);

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
  const [boostDailyKey, setBoostDailyKey] = useState(null);           // YYYY-MM-DD
  const [boostDailyFreeUsed, setBoostDailyFreeUsed] = useState(0);    // 0/1
  const [boostMonthKey, setBoostMonthKey] = useState(null);           // YYYY-MM
  const [boostMembershipUsed, setBoostMembershipUsed] = useState(0);  // 월 N회 사용
  const [activeBoost, setActiveBoost] = useState(null);   
  const [boostTickets, setBoostTickets] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // ✅ [추가] (stores) 작성자 admin 여부 캐시 (ownerIsAdmin 보강용)
  const ownerAdminCacheRef = useRef({}); // { [uid]: boolean }
  const getOwnerIsAdminCached = async (ownerId) => {
    try {
      if (!ownerId) return false;
      const cached = ownerAdminCacheRef.current?.[ownerId];
      if (typeof cached === "boolean") return cached;

      const snap = await getDoc(doc(db, "users", ownerId));
      const flag = !!(snap.exists() ? snap.data()?.isAdmin : false);
      ownerAdminCacheRef.current = { ...(ownerAdminCacheRef.current || {}), [ownerId]: flag };
      return flag;
    } catch {
      ownerAdminCacheRef.current = { ...(ownerAdminCacheRef.current || {}), [ownerId]: false };
      return false;
    }
  };

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
  const HOTPLACE_CONSUMABLE_PACKAGE_ID = process.env.EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PACKAGE_ID || "";
  const HOTPLACE_CONSUMABLE_PRODUCT_ID = process.env.EXPO_PUBLIC_HOTPLACE_CONSUMABLE_PRODUCT_ID || "";
  const HOTPLACE_CONSUMABLE_FALLBACK_IDS = [
    "hotplace_single_099",
    "hotplace_099",
    "hotplace_single",
    "hotplace_one_time",
  ];

  const BOOST_CONSUMABLE_PACKAGE_ID = process.env.EXPO_PUBLIC_BOOST_CONSUMABLE_PACKAGE_ID || "";
  const BOOST_CONSUMABLE_PRODUCT_ID = process.env.EXPO_PUBLIC_BOOST_CONSUMABLE_PRODUCT_ID || "";
  const BOOST_CONSUMABLE_FALLBACK_IDS = [
    "boost_single_099",
    "boost_099",
    "boost_single",
    "boost_one_time",
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
        setMembershipType("yearly");
        return;
      }

      const entitlement = getActiveEntitlement(customerInfo);
      const nextPremiumUntil = entitlement?.expirationDate || null;
      const nextIsPremium = !!entitlement || !!isAdminRef.current;

      let nextMembershipType = "free";
      if (nextIsPremium) {
        const pid = entitlement?.productIdentifier || "";
        if (pid.toLowerCase().includes("year") || pid.toLowerCase().includes("annual")) {
          nextMembershipType = "yearly";
        } else {
          nextMembershipType = "monthly";
        }
      }

      setPremiumUntil(nextPremiumUntil);
      setIsPremium(nextIsPremium);
      setMembershipType(nextMembershipType);

      if (uid) {
        await updateDoc(doc(db, "users", uid), {
          premiumUntil: nextPremiumUntil,
          isPremium: nextIsPremium,
          membershipType: nextMembershipType,
          premiumUpdatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("applyCustomerInfoToStateAndDb 실패:", e);
    }
  };

  const refreshPremiumFromRevenueCat = async () => {
    try {
      if (!user?.uid) return;

      if (isAdminRef.current) {
        setPremiumUntil("2099-12-31T23:59:59.999Z");
        setIsPremium(true);
        return;
      }

      await initRevenueCatForUser(user.uid);

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

      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.product?.identifier || "") === id);
        if (hit) return hit;
      }

      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.identifier || "") === id);
        if (hit) return hit;
      }

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

  const findBoostConsumablePackage = (offerings) => {
    try {
      const current = offerings?.current;
      const packs = current?.availablePackages || [];
      if (!packs.length) return null;

      if (BOOST_CONSUMABLE_PACKAGE_ID) {
        const hit = packs.find((p) => String(p?.identifier || "") === String(BOOST_CONSUMABLE_PACKAGE_ID));
        if (hit) return hit;
      }

      const allIds = [];
      if (BOOST_CONSUMABLE_PRODUCT_ID) allIds.push(String(BOOST_CONSUMABLE_PRODUCT_ID));
      for (const v of BOOST_CONSUMABLE_FALLBACK_IDS) allIds.push(String(v));

      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.product?.identifier || "") === id);
        if (hit) return hit;
      }

      for (const id of allIds) {
        const hit = packs.find((p) => String(p?.identifier || "") === id);
        if (hit) return hit;
      }

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

  const purchaseBoostConsumable = async () => {
    if (isAdminRef.current) {
      return { status: "PURCHASED", purchaseInfo: { admin: true } };
    }

    if (!user?.uid) throw new Error("NO_USER");
    const apiKey = getRevenueCatApiKey();
    if (!apiKey) throw new Error("NO_REVENUECAT_API_KEY");

    await initRevenueCatForUser(user.uid);

    const offerings = await Purchases.getOfferings();
    const targetPackage = findBoostConsumablePackage(offerings);
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


  // ✅ [추가] 홈 동 로드(앱 시작 1회)
  const loadHomeDongFromStorage = async () => {
    try {
      // 1) HOME_DONG_* 개별키 우선 로드
      const pairs = await AsyncStorage.multiGet([
        HOME_DONG_NAME_KEY,
        HOME_DONG_CODE_KEY,
        HOME_DONG_VERIFIED_KEY,
        HOME_DONG_VERIFIED_AT_KEY,
      ]);

      const map = Object.fromEntries(pairs || []);
      const kName = map?.[HOME_DONG_NAME_KEY] || null;

      if (kName) {
        const kCode = map?.[HOME_DONG_CODE_KEY] || null;
        const kVerifiedRaw = map?.[HOME_DONG_VERIFIED_KEY] || "false";
        const kVerified = String(kVerifiedRaw).toLowerCase() === "true";
        const kVerifiedAt = map?.[HOME_DONG_VERIFIED_AT_KEY] || null;

        setHomeDong(kName);
        setHomeDongCode(kCode);
        homeDongLastNameRef.current = kName ? String(kName) : "";
        setHomeDongPolygonId(null);
        setHomeDongVerified(kVerified);
        setHomeDongVerifiedAt(kVerifiedAt);

        // 2) 기존 포맷(home_dong_v1)로 마이그레이션 저장(호환 유지)
        try {
          const legacy = {
            dongName: kName,
            dongCode: kCode,
            featureId: null,
            verified: kVerified,
            verifiedAt: kVerifiedAt,
          };
          await AsyncStorage.setItem(HOME_DONG_STORAGE_KEY, JSON.stringify(legacy));
        } catch {}

        return;
      }

      // 3) fallback: 기존 home_dong_v1 로드
      const raw = await AsyncStorage.getItem(HOME_DONG_STORAGE_KEY);
      if (!raw) {
        setHomeDong(null);
        setHomeDongCode(null);
        homeDongLastNameRef.current = "";
        setHomeDongPolygonId(null);
        setHomeDongVerified(false);
        setHomeDongVerifiedAt(null);
        return;
      }

      const parsed = JSON.parse(raw) || {};
      const dongName = parsed?.dongName || null;
      const dongCode = parsed?.dongCode || null;
      const featureId = parsed?.featureId || null;
      const verified = !!parsed?.verified;
      const verifiedAt = parsed?.verifiedAt || null;

      setHomeDong(dongName);
      setHomeDongCode(dongCode);
      homeDongLastNameRef.current = dongName ? String(dongName) : "";
      setHomeDongPolygonId(featureId);
      setHomeDongVerified(verified);
      setHomeDongVerifiedAt(verifiedAt);

      // 4) fallback로 읽은 값도 HOME_DONG_*에 동기화(다음부터는 개별키 사용)
      try {
        await AsyncStorage.multiSet([
          [HOME_DONG_NAME_KEY, dongName ? String(dongName) : ""],
          [HOME_DONG_CODE_KEY, dongCode ? String(dongCode) : ""],
          [HOME_DONG_VERIFIED_KEY, verified ? "true" : "false"],
          [HOME_DONG_VERIFIED_AT_KEY, verifiedAt ? String(verifiedAt) : ""],
        ]);
      } catch {}
    } catch {
      setHomeDong(null);
      setHomeDongCode(null);
      homeDongLastNameRef.current = "";
      setHomeDongPolygonId(null);
      setHomeDongVerified(false);
      setHomeDongVerifiedAt(null);
    }
  };

  // ✅ [추가] HOME_DONG_*가 다른 화면에서 직접 저장될 때도 감지해서 state 갱신
  const syncHomeDongFromStorageIfChanged = async () => {
    try {
      const storedNameRaw = await AsyncStorage.getItem(HOME_DONG_NAME_KEY);
      const storedName = storedNameRaw ? String(storedNameRaw) : "";

      const currentName = homeDong ? String(homeDong) : "";
      const lastName = homeDongLastNameRef.current != null ? String(homeDongLastNameRef.current) : currentName;

      if (storedName !== currentName || storedName !== lastName) {
        await loadHomeDongFromStorage();
      }
    } catch {}
  };

  // ✅ [추가] 홈 동 저장(사용자 확정)
  const saveHomeDong = async ({ dongName, dongCode, featureId } = {}) => {
  // ✅ 1) 동네 저장 순간에 "인증 도장(verified)"을 지우지 않음 (리셋 제거)
  const preservedVerified = !!homeDongVerified;
  const preservedVerifiedAt = homeDongVerifiedAt || null;

  const next = {
    dongName: dongName || null,
    dongCode: dongCode || null,
    featureId: featureId || null,
    verified: preservedVerified,
    verifiedAt: preservedVerifiedAt,
  };

  try {
    // ✅ legacy + HOME_DONG_* 동시 저장(호환)
    await AsyncStorage.setItem(HOME_DONG_STORAGE_KEY, JSON.stringify(next));
    await AsyncStorage.multiSet([
      [HOME_DONG_NAME_KEY, next.dongName ? String(next.dongName) : ""],
      [HOME_DONG_CODE_KEY, next.dongCode ? String(next.dongCode) : ""],
      [HOME_DONG_VERIFIED_KEY, preservedVerified ? "true" : "false"],
      [HOME_DONG_VERIFIED_AT_KEY, preservedVerifiedAt ? String(preservedVerifiedAt) : ""],
    ]);
  } catch {}

  setHomeDong(next.dongName);
  setHomeDongCode(next.dongCode);
  homeDongLastNameRef.current = next.dongName ? String(next.dongName) : "";
  setHomeDongPolygonId(next.featureId);
  setHomeDongVerified(preservedVerified);
  setHomeDongVerifiedAt(preservedVerifiedAt);
};

  // ✅ [추가] 홈 동 초기화
  const clearHomeDong = async () => {
    try {
      await AsyncStorage.removeItem(HOME_DONG_STORAGE_KEY);
      await AsyncStorage.multiRemove([
        HOME_DONG_NAME_KEY,
        HOME_DONG_CODE_KEY,
        HOME_DONG_VERIFIED_KEY,
        HOME_DONG_VERIFIED_AT_KEY,
      ]);
    } catch {}

    setHomeDong(null);
    setHomeDongCode(null);
    homeDongLastNameRef.current = "";
    setHomeDongPolygonId(null);
    setHomeDongVerified(false);
    setHomeDongVerifiedAt(null);
  };

  // ✅ [추가] GPS 좌표만 갱신 (동 표시 문자열은 절대 변경 금지)
    const refreshMyCoords = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm?.status !== "granted") {
        setLocationChecked(true);
        return null;
      }

      const c = await getBestCoordsWithShortWatch();
      if (!c?.latitude || !c?.longitude) {
        setLocationChecked(true);
        return null;
      }

      const coords = {
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        accuracy: c.accuracy != null ? Number(c.accuracy) : undefined,
      };

      setMyCoords(coords);

      // ✅ [추가] 성공 케이스도 체크 완료 처리 (부팅 조건 꼬임 방지)
      setLocationChecked(true);

      return coords;
    } catch {
      setLocationChecked(true);
      return null;
    }
  };


  // ✅ [추가] 현재 GPS가 선택 동 폴리곤 안인지 검증(동 이름은 절대 변경 금지)
  const verifyHomeDongByGps = async ({ polygon, forceFresh = false, coordsOverride = null } = {}) => {
  try {
    // ✅ 2) 확정 직후 인증은 "같은 기준(최신 GPS)"으로 바로 찍기
    // - forceFresh=true면 기존 myCoords가 있어도 무조건 refreshMyCoords()로 최신 GPS를 사용
    let coords = null;

    if (coordsOverride?.latitude && coordsOverride?.longitude) {
      coords = coordsOverride;
    } else if (forceFresh) {
      coords = await refreshMyCoords();
    } else {
      coords = myCoords?.latitude && myCoords?.longitude ? myCoords : await refreshMyCoords();
    }

    if (!coords?.latitude || !coords?.longitude) return false;

    if (!polygon || typeof polygon !== "object") return false;

    const ok = pointInPolygonGeometry(Number(coords.longitude), Number(coords.latitude), polygon);

    const nowIso = new Date().toISOString();
    setHomeDongVerified(!!ok);
    setHomeDongVerifiedAt(nowIso);

    try {
      const raw = await AsyncStorage.getItem(HOME_DONG_STORAGE_KEY);
      const prev = raw ? JSON.parse(raw) || {} : {};
      const next = {
        dongName: prev?.dongName || homeDong || null,
        dongCode: prev?.dongCode || homeDongCode || null,
        featureId: prev?.featureId || homeDongPolygonId || null,
        verified: !!ok,
        verifiedAt: nowIso,
      };

      // ✅ legacy + HOME_DONG_* 동시 저장(검증 상태 동기화)
      await AsyncStorage.setItem(HOME_DONG_STORAGE_KEY, JSON.stringify(next));
      await AsyncStorage.multiSet([
        [HOME_DONG_VERIFIED_KEY, ok ? "true" : "false"],
        [HOME_DONG_VERIFIED_AT_KEY, nowIso ? String(nowIso) : ""],
      ]);
    } catch {}

    return !!ok;
  } catch {
    return false;
  }
};

  // ✅ 동 표시 정책 반영: homeDong 변경 시 currentLocation 동기화
  useEffect(() => {
    setCurrentLocation(homeDong ? String(homeDong) : "내 동네 설정");
  }, [homeDong]);

  // ✅ [추가] 다른 화면에서 AsyncStorage만 바꿔도 홈 동 표시가 갱신되도록 안전장치
  useEffect(() => {
    let appStateSub = null;

    const startTimer = () => {
      if (homeDongSyncTimerRef.current) return;
      homeDongSyncTimerRef.current = setInterval(() => {
        syncHomeDongFromStorageIfChanged();
      }, 1200);
    };

    const stopTimer = () => {
      if (homeDongSyncTimerRef.current) {
        clearInterval(homeDongSyncTimerRef.current);
        homeDongSyncTimerRef.current = null;
      }
    };

    syncHomeDongFromStorageIfChanged();

    appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncHomeDongFromStorageIfChanged();
        startTimer();
      } else {
        stopTimer();
      }
    });

    startTimer();

    return () => {
      stopTimer();
      if (appStateSub && appStateSub.remove) appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadHomeDongFromStorage();

    let customerInfoListener = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthChecked(true);
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
  setBlockedUsers([]);
  setPostLimit(20);
  setStoreLimit(20);

  setMembershipType("free");
  setHotplaceMonthKey(null);
  setHotplaceCount(0);
  setHotplacePaidExtraMonthKey(null);
  setHotplacePaidExtraCount(0);

  await AsyncStorage.removeItem(STORAGE_KEY);
  await clearHomeDong();

  // ✅ [추가] 로그아웃 상태면 인증도 초기화!
  setIsVerified(false);
  setLocationChecked(true); // 위치 체크는 끝난 걸로 처리

  // ✅ [추가] 다음 로그인에서 최초 부팅 로더가 다시 정상 동작하도록 리셋
  setInitialReady(false);

  rcLoggedInUidRef.current = null;
  return;
}

      // ✅ 핵심: 로그인된 uid 기준으로만 인증 복구 판단
      const metadata = currentUser.metadata;
      const isNewUser = metadata.creationTime && (Date.now() - new Date(metadata.creationTime).getTime() < 10000);

      if (isNewUser) {
        // 1. 신규 유저: 무조건 초기화
        await AsyncStorage.removeItem(STORAGE_KEY);
        await clearHomeDong();
        setIsVerified(false);
        setLocationChecked(true);
      } else {
        // 2. 기존 유저: 저장된 기록 확인 (uid 검증 포함)
        await checkSavedVerification(currentUser.uid);
      }

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data();
          const adminFlag = !!data.isAdmin;

          setIsAdmin(adminFlag);
          isAdminRef.current = adminFlag;

          setBlockedUsers(data.blockedUsers || []);

          setPremiumUntil(data.premiumUntil || null);
          setIsPremium(!!data.isPremium);
          const todayKST = getTodayKST();
          const savedDate = data.dailyPostCountDate || null;

          if (savedDate !== todayKST) {
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
            setDailyPostCount(data.dailyPostCount || 0);
            setDailyPostCountDate(savedDate);
          }

          setMembershipType(data.membershipType || "free");
          setHotplaceMonthKey(data.hotplaceMonthKey || null);
          setHotplaceCount(typeof data.hotplaceCount === "number" ? data.hotplaceCount : 0);
          setHotplacePaidExtraMonthKey(data.hotplacePaidExtraMonthKey || null);
          setHotplacePaidExtraCount(typeof data.hotplacePaidExtraCount === "number" ? data.hotplacePaidExtraCount : 0);
          // ✅ [추가] Boost 상태 로드
          setBoostDailyKey(data[BOOST_DAILY_KEY_FIELD] || null);
          setBoostDailyFreeUsed(typeof data[BOOST_DAILY_FREE_USED_FIELD] === "number" ? data[BOOST_DAILY_FREE_USED_FIELD] : 0);
          setBoostMonthKey(data[BOOST_MONTH_KEY_FIELD] || null);
          setBoostMembershipUsed(typeof data[BOOST_MEMBERSHIP_USED_FIELD] === "number" ? data[BOOST_MEMBERSHIP_USED_FIELD] : 0);
          setActiveBoost(data[BOOST_ACTIVE_FIELD] || null);

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

            membershipType: "free",
            hotplaceMonthKey: null,
            hotplaceCount: 0,
            hotplacePaidExtraMonthKey: null,
            hotplacePaidExtraCount: 0,
            

            // ✅ [추가] Boost 기본값
            [BOOST_DAILY_KEY_FIELD]: null,
            [BOOST_DAILY_FREE_USED_FIELD]: 0,
            [BOOST_MONTH_KEY_FIELD]: null,
            [BOOST_MEMBERSHIP_USED_FIELD]: 0,
            [BOOST_ACTIVE_FIELD]: null,
          }); 
          
          setIsAdmin(false);
          isAdminRef.current = false;
          setBlockedUsers([]);

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
          if (data.boostTickets === undefined) {
             updateDoc(userRef, { boostTickets: 0 }).catch(() => {});
             setBoostTickets(0); // 화면에는 일단 0으로 표시
          } else {
             setBoostTickets(data.boostTickets);
          }

          setMembershipType(data.membershipType || "free");
          setHotplaceMonthKey(data.hotplaceMonthKey || null);
          setHotplaceCount(typeof data.hotplaceCount === "number" ? data.hotplaceCount : 0);
          setHotplacePaidExtraMonthKey(data.hotplacePaidExtraMonthKey || null);
          setHotplacePaidExtraCount(typeof data.hotplacePaidExtraCount === "number" ? data.hotplacePaidExtraCount : 0);
          setBoostDailyKey(data[BOOST_DAILY_KEY_FIELD] || null);
          setBoostDailyFreeUsed(typeof data[BOOST_DAILY_FREE_USED_FIELD] === "number" ? data[BOOST_DAILY_FREE_USED_FIELD] : 0);
          setBoostMonthKey(data[BOOST_MONTH_KEY_FIELD] || null);
          setBoostMembershipUsed(typeof data[BOOST_MEMBERSHIP_USED_FIELD] === "number" ? data[BOOST_MEMBERSHIP_USED_FIELD] : 0);
          setActiveBoost(data[BOOST_ACTIVE_FIELD] || null);
          
        } else {
          setBlockedUsers([]);

          setMembershipType("free");
          setHotplaceMonthKey(null);
          setHotplaceCount(0);
          setHotplacePaidExtraMonthKey(null);
          setHotplacePaidExtraCount(0);
          setBoostTickets(0);
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
  let unsubRooms = null;

  if (user?.uid) {
    unsubRooms = subscribeMyRooms((rooms) => {
      const uid = user.uid;

      const sum = (rooms || []).reduce((acc, r) => {
        const unreadObj = r?.unreadCounts && typeof r.unreadCounts === "object" ? r.unreadCounts : {};
        const n = Number(unreadObj?.[uid] || 0);
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);

      setTotalUnreadCount(sum);
    });
  } else {
    setTotalUnreadCount(0);
  }

  return () => {
    if (unsubRooms) unsubRooms();
  };
}, [user?.uid]);


  function getTodayKST() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  // ✅ [수정] posts: 로그인 여부와 무관하게 구독(원본 수집) + 차단 필터는 별도 파생
  useEffect(() => {
    let unsub = null;
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(postLimit));

    unsub = onSnapshot(
      q,
      (querySnapshot) => {
        const loaded = [];
        querySnapshot.forEach((d) => {
          const postData = d.data();
          loaded.push({ ...postData, id: d.id });
        });

        const sorted = loaded.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        setRawPosts(sorted);
        setPostsLoaded(true);
      },
      (e) => {
        console.warn("posts onSnapshot Error:", e);
        setRawPosts([]);
        setPostsLoaded(true);
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [postLimit, postsRefreshKey]);

  useEffect(() => {
    const loaded = [];
    for (const p of rawPosts || []) {
      if (!blockedUsers.includes(p?.ownerId)) {
        loaded.push(p);
      }
    }

    const sorted = loaded.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    setPosts(sorted);
  }, [rawPosts, blockedUsers]);

  // =================================================================
  // ✅ [추가] Stores(가게) 데이터 실시간 구독 로직
  // =================================================================
  useEffect(() => {
    let unsub = null;
    let alive = true;

    const q = query(collection(db, "stores"), orderBy("createdAt", "desc"), limit(storeLimit));

    unsub = onSnapshot(
      q,
      async (querySnapshot) => {
        try {
          const loaded = [];
          querySnapshot.forEach((d) => {
            const storeData = d.data();
            loaded.push({ ...storeData, id: d.id, type: "store" });
          });

          const normalized = await Promise.all(
            loaded.map(async (item) => {
              const rawCoords =
                item?.coords ||
                (item?.location && typeof item.location === "object"
                  ? { latitude: item.location.latitude, longitude: item.location.longitude }
                  : null);

              const coords =
                rawCoords && rawCoords.latitude != null && rawCoords.longitude != null
                  ? { latitude: Number(rawCoords.latitude), longitude: Number(rawCoords.longitude) }
                  : null;

              const locationText =
                typeof item.location === "string"
                  ? item.location
                  : (item.address || item.locationText || item.place || item.placeName || "");

              const title = item.title || item.name || item.storeName || "";

              const createdAtMs = item.createdAt ? new Date(item.createdAt).getTime() : 0;

              const ownerIsAdmin =
                typeof item.ownerIsAdmin === "boolean"
                  ? item.ownerIsAdmin
                  : await getOwnerIsAdminCached(item.ownerId);

              return {
                ...item,
                title,
                storeName: item.storeName || title,
                address: item.address || locationText || "위치 정보 없음",

                // ✅ location은 "좌표 객체"로 통일
                location:
                  item?.location &&
                  typeof item.location === "object" &&
                  item.location.latitude != null &&
                  item.location.longitude != null
                    ? { latitude: Number(item.location.latitude), longitude: Number(item.location.longitude) }
                    : coords,

                // ✅ 거리계산용 coords 유지 (기존 로직 호환)
                coords,

                createdAtMs,
                ownerIsAdmin,
              };
            })
          );

          const sorted = normalized.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.createdAtMs || 0);
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.createdAtMs || 0);
            return dateB - dateA;
          });

          if (alive) setRawStores(sorted);
          setStoresLoaded(true);
        } catch (e) {
          console.warn("stores onSnapshot 처리 실패:", e);
          if (alive) setRawStores([]);
          setStoresLoaded(true);
        }
      },
      (e) => {
        console.warn("stores onSnapshot Error:", e);
        if (alive) setRawStores([]);
        setStoresLoaded(true);
      }
    );

    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, [storeLimit, storesRefreshKey]);

  useEffect(() => {
    const loaded = [];
    for (const s of rawStores || []) {
      if (!blockedUsers.includes(s?.ownerId)) {
        loaded.push(s);
      }
    }

    const sorted = loaded.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.createdAtMs || 0);
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.createdAtMs || 0);
      return dateB - dateA;
    });

    setStores(sorted);
  }, [rawStores, blockedUsers]);

  const loadMorePosts = () => {
    setPostLimit((prev) => prev + 5);
  };

  const loadMoreStores = () => {
    setStoreLimit((prev) => prev + 5);
  };

  const refreshPostsAndStores = async () => {
    setPostsLoaded(false);
    setStoresLoaded(false);
    setPostsRefreshKey((prev) => prev + 1);
    setStoresRefreshKey((prev) => prev + 1);
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

  const reportUser = async (targetUserId, contentId, reason, type = "post", silent = false) => {
    if (!user) {
      if (!silent) openModal("알림", "로그인이 필요합니다.");
      return;
    }
    try {
      // 1. 신고 내역 저장
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

      // ✅ [추가] 게시글 신고 시, 관련 채팅방에서 즉시 퇴장 처리 (유령 회원 방지)
      if (type === "post" && contentId) {
        try {
          // 채팅방 ID 규칙: post_{게시글ID}
          const roomId = `post_${contentId}`;
          await updateDoc(doc(db, "chatRooms", roomId), {
            participants: arrayRemove(user.uid)
          });
        } catch (ignore) {
          // 채팅방이 없거나(아직 참여 안함), 이미 나간 경우 에러 무시
          // console.log("채팅방 퇴장 스킵:", ignore);
        }
      }

      if (!silent) openModal("신고 완료", "신고가 접수되었습니다. 검토 후 조치하겠습니다.");
    } catch (e) {
      console.error("신고 실패:", e);
      if (!silent) openModal("오류", "신고 처리 중 문제가 발생했습니다.");
    }
  };

  const blockUser = async (targetUserId, silent = false) => {
    if (!user) return;
    if (targetUserId === user.uid) {
      if (!silent) openModal("알림", "자기 자신은 차단할 수 없습니다.");
      return;
    }

    try {
      if (blockedUsers.includes(targetUserId)) {
        if (!silent) openModal("알림", "이미 차단된 사용자입니다.");
        return;
      }

      await setDoc(
        doc(db, "users", user.uid),
        { blockedUsers: arrayUnion(targetUserId) },
        { merge: true }
      );

      setBlockedUsers((prev) => [...new Set([...prev, targetUserId])]);
    } catch (e) {
      console.error("차단 실패:", e);
      if (!silent) openModal("오류", "차단 처리 중 문제가 발생했습니다.");
    }
  };

  /* =========================
      위치 인증 (좌표만)
  ========================= */

  const checkSavedVerification = async (currentUid = null) => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) || {};
        const savedUid = parsed?.uid != null ? String(parsed.uid) : "";
        const nowUid = currentUid != null ? String(currentUid) : "";

        // ✅ [추가] 구버전 저장값(uid 없음)은 무조건 폐기 (자동인증 방지)
        if (nowUid && !savedUid) {
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
          setIsVerified(false);
          setLocationChecked(true);
          return;
        }

        // ✅ 핵심: 다른 계정 기록이면 무조건 폐기(재가입/계정변경 자동인증 방지)
        if (savedUid && nowUid && savedUid !== nowUid) {
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
          } catch {}
          setIsVerified(false);
          setLocationChecked(true);
          return;
        }

        const timestamp = parsed?.timestamp || 0;

        const rawC = parsed?.coords || null;
        const c =
          rawC && rawC.latitude != null && rawC.longitude != null
            ? { latitude: Number(rawC.latitude), longitude: Number(rawC.longitude) }
            : null;

        // 7일 이내 기록이 있으면 -> 인증 상태 복구 (OK)
        if (c && timestamp && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
          setMyCoords(c);
          setIsVerified(true); // ✅ 저장된 게 있으니 인증됨
          setLocationChecked(true);
          return;
        }
      }

      // 저장된 게 없거나 만료됨 -> 좌표는 잡지만 인증은 안 함!
      await refreshMyCoords();
      setIsVerified(false); // ✅ 확실하게 미인증으로 시작
      setLocationChecked(true);

    } catch {
      await refreshMyCoords();
      setIsVerified(false); // ✅ 에러 시에도 미인증
      setLocationChecked(true);
    }
  };

  // ✅ 기존 호출 호환용: verifyLocation은 이제 "좌표 갱신"만 수행
  const verifyLocation = async () => {
    const coords = await refreshMyCoords();
    if (coords) {
      setIsVerified(true); // ✅ 명시적 인증 성공 시 true 설정

      // ✅ 인증 정보 저장 (유효기간 체크용) + uid 바인딩
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            uid: user?.uid ? String(user.uid) : null,
            coords: { latitude: coords.latitude, longitude: coords.longitude },
            timestamp: Date.now()
          })
        );
      } catch {}

      return true;
    }
    return false;
  };

  /* =========================
      Auth
  ========================= */
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = async (idToken) => {
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  };

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
    // 1. 혹시 남아있을지 모를 이전 인증 기록 삭제
    await AsyncStorage.removeItem(STORAGE_KEY);
    setIsVerified(false); // 강제 미인증 처리
    await clearHomeDong();

    // 2. 회원가입 진행
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    if (nickname) {
      await updateProfile(userCredential.user, { displayName: nickname });
      setUser({ ...userCredential.user, displayName: nickname });
    }

    await setDoc(doc(db, "users", userCredential.user.uid), {
      displayName: nickname ? String(nickname) : "",
      premiumUntil: null,
      isPremium: false,
      isAdmin: false,
      dailyPostCount: 0,
      dailyPostCountDate: getTodayKST(),
      createdAt: new Date().toISOString(),
      blockedUsers: [],
      email: email,

      membershipType: "free",
      hotplaceMonthKey: null,
      hotplaceCount: 0,
      hotplacePaidExtraMonthKey: null,
      hotplacePaidExtraCount: 0,
      boostTickets: 0,
      [BOOST_DAILY_KEY_FIELD]: null,
    });

    await initRevenueCatForUser(userCredential.user.uid);
    await refreshPremiumFromRevenueCat();

    return userCredential;
  };

  const logout = async () => {
    try {
      // 1. 폰에 저장된 인증 정보 삭제
      await AsyncStorage.removeItem(STORAGE_KEY); 
      await clearHomeDong();
      
      // 2. 상태 초기화
      setIsVerified(false); 

      if (Purchases.logOut) {
        await Purchases.logOut();
      }
    } catch (e) {
      console.warn("LogOut process error:", e);
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

  const getCurrentMonthKeyKST = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 7);
  };

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

  const incrementHotplaceCount = async ({ usageType, purchaseInfo } = {}) => {
    if (!user?.uid) return;

    const monthKey = getCurrentMonthKeyKST();

    if (usageType === "paid_extra") {
      const baseCount =
        hotplacePaidExtraMonthKey === monthKey
          ? (typeof hotplacePaidExtraCount === "number" ? hotplacePaidExtraCount : 0)
          : 0;
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

  const addBoostTicket = async (purchaseInfo = null) => {
    if (!user?.uid) return;

    // 1. DB에서 현재 보유 티켓 수 조회 (안전장치)
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const currentTickets = snap.exists() ? (snap.data().boostTickets || 0) : 0;

    // 2. DB 업데이트 (+1)
    await updateDoc(userRef, {
      boostTickets: currentTickets + 1,
    });

    // 3. 구매 내역 기록 (선택 사항)
    try {
      await addDoc(collection(db, "users", user.uid, "boostPurchases"), {
        type: "ticket_purchase",
        purchaseInfo: purchaseInfo || null,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("부스트 구매기록 저장 실패(무시)", e);
    }
  };

  const getNowIso = () => new Date().toISOString();

  const getTodayKSTKey = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  const getBoostMembershipMonthlyLimit = () => {
    // ✅ 정책값(임시 기본): monthly=2, yearly=4 (원하면 여기만 바꾸면 됨)
    const type = membershipType || "free";
    if (!isPremium) return 0;
    if (type === "yearly") return 4;
    if (type === "monthly") return 2;
    return 0;
  };

  const _parseMs = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

    const _isActiveBoost = (ab) => {
    const untilMs = _parseMs(ab?.until);
    return untilMs > Date.now();
  };

  // ✅ [추가] paid(단건 유료) 중복 방지용 구매ID 추출
  const _getPurchaseIdFromPurchaseInfo = (purchaseInfo) => {
    try {
      if (!purchaseInfo || typeof purchaseInfo !== "object") return "";

      const t = purchaseInfo?.transaction || null;

      const candidates = [
        t?.transactionIdentifier,          // iOS
        t?.originalTransactionIdentifier,  // iOS
        t?.purchaseToken,                  // Android
        t?.identifier,                     // fallback
        purchaseInfo?.purchaseId,
        purchaseInfo?.orderId,
        purchaseInfo?.purchasedAt && `${purchaseInfo.purchasedAt}:${purchaseInfo?.productIdentifier || ""}`,
      ];

      for (const v of candidates) {
        const s = v != null ? String(v).trim() : "";
        if (s) return s;
      }

      const raw = JSON.stringify(purchaseInfo);
      if (!raw) return "";

      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
      }
      return `pi_${hash}`;
    } catch {
      return "";
    }
  };

  // [수정 후]
const checkBoostEligibility = async ({ contentType = "post", contentId, mode = "free" } = {}) => {
  if (!user?.uid) return { status: "NO_USER", ok: false };
  if (!contentId) return { status: "NO_CONTENT_ID", ok: false };

  // ✅ 유저당 동시 1개 활성 부스트 제한 (같은 콘텐츠라도 "진행 중"이면 재부여 차단)
  const ab = activeBoost;
  if (ab && _isActiveBoost(ab)) {
    // ✅ activeBoost가 걸린 콘텐츠가 삭제된 경우, 자동 해제 후 진행
    try {
      const abType = String(ab?.type || "");
      const abId = String(ab?.contentId || "");
      const abCol = abType === "store" ? "stores" : "posts";
      const abSnap = await getDoc(doc(db, abCol, abId));
      if (!abSnap.exists()) {
        await updateDoc(doc(db, "users", user.uid), {
          [BOOST_ACTIVE_FIELD]: null,
        });
        setActiveBoost(null);
      } else {
        return { status: "HAS_ACTIVE_BOOST", ok: false, activeBoost: ab };
      }
    } catch {
      return { status: "HAS_ACTIVE_BOOST", ok: false, activeBoost: ab };
    }
  }


  // ✅ 게시글/스토어 문서 확인 + 6시간 경과 조건(도배 방지)
  // - paid도 동일하게 걸어두었음(원하면 paid만 즉시 허용으로 바꿀 수 있음)
  const colName = contentType === "store" ? "stores" : "posts";
  const snap = await getDoc(doc(db, colName, String(contentId)));
  if (!snap.exists()) return { status: "NOT_FOUND", ok: false };

  const data = snap.data() || {};
  const createdAtMs = _parseMs(data?.createdAt);
  const minAgeMs = 6 * 60 * 60 * 1000;
  if (createdAtMs && Date.now() - createdAtMs < minAgeMs) {
    return { status: "TOO_EARLY", ok: false, waitMs: (minAgeMs - (Date.now() - createdAtMs)) };
  }

  // ✅ 무료 부스트: 일 1회
  if (mode === "free") {
    const todayKey = getTodayKSTKey();
    const used = (boostDailyKey === todayKey) ? (Number(boostDailyFreeUsed || 0)) : 0;

    if (used >= 1) {
      return { status: "FREE_DAILY_LIMIT", ok: false, todayKey, used };
    }

    return { status: "OK", ok: true, todayKey };
  }

  // ✅ 멤버십 부스트: 월 N회
  if (mode === "membership") {
    if (!isPremium) return { status: "NOT_PREMIUM", ok: false };

    const monthKey = getCurrentMonthKeyKST();
    const limit = getBoostMembershipMonthlyLimit();
    const used = (boostMonthKey === monthKey) ? Number(boostMembershipUsed || 0) : 0;

    if (limit <= 0) return { status: "NOT_ELIGIBLE", ok: false, monthKey, limit, used };
    if (used >= limit) return { status: "MEMBERSHIP_LIMIT", ok: false, monthKey, limit, used };

    return { status: "OK", ok: true, monthKey, limit, used };
  }

  // ✅ paid(단건 유료): 구매 검증은 이후 단계(RevenueCat/결제 연동)에서 붙일 예정
  if (mode === "paid") {
    return { status: "OK", ok: true };
  }

  return { status: "UNKNOWN_MODE", ok: false };
};

  // [수정 후]
const applyBoostToContent = async ({ contentType = "post", contentId, mode = "free", durationHours = 2, purchaseInfo = null } = {}) => {

  if (!user?.uid) return { status: "NO_USER", ok: false };
  if (!contentId) return { status: "NO_CONTENT_ID", ok: false };

  try {
    const nowMs = Date.now();
    const untilMs = nowMs + Number(durationHours || 2) * 60 * 60 * 1000;

    const appliedAtIso = new Date(nowMs).toISOString();
    const untilIso = new Date(untilMs).toISOString();

    const colName = contentType === "store" ? "stores" : "posts";
    const userRef = doc(db, "users", user.uid);
    const contentRef = doc(db, colName, String(contentId));

    const todayKey = getTodayKSTKey();
    const monthKey = getCurrentMonthKeyKST();

    const txRes = await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const contentSnap = await tx.get(contentRef);

      if (!contentSnap.exists()) {
        return { ok: false, status: "NOT_FOUND" };
      }

      const userData = userSnap.exists() ? (userSnap.data() || {}) : {};

      // ✅ activeBoost 진행 중이면 재부여 차단 (같은 콘텐츠 포함)
      const ab = userData?.[BOOST_ACTIVE_FIELD] || null;
      if (ab && _isActiveBoost(ab)) {
        return { ok: false, status: "HAS_ACTIVE_BOOST", activeBoost: ab };
      }

      // ✅ 6시간 경과 조건 (기존 정책 유지)
      const data = contentSnap.data() || {};
      const createdAtMs = _parseMs(data?.createdAt);
      const minAgeMs = 6 * 60 * 60 * 1000;
      if (createdAtMs && nowMs - createdAtMs < minAgeMs) {
        return { ok: false, status: "TOO_EARLY", waitMs: (minAgeMs - (nowMs - createdAtMs)) };
      }

      // ✅ 모드별 카운트/자격 검증 (트랜잭션 기준)
      let nextDailyKey = userData?.[BOOST_DAILY_KEY_FIELD] || null;
      let nextDailyUsed = typeof userData?.[BOOST_DAILY_FREE_USED_FIELD] === "number" ? userData?.[BOOST_DAILY_FREE_USED_FIELD] : 0;

      let nextMonthKey = userData?.[BOOST_MONTH_KEY_FIELD] || null;
      let nextMembershipUsed = typeof userData?.[BOOST_MEMBERSHIP_USED_FIELD] === "number" ? userData?.[BOOST_MEMBERSHIP_USED_FIELD] : 0;

      // ✅ [추가] paid(단건 유료) 중복 방지용 구매ID
      let paidPurchaseId = "";
      if (mode === "paid") {
        paidPurchaseId = _getPurchaseIdFromPurchaseInfo(purchaseInfo);
        if (!paidPurchaseId) return { ok: false, status: "NO_PURCHASE_ID" };

        // users/{uid}/boostPurchases/{purchaseId} 존재하면 이미 처리된 결제 -> boostCount 중복 +1 금지
        const purchaseRef = doc(db, "users", user.uid, "boostPurchases", String(paidPurchaseId));
        const purchaseSnap = await tx.get(purchaseRef);
        if (purchaseSnap.exists()) {
          return { ok: false, status: "DUPLICATE_PURCHASE", purchaseId: paidPurchaseId };
        }

        // ✅ 아직 처리 안된 결제면 기록 + boostCount +1 (트랜잭션)
        const baseBoostCount = typeof userData?.boostCount === "number" ? userData.boostCount : 0;
        tx.set(purchaseRef, {
          purchaseId: String(paidPurchaseId),
          contentType: String(contentType),
          contentId: String(contentId),
          purchaseInfo: purchaseInfo || null,
          createdAt: serverTimestamp(),
        });

        tx.update(userRef, {
          boostCount: baseBoostCount + 1,
        });
      }

      if (mode === "free") {
        const used = (nextDailyKey === todayKey) ? Number(nextDailyUsed || 0) : 0;
        if (used >= 1) return { ok: false, status: "FREE_DAILY_LIMIT", todayKey, used };

        nextDailyKey = todayKey;
        nextDailyUsed = used + 1;
      }

      if (mode === "membership") {
        const dbIsPremium = !!userData?.isPremium || !!userData?.isAdmin;
        if (!isPremium && !dbIsPremium) return { ok: false, status: "NOT_PREMIUM" };

        const type = userData?.membershipType || membershipType || "free";
        const limit = (type === "yearly") ? 4 : (type === "monthly") ? 2 : 0;

        const used = (nextMonthKey === monthKey) ? Number(nextMembershipUsed || 0) : 0;
        if (limit <= 0) return { ok: false, status: "NOT_ELIGIBLE", monthKey, limit, used };
        if (used >= limit) return { ok: false, status: "MEMBERSHIP_LIMIT", monthKey, limit, used };

        nextMonthKey = monthKey;
        nextMembershipUsed = used + 1;      
      }

      // ✅ 콘텐츠 문서 부스트 필드
      tx.update(contentRef, {
        boostAppliedAt: appliedAtIso,
        boostUntil: untilIso,
        boostMode: String(mode),
      });

      // ✅ 유저 문서 activeBoost + 카운트
      const patch = {
        [BOOST_ACTIVE_FIELD]: {
          type: String(contentType),
          contentId: String(contentId),
          appliedAt: appliedAtIso,
          until: untilIso,
          mode: String(mode),
        },
      };

      if (mode === "free") {
        patch[BOOST_DAILY_KEY_FIELD] = nextDailyKey;
        patch[BOOST_DAILY_FREE_USED_FIELD] = nextDailyUsed;
      }

      if (mode === "membership") {
        patch[BOOST_MONTH_KEY_FIELD] = nextMonthKey;
        patch[BOOST_MEMBERSHIP_USED_FIELD] = nextMembershipUsed;
      }

      tx.update(userRef, patch);

      return {
        ok: true,
        status: "BOOST_APPLIED",
        boostAppliedAt: appliedAtIso,
        boostUntil: untilIso,
        mode: String(mode),
        todayKey: nextDailyKey,
        dailyUsed: nextDailyUsed,
        monthKey: nextMonthKey,
        membershipUsed: nextMembershipUsed,
      };
    });

    if (!txRes?.ok) return { ...txRes, ok: false };

    // ✅ 로컬 state 반영
    if (mode === "free") {
      setBoostDailyKey(txRes?.todayKey || todayKey);
      setBoostDailyFreeUsed(typeof txRes?.dailyUsed === "number" ? txRes.dailyUsed : 0);
    }

    if (mode === "membership") {
      setBoostMonthKey(txRes?.monthKey || monthKey);
      setBoostMembershipUsed(typeof txRes?.membershipUsed === "number" ? txRes.membershipUsed : 0);
    }

    setActiveBoost({
      type: String(contentType),
      contentId: String(contentId),
      appliedAt: txRes.boostAppliedAt,
      until: txRes.boostUntil,
      mode: String(mode),
    });

    return { status: "BOOST_APPLIED", ok: true, boostUntil: txRes.boostUntil, boostAppliedAt: txRes.boostAppliedAt };
  } catch (e) {
    console.warn("applyBoostToContent 실패:", e);
    return { status: "FAILED", ok: false, error: e };
  }
};


  const clearExpiredActiveBoostIfNeeded = async () => {
  try {
    if (!user?.uid) return;

    const ab = activeBoost;
    if (!ab) return;

    const isActive = _isActiveBoost(ab);

    // ✅ 진행 중이라도, 대상 문서가 삭제되었으면 activeBoost 해제
    if (isActive) {
      try {
        const abType = String(ab?.type || "");
        const abId = String(ab?.contentId || "");
        const abCol = abType === "store" ? "stores" : "posts";
        const snap = await getDoc(doc(db, abCol, abId));
        if (snap.exists()) return;
      } catch {
        return;
      }
    }

    // ✅ 만료(or 삭제) 되었으면 users.activeBoost만 비움
    await updateDoc(doc(db, "users", user.uid), {
      [BOOST_ACTIVE_FIELD]: null,
    });

    setActiveBoost(null);
  } catch (e) {
    console.warn("clearExpiredActiveBoostIfNeeded 실패:", e);
  }
};

  /* =========================
      posts CRUD
  ========================= */
  const addPost = async (newPostData) => {
    if (!user) return;
    await addDoc(collection(db, "posts"), {
      ...newPostData,
      pricePerPerson: Number(newPostData.pricePerPerson || 0),
      tip: Number(newPostData.tip || 0),
      maxParticipants: Number(newPostData.maxParticipants || 0),
      currentParticipants: Number(newPostData.currentParticipants || 1), // 기본값 1(본인)
      
      category: newPostData.category,
      ownerId: user.uid,
      ownerEmail: user.email,
      createdAt: new Date().toISOString(),
      location: homeDong || currentLocation,
    });
  };

  const updatePost = async (postId, updatedData) => {
    if (!postId) return;
    
    // 1. 게시물 업데이트
    await updateDoc(doc(db, "posts", postId), updatedData);

    // ✅ 2. 해당 postId를 가진 모든 채팅방에 알림 전송
    try {
      // 닉네임 불일치 문제를 해결하기 위해 최신 닉네임을 조회합니다.
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const latestNickname = userSnap.exists() 
        ? (userSnap.data().displayName || "방장") 
        : "방장";

      const q = query(collection(db, "chatRooms"), where("postId", "==", postId));
      const roomSnaps = await getDocs(q);

      roomSnaps.forEach(async (roomDoc) => {
        await addDoc(collection(db, "chatRooms", roomDoc.id, "messages"), {
          text: "방장이 게시물을 수정하였습니다.",
          senderId: "system",
          actorId: user.uid,           // ✅ 누가 수정했는지 ID 저장
          displayName: latestNickname, // ✅ 수정 당시의 닉네임 저장
          type: "system",
          createdAt: new Date().toISOString(),
        });
      });
    } catch (e) {
      console.warn("수정 알림 전송 실패:", e);
    }
  };

  const deletePost = async (postId) => {
    if (!postId) return;

    // ✅ 1. 삭제 전, 해당 postId를 가진 모든 채팅방에 알림 전송
    try {
      // 닉네임 불일치 문제를 해결하기 위해 최신 닉네임을 조회합니다.
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const latestNickname = userSnap.exists() 
        ? (userSnap.data().displayName || "방장") 
        : "방장";

      const q = query(collection(db, "chatRooms"), where("postId", "==", postId));
      const roomSnaps = await getDocs(q);

      for (const roomDoc of roomSnaps.docs) {
        await addDoc(collection(db, "chatRooms", roomDoc.id, "messages"), {
          text: "방장이 게시물을 삭제하였습니다.",
          senderId: "system",
          actorId: user.uid,           // ✅ 누가 삭제했는지 ID 저장
          displayName: latestNickname, // ✅ 삭제 당시의 닉네임 저장
          type: "system",
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("삭제 알림 전송 실패:", e);
    }

    // 2. 게시물 삭제
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
        boostTickets,      // (현재 보유 개수)
        addBoostTicket,    // (티켓 추가 함수)

        currentLocation,
        setCurrentLocation,
        myCoords,
        setMyCoords,

        // ✅ 홈 동(표시/검증)
        homeDong,
        homeDongVerified,
        homeDongVerifiedAt,
        loadHomeDongFromStorage,
        saveHomeDong,
        clearHomeDong,
        refreshMyCoords,
        verifyHomeDongByGps,

        posts,
        stores,
        addPost,
        updatePost,
        deletePost,

        loadMorePosts,
        loadMoreStores,

        refreshPostsAndStores,

        getDistanceFromLatLonInKm,
        verifyLocation,
        checkSavedVerification,
        isVerified,

        authChecked,
        locationChecked,
        postsLoaded,
        storesLoaded,
        initialReady,
        isBooting,

        isPremium,
        premiumUntil,
        dailyPostCount,
        dailyPostCountDate,
        incrementDailyPostCount,

        membershipType,
        hotplaceMonthKey,
        hotplaceCount,
        hotplacePaidExtraMonthKey,
        hotplacePaidExtraCount,
        getCurrentMonthKeyKST,
        checkHotplaceEligibility,
        incrementHotplaceCount,

        purchaseHotplaceConsumable,
        purchaseHotplaceExtra: purchaseHotplaceConsumable,

        purchaseBoostConsumable,

        isAdmin,

        blockedUsers,
        reportUser,
        blockUser,
        sendNotificationToReporter,

        activatePremium,
        refreshPremiumFromRevenueCat,
        restorePurchases,

        // ✅ [추가] Boost API
        checkBoostEligibility,
        applyBoostToContent,
        clearExpiredActiveBoostIfNeeded,
        totalUnreadCount,
      }}
    >
      {children}

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
