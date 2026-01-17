// 파일 경로: C:\n_bbang\src\features\post\screens\WriteFreeScreen.js

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { MaterialIcons } from "@expo/vector-icons";

import { useAppContext } from "../../../app/providers/AppContext";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";
import { theme } from "../../../theme";

import { storage } from "../../../firebaseConfig";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { hasBadWord } from "../../../utils/badWordFilter";

// ✅ 안내 문구 (기존 그대로)
const DEFAULT_DESC = `나눔하실 물건 상태를 적어주세요.

예시)
- 언제 구매하신 제품인가요?
- 사용감(흠집/오염/고장 여부) 어떤가요?
- 구성품은 무엇이 포함되나요?
- 사용 기간은 어느 정도인가요?
- 나눔 사유는 무엇인가요?`;

export default function WriteFreeScreen({ navigation, route }) {
  const { addPost, updatePost, currentLocation, myCoords, posts } = useAppContext();

  // ✅ 수정 모드 데이터
  const editPostData = route?.params?.post;
  const isEditMode = !!editPostData;

  // ✅ 상태
  const [title, setTitle] = useState(isEditMode ? editPostData?.title || "" : "");
  const [content, setContent] = useState(isEditMode ? editPostData?.content || "" : DEFAULT_DESC);
  const [coords, setCoords] = useState(
    isEditMode && editPostData?.coords
      ? editPostData.coords
      : myCoords || { latitude: 37.5665, longitude: 126.9780 }
  );
  // ✅ 상세 위치(픽업 장소) 상태
  const [pickupPoint, setPickupPoint] = useState(isEditMode ? editPostData?.pickup_point || "" : "");

  const [images, setImages] = useState(isEditMode ? editPostData?.images || [] : []);

  const [loading, setLoading] = useState(false);

  // ✅ 안내/알림 모달
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  // ✅ 갤러리 모달
  const [galleryVisible, setGalleryVisible] = useState(false);

  // ✅ [구조 수정(클로저 해결)] posts를 최신으로 보는 ref
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  // ✅ 헤더 타이틀
  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "무료나눔 수정" : "무료나눔 하기",
    });
  }, [navigation, isEditMode]);

  // ✅ 앱 컨텍스트 위치값이 늦게 들어오는 경우 반영
  useEffect(() => {
    if (!isEditMode && myCoords?.latitude && myCoords?.longitude) {
      setCoords(myCoords);
    }
  }, [myCoords, isEditMode]);

  const showAlert = (msg) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  };

  const resetForm = () => {
    setTitle("");
    setContent(DEFAULT_DESC);
    setCoords(myCoords || { latitude: 37.5665, longitude: 126.9780 });
    setPickupPoint("");
    setImages([]);
  };

  // ✅ 카메라 촬영
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        showAlert("카메라 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0].uri;
        // ✅ 구조 수정: 이전 state 클로저 문제 방지(연속 추가 시 누락 방지)
        setImages((prev) => [...prev, uri]);
      }
    } catch (e) {
      showAlert("카메라 실행 중 오류가 발생했습니다.");
    }
  };

  // ✅ 갤러리 열기 (커스텀 모달)
  const openGallery = () => {
    setGalleryVisible(true);
  };

  // ✅ 갤러리에서 선택 결과 반영
  const handleGallerySelect = (selectedUris) => {
    // ✅ 구조 수정: (string | {uri}) 혼합 방지 + 빈값 제거
    const normalized = (selectedUris || [])
      .map((u) => (typeof u === "string" ? u : u?.uri))
      .filter(Boolean);

    if (normalized.length > 0) {
      // ✅ 구조 수정: 이전 state 클로저 문제 방지(연속 추가 시 누락 방지)
      setImages((prev) => [...prev, ...normalized]);
    }

    // ✅ 혹시 모달이 onClose 누락되더라도 강제로 닫아 “버튼 먹통” 방지
    setGalleryVisible(false);
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ✅ (이미지 업로드) string/url만 받도록 정규화해서 처리
  const uriToBlob = (uri) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // ✅ 구조 수정: 특정 uri에서 onload/onerror가 안 오는 “무한 대기” 방지
      const timer = setTimeout(() => {
        try {
          xhr.abort();
        } catch {}
        reject(new Error("BLOB_REQUEST_TIMEOUT"));
      }, 20000);

      xhr.onload = () => {
        clearTimeout(timer);
        resolve(xhr.response);
      };

      xhr.onerror = () => {
        clearTimeout(timer);
        reject(new Error("BLOB_REQUEST_FAILED"));
      };

      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  };

  // ✅ 업로드 전 이미지 리사이즈/압축: 720px / 0.6
  const normalizeImageForUpload = async (uri) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 720 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipulated?.uri || uri;
    } catch (e) {
      return uri;
    }
  };

  const uploadImagesIfNeeded = async (uris) => {
    const normalized = (uris || [])
      .map((u) => (typeof u === "string" ? u : u?.uri))
      .filter(Boolean);

    const uploaded = [];

    for (const uri of normalized) {
      // ✅ 이미 업로드된(원격) 이미지는 그대로 유지
      if (typeof uri === "string" && (uri.startsWith("http://") || uri.startsWith("https://"))) {
        uploaded.push(uri);
        continue;
      }

      // ✅ 로컬 파일 업로드
      const processedUri = await normalizeImageForUpload(uri);
      const blob = await uriToBlob(processedUri);
      const filename = `free_posts/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const storageRef = ref(storage, filename);

      await uploadBytes(storageRef, blob, {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=2592000",
      });
      const downloadURL = await getDownloadURL(storageRef);
      uploaded.push(downloadURL);
    }

    return uploaded;
  };

  // ✅ “진짜 반영”될 때까지 대기(업데이트 지연으로 ‘수정 안됨’처럼 보이는 현상 방지)
  const waitForUpdatedAt = (targetId, expectedUpdatedAt) => {
    return new Promise((resolve, reject) => {
      let count = 0;
      const interval = setInterval(() => {
        count += 1;

        // ✅ [구조 수정(클로저 해결)] 최신 posts를 ref로 조회
        const list = postsRef.current;
        const found = list?.find?.((p) => p?.id === targetId && p?.updatedAt === expectedUpdatedAt);

        if (found) {
          clearInterval(interval);
          resolve(true);
          return;
        }

        if (count >= 30) {
          clearInterval(interval);
          reject(new Error("UPDATE_TIMEOUT"));
        }
      }, 200);
    });
  };

  // ✅ 등록/수정
  const handleSubmit = async () => {
    // 기본 검증
    if (!title.trim()) {
      showAlert("나눔할 물건 이름을 입력해주세요.");
      return;
    }
    if (!content.trim() || content.trim() === DEFAULT_DESC.trim()) {
      showAlert("나눔 설명을 입력해주세요.");
      return;
    }
    if (!coords?.latitude || !coords?.longitude) {
      showAlert("위치를 선택해주세요.");
      return;
    }
    if (hasBadWord(title) || hasBadWord(content) || hasBadWord(pickupPoint)) {
      showAlert("부적절한 단어(욕설, 관리자 사칭 등)가 포함되어 있습니다.\n바른 말을 사용해주세요.");
      return;
    }

    setLoading(true);
    // (UI 반영을 위한 짧은 yield)
    await new Promise((r) => setTimeout(r, 150));

    // ✅ 업데이트 동기화를 위해 updatedAt 고정값 사용
    const nowIso = new Date().toISOString();

    try {
      const uploadedImages = await uploadImagesIfNeeded(images);

      const postData = {
        title: title.trim(),
        content: content.trim(),
        coords,
        location: currentLocation || "위치 미지정",
        // ✅ 상세 픽업 장소 저장
        pickup_point: pickupPoint,
        images: uploadedImages,
        isFree: true,
        // ✅ [핵심 수정] 무료나눔 분기 기준 통일용 필드 저장
        category: "무료나눔",
        updatedAt: nowIso,
        // ✅ 생성일은 수정 모드에서는 유지
        createdAt: isEditMode ? editPostData?.createdAt : nowIso,
      };

      if (isEditMode) {
        const postId = editPostData?.id;
        if (!postId) {
          showAlert("수정할 게시글 정보를 찾지 못했습니다.");
          return;
        }

        await updatePost(postId, postData);

        // ✅ “진짜 반영”될 때까지 대기 (지연으로 인한 ‘수정 안됨’ 오해 방지)
        await waitForUpdatedAt(postId, nowIso);

        showAlert("무료나눔 게시글이 수정되었습니다.");
      } else {
        const postId = await addPost(postData);

        // ✅ 등록도 동일하게 반영 대기
        if (postId) {
          await waitForUpdatedAt(postId, nowIso).catch(() => {});
        }

        showAlert("무료나눔 게시글이 등록되었습니다.");
        resetForm();
      }
    } catch (error) {
      console.log("❌ 저장 실패:", error);
      showAlert("저장에 실패했습니다.\n네트워크/권한/이미지 업로드 상태를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ 지도 탭으로 위치 변경
  const handleMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ latitude, longitude });
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* ✅ 사진 업로드 섹션을 맨 위로 위치만 이동 */}
        <Text style={styles.label}>사진 업로드</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
            <MaterialIcons name="camera-alt" size={24} color="grey" />
            <Text style={styles.btnText}>카메라</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.imageBtn} onPress={openGallery}>
            <MaterialIcons name="photo-library" size={24} color="grey" />
            <Text style={styles.btnText}>앨범</Text>
          </TouchableOpacity>

          {images.map((uri, idx) => (
            <View key={idx} style={styles.imageContainer}>
              <Image
                source={{ uri: typeof uri === "string" ? uri : uri?.uri }}
                style={styles.imagePreview}
              />
              <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(idx)}>
                <MaterialIcons name="close" size={16} color="white" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.label}>나눔할 물건 이름</Text>
        <TextInput
          style={styles.input}
          placeholder="예: 의자, 책상, 장난감"
          placeholderTextColor="#666"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>나눔 설명</Text>
        <TextInput
          // ✅ [수정] 안내 문구일 때 글자색을 흐릿하게 (#888) 처리
          style={[styles.textarea, content === DEFAULT_DESC && { color: "#888" }]}
          multiline
          placeholderTextColor="#666"
          value={content}
          onChangeText={setContent}
          // ✅ 포커스 시 예시 문구 삭제, 비우고 나가면 다시 예시 복구
          onFocus={() => {
            if (content === DEFAULT_DESC) setContent("");
          }}
          onBlur={() => {
            if (content.trim() === "") setContent(DEFAULT_DESC);
          }}
        />

        <Text style={styles.label}>나눔 위치</Text>
        <View style={styles.mapContainer}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            region={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={handleMapPress}
          >
            <Marker coordinate={coords} />
          </MapView>
        </View>

        {/* ✅ 지도 하단 설명 문구 */}
        <Text style={styles.helperText}>지도를 움직여 핀을 만날 장소에 맞춰주세요.</Text>

        {/* ✅ 상세 위치 입력창 */}
        <TextInput
          style={styles.subInput}
          placeholder="예: 스타벅스 앞, 101동 입구"
          placeholderTextColor="#666"
          value={pickupPoint}
          onChangeText={setPickupPoint}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <>
              <ActivityIndicator size="small" color="black" style={{ marginRight: 8 }} />
              <Text style={styles.submitText}>처리 중...</Text>
            </>
          ) : (
            <Text style={styles.submitText}>{isEditMode ? "수정 완료" : "나눔 등록하기"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CustomImagePickerModal
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
        onSelect={handleGallerySelect}
        max={10}
      />

      <CustomModal
        visible={alertVisible}
        message={alertMsg}
        onConfirm={() => {
          setAlertVisible(false);
          if (alertMsg.includes("수정되었습니다") || alertMsg.includes("등록되었습니다")) {
            navigation.goBack();
          }
        }}
      />

      {/* ✅ 업로드 중입니다... 모달 추가 */}
      <CustomModal visible={loading} loading={true} message="업로드 중입니다..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    padding: 20,
  },
  label: {
    color: "white",
    fontSize: 14,
    marginBottom: 6,
    marginTop: 14,
    fontWeight: "bold",
  },
  input: {
    backgroundColor: "#1E1E1E",
    color: "white",
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
  },
  textarea: {
    backgroundColor: "#1E1E1E",
    color: "white",
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    minHeight: 140,
    textAlignVertical: "top",
  },

  imageBtn: {
    width: 80,
    height: 80,
    borderColor: "#444",
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  btnText: {
    color: "grey",
    fontSize: 11,
    marginTop: 4,
  },
  imageContainer: {
    position: "relative",
    marginRight: 10,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  deleteBtn: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  mapContainer: {
    height: 150, // ✅ [수정] 지도 높이 줄임 (200 -> 150)
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 10,
  },
  // ✅ 스타일
  helperText: {
    color: "grey",
    fontSize: 12,
    marginBottom: 10,
  },
  // ✅ 상세 위치 입력창 스타일
  subInput: {
    backgroundColor: "#1E1E1E",
    color: "white",
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: "#CCFF00",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 40, // ✅ [수정] 하단 시스템 버튼과 겹치지 않도록 여백 추가
  },
  submitText: {
    color: "black",
    fontWeight: "bold",
    fontSize: 16,
  },
});
