// ================================================================================ 
//  FILE: src/features/location/screens/MyTownScreen.js
// ================================================================================

import React, { useState, useEffect, useRef, useMemo } from "react";
import {SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Modal,  
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Pressable
} from "react-native";
import MapView, { Polygon, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppContext } from "../../../app/providers/AppContext";
// ✅ Turf 라이브러리 (없으면 크래쉬 남)
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, multiPolygon } from "@turf/helpers";

// ✅ 아이콘
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

// ✅ 데이터 파일 (경로 정확해야 함)
import GJSON_DATA from "../../../../assets/geo/HangJeongDong.json";
import DONG_INDEX from "../../../../assets/geo/DongSearchIndex.json";

const { width } = Dimensions.get("window");
const PRIMARY_COLOR = "#CCFF00"; // 라임 그린
const BG_COLOR = "#121212"; // 딥 블랙

// ✅ [추가] AsyncStorage 저장 키 (요구사항)
const HOME_DONG_NAME = "HOME_DONG_NAME";
const HOME_DONG_CODE = "HOME_DONG_CODE";
const HOME_DONG_VERIFIED = "HOME_DONG_VERIFIED";
const HOME_DONG_VERIFIED_AT = "HOME_DONG_VERIFIED_AT";

// ✅ [수정] MapStyle을 컴포넌트 밖, 최상단으로 이동 (참조 에러 방지)
const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

// =========================================================
//  TopoJSON(Topology) -> GeoJSON Feature[] 변환 헬퍼
// =========================================================
const _isTopoLike = (data) => {
  if (!data || typeof data !== "object") return false;
  if (data.type === "Topology") return true;
  if (Array.isArray(data.arcs) && data.objects && typeof data.objects === "object") return true;
  return false;
};

const _isGeoLike = (data) => {
  if (!data || typeof data !== "object") return false;
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) return true;
  if (Array.isArray(data.features)) return true;
  return false;
};

const _topoToGeoFeatures = (topology) => {
  const arcs = Array.isArray(topology.arcs) ? topology.arcs : [];
  const transform = topology.transform || null;
  const scale = transform?.scale || [1, 1];
  const translate = transform?.translate || [0, 0];

  const decodedArcCache = new Array(arcs.length);

  const decodeArc = (arcIndex) => {
    if (decodedArcCache[arcIndex]) return decodedArcCache[arcIndex];

    const arc = arcs[arcIndex];
    let x = 0;
    let y = 0;
    const out = [];

    for (let i = 0; i < arc.length; i++) {
      const dx = arc[i][0];
      const dy = arc[i][1];
      x += dx;
      y += dy;

      const lon = translate[0] + scale[0] * x;
      const lat = translate[1] + scale[1] * y;

      out.push([lon, lat]);
    }

    decodedArcCache[arcIndex] = out;
    return out;
  };

  const arcByIndex = (i) => {
    if (i >= 0) return decodeArc(i);
    const idx = ~i;
    const a = decodeArc(idx);
    const rev = new Array(a.length);
    for (let k = 0; k < a.length; k++) rev[k] = a[a.length - 1 - k];
    return rev;
  };

  const stitchArcs = (arcIndices) => {
    const coords = [];
    for (let i = 0; i < arcIndices.length; i++) {
      const part = arcByIndex(arcIndices[i]);
      if (!part || part.length === 0) continue;

      if (coords.length === 0) {
        for (let p = 0; p < part.length; p++) coords.push(part[p]);
      } else {
        const last = coords[coords.length - 1];
        const first = part[0];
        const same = last && first && last[0] === first[0] && last[1] === first[1];
        const startIdx = same ? 1 : 0;
        for (let p = startIdx; p < part.length; p++) coords.push(part[p]);
      }
    }
    return coords;
  };

  const geomToFeatureList = (geom, inheritedProps) => {
    if (!geom) return [];

    if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      const all = [];
      for (const g of geom.geometries) {
        const props = g?.properties ? { ...inheritedProps, ...g.properties } : inheritedProps;
        const part = geomToFeatureList(g, props);
        for (const f of part) all.push(f);
      }
      return all;
    }

    const props = geom.properties ? { ...inheritedProps, ...geom.properties } : inheritedProps;

    if (geom.type === "Polygon") {
      const ringsArcs = geom.arcs || [];
      const coordinates = [];
      for (let r = 0; r < ringsArcs.length; r++) {
        const ring = stitchArcs(ringsArcs[r]);
        if (ring.length > 0) coordinates.push(ring);
      }
      return [
        {
          type: "Feature",
          properties: props,
          geometry: { type: "Polygon", coordinates },
        },
      ];
    }

    if (geom.type === "MultiPolygon") {
      const polys = geom.arcs || [];
      const coordinates = [];
      for (let p = 0; p < polys.length; p++) {
        const ringsArcs = polys[p];
        const polyCoords = [];
        for (let r = 0; r < ringsArcs.length; r++) {
          const ring = stitchArcs(ringsArcs[r]);
          if (ring.length > 0) polyCoords.push(ring);
        }
        if (polyCoords.length > 0) coordinates.push(polyCoords);
      }
      return [
        {
          type: "Feature",
          properties: props,
          geometry: { type: "MultiPolygon", coordinates },
        },
      ];
    }

    return [];
  };

  const out = [];
  const objects = topology.objects || {};
  for (const key of Object.keys(objects)) {
    const obj = objects[key];
    const props = obj?.properties ? { ...obj.properties } : {};
    const list = geomToFeatureList(obj, props);
    for (const f of list) out.push(f);
  }
  return out;
};

