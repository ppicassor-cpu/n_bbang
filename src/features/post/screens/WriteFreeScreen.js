import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import MapView, { Marker } from "react-native-maps";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";

const DEFAULT_DESC = "나눔하려는 물품의 상태와 나눔 이유를 적어주세요.\n(예: 유통기한 임박, 이사 정리, 단순 변심 등)\n\n서로 기분 좋은 나눔이 되도록 매너를 지켜주세요! 😊";

export default function WriteFreeScreen({ navigation, route }) {
  const { addPost, updatePost, currentLocation, myCoords } = useAppContext();
  
  // ✅ 수정 모드 데이터 수신
  const editPostData = route.params?.post;
  const isEditMode = !!editPostData;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState(DEFAULT_DESC);
  const [images, setImages] = useState([]);
  const [pickupPoint, setPickupPoint] = useState("");
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [galleryVisible, setGalleryVisible] = useState(false);

  const [region, setRegion] = useState({
    latitude: 37.5665, longitude: 126.9780,
    latitudeDelta: 0.005, longitudeDelta: 0.005,
  });

  useEffect(() => {
    if (isEditMode) {
      setTitle(editPostData.title || "");
      setContent(editPostData.content || DEFAULT_DESC);
      setImages(editPostData.images || []);
      setPickupPoint(editPostData.pickup_point || "");
      if (editPostData.coords) {
        setRegion({ ...region, ...editPostData.coords });
      }
      navigation.setOptions({ title: "무료나눔 수정" });
    }
  }, [editPostData]);

  useEffect(() => {
    if (!isEditMode && myCoords) {
      setRegion({ ...region, latitude: myCoords.latitude, longitude: myCoords.longitude });
    }
  }, [myCoords]);

  const showAlert = (msg) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  };

  const openGallery = () => {
    if (images.length >= 10) {
      showAlert("사진은 최대 10장까지입니다.");
      return;
    }
    setGalleryVisible(true);
  };

  const handleGallerySelect = (selectedUris) => {
    setImages([...images, ...selectedUris]);
  };

  const takePhoto = async () => {
    if (images.length >= 10) {
      showAlert("사진은 최대 10장까지입니다.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return showAlert("카메라 권한이 필요합니다.");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled) setImages([...images, result.assets[0].uri]);
  };

  const removeImage = (index) => setImages(images.filter((_, i) => i !== index));

  const handleContentFocus = () => {
    if (content === DEFAULT_DESC) {
      setContent("");
    }
  };

  const handleSubmit = async () => {
    if (!title) { showAlert("나눔할 물건의 이름을 입력해주세요."); return; }
    if (!content || content === DEFAULT_DESC) { showAlert("나눔 설명을 입력해주세요."); return; }

    const postData = {
      category: "무료나눔",
      title,
      content,
      location: isEditMode ? editPostData.location : currentLocation,
      coords: { latitude: region.latitude, longitude: region.longitude },
      pickup_point: pickupPoint,
      price: 0,
      pricePerPerson: 0,
      tip: 0,
      currentParticipants: 0, 
      maxParticipants: 1,
      images: images, 
      status: isEditMode ? editPostData.status : "나눔중",
    };

    if (isEditMode) {
      await updatePost(editPostData.id, postData);
      navigation.pop(2);
    } else {
      const newPost = {
        id: Date.now().toString(),
        ownerId: "me",
        ...postData
      };
      addPost(newPost);
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
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
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(idx)}>
                  <MaterialIcons name="close" size={16} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TextInput 
            style={styles.inputTitle} 
            placeholder="나눔할 물건 이름" 
            placeholderTextColor="#777"
            value={title} 
            onChangeText={setTitle}
          />

          <TextInput 
            style={styles.inputContent} 
            multiline
            placeholderTextColor="#777"
            value={content}
            onFocus={handleContentFocus}
            onChangeText={setContent}
          />

          <View style={{ marginTop: 30, marginBottom: 20 }}>
              <Text style={styles.label}>나눔 희망 장소</Text>
              <View style={styles.mapContainer}>
                  <MapView
                      style={styles.map}
                      region={region}
                      onRegionChangeComplete={setRegion}
                  >
                      <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
                  </MapView>
              </View>
              <Text style={{ color: "grey", fontSize: 12, marginTop: 4, marginBottom: 10 }}>
                지도를 움직여 핀을 위치시켜주세요.
              </Text>
              
              <TextInput
                style={styles.subInput} 
                placeholder="상세 장소 (예: 경비실 앞, 101동 벤치)" 
                placeholderTextColor="grey"
                value={pickupPoint} onChangeText={setPickupPoint}
              />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "black" }}>
                {isEditMode ? "수정 완료" : "나눔 등록하기"}
            </Text>
          </TouchableOpacity>

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
  
  imageBtn: { width: 80, height: 80, borderColor: "#444", borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 10 },
  btnText: { color: "grey", fontSize: 11, marginTop: 4 },
  imageContainer: { position: "relative", marginRight: 10 },
  imagePreview: { width: 80, height: 80, borderRadius: 12 },
  deleteBtn: { position: "absolute", top: -5, right: -5, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  
  inputTitle: { 
    borderBottomWidth: 1, borderBottomColor: "#444", paddingVertical: 12, 
    color: "white", fontSize: 20, fontWeight: "bold", marginBottom: 20 
  },
  inputContent: { 
    minHeight: 150, backgroundColor: "#111", borderRadius: 12, padding: 16,
    color: "#DDD", fontSize: 15, lineHeight: 22, textAlignVertical: "top"
  },
  
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
  subInput: { backgroundColor: "#222", borderRadius: 8, padding: 12, color: "white", fontSize: 14 },
  
  submitBtn: { 
    backgroundColor: theme.primary, padding: 16, borderRadius: 12, 
    alignItems: "center", marginTop: 20, marginBottom: 50
  },
});
