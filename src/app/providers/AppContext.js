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

const AppContext = createContext();
const STORAGE_KEY = "user_location_auth_v3";

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

function getTodayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentLocation, setCurrentLocation] = useState("위치 찾는 중...");
  const [myCoords, setMyCoords] = useState(null);
  const [posts, setPosts] = useState([]);

  const [postLimit, setPostLimit] = useState(20);

  const [blockedUsers, setBlockedUsers] = useState([]);

  const [isVerified, setIsVerified] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState(null);
  const [dailyPostCount, setDailyPostCount] = useState(0);
  const [dailyPostCountDate, setDailyPostCountDate] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // ✅ Entitlement Identifier (RevenueCat 대시보드 Identifier)
  const ENTITLEMENT_ID = "Nbbang Premium";

  // ✅ (통일) Public SDK Key는 EXPO_PUBLIC 하나만 사용
  const REVENUECAT_PUBLIC_SDK_KEY = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_SDK_KEY || "";

  const getRevenueCatApiKey = () => {
    // 공용 키만 사용 (App.js에서 configure에 사용)
    return REVENUECAT_PUBLIC_SDK_KEY || "";
  };

  // ✅ AppContext에서는 절대 configure 하지 않음
  const rcLoggedInUidRef = useRef(null);

  const initRevenueCatForUser = async (uid) => {
    try {
      const apiKey = getRevenueCatApiKey();
      if (!apiKey) {
        rcLoggedInUidRef.current = null;
        return;
      }

      // ✅ 로그인(identify) 연결: uid가 있고, 현재 로그인 uid와 다르면 logIn
      if (uid && rcLoggedInUidRef.current !== uid && Purchases.logIn) {
        try {
          await Purchases.logIn(uid);
          rcLoggedInUidRef.current = uid;
        } catch (e) {
          // logIn 실패해도 앱은 계속 동작해야 함
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
        return;
      }

      const entitlement = customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] || null;
      const nextPremiumUntil = entitlement?.expirationDate || null;
      const nextIsPremium = !!entitlement || !!isAdminRef.current;

      setPremiumUntil(nextPremiumUntil);
      setIsPremium(nextIsPremium);

      if (uid) {
        await updateDoc(doc(db, "users", uid), {
          premiumUntil: nextPremiumUntil,
          isPremium: nextIsPremium,
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

      // ✅ 혹시 아직 logIn 안 된 상태면 먼저 보장 (configure는 App.js에서만)
      await initRevenueCatForUser(user.uid);

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

      const info = await Purchases.restorePurchases();
      const entitlement = info?.entitlements?.active?.[ENTITLEMENT_ID];
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
        setBlockedUsers([]);
        setPostLimit(20);
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
          setDailyPostCount(data.dailyPostCount || 0);
          setDailyPostCountDate(data.dailyPostCountDate || null);

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
          });

          setIsAdmin(false);
          isAdminRef.current = false;
          setBlockedUsers([]);
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
        setPosts(loaded);
      });
    } else {
      setPosts([]);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [user, postLimit, blockedUsers]);

  const loadMorePosts = () => {
    setPostLimit((prev) => prev + 5);
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

  const reportUser = async (targetUserId, contentId, reason, type = "post") => {
    if (!user) {
      Alert.alert("알림", "로그인이 필요합니다.");
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
      Alert.alert("신고 완료", "신고가 접수되었습니다. 검토 후 조치하겠습니다.");
    } catch (e) {
      console.error("신고 실패:", e);
      Alert.alert("오류", "신고 처리 중 문제가 발생했습니다.");
    }
  };

  const blockUser = async (targetUserId) => {
    if (!user) return;
    if (targetUserId === user.uid) {
      Alert.alert("알림", "자기 자신은 차단할 수 없습니다.");
      return;
    }

    try {
      await updateDoc(doc(db, "users", user.uid), {
        blockedUsers: arrayUnion(targetUserId),
      });

      setBlockedUsers((prev) => [...prev, targetUserId]);

      Alert.alert("차단 완료", "해당 사용자를 차단했습니다.\n이제 이 사용자의 글과 채팅이 보이지 않습니다.");
    } catch (e) {
      console.error("차단 실패:", e);
      Alert.alert("오류", "차단 처리 중 문제가 발생했습니다.");
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
        if (Date.now() - timestamp < 30 * 24 * 60 * 60 * 1000) {
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
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = location.coords;

      let dong = null;
      const addresses = await Location.reverseGeocodeAsync(coords).catch(() => []);
      for (const addr of addresses) {
        const found = extractDong([addr.street, addr.name, addr.district, addr.subregion].join(" "));
        if (found) {
          dong = found;
          break;
        }
      }

      const authData = { dong: dong || "내 동네", coords, timestamp: Date.now() };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

      setCurrentLocation(authData.dong);
      setMyCoords(coords);
      setIsVerified(true);
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

  /* =========================
      posts CRUD
  ========================= */
  const addPost = async (newPostData) => {
    if (!user) return;
    await addDoc(collection(db, "posts"), {
      ...newPostData,
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
        addPost,
        updatePost,
        deletePost,

        loadMorePosts,

        getDistanceFromLatLonInKm,
        verifyLocation,
        isVerified,

        isPremium,
        premiumUntil,
        dailyPostCount,
        dailyPostCountDate,
        incrementDailyPostCount,

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
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