const _buildGeoFeatures = (data) => {
  try {
    if (_isTopoLike(data)) {
      const features = _topoToGeoFeatures(data);
      return { ok: true, features };
    }
    if (_isGeoLike(data)) {
      const features = Array.isArray(data.features) ? data.features : [];
      return { ok: true, features };
    }
    return { ok: false, features: [], reason: "행정동 데이터를 읽을 수 없다 / JSON이 GeoJSON(또는 TopoJSON) 구조인지 확인" };
  } catch (e) {
    return { ok: false, features: [], reason: `행정동 데이터를 읽을 수 없다 / JSON 파싱 오류: ${String(e?.message || e)}` };
  }
};

const MyTownScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const { saveHomeDong, verifyHomeDongByGps } = useAppContext();

  // GeoJSON 검증용 Ref
  const geoIsWgs84Ref = useRef(null);
  const geoCheckedRef = useRef(false);

  const [activeTab, setActiveTab] = useState("current");
  const [loading, setLoading] = useState(false);
  const [myCoords, setMyCoords] = useState(null);
  const [searchCoords, setSearchCoords] = useState(null);
  const [selectedDong, setSelectedDong] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", msg: "", onConfirm: null });

  // ✅ [추가] TopoJSON/GeoJSON 자동 판별 후, 실제로 사용할 features 준비
  const geoPrepared = useMemo(() => _buildGeoFeatures(GJSON_DATA), []);

  // ✅ [추가] DongSearchIndex.json (key -> entries[]) 빠른 조회용 맵 (한번만 생성)
  const dongIndexMap = useMemo(() => {
    const m = new Map();
    const arr = Array.isArray(DONG_INDEX) ? DONG_INDEX : [];

    for (let i = 0; i < arr.length; i++) {
      const it = arr[i] || {};
      const k = String(it.key || "");
      if (!k) continue;

      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return m;
  }, []);

  // ✅ [추가] adm_cd -> GeoJSON feature 빠른 조회용 맵 (features 준비되면 생성)
  const featureByAdmCd = useMemo(() => {
    const m = new Map();
    const feats = geoPrepared?.features || [];

    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const cd = f?.properties?.adm_cd;
      if (cd) m.set(String(cd), f);
    }
    return m;
  }, [geoPrepared]);

  // ✅ [추가] adm_cd2(10자리) -> GeoJSON feature 빠른 조회용 맵
  // - DongSearchIndex.json의 3번째 값(예: 2711010100)이 실제로는 adm_cd2 형태로 들어오는 케이스가 많음
  const featureByAdmCd2 = useMemo(() => {
    const m = new Map();
    const feats = geoPrepared?.features || [];

    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const cd2 = f?.properties?.adm_cd2;
      if (cd2) m.set(String(cd2), f);
    }
    return m;
  }, [geoPrepared]);

