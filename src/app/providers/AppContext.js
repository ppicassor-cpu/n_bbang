// FILE: src/app/providers/AppContext.js

import React, { createContext, useState, useContext, useEffect, useRef } from "react";
import { Platform } from "react-native";
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

// ✅ [추가] 홈 동 저장 키
const HOME_DONG_STORAGE_KEY = "home_dong_v1";
const HOME_DONG_NAME_KEY = "HOME_DONG_NAME";
const HOME_DONG_CODE_KEY = "HOME_DONG_CODE";
const HOME_DONG_VERIFIED_KEY = "HOME_DONG_VERIFIED";
const HOME_DONG_VERIFIED_AT_KEY = "HOME_DONG_VERIFIED_AT";

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

  // ✅ 동 표시 정책: homeDong 우선 (없으면 "내 동네 설정")
  const [currentLocation, setCurrentLocation] = useState("내 동네 설정");
  const [myCoords, setMyCoords] = useState(null);

  // ✅ [추가] 홈 동 상태
  const [homeDong, setHomeDong] = useState(null);
  const [homeDongCode, setHomeDongCode] = useState(null);
  const [homeDongPolygonId, setHomeDongPolygonId] = useState(null);
  const [homeDongVerified, setHomeDongVerified] = useState(false);
  const [homeDongVerifiedAt, setHomeDongVerifiedAt] = useState(null);

  // ✅ [추가] 초기 로딩 게이팅용 상태(홈 모달에서 사용)
  const [authChecked, setAuthChecked] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const isBooting = !(authChecked && locationChecked && postsLoaded && storesLoaded);

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
      setHomeDongPolygonId(null);
      setHomeDongVerified(false);
      setHomeDongVerifiedAt(null);
    }
  };

  // ✅ [추가] 홈 동 저장(사용자 확정)
  const saveHomeDong = async ({ dongName, dongCode, featureId } = {}) => {
    const next = {
      dongName: dongName || null,
      dongCode: dongCode || null,
      featureId: featureId || null,
      verified: false,
      verifiedAt: null,
    };

    try {
      // ✅ legacy + HOME_DONG_* 동시 저장(호환)
      await AsyncStorage.setItem(HOME_DONG_STORAGE_KEY, JSON.stringify(next));
      await AsyncStorage.multiSet([
        [HOME_DONG_NAME_KEY, next.dongName ? String(next.dongName) : ""],
        [HOME_DONG_CODE_KEY, next.dongCode ? String(next.dongCode) : ""],
        [HOME_DONG_VERIFIED_KEY, "false"],
        [HOME_DONG_VERIFIED_AT_KEY, ""],
      ]);
    } catch {}

    setHomeDong(next.dongName);
    setHomeDongCode(next.dongCode);
    setHomeDongPolygonId(next.featureId);
    setHomeDongVerified(false);
    setHomeDongVerifiedAt(null);
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
      setIsVerified(true);
      setLocationChecked(true);

      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ coords: { latitude: coords.latitude, longitude: coords.longitude }, timestamp: Date.now() })
        );
      } catch {}

      return coords;
    } catch {
      setLocationChecked(true);
      return null;
    }
  };

  // ✅ [추가] 현재 GPS가 선택 동 폴리곤 안인지 검증(동 이름은 절대 변경 금지)
  const verifyHomeDongByGps = async ({ polygon } = {}) => {
    try {
      const coords = myCoords?.latitude && myCoords?.longitude ? myCoords : await refreshMyCoords();
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

  useEffect(() => {
    loadHomeDongFromStorage();
    checkSavedVerification();

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

            setMembershipType(data.membershipType || "free");
            setHotplaceMonthKey(data.hotplaceMonthKey || null);
            setHotplaceCount(typeof data.hotplaceCount === "number" ? data.hotplaceCount : 0);
            setHotplacePaidExtraMonthKey(data.hotplacePaidExtraMonthKey || null);
            setHotplacePaidExtraCount(typeof data.hotplacePaidExtraCount === "number" ? data.hotplacePaidExtraCount : 0);
          } else {
            setBlockedUsers([]);

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

  const checkSavedVerification = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) || {};
        const timestamp = parsed?.timestamp || 0;

        const rawC = parsed?.coords || null;
        const c =
          rawC && rawC.latitude != null && rawC.longitude != null
            ? { latitude: Number(rawC.latitude), longitude: Number(rawC.longitude) }
            : null;

        if (c && timestamp && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
          setMyCoords(c);
          setIsVerified(true);
          setLocationChecked(true);
          return;
        }
      }

      await refreshMyCoords();
    } catch {
      await refreshMyCoords();
    }
  };

  // ✅ 기존 호출 호환용: verifyLocation은 이제 "좌표 갱신"만 수행
  const verifyLocation = async () => {
    return await refreshMyCoords();
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

  /* =========================
      posts CRUD
  ========================= */
  const addPost = async (newPostData) => {
    if (!user) return;
    await addDoc(collection(db, "posts"), {
      ...newPostData,
      category: newPostData.category,
      ownerId: user.uid,
      ownerEmail: user.email,
      createdAt: new Date().toISOString(),
      location: homeDong || currentLocation,
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
        isVerified,

        authChecked,
        locationChecked,
        postsLoaded,
        storesLoaded,
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
