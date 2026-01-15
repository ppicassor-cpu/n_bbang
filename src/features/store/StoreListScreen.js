// FILE: src/features/post/screens/StoreWriteScreen.js

import React, { useState, useEffect } from "react";
import { 
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, 
  Image, KeyboardAvoidingView, Platform, Alert, ActivityIndicator 
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator"; // ✅ 압축 필수 라이브러리
import MapView, { Marker } from "react-native-maps";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../../theme";
// ✅ incrementHotplaceCount 가져오기
import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal"; 

// Firebase 관련
import { auth, db, storage } from "../../../firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// 업종 카테고리 예시
const CATEGORIES = ["식당/카페", "운동/헬스", "미용/뷰티", "병원/약국", "생활/편의", "학원/교육", "기타"];

export default function StoreWriteScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  
  // ✅ incrementHotplaceCount 함수 가져오기
  const { user, currentLocation, myCoords, incrementHotplaceCount } = useAppContext();
  
  // 이전 화면(모달)에서 넘겨준 결제 타입 ('membership' 또는 'single')
  const { paymentType = 'membership', purchaseInfo = null } = route.params || {};

  // 입력 상태 관리
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(""); // 상세 주소 입력
  const [selectedCategory, setSelectedCategory] = useState("식당/카페");
  
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 지도 위치 상태
  const [region, setRegion] = useState({
    latitude: myCoords?.latitude || 37.5665,
    longitude: myCoords?.longitude || 126.9780,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  // 모달 상태
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  // 초기 위치 설정
  useEffect(() => {
    if (myCoords) {
      setRegion((prev) => ({
        ...prev,
        latitude: myCoords.latitude,
        longitude: myCoords.longitude
      }));
    }
  }, [myCoords]);

  const showAlert = (msg) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  };

  // ✅ 이미지 압축 및 추가 로직 (WebP, 600px, 0.4)
  const processAndAddImage = async (uri) => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }], 
        { compress: 0.4, format: ImageManipulator.SaveFormat.WEBP }
      );
      setImages((prev) => [...prev, manipResult.uri]);
    } catch (e) {
      console.warn("Image compression failed:", e);
      // 실패 시 원본이라도 넣음
      setImages((prev) => [...prev, uri]);
    }
  };

  const openGallery = () => {
    if (images.length >= 5) return showAlert("사진은 최대 5장까지입니다.");
    setGalleryVisible(true);
  };

  const handleGallerySelect = async (selectedUris) => {
    if (!selectedUris) return;

    let count = images.length;
    for (const uri of selectedUris) {
      if (count >= 5) break;
      await processAndAddImage(uri);
      count += 1;
    }
  };

  const takePhoto = async () => {
    if (images.length >= 5) return showAlert("사진은 최대 5장까지입니다.");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return showAlert("카메라 권한이 필요합니다.");
    
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      await processAndAddImage(result.assets[0].uri);
    }
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  // ✅ Firebase Storage 업로드
  const uploadImages = async () => {
    if (images.length === 0) return [];
    if (!user) throw new Error("NO_USER");

    const urls = [];
    for (let i = 0; i < images.length; i++) {
      const uri = images[i];
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // 경로: stores/{uid}/{timestamp}_{index}.webp
      const filename = `stores/${user.uid}/${Date.now()}_${i}.webp`;
      const storageRef = ref(storage, filename);
      
      // 메타데이터 설정 (캐시 1년)
      const metadata = { cacheControl: 'public,max-age=31536000' };
      
      await uploadBytes(storageRef, blob, metadata);
      const url = await getDownloadURL(storageRef);
      urls.push(url);
    }
    return urls;
  };

  // ✅ 최종 등록 핸들러
  const handleSubmit = async () => {
    if (!name.trim()) return showAlert("업체명을 입력해주세요.");
    if (!desc.trim()) return showAlert("업체 소개를 입력해주세요.");
    if (!phone.trim()) return showAlert("연락처를 입력해주세요.");
    if (images.length === 0) return showAlert("최소 1장의 사진을 등록해주세요.");

    setLoading(true);
    try {
      // 1. 이미지 업로드
      const imageUrls = await uploadImages();

      // 2. 유효기간 설정 (현재 + 1달)
      const now = new Date();
      const expirationDate = new Date(now.setMonth(now.getMonth() + 1));

      // 3. Firestore 데이터 생성
      const newStoreData = {
        ownerId: user.uid,
        name: name,
        description: desc,
        category: selectedCategory,
        phone: phone,
        address: address, // 상세 주소 텍스트
        
        // 지도 좌표
        location: {
            latitude: region.latitude,
            longitude: region.longitude
        },
        
        imageUrl: imageUrls[0], // 대표 이미지
        images: imageUrls,      // 전체 이미지 배열
        
        status: "active",       // 활성 상태
        isPremium: true,        // 핫플레이스는 기본적으로 강조 표시
        paymentType: paymentType, // membership or single
        
        createdAt: serverTimestamp(),
        expiresAt: expirationDate.toISOString(), // 1달 뒤 만료
      };

      await addDoc(collection(db, "stores"), newStoreData);

      // ✅ 4. 카운트 증가 및 기록 (멤버십 차감 or 추가 결제 기록)
      // route params로 “paid_extra vs membership” + purchaseInfo를 받아서
      // 글 등록 성공 후 incrementHotplaceCount에 그대로 넘김
      if (typeof incrementHotplaceCount === 'function') {
        const usageType = paymentType === "single" ? "paid_extra" : "membership";
        await incrementHotplaceCount({ usageType, purchaseInfo: purchaseInfo ?? null }); 
      }

      Alert.alert("등록 완료", "핫플레이스 등록이 완료되었습니다!", [
        { text: "확인", onPress: () => navigation.goBack() }
      ]);

    } catch (e) {
      console.error("Store Upload Error:", e);
      showAlert("등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <MaterialIcons name="close" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>핫플레이스 등록</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={loading} style={{ padding: 10 }}>
          {loading ? <ActivityIndicator color={theme.primary} /> : (
            <Text style={{ color: theme.primary, fontWeight: "bold", fontSize: 16 }}>완료</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          
          {/* 이미지 섹션 */}
          <Text style={styles.sectionLabel}>매장 사진 (최대 5장)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
              <MaterialIcons name="camera-alt" size={24} color="grey" />
              <Text style={styles.btnText}>촬영</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageBtn} onPress={openGallery}>
              <MaterialIcons name="photo-library" size={24} color="grey" />
              <Text style={styles.btnText}>앨범</Text>
            </TouchableOpacity>
            {images.map((uri, idx) => (
              <View key={idx} style={styles.imageWrapper}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(idx)}>
                   <MaterialIcons name="close" size={14} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* 입력 폼 */}
          <Text style={styles.label}>업체명</Text>
          <TextInput 
            style={styles.input} 
            placeholder="예: 맛있는 국밥집" 
            placeholderTextColor="grey"
            value={name} 
            onChangeText={setName}
          />

          <Text style={styles.label}>카테고리</Text>
          <View style={styles.categoryContainer}>
            {CATEGORIES.map((cat) => (
                <TouchableOpacity 
                    key={cat} 
                    style={[styles.catChip, selectedCategory === cat && styles.catChipSelected]}
                    onPress={() => setSelectedCategory(cat)}
                >
                    <Text style={[styles.catText, selectedCategory === cat && styles.catTextSelected]}>{cat}</Text>
                </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>업체 소개</Text>
          <TextInput 
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
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

          {/* 지도 섹션 */}
          <Text style={styles.label}>위치 설정</Text>
          <View style={styles.mapContainer}>
              <MapView
                  style={styles.map}
                  region={region}
                  onRegionChangeComplete={setRegion}
              >
                  <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
              </MapView>
              <View style={styles.mapOverlay}>
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

          <Text style={styles.infoText}>
            * 등록된 핫플레이스는 1개월간 노출되며 이후 자동 만료됩니다.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 10 },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  
  sectionLabel: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  label: { color: "#AAA", fontSize: 14, marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: "#222", color: "white", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "#333" },
  
  imageBtn: { width: 70, height: 70, borderColor: "#444", borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 },
  btnText: { color: "grey", fontSize: 11, marginTop: 4 },
  imageWrapper: { position: "relative", marginRight: 10 },
  imagePreview: { width: 70, height: 70, borderRadius: 8 },
  deleteBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, padding: 4 },
  
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: '#444', backgroundColor: '#222' },
  catChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  catText: { color: '#CCC', fontSize: 13 },
  catTextSelected: { color: 'black', fontWeight: 'bold' },

  mapContainer: { height: 200, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  map: { flex: 1 },
  mapOverlay: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  mapOverlayText: { color: 'white', fontSize: 11 },

  infoText: { color: '#666', fontSize: 12, marginTop: 30, textAlign: 'center' }
});
