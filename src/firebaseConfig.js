import { initializeApp } from "firebase/app";
// ⚠️ [수정] getAuth 대신 initializeAuth와 Persistence 모듈 사용
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
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

const app = initializeApp(firebaseConfig);

// ✅ [핵심] 로그인 정보가 앱을 꺼도 날아가지 않게 저장소와 연결
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);
