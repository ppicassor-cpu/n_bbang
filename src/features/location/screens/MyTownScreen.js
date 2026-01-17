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
  StatusBar
} from "react-native";
import MapView, { Polygon, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ✅ Turf 라이브러리 (없으면 크래쉬 남)
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon, multiPolygon } from "@turf/helpers";

// ✅ 아이콘
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

// ✅ 데이터 파일 (경로 정확해야 함)
import GJSON_DATA from "../../../../assets/geo/HangJeongDong.json";

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

  // ✅ [추가] 주소 검색 결과(중복 대응) 드롭다운 상태
  const [searchOptions, setSearchOptions] = useState([]);
  const [selectedSearchOption, setSelectedSearchOption] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    _getCurrentLocation();
  }, []);

  useEffect(() => {
    if (activeTab === "current") {
      _getCurrentLocation();
    } else {
      setIsVerified(false);
    }
  }, [activeTab]);

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
      _showModal("데이터 오류", geoPrepared?.reason || "행정동 데이터를 읽을 수 없습니다.");
      return false;
    }

    const first = _getFirstGeoCoord();
    if (!first) {
      geoIsWgs84Ref.current = false;
      _showModal("데이터 오류", "행정동 데이터를 읽을 수 없다 / JSON이 GeoJSON(또는 TopoJSON) 구조인지 확인");
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
      try {
        const last = await Location.getLastKnownPositionAsync({});
        if (last?.coords) coords = last.coords;
      } catch {}

      if (!coords) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = loc?.coords;
        } catch {}
      }

      if (!coords) {
        _showModal("오류", "위치를 가져올 수 없습니다.");
        return;
      }

      setMyCoords({ latitude: coords.latitude, longitude: coords.longitude });
      _focusMap(coords);

      if (activeTab === "current") {
        setTimeout(() => _findDongByCoords(coords), 100);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  const _findDongByCoords = (coords) => {
    if (!coords?.latitude || !_ensureGeoWgs84()) return;
    if (!geoPrepared?.ok) {
      _showModal("데이터 오류", geoPrepared?.reason || "행정동 데이터를 읽을 수 없습니다.");
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
        const baseCoords = activeTab === "search" && searchCoords ? searchCoords : coords;
        _checkVerification(baseCoords, found);
        _focusMap(coords);
      } else {
        setSelectedDong(null);
        setIsVerified(false);
        _showModal("알림", "해당 위치의 행정동 정보를 찾을 수 없습니다.");
      }
    } catch (e) {
      console.warn("Find Dong Error", e);
      setSelectedDong(null);
      setIsVerified(false);
      _showModal("오류", "행정동 탐색 중 오류가 발생했습니다.");
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
      const region = (addr?.region || "").trim(); // 시/도
      const cityOrCounty = (addr?.city || addr?.subregion || "").trim(); // 시/군/구
      const label = [region, cityOrCounty].filter(Boolean).join(" ").trim();
      return label || String(fallbackText || "");
    } catch {
      return String(fallbackText || "");
    }
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

      const result = await Location.geocodeAsync(q);
      if (result?.length) {
        const limited = result.slice(0, 6);
        const optionList = [];

        for (let i = 0; i < limited.length; i++) {
          const r = limited[i];
          const coords = { latitude: r.latitude, longitude: r.longitude };

          let label = q;
          try {
            const rev = await Location.reverseGeocodeAsync(coords);
            const addr = rev?.[0] || null;
            label = _formatOptionLabel(addr, q);
          } catch {}

          optionList.push({
            id: `${coords.latitude}_${coords.longitude}_${i}`,
            label,
            coords,
          });
        }

        setSearchOptions(optionList);
        const first = optionList[0] || null;
        setSelectedSearchOption(first);
        if (first?.coords) {
          _applySearchCoords(first.coords);
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

      await AsyncStorage.multiSet([
        [HOME_DONG_NAME, String(dongName)],
        [HOME_DONG_CODE, String(dongCode)],
        [HOME_DONG_VERIFIED, "true"],
        [HOME_DONG_VERIFIED_AT, new Date().toISOString()],
      ]);

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
    if (!fullName) return "지역을 선택해주세요";
    return fullName.split(" ").pop();
  };

  // ✅ [추가] 하단 시스템 버튼/홈바 겹침 방지 padding 계산
  const bottomSafePadding = useMemo(() => {
    const base = 24;
    const extra = Math.max(0, insets?.bottom || 0);
    // Android 3버튼/제스처 모두 대응: 최소 base 보장 + insets.bottom 추가
    return Math.max(base, base + extra);
  }, [insets]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        {/* 상단 헤더 & 탭 */}
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
                    placeholder="동 이름을 입력하세요 (예: 논현동)"
                    placeholderTextColor="#666"
                    value={searchText}
                    onChangeText={setSearchText}
                    returnKeyType="search"
                    onSubmitEditing={_onSearchAddress}
                  />
                </View>
                <TouchableOpacity style={styles.searchBtn} onPress={_onSearchAddress}>
                  <Text style={styles.searchBtnText}>검색</Text>
                </TouchableOpacity>
              </View>

              {(searchOptions?.length > 1) && (
                <View style={styles.dropdownWrap}>
                  <View style={styles.dropdownRight}>
                    <TouchableOpacity
                      style={styles.dropdownBtn}
                      onPress={() => setDropdownOpen((v) => !v)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.dropdownBtnText} numberOfLines={1}>
                        {selectedSearchOption?.label || "지역 선택"}
                      </Text>
                      <MaterialIcons name={dropdownOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={20} color={PRIMARY_COLOR} />
                    </TouchableOpacity>

                    {dropdownOpen && (
                      <View style={styles.dropdownList}>
                        {searchOptions.map((opt) => {
                          const isActive = selectedSearchOption?.id === opt.id;
                          return (
                            <TouchableOpacity
                              key={opt.id}
                              style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                              onPress={() => {
                                setSelectedSearchOption(opt);
                                setDropdownOpen(false);
                                if (opt?.coords) _applySearchCoords(opt.coords);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.dropdownItemText, isActive && styles.dropdownItemTextActive]} numberOfLines={1}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
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
                      {isVerified ? "인증됨" : "위치 불일치"}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.descText}>
                {isVerified
                  ? "현재 위치가 해당 동네 안에 있습니다."
                  : selectedDong
                  ? "현재 위치가 선택한 동네를 벗어났습니다."
                  : "지도를 움직이거나 검색하여 동네를 선택해주세요."}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, !isVerified && styles.confirmBtnDisabled]}
              onPress={_onSave}
              disabled={!isVerified}
              activeOpacity={0.8}
            >
              <Text style={[styles.confirmBtnText, !isVerified && { color: "#666" }]}>이 동네로 확정하기</Text>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "black" },
  container: { flex: 1 },

  // 헤더
  header: {
    backgroundColor: "black",
    paddingTop: 0,
    zIndex: 10,
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
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: "black",
  },
  dropdownRight: {
    alignItems: "flex-end",
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 180,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: "#333",
  },
  dropdownBtnText: {
    flex: 1,
    color: "white",
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
  },
  dropdownList: {
    marginTop: 8,
    width: 180,
    backgroundColor: "#1A1A1A",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    overflow: "hidden",
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

  mapWrap: { flex: 1 },
  map: { flex: 1 },

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
