// FILE: src/utils/autoSampleGenerator.js  

import { Image } from "react-native"; 
import { collection, doc, getDoc, setDoc, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../firebaseConfig"; 

const SAMPLE_VERSION = 1;

// ✅ 샘플 전용 컬렉션(분리)
const SAMPLE_COLLECTION = "sample_posts";

// ✅ 레거시 샘플(예전엔 posts에 생성됨) 존재 시 중복 생성 방지용 "읽기" 전용
const LEGACY_COLLECTION = "posts";

// ✅ "동네/격자" 키(반경 5km급) - 위도 0.05도 ≈ 5.5km
const GRID_SIZE_DEG = 0.05;

// ✅ 반경 제한(근처 샘플 있으면 생성 금지)
const NEARBY_LIMIT_KM = 5;

const CATEGORY_SLUG = {
  "마트/식품": "mart_food",
  "생활용품": "life_goods",
  "무료나눔": "free_share",
};

const _slugify = (v) => {
  const s = String(v ?? "").trim();
  return CATEGORY_SLUG[s] || s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
};

const _gridKeyFromGrid = (gLat, gLng) => {
  const a = Number(gLat).toFixed(2).replace(".", "");
  const b = Number(gLng).toFixed(2).replace(".", "");
  return `${a}_${b}`;
};

const _gridKey = (coords) => {
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "0_0";

  const gLat = Math.floor(lat / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const gLng = Math.floor(lng / GRID_SIZE_DEG) * GRID_SIZE_DEG;

  // ✅ 문서ID 안정성: 소수점 2자리 고정 + 점(.) 제거
  return _gridKeyFromGrid(gLat, gLng);
};

// ✅ 반경 체크용(3x3 주변 격자)
const _neighborGrids = (coords) => {
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ["0_0"];

  const baseLat = Math.floor(lat / GRID_SIZE_DEG) * GRID_SIZE_DEG;
  const baseLng = Math.floor(lng / GRID_SIZE_DEG) * GRID_SIZE_DEG;

  const grids = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gLat = baseLat + dy * GRID_SIZE_DEG;
      const gLng = baseLng + dx * GRID_SIZE_DEG;
      grids.push(_gridKeyFromGrid(gLat, gLng));
    }
  }
  return grids;
};

// ✅ 거리 계산(하버사인) km
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}
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

const _normalizeCoords = (v) => {
  if (!v || typeof v !== "object") return null;
  const lat = Number(v.latitude ?? v.lat);
  const lng = Number(v.longitude ?? v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
};

// 랜덤 좌표 생성기 (현재 위치 기준 약간의 오차)
const getRandomCoords = (center) => {
  const latOffset = (Math.random() - 0.5) * 0.015;
  const lonOffset = (Math.random() - 0.5) * 0.015;
  return {
    latitude: center.latitude + latOffset,
    longitude: center.longitude + lonOffset,
  };
};

// ✅ (핵심) 근처(5km) 샘플 존재 여부 검사
// 1) sample_posts: sampleKey 문서(현재 격자 + 인접 8격자) 빠른 검사
// 2) sample_posts: 혹시 남아있는 레거시(랜덤 docId)까지 ownerId==SAMPLE_DATA 조회 후 거리 검사
// 3) posts(레거시): 예전에 posts에 생성된 샘플까지 조회 후 거리 검사(읽기만)
const _hasNearbySampleWithin5km = async (sampleRef, legacyPostsRef, currentCoords, templates) => {
  // (1) sampleKey 기반 빠른 검사(주변 3x3 격자) - sample_posts
  try {
    const grids = _neighborGrids(currentCoords);
    const reads = [];

    for (let g = 0; g < grids.length; g++) {
      const grid = grids[g];
      for (let i = 0; i < templates.length; i++) {
        const base = templates[i];
        const catSlug = _slugify(base.category);
        const sampleKey = `sample_${grid}_${catSlug}_${i + 1}`;
        const docRef = doc(db, SAMPLE_COLLECTION, sampleKey);
        reads.push(getDoc(docRef));
      }
    }

    const snaps = await Promise.all(reads);
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i]?.exists?.()) {
        return true;
      }
    }
  } catch (e) {
    // 빠른 검사 실패해도 아래 거리 검사로 안전망
  }

  // (2) sample_posts 내 레거시(랜덤 docId) 거리 검사(있을 가능성 낮지만 안전망)
  try {
    const qSamples = query(
      sampleRef,
      where("ownerId", "==", "SAMPLE_DATA"),
      limit(300)
    );
    const snapSamples = await getDocs(qSamples);

    for (const d of snapSamples.docs) {
      const data = d.data() || {};
      const c = _normalizeCoords(data.coords);
      if (!c) continue;

      const dist = getDistanceFromLatLonInKm(
        Number(currentCoords.latitude),
        Number(currentCoords.longitude),
        Number(c.latitude),
        Number(c.longitude)
      );

      if (dist <= NEARBY_LIMIT_KM) {
        return true;
      }
    }
  } catch (e) {
    // sample_posts 검사 실패 시: 중복 방지가 더 중요하면 true
    return true;
  }

  // (3) posts(레거시) 거리 검사 - 읽기만
  try {
    const qLegacy = query(
      legacyPostsRef,
      where("ownerId", "==", "SAMPLE_DATA"),
      limit(300)
    );
    const snapLegacy = await getDocs(qLegacy);

    for (const d of snapLegacy.docs) {
      const data = d.data() || {};
      const c = _normalizeCoords(data.coords);
      if (!c) continue;

      const dist = getDistanceFromLatLonInKm(
        Number(currentCoords.latitude),
        Number(currentCoords.longitude),
        Number(c.latitude),
        Number(c.longitude)
      );

      if (dist <= NEARBY_LIMIT_KM) {
        return true;
      }
    }
  } catch (e) {
    // 레거시 검사 실패 시에도 "생성 방지"가 더 안전하므로 true
    return true;
  }

  return false;
};

