import React, { createContext, useState, useContext, useEffect } from "react";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth, db } from "../../firebaseConfig";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  deleteDoc, 
  updateDoc, 
  doc,
  onSnapshot
} from "firebase/firestore";

const AppContext = createContext();
const STORAGE_KEY = "user_location_auth_v3";

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

function extractDong(text) {
  if (!text) return null;
  const str = String(text);
  const words = str.split(/[\s,()\[\]]+/);
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (w.endsWith("로") || w.endsWith("길") || w.endsWith("대로")) continue;
    if (w.endsWith("시") || w.endsWith("군") || w.endsWith("구") || w.endsWith("도")) continue;
    if (/[가-힣0-9]+(동|읍|면|리|가)$/.test(w)) return w;
  }
  return null;
}

async function checkIpConsistency(gpsCoords) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://ipwho.is/", { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return true;
    const json = await res.json();
    if (!json.success) return true;

    const dist = getDistanceFromLatLonInKm(gpsCoords.latitude, gpsCoords.longitude, json.latitude, json.longitude);
    if (dist > 200) {
      console.warn(`IP 거리 차이: ${dist.toFixed(0)}km`);
      return false;
    }
    return true;
  } catch (error) {
    return true;
  }
}

async function resolveAdminDong(coords) {
  try {
    const addresses = await Location.reverseGeocodeAsync(coords);
    if (addresses && addresses.length > 0) {
      for (const addr of addresses) {
        const full = [addr.street, addr.name, addr.district, addr.subregion, addr.formattedAddress].join(" ");
        const found = extractDong(full);
        if (found) return found;
      }
    }
  } catch (e) {}
  
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&zoom=18&accept-language=ko`;
    const res = await fetch(url, { headers: { "User-Agent": "NBBANG_APP/1.0" } });
    if (res.ok) {
      const json = await res.json();
      const addr = json.address || {};
      const candidates = [addr.neighbourhood, addr.quarter, addr.suburb, addr.village, addr.town, addr.hamlet, json.display_name];
      for (const c of candidates) {
        const found = extractDong(c);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentLocation, setCurrentLocation] = useState("위치 찾는 중...");
  const [myCoords, setMyCoords] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    checkSavedVerification();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        subscribePosts(); 
      }
    });
    return () => unsubscribe();
  }, []);

  const subscribePosts = () => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const loadedPosts = [];
      querySnapshot.forEach((doc) => {
        loadedPosts.push({ id: doc.id, ...doc.data() });
      });
      setPosts(loadedPosts);
    });
    return unsubscribe;
  };

  const checkSavedVerification = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { dong, coords, timestamp } = JSON.parse(saved);
        if ((Date.now() - timestamp) < (30 * 24 * 60 * 60 * 1000)) {
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
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = location.coords;

      await checkIpConsistency(coords);
      let dong = await resolveAdminDong(coords);
      if (!dong) {
         const raw = await Location.reverseGeocodeAsync(coords).catch(()=>[]);
         dong = raw[0]?.district || raw[0]?.city || "내 동네";
      }

      const authData = { dong, coords, timestamp: Date.now() };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
      
      setCurrentLocation(dong);
      setMyCoords(coords);
      setIsVerified(true);
    } catch (e) { 
      console.log("위치 에러:", e);
      setCurrentLocation("위치 확인 불가"); 
    }
  };

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signup = async (email, password, nickname) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    if (nickname) {
        await updateProfile(userCredential.user, { displayName: nickname });
        setUser({ ...userCredential.user, displayName: nickname });
    }
    return userCredential;
  };

  const logout = () => signOut(auth);
  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const addPost = async (newPostData) => {
    if (!user) return;
    await addDoc(collection(db, "posts"), {
      ...newPostData,
      ownerId: user.uid,
      ownerEmail: user.email,
      createdAt: new Date().toISOString(),
      location: currentLocation
    });
  };

  // ✅ 게시글 수정 함수 추가
  const updatePost = async (postId, updatedData) => {
    if (!postId) return;
    const postRef = doc(db, "posts", postId);
    await updateDoc(postRef, updatedData);
  };

  const deletePost = async (postId) => {
    await deleteDoc(doc(db, "posts", postId));
  };

  return (
    <AppContext.Provider value={{ 
      user, login, signup, logout, resetPassword,
      currentLocation, myCoords, posts, addPost, updatePost, deletePost, 
      getDistanceFromLatLonInKm, verifyLocation, isVerified 
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
