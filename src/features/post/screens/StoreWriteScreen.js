// FILE: src/features/post/screens/StoreWriteScreen.js

import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import MapView, { Marker } from "react-native-maps";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../../theme";
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";

import { db, storage } from "../../../firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const CATEGORIES = ["식당/카페", "운동/헬스", "미용/뷰티", "병원/약국", "생활/편의", "학원/교육", "기타"];

export default function StoreWriteScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();

  const { user, myCoords, incrementHotplaceCount } = useAppContext();

  const { paymentType = "membership", purchaseInfo = null } = route?.params || {};

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [phone, setPhone] = useState("");
  // ✅ [추가] 홈페이지 주소 상태
  const [homepage, setHomepage] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);

  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [region, setRegion] = useState({
    latitude: myCoords?.latitude || 37.5665,
    longitude: myCoords?.longitude || 126.978,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  const [galleryVisible, setGalleryVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  const canSubmit = useMemo(() => {
    return (
      !!user &&
      name.trim().length > 0 &&
      desc.trim().length > 0 &&
      phone.trim().length > 0 &&
      images.length > 0
    );
  }, [user, name, desc, phone, images]);

  useEffect(() => {
    if (myCoords?.latitude && myCoords?.longitude) {
      setRegion((prev) => ({
        ...prev,
        latitude: myCoords.latitude,
        longitude: myCoords.longitude,
      }));
    }
  }, [myCoords]);

  const showAlert = (msg) => {
    setAlertMsg(String(msg || ""));
    setAlertVisible(true);
  };

  const ensureCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const ensureLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === "granted";
  };

  const processAndAddImage = async (uri) => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }],
        { compress: 0.4, format: ImageManipulator.SaveFormat.WEBP }
      );
      setImages((prev) => [...prev, manipResult.uri]);
    } catch (e) {
      setImages((prev) => [...prev, uri]);
    }
  };

  const openGallery = async () => {
    if (images.length >= 5) return showAlert("사진은 최대 5장까지입니다.");
    const ok = await ensureLibraryPermission();
    if (!ok) return showAlert("사진 접근 권한이 필요합니다.");
    setGalleryVisible(true);
  };

  const handleGallerySelect = async (selectedUris) => {
    if (!selectedUris || !Array.isArray(selectedUris)) return;

    let count = images.length;
    for (const uri of selectedUris) {
      if (!uri) continue;
      if (count >= 5) break;
      await processAndAddImage(uri);
      count += 1;
    }
  };

  const takePhoto = async () => {
    if (images.length >= 5) return showAlert("사진은 최대 5장까지입니다.");
    const ok = await ensureCameraPermission();
    if (!ok) return showAlert("카메라 권한이 필요합니다.");

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result?.canceled && result?.assets?.[0]?.uri) {
      await processAndAddImage(result.assets[0].uri);
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async () => {
    if (!user) throw new Error("NO_USER");
    if (!images || images.length === 0) return [];

    const urls = [];
    for (let i = 0; i < images.length; i++) {
      const uri = images[i];
      if (!uri) continue;

      const response = await fetch(uri);
      const blob = await response.blob();

      const filename = `stores/${user.uid}/${Date.now()}_${i}.webp`;
      const storageRef = ref(storage, filename);

      const metadata = { cacheControl: "public,max-age=31536000" };

      await uploadBytes(storageRef, blob, metadata);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

  const handleSubmit = async () => {
    if (loading) return;

    if (!user) return showAlert("로그인이 필요합니다.");
    if (!name.trim()) return showAlert("업체명을 입력해주세요.");
    if (!desc.trim()) return showAlert("업체 소개를 입력해주세요.");
    if (!phone.trim()) return showAlert("연락처를 입력해주세요.");
    if (images.length === 0) return showAlert("최소 1장의 사진을 등록해주세요.");

    setLoading(true);
    try {
      const imageUrls = await uploadImages();

      const now = new Date();
      const expirationDate = new Date(now.setMonth(now.getMonth() + 1));

      const newStoreData = {
        ownerId: user.uid,
        name: name.trim(),
        description: desc.trim(),
        category: selectedCategory,
        phone: phone.trim(),
        // ✅ [추가] 홈페이지 주소 저장
        homepage: homepage.trim(),
        address: address.trim(),

        location: {
          latitude: Number(region.latitude),
          longitude: Number(region.longitude),
        },

        imageUrl: imageUrls?.[0] || null,
        images: imageUrls || [],

        status: "active",
        isPremium: true,
        paymentType: paymentType,

        createdAt: new Date().toISOString(),
        expiresAt: expirationDate.toISOString(),
      };

      await addDoc(collection(db, "stores"), newStoreData);

      if (typeof incrementHotplaceCount === "function") {
        const usageType = paymentType === "single" ? "paid_extra" : "membership";
        await incrementHotplaceCount({ usageType, purchaseInfo: purchaseInfo ?? null });
      }

      Alert.alert("등록 완료", "핫플레이스 등록이 완료되었습니다!", [
        { text: "확인", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      showAlert("등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 상단 헤더 삭제됨 */}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>매장 사진 (최대 5장)</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <TouchableOpacity style={styles.imageBtn} onPress={takePhoto} activeOpacity={0.8}>
              <MaterialIcons name="camera-alt" size={24} color="grey" />
              <Text style={styles.btnText}>촬영</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.imageBtn} onPress={openGallery} activeOpacity={0.8}>
              <MaterialIcons name="photo-library" size={24} color="grey" />
              <Text style={styles.btnText}>앨범</Text>
            </TouchableOpacity>

            {images.map((uri, idx) => (
              <View key={`${uri}_${idx}`} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(idx)} activeOpacity={0.8}>
                  <MaterialIcons name="close" size={14} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.label}>업체명</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 맛있는 국밥집"
            placeholderTextColor="grey"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />

          <Text style={styles.label}>카테고리</Text>
          <View style={styles.categoryContainer}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, selectedCategory === cat && styles.catChipSelected]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catText, selectedCategory === cat && styles.catTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>업체 소개</Text>
          <TextInput
            style={[styles.input, { height: 110, textAlignVertical: "top" }]}
            placeholder="업체 소개와 N빵 유저 혜택 등을 적어주세요."
            placeholderTextColor="grey"
            multiline
            value={desc}
            onChangeText={setDesc}
          />

          <Text style={styles.label}>연락처</Text>
          <TextInput
            style={styles.input}
            placeholder="010-0000-0000"
            placeholderTextColor="grey"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          {/* ✅ [추가] 홈페이지 입력칸 */}
          <Text style={styles.label}>홈페이지 / SNS / 배달앱 주소 (선택)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://instagram.com/..."
            placeholderTextColor="grey"
            autoCapitalize="none"
            keyboardType="url"
            value={homepage}
            onChangeText={setHomepage}
          />

          <Text style={styles.label}>위치 설정</Text>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={region}
              onRegionChangeComplete={(r) => setRegion(r)}
              showsUserLocation={true}
              showsMyLocationButton={true}
            >
              <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
            </MapView>

            <View style={styles.mapOverlay}>
              <MaterialIcons name="place" size={14} color="white" />
              <Text style={styles.mapOverlayText}>지도를 움직여 핀을 매장 위치에 맞춰주세요</Text>
            </View>
          </View>

          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder="상세 주소 (예: 1층 101호)"
            placeholderTextColor="grey"
            value={address}
            onChangeText={setAddress}
          />

          <Text style={styles.infoText}>* 등록된 핫플레이스는 1개월간 노출되며 이후 자동 만료됩니다.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 하단 완료 버튼 영역 */}
      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={[styles.submitBtn, (!canSubmit || loading) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={loading || !canSubmit}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="black" />
          ) : (
            <Text style={styles.submitBtnText}>등록 완료</Text>
          )}
        </TouchableOpacity>
      </View>

      <CustomImagePickerModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        onSelect={handleGallerySelect}
        currentCount={images.length}
      />

      <CustomModal
        visible={alertVisible}
        title="알림"
        message={alertMsg}
        onConfirm={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // 기존 헤더 스타일 삭제됨

  sectionLabel: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 10, marginTop: 10 },
  label: { color: "#AAA", fontSize: 14, marginBottom: 6, marginTop: 16 },

  input: {
    backgroundColor: "#222",
    color: "white",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#333",
  },

  imageBtn: {
    width: 74,
    height: 74,
    borderColor: "#444",
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    backgroundColor: "#1A1A1A",
  },
  btnText: { color: "grey", fontSize: 11, marginTop: 4 },

  imageWrapper: { position: "relative", marginRight: 10 },
  imagePreview: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#111" },
  deleteBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 999,
    padding: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  categoryContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#222",
  },
  catChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  catText: { color: "#CCC", fontSize: 13 },
  catTextSelected: { color: "black", fontWeight: "bold" },

  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#111",
  },
  map: { flex: 1 },
  mapOverlay: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mapOverlayText: { color: "white", fontSize: 11 },

  infoText: { color: "#666", fontSize: 12, marginTop: 26, textAlign: "center" },

  // 하단 버튼 스타일 추가
  bottomArea: {
    padding: 20,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  submitBtn: {
    backgroundColor: theme.primary,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "black",
    fontSize: 16,
    fontWeight: "bold",
  },
});