export const checkAndGenerateSamples = async (currentCoords) => {
  if (!currentCoords || !currentCoords.latitude) return;

  try {
    console.log("📍 샘플 데이터 지역 검사 시작...");

    // ✅ 샘플은 sample_posts로만 생성/조회
    const sampleRef = collection(db, SAMPLE_COLLECTION);

    // ✅ 레거시 샘플 중복 방지용(읽기만)
    const legacyPostsRef = collection(db, LEGACY_COLLECTION);

    const grid = _gridKey(currentCoords);
    const nowIso = new Date().toISOString();

    // ✅ 로컬 이미지 주소 변환 (chair.png)
    const localChairUri = Image.resolveAssetSource(require("../../assets/chair.png")).uri;

    // ✅ 샘플 템플릿 (sampleKey / sampleVersion / isSample 추가 + 문서ID=sampleKey)
    const templates = [
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
      },
      {
        category: "무료나눔",
        title: "🎁 안 쓰는 원목 테이블 드려요",
        content: "이사 가면서 내놓습니다. 상태 깨끗해요. 직접 가져가실 분만 채팅주세요.",
        price: 0,
        pricePerPerson: 0,
        maxParticipants: 1,
        currentParticipants: 0,
        location: "우리동네 공원",
        pickup_point: "공원 벤치",
        // ✅ 로컬 이미지 적용
        images: ["https://images.pexels.com/photos/2092058/pexels-photo-2092058.jpeg?auto=compress&cs=tinysrgb&w=600"],
        status: "나눔중",
        ownerId: "SAMPLE_DATA",
        ownerEmail: "chair@nbbang.com",
        tip: 0,
        isFree: true,
      },
    ];

    // ✅ (추가) 근처 5km 내 샘플이 이미 있으면 생성 자체를 금지(레거시 포함)
    const hasNearby = await _hasNearbySampleWithin5km(sampleRef, legacyPostsRef, currentCoords, templates);
    if (hasNearby) {
      console.log(`✅ 반경 ${NEARBY_LIMIT_KM}km 내 샘플 데이터가 이미 존재합니다. 생성을 건너뜁니다.`);
      return;
    }

    let createdCount = 0;

    for (let i = 0; i < templates.length; i++) {
      const base = templates[i];
      const catSlug = _slugify(base.category);
      const sampleKey = `sample_${grid}_${catSlug}_${i + 1}`;

      // ✅ 문서ID=sampleKey, 컬렉션=sample_posts
      const docRef = doc(db, SAMPLE_COLLECTION, sampleKey);
      const snap = await getDoc(docRef);

      // ✅ 이미 존재하면 생성하지 않음 (필요 필드만 백필 merge)
      if (snap.exists()) {
        const d = snap.data() || {};
        const needsBackfill =
          d.isSample !== true ||
          String(d.sampleKey || "") !== sampleKey ||
          Number(d.sampleVersion || 0) !== SAMPLE_VERSION;

        if (needsBackfill) {
          await setDoc(
            docRef,
            {
              isSample: true,
              sampleKey,
              sampleVersion: SAMPLE_VERSION,
            },
            { merge: true }
          );
        }
        continue;
      }

      const payload = {
        ...base,
        coords: getRandomCoords(currentCoords),
        createdAt: nowIso,
        updatedAt: nowIso,
        isSample: true,
        sampleKey,
        sampleVersion: SAMPLE_VERSION,
      };

      await setDoc(docRef, payload);
      createdCount += 1;
    }

    if (createdCount > 0) {
      console.log(`🎉 현재 격자(${grid})에 새로운 샘플 데이터 ${createdCount}개 생성 완료!`);
    } else {
      console.log(`✅ 현재 격자(${grid})에는 이미 샘플 데이터가 있습니다. 생성을 건너뜁니다.`);
    }
  } catch (e) {
    console.error("샘플 생성 실패:", e);
  }
};
