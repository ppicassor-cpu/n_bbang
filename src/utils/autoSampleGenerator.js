import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebaseConfig"; // 경로: src/firebaseConfig.js

const SAMPLE_FLAG_KEY = "HAS_GENERATED_SAMPLES_V1";

// 랜덤 좌표 생성기 (현재 위치 기준 약 500m ~ 1km 반경)
const getRandomCoords = (center) => {
  const latOffset = (Math.random() - 0.5) * 0.015; 
  const lonOffset = (Math.random() - 0.5) * 0.015;
  return {
    latitude: center.latitude + latOffset,
    longitude: center.longitude + lonOffset,
  };
};

export const checkAndGenerateSamples = async (currentCoords) => {
  // 좌표가 없으면 중단
  if (!currentCoords || !currentCoords.latitude) return;

  try {
    // 1. 이미 생성했는지 확인 (앱 재실행 때마다 생성되면 안 됨)
    const hasGenerated = await AsyncStorage.getItem(SAMPLE_FLAG_KEY);
    if (hasGenerated === "true") return;

    console.log("📍 새로운 지역! 주변에 샘플 데이터를 생성합니다...");

    const postsRef = collection(db, "posts");
    const nowIso = new Date().toISOString();

    // 2. 심어줄 샘플 데이터 목록
    const samples = [
      {
        category: "마트/식품",
        title: "👋 [체험용] 근처 마트 피자 나누실 분?",
        content: "이 글은 체험용 샘플입니다. 채팅하기를 눌러보세요!",
        price: 15000,
        pricePerPerson: 5000,
        maxParticipants: 3,
        currentParticipants: 1,
        location: "우리동네 마트 앞",
        pickup_point: "정문 건널목",
        images: ["https://dummyimage.com/600x400/ffcc00/000000.png&text=Pizza"],
        status: "모집중",
        ownerId: "SAMPLE_DATA", // ★ 삭제 식별자
        ownerEmail: "welcome@nbbang.com",
        tip: 0,
        coords: getRandomCoords(currentCoords), // 사용자 주변 좌표
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        category: "생활용품",
        title: "🧻 [체험용] 휴지 대량구매 소분해요",
        content: "N빵 앱에 오신 걸 환영합니다. 이런 식으로 소분을 진행해보세요.",
        price: 20000,
        pricePerPerson: 10000,
        maxParticipants: 2,
        currentParticipants: 1,
        location: "근처 편의점",
        pickup_point: "편의점 앞 벤치",
        images: ["https://dummyimage.com/600x400/00ccff/ffffff.png&text=Tissue"],
        status: "모집중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "guide@nbbang.com",
        tip: 0,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        category: "무료나눔",
        title: "🎁 [체험용] 안 쓰는 의자 드려요",
        content: "무료나눔 기능도 체험해보세요. 위치는 사용자님 근처로 설정되었습니다.",
        price: 0,
        pricePerPerson: 0,
        maxParticipants: 1,
        currentParticipants: 0,
        location: "우리동네 공원",
        pickup_point: "공원 입구",
        images: ["https://dummyimage.com/600x400/ff4444/ffffff.png&text=Free"],
        status: "나눔중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "gift@nbbang.com",
        tip: 0,
        isFree: true,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    // 3. 파이어베이스 전송
    await Promise.all(samples.map((post) => addDoc(postsRef, post)));

    // 4. 생성 완료 플래그 저장
    await AsyncStorage.setItem(SAMPLE_FLAG_KEY, "true");
    console.log("✅ 주변 샘플 데이터 생성 완료!");
    
  } catch (e) {
    console.error("샘플 생성 실패:", e);
  }
};