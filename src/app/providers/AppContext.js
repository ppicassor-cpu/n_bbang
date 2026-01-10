import React, { createContext, useState, useContext, useEffect } from "react";
import * as Location from "expo-location";

const AppContext = createContext();

// 거리 계산 함수 (Haversine formula)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  // ✅ [수정] 0도 좌표도 유효한 값이므로 null/undefined만 체크하도록 수정
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 9999;

  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export const AppProvider = ({ children }) => {
  const [currentLocation, setCurrentLocation] = useState("위치 찾는 중...");
  const [myCoords, setMyCoords] = useState(null); // 내 위경도 { latitude, longitude }
  const [myPoints, setMyPoints] = useState(50000);
  const [posts, setPosts] = useState([
    {
      id: "1",
      ownerId: "other_user",
      category: "대형마트",
      title: "코스트코 소고기 소분해요",
      location: "내동",
      coords: { latitude: 35.2320, longitude: 128.8710 },
      pickup_point: "현대아파트 정문",
      price: 30000, 
      pricePerPerson: 15000,
      tip: 1000,
      currentParticipants: 2,
      maxParticipants: 4,
      images: [],
      status: "모집중",
      content: "소고기 반 나누실 분!",
    },
  ]);

  // 앱 시작 시 내 위치 가져오기
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCurrentLocation("위치 권한 없음");
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setMyCoords(location.coords);
      
      // 주소 변환 (Geocoding)
      let address = await Location.reverseGeocodeAsync(location.coords);
      if (address && address.length > 0) {
        setCurrentLocation(address[0].district || address[0].street || "내 위치");
      }
    })();
  }, []);

  const addPost = (newPost) => {
    // ✅ [수정] 함수형 업데이트로 변경하여 레이스 컨디션(누락) 방지
    setPosts(prevPosts => [newPost, ...prevPosts]);
  };

  return (
    <AppContext.Provider value={{ currentLocation, myCoords, setCurrentLocation, myPoints, posts, addPost, getDistanceFromLatLonInKm }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
