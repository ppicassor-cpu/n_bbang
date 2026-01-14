import { Image } from "react-native"; // ✅ 로컬 이미지 변환용 추가
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, addDoc, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebaseConfig"; 

// ✅ V10: 로컬 이미지 적용을 위해 키 변경 (강제 청소 & 재생성)
const SAMPLE_FLAG_KEY = "HAS_GENERATED_SAMPLES_V10";

// 랜덤 좌표 생성기
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
    // 1. 이미 V10 버전으로 작업을 했는지 확인
    const hasGenerated = await AsyncStorage.getItem(SAMPLE_FLAG_KEY);
    
    if (hasGenerated !== "true") {
        console.log("🧹 기존 샘플 데이터 강제 청소 시작...");
        
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("ownerId", "==", "SAMPLE_DATA"));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const deletePromises = snapshot.docs.map((d) => deleteDoc(doc(db, "posts", d.id)));
            await Promise.all(deletePromises);
            console.log(`🗑️ 기존 중복 샘플 ${snapshot.size}개 삭제 완료!`);
        }

        // 2. 깨끗해진 상태에서 새로운 샘플 3개 생성
        console.log("🌱 새로운 샘플 데이터 생성 중...");
        const nowIso = new Date().toISOString();

        // ✅ [핵심 수정] 로컬에 있는 chair.png 파일을 주소로 변환해서 가져옴
        // (파일 경로: src/utils/../../assets/chair.png)
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
            // ✅ 위에서 변환한 로컬 이미지 주소를 여기에 적용
            images: [localChairUri],
            status: "나눔중",
            ownerId: "SAMPLE_DATA",
            ownerEmail: "chair@nbbang.com",
            tip: 0,
            isFree: true,
            coords: getRandomCoords(currentCoords),
            createdAt: nowIso,
            updatedAt: nowIso,
        },
        ];

        // 3. 파이어베이스 전송
        await Promise.all(samples.map((post) => addDoc(postsRef, post)));

        // 4. 완료 플래그 저장
        await AsyncStorage.setItem(SAMPLE_FLAG_KEY, "true");
        console.log("✅ 샘플 데이터 재설정 완료 (총 3개)");
    }
    
  } catch (e) {
    console.error("샘플 생성 실패:", e);
  }
};