// ✅ [추가] adm_nm(공백 제거) -> GeoJSON feature 빠른 조회용 맵 (법정동 라벨 매핑용)
  const featureByAdmNm = useMemo(() => {
    const m = new Map();
    const feats = geoPrepared?.features || [];

    const norm = (s) => String(s || "").replace(/\s+/g, "").trim();

    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      const nm = norm(f?.properties?.adm_nm);
      if (nm) {
        // 중복일 수 있으나, 기본은 첫 번째 유지
        if (!m.has(nm)) m.set(nm, f);
      }
    }
    return m;
  }, [geoPrepared]);

  const _normalizeAdmCd = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return null;    
    return s;
  };

  // ✅ [추가] DongSearchIndex entry.label -> HangJeongDong feature 매칭
  const _resolveFeatureFromLabel = (label) => {
    try {
      if (!label || !geoPrepared?.ok) return null;

      const norm = (s) => String(s || "").replace(/\s+/g, "").trim();
      const raw = String(label || "").trim();

      // 1) 가장 우선: 공백 제거 후 adm_nm 완전일치
      const exact = featureByAdmNm.get(norm(raw));
      if (exact) return exact;

      // 2) 토큰 점수 기반 best-match (동명 중복 대응)
      const tokens = raw.split(/\s+/).filter(Boolean);
      if (!tokens.length) return null;

      const feats = geoPrepared?.features || [];
      let best = null;
      let bestScore = 0;

      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const admNm = String(f?.properties?.adm_nm || "");
        if (!admNm) continue;

        let score = 0;
        for (const t of tokens) {
          if (admNm.includes(t)) score += 1;
        }

        // 최소 2토큰 이상 매칭(예: "동구"+"삼정동")이면 후보로 인정
        if (score >= 2 && score > bestScore) {
          bestScore = score;
          best = f;
        }
      }

      return best;
    } catch {
      return null;
    }
  };
  // ✅ [추가] 주소 검색 결과(중복 대응) 드롭다운 상태
  const [searchOptions, setSearchOptions] = useState([]);
  const [selectedSearchOption, setSelectedSearchOption] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // ✅ [추가] 지오코딩 캐시 (adm_cd 없는 항목 선택 시)
  const geocodeCacheRef = useRef(new Map());

  // ✅ [추가] 검색 버튼 기준 드롭다운 위치 계산용
  const searchBtnRef = useRef(null);
  const [dropdownAnchor, setDropdownAnchor] = useState(null);

  // ✅ [추가] selectedDong가 없으면 인증 상태는 무조건 false
  useEffect(() => {
    if (!selectedDong) {
      setIsVerified(false);
    }
  }, [selectedDong]);

  // ✅ [추가] 검색 버튼 위치 측정(드롭다운을 검색 버튼 바로 밑에 띄우기 위함)
  const _measureSearchBtnAnchor = () => {
    try {
      if (!searchBtnRef.current?.measureInWindow) return;
      requestAnimationFrame(() => {
        searchBtnRef.current.measureInWindow((x, y, w, h) => {
          setDropdownAnchor({ x, y, w, h });
        });
      });
    } catch {}
  };

  useEffect(() => {
    _getCurrentLocation();
  }, []);

  useEffect(() => {
    if (activeTab === "current") {
      _getCurrentLocation();
    } else {
      // ✅ search 탭 진입 시: 이전(current 탭) 선택 동이 남아있어서 "불일치"가 뜨는 걸 방지
      setSelectedDong(null);
      setIsVerified(false);

      // ✅ (선택) 검색 상태도 초기화(UX 안정화)
      setSearchCoords(null);
      setSearchOptions([]);
      setSelectedSearchOption(null);
      setDropdownOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "search") return;
    if (!myCoords) return;
    if (!selectedDong) return;

    _checkVerification(
      { latitude: myCoords.latitude, longitude: myCoords.longitude },
      selectedDong
    );
  }, [activeTab, myCoords, selectedDong]);

  // ✅ [수정] 첫 좌표는 "실제 사용 features" 기준으로 뽑기 (TopoJSON도 지원)
  const _getFirstGeoCoord = () => {
    try {
      const features = geoPrepared?.features || [];
      if (!features.length) return null;

      for (const f of features) {
        const coords = f?.geometry?.coordinates;
        const type = f?.geometry?.type;
        if (type === "Polygon" && coords?.[0]?.[0]) return coords[0][0];
        if (type === "MultiPolygon" && coords?.[0]?.[0]?.[0]) return coords[0][0][0];
      }
    } catch (e) {
      console.warn("GeoJSON Error", e);
    }
    return null;
  };

  const _ensureGeoWgs84 = () => {
    if (geoCheckedRef.current) return geoIsWgs84Ref.current === true;
    geoCheckedRef.current = true;

    if (!geoPrepared?.ok) {
      geoIsWgs84Ref.current = false;
      _showModal("데이터 오류", geoPrepared?.reason || "데이터를 읽을 수 없습니다.");
      return false;
    }

    const first = _getFirstGeoCoord();
    if (!first) {
      geoIsWgs84Ref.current = false;
      _showModal("데이터 오류", "데이터를 읽을 수 없다 / JSON이 GeoJSON(또는 TopoJSON) 구조인지 확인");
      return false;
    }

    const x = first[0];
    const y = first[1];
    const isWgs84 = Math.abs(x) <= 180 && Math.abs(y) <= 90;
    geoIsWgs84Ref.current = isWgs84;

    if (!isWgs84) {
      _showModal("좌표계 오류", "좌표가 위경도(WGS84)가 아닙니다. 변환이 필요합니다.");
      return false;
    }
    return true;
  };

  const _getCurrentLocation = async () => {
  setLoading(true);
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      _showModal("권한 필요", "위치 권한을 허용해야 이용 가능합니다.");
      return;
    }

    let coords = null;

      // ✅ 1) 최신 GPS 우선 (캐시(lastKnown)보다 현재값 먼저 시도)
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        coords = loc?.coords;
      } catch {}

      // ✅ 2) 실패 시에만 lastKnown fallback
      if (!coords) {
        try {
          const last = await Location.getLastKnownPositionAsync({});
          if (last?.coords) coords = last.coords;
        } catch {}
      }

    if (!coords) {
      _showModal("오류", "위치를 가져올 수 없습니다.");
      return;
    }

    setMyCoords({ latitude: coords.latitude, longitude: coords.longitude });
    _focusMap(coords);

    if (activeTab === "current") {
      // ✅ 최신 GPS(coords) 기준으로만 즉시 검증되게 고정 (버튼 흔들림 제거)
      setTimeout(() => _findDongByCoords(coords, coords), 100);
    }
  } catch (e) {
    console.warn(e);
  } finally {
    setLoading(false);
  }
};

  const _findDongByCoords = (coords, verifyCoordsOverride = null) => {
    if (!coords?.latitude || !_ensureGeoWgs84()) return;
    if (!geoPrepared?.ok) {
      _showModal("데이터 오류", geoPrepared?.reason || "데이터를 읽을 수 없습니다.");
      return;
    }

    try {
      const pt = point([coords.longitude, coords.latitude]);

      const found = (geoPrepared?.features || []).find((feature) => {
        const geom = feature?.geometry;
        if (!geom) return false;
        try {
          if (geom.type === "Polygon") return booleanPointInPolygon(pt, polygon(geom.coordinates));
          if (geom.type === "MultiPolygon") return booleanPointInPolygon(pt, multiPolygon(geom.coordinates));
        } catch {
          return false;
        }
        return false;
      });

      if (found) {
        setSelectedDong(found);

        // ✅ 판정 기준 좌표
        // - search 탭: 내 GPS(myCoords) 기준 유지
        // - current 탭: verifyCoordsOverride(있으면) → 없으면 coords
        const verifyCoords = verifyCoordsOverride || coords;

        const baseCoords =
          activeTab === "search" && myCoords
            ? { latitude: myCoords.latitude, longitude: myCoords.longitude }
            : verifyCoords;

        _checkVerification(baseCoords, found);
        _focusMap(coords);
      } else {
        setSelectedDong(null);
        setIsVerified(false);
        _showModal("알림", "해당 위치의 정보를 찾을 수 없습니다.");
      }
    } catch (e) {
      console.warn("Find Dong Error", e);
      setSelectedDong(null);
      setIsVerified(false);
      _showModal("오류", "탐색 중 오류가 발생했습니다.");
    }
  };

  const _checkVerification = (currentCoords, targetDong) => {
    if (!currentCoords || !targetDong) {
      setIsVerified(false);
      return;
    }
    try {
      const pt = point([currentCoords.longitude, currentCoords.latitude]);
      const geom = targetDong.geometry;
      let inside = false;

      if (geom.type === "Polygon") inside = booleanPointInPolygon(pt, polygon(geom.coordinates));
      else if (geom.type === "MultiPolygon") inside = booleanPointInPolygon(pt, multiPolygon(geom.coordinates));

      setIsVerified(Boolean(inside));
    } catch {
      setIsVerified(false);
    }
  };

  const _applySearchCoords = (coords) => {
    if (!coords) return;
    setSearchCoords(coords);
    _focusMap(coords);
    _findDongByCoords(coords);
  };

    const _formatOptionLabel = (addr, fallbackText) => {
    try {
      // ✅ region/city/subregion이 비어있을 때도 라벨이 최대한 구체적으로 나오도록 보강
      const region = String(addr?.region || "").trim(); // 시/도
      const cityOrCounty = String(addr?.city || addr?.subregion || "").trim(); // 시/군/구

      const district = String(
        addr?.district || addr?.county || addr?.municipality || ""
      ).trim(); // 기기/플랫폼에 따라 내려오는 추가 행정단위

      const street = String(addr?.street || "").trim();
      const name = String(addr?.name || "").trim();

      const label = [region, cityOrCounty, district]
        .filter(Boolean)
        .join(" ")
        .trim();

      // label이 비면 street/name까지 fallback으로 붙임 (드롭다운에서 구분 가능하게)
      const fallback = [region, cityOrCounty, district, street, name]
        .filter(Boolean)
        .join(" ")
        .trim();

      return label || fallback || String(fallbackText || "");
    } catch {
      return String(fallbackText || "");
    }
  };

  // =========================================================
  // ✅ [추가] HangJeongDong.json 기반 "동 이름 검색" (중복 후보 100% 리스트업)
  // =========================================================
  const _normalizeDongQuery = (q) => {
    const raw = String(q || "").trim();
    // 공백 제거 + 끝의 '동/읍/면'은 입력이 있든 없든 매칭되게 처리
    const noSpace = raw.replace(/\s+/g, "");
    return noSpace;
  };

  const _getDongTokenFromAdmNm = (admNm) => {
    const full = String(admNm || "").trim();
    if (!full) return "";
    // 보통 "시/도 구/군 동/읍/면" 형태 → 마지막 토큰이 동 이름
    const tokens = full.split(/\s+/).filter(Boolean);
    return String(tokens[tokens.length - 1] || "").trim();
  };

  const _calcFeatureCenter = (feature) => {
    try {
      const geom = feature?.geometry;
      if (!geom?.type || !geom?.coordinates) return null;

      // Polygon: coordinates[0] (outer ring)
      // MultiPolygon: coordinates[0][0] (첫 polygon의 outer ring)
      const ring =
        geom.type === "Polygon"
          ? geom.coordinates?.[0]
          : geom.type === "MultiPolygon"
          ? geom.coordinates?.[0]?.[0]
          : null;

      if (!Array.isArray(ring) || ring.length < 2) return null;

      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;

      for (const c of ring) {
        const lon = c?.[0];
        const lat = c?.[1];
        if (typeof lon !== "number" || typeof lat !== "number") continue;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      if (!isFinite(minLon) || !isFinite(minLat) || !isFinite(maxLon) || !isFinite(maxLat)) return null;

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLon + maxLon) / 2,
      };
    } catch {
      return null;
    }
  };

  // ✅ [추가] adm_cd 없는 항목 선택 시 지오코딩(주소 -> 좌표) fallback
  const _geocodeToCoords = async (label) => {
    try {
      const q = String(label || "").trim();
      if (!q) return null;

      const cached = geocodeCacheRef.current.get(q);
      if (cached) return cached;

      const geocoded = await Location.geocodeAsync(q);
      if (Array.isArray(geocoded) && geocoded.length > 0) {
        const { latitude, longitude } = geocoded[0] || {};
        if (typeof latitude === "number" && typeof longitude === "number") {
          const coords = { latitude, longitude };
          geocodeCacheRef.current.set(q, coords);
          return coords;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  // ✅ [수정] 검색 결과 선택 핸들러
  const _handleSelectSearchOption = async (opt) => {
    try {
      setSelectedSearchOption(opt);
      setDropdownOpen(false);

      // =========================================================
      // CASE A: feature가 이미 있으면 그대로 사용 (폴리곤 + 중심점 이동)
      // =========================================================
      if (opt?.feature) {
        const feature = opt.feature;
        const center = opt?.coords || _calcFeatureCenter(feature);

        if (center) {
          setSearchCoords(center);
          _focusMap(center);
        }

        setSelectedDong(feature);

        if (myCoords) {
          _checkVerification(
            { latitude: myCoords.latitude, longitude: myCoords.longitude },
            feature
          );
        } else {
          setIsVerified(false);
        }

        return;
      }

      // =========================================================
      // CASE A-2: adm_cd가 존재함 -> featureByAdmCd에서 재조회
      // =========================================================
      if (opt?.adm_cd) {
        const admCd = _normalizeAdmCd(opt.adm_cd);
        const feature = admCd ? featureByAdmCd.get(admCd) : null;

        if (feature) {
          const center = opt?.coords || _calcFeatureCenter(feature);

          if (center) {
            setSearchCoords(center);
            _focusMap(center);
          }

          setSelectedDong(feature);

          if (myCoords) {
            _checkVerification(
              { latitude: myCoords.latitude, longitude: myCoords.longitude },
              feature
            );
          } else {
            setIsVerified(false);
          }

          return;
        }
      }

      // =========================================================
      // CASE A-3: DongSearchIndex의 bjd_cd(10자리) -> HangJeongDong의 adm_cd2로 feature 재조회
      // =========================================================
      if (opt?.bjd_cd) {
        const cd2 = String(opt.bjd_cd || "").trim();
        const feature = cd2 ? featureByAdmCd2.get(cd2) : null;

        if (feature) {
          const center = opt?.coords || _calcFeatureCenter(feature);

          if (center) {
            setSearchCoords(center);
            _focusMap(center);
          }

          setSelectedDong(feature);

          if (myCoords) {
            _checkVerification(
              { latitude: myCoords.latitude, longitude: myCoords.longitude },
              feature
            );
          } else {
            setIsVerified(false);
          }

          return;
        }
      }

      // =========================================================
      // CASE B: adm_cd 없음 -> 지오코딩 + 폴리곤 OFF
      // =========================================================
      const coords = await _geocodeToCoords(opt?.label);
      if (coords) {
        setSearchCoords(coords);
        _focusMap(coords);

        // ✅ 핵심: 폴리곤 끄기 + 인증 끄기
        setSelectedDong(null);
        setIsVerified(false);
      } else {
        setSelectedDong(null);
        setIsVerified(false);
        _showModal("검색 실패", "위치를 검색할 수 없습니다.");
      }
    } catch {
      setSelectedDong(null);
      setIsVerified(false);
      _showModal("오류", "위치 이동 중 문제가 발생했습니다.");
    }
  };

  const _buildDongOptionsFromGeo = (q) => {
    const query = _normalizeDongQuery(q);
    if (!query) return [];
    if (!geoPrepared?.ok) return [];

    const qKey = query;
    const out = [];

    const seenAdmCd = new Set();
    const seenLabelNoAdm = new Set();

    let entries = [];

    // ✅ 1) 기존 배열 구조([{key,label,adm_cd,...}, ...]) 지원
    if (Array.isArray(DONG_INDEX)) {
      entries = dongIndexMap?.get(qKey) || [];

      // 2) 정확 매칭이 없으면 부분 매칭(너무 많은 경우 대비 제한)
      if (!entries.length) {
        const arr = Array.isArray(DONG_INDEX) ? DONG_INDEX : [];
        const temp = [];
        const LIMIT = 300;

        for (let i = 0; i < arr.length; i++) {
          const it = arr[i] || {};
          const k = String(it.key || "");
          if (!k) continue;
          if (k.includes(qKey)) {
            temp.push(it);
            if (temp.length >= LIMIT) break;
          }
        }
        entries = temp;
      }
    }

    // ✅ 2) 압축 구조({v,labels,keys}) 지원: keys[key] = [[adm_cd,labelId,bjd_cd], ...]
    if (
      !entries.length &&
      DONG_INDEX &&
      typeof DONG_INDEX === "object" &&
      Array.isArray(DONG_INDEX.labels) &&
      (DONG_INDEX.keys || DONG_INDEX.index)
    ) {
      const labels = Array.isArray(DONG_INDEX.labels) ? DONG_INDEX.labels : [];
      const keysObj =
        (DONG_INDEX.keys && typeof DONG_INDEX.keys === "object")
          ? DONG_INDEX.keys
          : (DONG_INDEX.index && typeof DONG_INDEX.index === "object")
          ? DONG_INDEX.index
          : {};

      const _rowToEntry = (row, k) => {
        const a0 = row?.[0];
        const a1 = row?.[1];
        const a2 = row?.[2];

        let lid = null;
        let adm_cd = "";
        let bjd_cd = "";

        // 케이스 1) [labelId, adm_cd, bjd_cd] (실제 파일에서 흔함)
        if (typeof a0 === "number" && labels[a0] != null) {
          lid = a0;
          adm_cd = a1 != null ? String(a1) : "";
          bjd_cd = a2 != null ? String(a2) : "";
        }
        // 케이스 2) [adm_cd, labelId, bjd_cd]
        else if (typeof a1 === "number" && labels[a1] != null) {
          lid = a1;
          adm_cd = a0 != null ? String(a0) : "";
          bjd_cd = a2 != null ? String(a2) : "";
        }
        // 예외: 판별 불가하면 기존 가정 유지
        else {
          adm_cd = a0 != null ? String(a0) : "";
          lid = typeof a1 === "number" ? a1 : null;
          bjd_cd = a2 != null ? String(a2) : "";
        }

        const label =
          (typeof lid === "number" && labels[lid] != null) ? String(labels[lid]) : "";

        return { key: k, label, adm_cd: adm_cd || null, bjd_cd: bjd_cd || null };
      };

      const list = Array.isArray(keysObj[qKey]) ? keysObj[qKey] : [];
      entries = list.map((row) => _rowToEntry(row, qKey));

      if (!entries.length) {
        const temp = [];
        const LIMIT = 300;
        const allKeys = Object.keys(keysObj);

        for (let i = 0; i < allKeys.length; i++) {
          const k = String(allKeys[i] || "");
          if (!k) continue;
          if (k.includes(qKey)) {
            const rows = Array.isArray(keysObj[k]) ? keysObj[k] : [];
            for (let r = 0; r < rows.length; r++) {
              temp.push(_rowToEntry(rows[r], k));
              if (temp.length >= LIMIT) break;
            }
          }
          if (temp.length >= LIMIT) break;
        }
        entries = temp;
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const it = entries[i] || {};

      let admCd = it.adm_cd != null ? _normalizeAdmCd(it.adm_cd) : null;
      if (admCd === "") admCd = null;

      const label = String(it.label || it.key || query).trim();
      const bjdCd = it.bjd_cd != null ? String(it.bjd_cd) : null;

      // =========================================================
      // CASE A: adm_cd 존재 -> GeoJSON 폴리곤 + 중심점 좌표로 옵션 생성
      // =========================================================
      if (admCd) {
        const feature = featureByAdmCd.get(admCd);
        if (!feature) continue;

        if (seenAdmCd.has(admCd)) continue;
        seenAdmCd.add(admCd);

        const center = _calcFeatureCenter(feature);
        if (!center) continue;

        out.push({
          id: `${admCd}_${i}`,
          label,
          coords: center,
          feature,
          adm_cd: admCd,
          bjd_cd: bjdCd,
        });
        continue;
      }

      // =========================================================
      // CASE B: adm_cd 없음 -> 지오코딩으로 센터링만 할 옵션 생성(폴리곤 없음)
      // =========================================================
      if (bjdCd) {
        const feature = featureByAdmCd2.get(String(bjdCd));
        if (feature) {
          const center = _calcFeatureCenter(feature);
          if (center) {
            const cd = feature?.properties?.adm_cd ? String(feature.properties.adm_cd) : null;
            out.push({
              id: `${cd || bjdCd}_${i}`,
              label,
              coords: center,
              feature,
              adm_cd: cd,
              bjd_cd: bjdCd,
            });
            continue;
          }
        }
      }

      // =========================================================
      // CASE C: feature를 못 찾으면 지오코딩으로 센터링만 할 옵션 생성(폴리곤 없음)
      // =========================================================
      const labelKey = String(label || "").trim();
      if (!labelKey) continue;

      if (seenLabelNoAdm.has(labelKey)) continue;
      seenLabelNoAdm.add(labelKey);

      out.push({
        id: `NOADM_${i}`,
        label,
        coords: null,
        feature: null,
        adm_cd: null,
        bjd_cd: bjdCd,
      });
    }

    out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return out;
  };

  const _onSearchAddress = async () => {
    const q = (searchText || "").trim();
    if (!q) {
      _showModal("입력 필요", "동 이름을 입력해주세요.");
      return;
    }
    if (!_ensureGeoWgs84()) return;

    setLoading(true);
    try {
      setSearchOptions([]);
      setSelectedSearchOption(null);
      setDropdownOpen(false);

      // =========================================================
      // ✅ [교체] OS 지오코더가 아니라 HangJeongDong.json에서 직접 후보를 만든다
      // =========================================================
      const optionList = _buildDongOptionsFromGeo(q);

      if (optionList.length) {
        setSearchOptions(optionList);

        // ✅ 중복(2개 이상)일 때: 자동 이동 금지 + 드롭다운 자동 오픈 (100% 동작)
        if (optionList.length === 1) {
          const only = optionList[0] || null;
          setSelectedSearchOption(only);

          if (only?.adm_cd && only?.feature) {
            const center = only?.coords || _calcFeatureCenter(only.feature);

            if (center) {
              setSearchCoords(center);
              _focusMap(center);
            }

            setSelectedDong(only.feature);

            if (myCoords) {
              _checkVerification(
                { latitude: myCoords.latitude, longitude: myCoords.longitude },
                only.feature
              );
            } else {
              setIsVerified(false);
            }
          } else {
            // ✅ adm_cd가 없으면 지오코딩으로 센터링만
            const coords = await _geocodeToCoords(only?.label);
            if (coords) {
              setSearchCoords(coords);
              _focusMap(coords);

              setSelectedDong(null);
              setIsVerified(false);
            } else {
              setSelectedDong(null);
              setIsVerified(false);
              _showModal("검색 실패", "위치를 검색할 수 없습니다.");
            }
          }
        } else {
          setSelectedSearchOption(null);

          _measureSearchBtnAnchor();
          setDropdownOpen(true);

          // 중복 후보는 사용자가 고르게 해야 하므로, 현재 선택/인증은 초기화
          setSelectedDong(null);
          setIsVerified(false);

          // ✅ 자동 이동 금지: map 이동/selectedDong 세팅 하지 않음
          // (사용자가 드롭다운에서 하나 선택하면 그때 이동)
        }
      } else {
        setSelectedDong(null);
        setIsVerified(false);
        _showModal("검색 실패", "정확한 동 이름을 입력해주세요.");
      }
    } catch {
      _showModal("오류", "검색 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const _focusMap = (coords) => {
    if (!coords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      600
    );
  };

  // ✅ [수정] 저장 요구사항: 4개 키를 AsyncStorage에 각각 저장
  const _onSave = async () => {
  if (!isVerified || !selectedDong) return;

  try {
    const fullName = selectedDong?.properties?.adm_nm || "";
    const dongName = fullName ? fullName.split(" ").pop() : "";
    const dongCode = selectedDong?.properties?.adm_cd ? String(selectedDong.properties.adm_cd) : "";

    // ✅ 1) 확정할 때 "미인증으로 리셋" 금지 (AppContext에서 리셋 제거됨)
    await saveHomeDong({ dongName, dongCode, featureId: null });

    // ✅ 2) 확정 직후 인증은 "최신 GPS"로 강제 갱신해서 같은 기준으로 즉시 저장/반영
    await verifyHomeDongByGps({ polygon: selectedDong?.geometry, forceFresh: true });

    _showModal("완료", "동네 설정이 저장되었습니다.", () => navigation.goBack());
  } catch {
    _showModal("오류", "저장에 실패했습니다.");
  }
};

  const _showModal = (title, msg, onConfirm = null) => {
    setModalConfig({ title, msg, onConfirm });
    setModalVisible(true);
  };

  const _renderPolygonCoords = () => {
    if (!selectedDong?.geometry) return [];
    try {
      const geom = selectedDong.geometry;
      if (geom.type === "Polygon") {
        return geom.coordinates[0].map((c) => ({ longitude: c[0], latitude: c[1] }));
      }
      if (geom.type === "MultiPolygon") {
        return geom.coordinates[0][0].map((c) => ({ longitude: c[0], latitude: c[1] }));
      }
    } catch {}
    return [];
  };

  const _getDongLabel = () => {
    const fullName = selectedDong?.properties?.adm_nm || "";
    if (!fullName) return "주소를 검색해주세요";
    return fullName.split(" ").pop();
  };

  // ✅ [추가] 하단 시스템 버튼/홈바 겹침 방지 padding 계산
  const bottomSafePadding = useMemo(() => {
    const base = 24;
    const extra = Math.max(0, insets?.bottom || 0);
    // Android 3버튼/제스처 모두 대응: 최소 base 보장 + insets.bottom 추가
    return Math.max(base, base + extra);
  }, [insets]);

  const canConfirm = Boolean(isVerified && selectedDong);

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        
        {/* ✅ [수정] paddingTop: insets.top 제거 -> 상단 여백을 없애서 위로 딱 붙임 */}
        <View style={styles.header}>          
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === "current" && styles.tabItemActive]}
              onPress={() => setActiveTab("current")}
            >
              <Text style={[styles.tabText, activeTab === "current" && styles.tabTextActive]}>현재 위치로</Text>
              {activeTab === "current" && <View style={styles.tabIndicator} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === "search" && styles.tabItemActive]}
              onPress={() => setActiveTab("search")}
            >
              <Text style={[styles.tabText, activeTab === "search" && styles.tabTextActive]}>주소 검색</Text>
              {activeTab === "search" && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          </View>

          {activeTab === "search" && (
            <>
              <View style={styles.searchContainer}>
                <View style={styles.inputWrapper}>
                  <Ionicons name="search" size={20} color="#666" />
                  <TextInput
                    style={styles.input}
                    placeholder="동 이름을 입력하세요 (예: 중앙동)"
                    placeholderTextColor="#666"
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType="search"
                    onSubmitEditing={_onSearchAddress}
                  />
                </View>
                <TouchableOpacity
                  ref={searchBtnRef}
                  collapsable={false}
                  style={styles.searchBtn}
                  onPress={_onSearchAddress}
                >
                  <Text style={styles.searchBtnText}>검색</Text>
                </TouchableOpacity>
              </View>
              
              {dropdownOpen && (
                <Modal
                  visible={dropdownOpen}
                  transparent
                  animationType="none"
                  onRequestClose={() => setDropdownOpen(false)}
                >
                  <Pressable
                    style={styles.dropdownBackdrop}
                    onPress={() => setDropdownOpen(false)}
                  >
                    <Pressable
                      style={[
                        styles.dropdownPanel,
                        dropdownAnchor
                          ? {
                              top: dropdownAnchor.y + dropdownAnchor.h + 48,
                              right: Math.max(16, width - (dropdownAnchor.x + dropdownAnchor.w)),
                            }
                          : null,
                      ]}
                      onPress={() => {}}
                    >
                      <View style={styles.dropdownList}>
                        <ScrollView
                          style={styles.dropdownScroll}
                          contentContainerStyle={styles.dropdownScrollContent}
                          showsVerticalScrollIndicator={true}
                          nestedScrollEnabled={true}
                          keyboardShouldPersistTaps="handled"
                        >
                          {searchOptions.map((opt) => {
                            const isActive = selectedSearchOption?.id === opt.id;

                            return (
                              <TouchableOpacity
                                key={opt.id}
                                style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                                onPress={() => {
                                  _handleSelectSearchOption(opt);
                                }}
                                activeOpacity={0.8}
                              >
                                <Text
                                  style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]}
                                  numberOfLines={1}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    </Pressable>
                  </Pressable>
                </Modal>
              )}

            </>
          )}
        </View>

        {/* 지도 */}
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            customMapStyle={MAP_STYLE}
            initialRegion={{ latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
            showsCompass={true}
            scrollEnabled={!dropdownOpen}
            zoomEnabled={!dropdownOpen}
            rotateEnabled={!dropdownOpen}
            pitchEnabled={!dropdownOpen}
            
            // ✅ [추가] 핀 선택 시 구글 버튼바(길찾기 등) 숨기기 (안드로이드 필수)
            toolbarEnabled={false} 
            // ✅ [추가] 기본 내장 GPS 버튼 숨기기 (커스텀 버튼을 사용하므로)
            showsMyLocationButton={false} 
          >
            {selectedDong && (
              <Polygon
                coordinates={_renderPolygonCoords()}
                fillColor="rgba(141, 251, 67, 0.2)"
                strokeColor={PRIMARY_COLOR}
                strokeWidth={2}
              />
            )}
            {myCoords && <Marker coordinate={myCoords} title="내 위치" pinColor={PRIMARY_COLOR} />}
            {searchCoords && activeTab === "search" && <Marker coordinate={searchCoords} title="검색 위치" />}
          </MapView>

          {/* ✅ [추가] 수동 GPS 갱신 버튼 (현재 위치 탭일 때만 표시) */}
          {activeTab === "current" && (
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={() => {
                _getCurrentLocation(); // GPS 갱신 및 내 위치로 이동 함수 재호출
              }}
              activeOpacity={0.8}
            >
              {/* 로딩 중이면 스피너, 아니면 아이콘 표시 */}
              {loading ? (
                <ActivityIndicator size="small" color={PRIMARY_COLOR} />
              ) : (
                <MaterialIcons name="my-location" size={24} color={PRIMARY_COLOR} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* 하단 패널 */}
        <View style={styles.bottomPanel}>
          <View style={[styles.panelContent, { paddingBottom: bottomSafePadding }]}>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>선택된 지역</Text>
              <View style={styles.dongNameRow}>
                <Text style={styles.dongName}>{_getDongLabel()}</Text>
                {/* 인증 상태 배지 */}
                {selectedDong && (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        borderColor: isVerified ? PRIMARY_COLOR : "#F44336",
                        backgroundColor: isVerified ? "rgba(141, 251, 67, 0.1)" : "rgba(244, 67, 54, 0.1)",
                      },
                    ]}
                  >
                    <Ionicons
                      name={isVerified ? "checkmark-circle" : "alert-circle"}
                      size={14}
                      color={isVerified ? PRIMARY_COLOR : "#F44336"}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.statusText, { color: isVerified ? PRIMARY_COLOR : "#F44336" }]}>
                      {isVerified ? "인증가능" : "위치 불일치"}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.descText}>
                {isVerified
                  ? "현재 위치가 해당 동네 안에 있습니다."
                  : selectedDong
                  ? "현재 위치가 선택한 동네를 벗어났습니다."
                  : "주소를 검색하여 동네를 선택해주세요."}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={_onSave}
              disabled={!canConfirm}
              activeOpacity={0.8}
            >
              <Text style={[styles.confirmBtnText, !canConfirm && { color: "#666" }]}>이 동네로 확정하기</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 모달 */}
        <Modal visible={modalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{modalConfig.title}</Text>
              <Text style={styles.modalMsg}>{modalConfig.msg}</Text>
              <TouchableOpacity
                style={styles.modalBtn}
                onPress={() => {
                  setModalVisible(false);
                  if (modalConfig.onConfirm) modalConfig.onConfirm();
                }}
              >
                <Text style={styles.modalBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "black" },
  container: { flex: 1 },

  // 헤더
  header: {
    backgroundColor: "black",
    zIndex: 10,
    elevation: 10,
    position: "relative", // ✅ Android에서 드롭다운 터치가 맵으로 새는 것 방지
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 50,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  backBtn: { padding: 4 },

  // 탭
  tabBar: {
    flexDirection: "row",
    marginTop: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  tabText: {
    color: "#666",
    fontSize: 15,
    fontWeight: "600",
  },
  tabTextActive: {
    color: PRIMARY_COLOR,
    fontWeight: "bold",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: "60%",
    height: 3,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 2,
  },

  // 검색창
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "black",
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: "#333",
  },
  input: {
    flex: 1,
    marginLeft: 8,
    color: "white",
    fontSize: 15,
  },
  searchBtn: {
    marginLeft: 12,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  searchBtnText: {
    color: PRIMARY_COLOR,
    fontSize: 16,
    fontWeight: "bold",
  },

  // 드롭다운
    dropdownWrap: {
    position: "absolute",   // ✅ 레이아웃 밀지 않음 (지도 내려감 방지)
    top: 44,            // ✅ header(검색탭 영역) 바로 아래에 붙임
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: "transparent",
    zIndex: 9999,
    elevation: 9999,
  },
  dropdownBtn: {
    width: 260,
    height: 42,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  dropdownBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownRight: {
    alignItems: "flex-end",
    position: "relative",
  },

  dropdownListOverlay: {
    position: "absolute",
    top: 44,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },

  dropdownList: {
    width: 260,
    maxHeight: 300,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    overflow: "hidden",
  },

  dropdownScrollContent: {
    paddingVertical: 0,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(204,255,0,0.12)",
  },
  dropdownItemText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },

  dropdownItemTextActive: {
    color: PRIMARY_COLOR,
  },

  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "transparent",
  },

  dropdownPanel: {
    position: "absolute",
    top: 88,
    right: 16,
    width: 260,
  },

  mapWrap: { flex: 1, position: "relative" }, // ✅ position: relative 명시 (안전장치)
  map: { flex: 1 },

  // ✅ [추가] GPS 갱신 버튼 스타일
  gpsBtn: {
    position: "absolute",
    bottom: 20, // 하단 패널 위로 적당히 띄움
    right: 20,  // 우측 여백
    width: 48,
    height: 48,
    borderRadius: 24, // 원형
    backgroundColor: "#222", // 다크 그레이 배경
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    // 그림자 (입체감)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6, // 안드로이드 그림자
    zIndex: 20,
  },

  // 하단 패널 (디자인 개선)
  bottomPanel: {
    backgroundColor: BG_COLOR,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  panelContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  locationInfo: { marginBottom: 24 },
  locationLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    letterSpacing: 1,
  },
  dongNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dongName: {
    color: "white",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  descText: {
    color: "#666",
    fontSize: 14,
    lineHeight: 20,
  },

  // 확정 버튼
  confirmBtn: {
    backgroundColor: PRIMARY_COLOR,
    height: 56,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#222",
    borderWidth: 1,
    borderColor: "#333",
  },
  confirmBtnText: {
    color: "black",
    fontSize: 17,
    fontWeight: "bold",
  },

  // 모달
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", backgroundColor: "#222", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#333" },
  modalTitle: { color: "white", fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  modalMsg: { color: "#CCC", textAlign: "center", marginBottom: 24, lineHeight: 22 },
  modalBtn: { backgroundColor: PRIMARY_COLOR, width: "100%", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  modalBtnText: { color: "black", fontWeight: "bold", fontSize: 16 },

  loader: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
});

export default MyTownScreen;
