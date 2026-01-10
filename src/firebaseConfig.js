import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
// ✅ initializeFirestore 추가 (설정 커스텀용)
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBp1vCATiECjHXQq9SH9Jo9ltOyroXCfCw",
  authDomain: "randomch-6f635.firebaseapp.com",
  databaseURL: "https://randomch-6f635-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "randomch-6f635",
  storageBucket: "randomch-6f635.firebasestorage.app",
  messagingSenderId: "1060639718995",
  appId: "1:1060639718995:web:99a4e09821374efa1290a6",
  measurementId: "G-WPP12P5W60"
};

// 1. 앱 초기화 (중복 방지: 이미 켜져 있으면 기존 것 사용)
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// 2. Auth 초기화 (중복 방지 & 로그인 유지 설정)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  if (e.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    console.error("Firebase Auth Init Error:", e);
    throw e;
  }
}

// 3. Firestore 초기화 (✅ 핵심: 안드로이드 연결 끊김 방지 설정)
let db;
try {
    db = initializeFirestore(app, { 
        experimentalForceLongPolling: true, // 이 설정이 있어야 안드로이드에서 타임아웃이 안 생깁니다.
    });
} catch (e) {
    // 이미 초기화 된 경우 기존 DB 인스턴스 사용
    db = getFirestore(app);
}

export { auth, db };
export const storage = getStorage(app);
