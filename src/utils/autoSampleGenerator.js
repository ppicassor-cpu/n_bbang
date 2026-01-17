// FILE: src/utils/autoSampleGenerator.js

import { Image } from "react-native"; 
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig"; 

// 거리 계산 함수 (km 단위)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구 반지름 (km)
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

// 랜덤 좌표 생성기 (현재 위치 기준 약간의 오차)
const getRandomCoords = (center) => {
  const latOffset = (Math.random() - 0.5) * 0.015;
  const lonOffset = (Math.random() - 0.5) * 0.015;
  return {
    latitude: center.latitude + latOffset,
    longitude: center.longitude + lonOffset,
  };
};

export const checkAndGenerateSamples = async (currentCoords) => {
  if (!currentCoords || !currentCoords.latitude) return;

  try {
    console.log("📍 샘플 데이터 지역 검사 시작...");

    const postsRef = collection(db, "posts");
    // 1. 'SAMPLE_DATA'로 등록된 모든 게시글 조회
    const q = query(postsRef, where("ownerId", "==", "SAMPLE_DATA"));
    const snapshot = await getDocs(q);

    let hasNearbySample = false;

    // 2. 내 위치 반경 5km 이내에 샘플이 존재하는지 확인
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.coords) {
        const dist = getDistanceFromLatLonInKm(
          currentCoords.latitude,
          currentCoords.longitude,
          data.coords.latitude,
          data.coords.longitude
        );
        
        // 5km 이내에 하나라도 있다면 생성하지 않음
        if (dist <= 5) {
          hasNearbySample = true;
          break; 
        }
      }
    }

    // 3. 주변에 샘플이 있다면 함수 종료 (기존 사용자의 데이터 보존)
    if (hasNearbySample) {
        console.log("✅ 이 지역(5km 내)에는 이미 샘플 데이터가 있습니다. 생성을 건너뜁니다.");
        return;
    }

    // 4. 주변에 샘플이 없다면, 새로운 샘플 생성 (Create)
    console.log("🌱 이 지역은 비어있습니다. 새로운 샘플 데이터를 생성합니다...");
    
    const nowIso = new Date().toISOString();

    // ✅ 로컬 이미지 주소 변환 (chair.png)
    const localChairUri = Image.resolveAssetSource(require("../../assets/chair.png")).uri;

    const samples = [
      {
        category: "마트/식품",
        title: "🍕 트레이더스 피자 나누실 분?",
        content: "혼자 먹기엔 너무 크네요. 반반 나누실 분 구합니다! 채팅 걸어주세요.",
        price: 16000,
        pricePerPerson: 8000,
        maxParticipants: 2,
        currentParticipants: 1,
        location: "이마트 트레이더스 앞",
        pickup_point: "푸드코트 입구",
        images: ["https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80"],
        status: "모집중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "pizza@nbbang.com",
        tip: 0,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
        isSample: true, // 식별자 추가
      },
      {
        category: "생활용품",
        title: "🧺 캡슐세제 100개입 반띵해요",
        content: "코스트코 커클랜드 캡슐세제 샀는데 양이 너무 많아서 50개씩 나누려고 합니다. 통 가져오시면 담아드릴게요!",
        price: 28000,
        pricePerPerson: 14000,
        maxParticipants: 2,
        currentParticipants: 1,
        location: "00아파트 정문",
        pickup_point: "경비실 앞",
        images: ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&q=80"],
        status: "모집중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "clean@nbbang.com",
        tip: 0,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
        isSample: true,
      },
      {
        category: "무료나눔",
        title: "🎁 안 쓰는 원목 의자 드려요",
        content: "이사 가면서 내놓습니다. 상태 깨끗해요. 직접 가져가실 분만 채팅주세요.",
        price: 0,
        pricePerPerson: 0,
        maxParticipants: 1,
        currentParticipants: 0,
        location: "우리동네 공원",
        pickup_point: "공원 벤치",
        // ✅ 로컬 이미지 적용
        images: [localChairUri],
        status: "나눔중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "chair@nbbang.com",
        tip: 0,
        isFree: true,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
        isSample: true,
      },
    ];

    // 5. DB에 추가 (기존 데이터 삭제 없이 추가만 함)
    await Promise.all(samples.map((post) => addDoc(postsRef, post)));
    console.log("🎉 현재 위치에 새로운 샘플 데이터 3개 생성 완료!");

  } catch (e) {
    console.error("샘플 생성 실패:", e);
  }
};