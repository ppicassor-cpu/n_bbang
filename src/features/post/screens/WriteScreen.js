import React, { useState, useEffect } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, Image, Modal, KeyboardAvoidingView, Platform } from "react-native";
import Slider from "@react-native-community/slider";
import * as ImagePicker from "expo-image-picker";
import MapView, { Marker } from "react-native-maps";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";

export default function WriteScreen({ navigation }) {
  const { addPost, currentLocation, myCoords } = useAppContext();

  const [title, setTitle] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [participants, setParticipants] = useState(2);
  const [selectedTip, setSelectedTip] = useState(0);
  const [images, setImages] = useState([]);
  
  // 드롭다운 열림/닫힘 상태
  const [isDropdownOpen, setDropdownOpen] = useState(false);

  // 직접 입력 모드 확인
  const [isCustomTip, setIsCustomTip] = useState(false);

  // 만남 장소 메모
  const [pickupPoint, setPickupPoint] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const [region, setRegion] = useState({
    latitude: 37.5665, longitude: 126.9780,
    latitudeDelta: 0.005, longitudeDelta: 0.005,
  });

  useEffect(() => {
    if (myCoords) {
      setRegion({
        ...region,
        latitude: myCoords.latitude,
        longitude: myCoords.longitude,
      });
    }
  }, [myCoords]);

  const pickImages = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, 
      quality: 1,
    });

    if (!result.canceled) {
      setImages([...images, ...result.assets.map(asset => asset.uri)]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("권한 필요", "카메라 접근 권한이 필요합니다.");
      return;
    }
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const removeImage = (indexToRemove) => {
    setImages(images.filter((_, index) => index !== indexToRemove));
  };

  const checkTipLimit = (tipAmount, isDirectInput = false) => {
    if (!buyPrice) {
      Alert.alert("알림", "구매 금액을 먼저 입력해주세요.");
      if (isDirectInput) setSelectedTip(0);
      return;
    }

    const price = parseInt(buyPrice.replace(/,/g, ""), 10);
    const totalTip = tipAmount * participants;
    const limit = price * 0.1;

    if (tipAmount > 0 && totalTip > limit) {
      setModalMessage(`수고비 합계(${totalTip.toLocaleString()}원)가\n구매 금액의 10%(${limit.toLocaleString()}원)를\n초과할 수 없습니다.`);
      setModalVisible(true);
    } else {
      setSelectedTip(tipAmount);
    }
  };

  const handlePresetTip = (tip) => {
    setIsCustomTip(false);
    checkTipLimit(tip);
  };

  const enableCustomTip = () => {
    if (!buyPrice) {
      Alert.alert("알림", "구매 금액을 먼저 입력해주세요.");
      return;
    }
    setIsCustomTip(true);
    setSelectedTip(0); 
  };

  const handleCustomTipChange = (text) => {
    const clean = text.replace(/,/g, "");
    if (clean === "") {
      setSelectedTip(0);
      return;
    }
    const num = parseInt(clean, 10);
    if (!isNaN(num)) {
      checkTipLimit(num, true);
    }
  };

  const handlePriceChange = (text) => {
    const clean = text.replace(/,/g, "");
    if (clean === "") {
      setBuyPrice("");
      return;
    }
    const num = parseInt(clean, 10);
    if (!isNaN(num)) {
      setBuyPrice(num.toLocaleString());
      setSelectedTip(0); 
      setIsCustomTip(false);
    }
  };

  const handleParticipantChange = (num) => {
    setParticipants(num);
    setDropdownOpen(false); // 선택 후 닫기
    setSelectedTip(0);
    setIsCustomTip(false);
  };

  const handleSubmit = () => {
    if (!title || !buyPrice) return;

    const priceInt = parseInt(buyPrice.replace(/,/g, ""), 10);
    const perPerson = Math.ceil(priceInt / participants);

    const newPost = {
      id: Date.now().toString(),
      ownerId: "me",
      category: "기타",
      title,
      location: currentLocation,
      coords: { latitude: region.latitude, longitude: region.longitude },
      pickup_point: pickupPoint,
      price: priceInt,
      pricePerPerson: perPerson,
      tip: selectedTip,
      currentParticipants: 1, 
      maxParticipants: participants,
      images: images,
      status: "모집중",
    };
    addPost(newPost);
    navigation.goBack();
  };

  const priceInt = buyPrice ? parseInt(buyPrice.replace(/,/g, ""), 10) : 0;
  const perPerson = participants > 0 ? Math.ceil(priceInt / participants) : 0;
  const finalPerPerson = perPerson + selectedTip;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }} nestedScrollEnabled={true}>
          
          {/* 이미지 업로드 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
            <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
              <MaterialIcons name="camera-alt" size={24} color="grey" />
              <Text style={styles.btnText}>카메라</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.imageBtn} onPress={pickImages}>
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
            style={styles.input} 
            placeholder="상품명 (제목)" 
            placeholderTextColor="grey"
            value={title}
            onChangeText={setTitle}
          />
          
          {/* 인원 선택 + 구매 금액 입력 행 */}
          {/* zIndex를 주어 드롭다운이 열릴 때 다른 요소 위로 올라오게 함 */}
          <View style={[styles.rowContainer, { zIndex: 2000 }]}>
            
            {/* 왼쪽: 드롭다운 형태의 인원 선택 */}
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity 
                style={styles.dropdownHeader} 
                onPress={() => setDropdownOpen(!isDropdownOpen)}
              >
                <Text style={styles.dropdownLabel}>인원</Text>
                <View style={styles.dropdownValueContainer}>
                  <Text style={styles.dropdownValueText}>{participants}명</Text>
                  <MaterialIcons 
                    name={isDropdownOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                    size={24} 
                    color="white" 
                  />
                </View>
              </TouchableOpacity>

              {/* 드롭다운 리스트 (열렸을 때만 보임) */}
              {isDropdownOpen && (
                <View style={styles.dropdownList}>
                  <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 150 }}>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <TouchableOpacity 
                        key={num} 
                        style={[
                          styles.dropdownItem,
                          participants === num && { backgroundColor: '#333' }
                        ]}
                        onPress={() => handleParticipantChange(num)}
                      >
                        <Text style={[
                          styles.dropdownItemText,
                          participants === num && { color: theme.primary, fontWeight: 'bold' }
                        ]}>
                          {num}명
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* 오른쪽: 구매 금액 입력 */}
            <View style={{ flex: 1, zIndex: -1 }}>
              <View style={styles.inputRow}>
                <TextInput 
                  style={[styles.input, { flex: 1, fontSize: 20, color: theme.primary, fontWeight: "bold", marginBottom: 0, borderBottomWidth: 0, textAlign: 'right' }]} 
                  placeholder="구매 금액" 
                  placeholderTextColor="grey"
                  keyboardType="numeric"
                  value={buyPrice}
                  onChangeText={handlePriceChange}
                />
                <Text style={styles.unitText}>원</Text>
              </View>
              <View style={{ height: 1, backgroundColor: "#444", marginTop: 4 }} />
            </View>
          </View>

          {/* 지도 */}
          <View style={{ marginTop: 20, marginBottom: 30, zIndex: -1 }}>
              <Text style={styles.label}>만남 장소</Text>
              <View style={styles.mapContainer}>
                  <MapView
                      style={styles.map}
                      region={region}
                      onRegionChangeComplete={setRegion}
                  >
                      <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} />
                  </MapView>
              </View>
              <Text style={{ color: "grey", fontSize: 12, marginTop: 4, marginBottom: 10 }}>지도를 움직여 핀을 만날 장소에 맞춰주세요.</Text>
              
              <TextInput
                style={styles.subInput}
                placeholder="상세 장소 메모 (예: 스타벅스 앞, 101동 입구)"
                placeholderTextColor="grey"
                value={pickupPoint}
                onChangeText={setPickupPoint}
              />
          </View>

          {/* 수고비 설정 */}
          <View style={{ marginTop: 10, zIndex: -1 }}>
            <Text style={styles.label}>방장 수고비 (1인당)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {[0, 500, 1000, 1500, 2000].map(tip => (
                <TouchableOpacity 
                  key={tip} 
                  style={[
                    styles.tipBtn, 
                    (!isCustomTip && selectedTip === tip) && styles.tipBtnSelected
                  ]}
                  onPress={() => handlePresetTip(tip)}
                >
                  <Text style={[
                    styles.tipText, 
                    (!isCustomTip && selectedTip === tip) && { color: "black" }
                  ]}>
                    {tip === 0 ? "무료봉사" : `${tip.toLocaleString()}`}
                  </Text>
                </TouchableOpacity>
              ))}
              
              <TouchableOpacity 
                  style={[styles.tipBtn, isCustomTip && styles.tipBtnSelected]}
                  onPress={enableCustomTip}
                >
                <Text style={[styles.tipText, isCustomTip && { color: "black" }]}>직접입력</Text>
              </TouchableOpacity>
            </ScrollView>

            {isCustomTip && (
              <View style={styles.customTipContainer}>
                <Text style={{color:'grey', marginRight: 10}}>입력 금액:</Text>
                <TextInput
                  style={styles.customTipInput}
                  placeholder="0"
                  placeholderTextColor="#777"
                  keyboardType="numeric"
                  value={selectedTip === 0 ? "" : selectedTip.toLocaleString()}
                  onChangeText={handleCustomTipChange}
                />
                <Text style={{color:'white', marginLeft: 5}}>원</Text>
              </View>
            )}
          </View>

          {/* 영수증 */}
          <View style={styles.receipt}>
            <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18 }}>🧾 </Text>
              <Text style={{ color: "white", fontSize: 16, fontWeight: "bold" }}>N빵 예상 계산서</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>1인당 물건값</Text>
              <Text style={{ color: "white" }}>{perPerson.toLocaleString()}원</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={{ color: "grey" }}>수고비</Text>
              <Text style={{ color: theme.primary, fontWeight: "bold" }}>+ {selectedTip.toLocaleString()}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: "grey", marginVertical: 12 }} />
            <View style={styles.receiptRow}>
              <Text style={{ color: "white", fontWeight: "bold" }}>최종 1인</Text>
              <Text style={{ color: theme.primary, fontSize: 24, fontWeight: "bold" }}>{finalPerPerson.toLocaleString()}원</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>완료</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* 경고 모달 */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <MaterialIcons name="warning" size={24} color="orange" />
              <Text style={{ color: "white", fontSize: 18, marginLeft: 8, fontWeight: "bold" }}>수고비 한도 초과</Text>
            </View>
            <Text style={{ color: "#DDD", lineHeight: 22 }}>{modalMessage}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setModalVisible(false)}>
              <Text style={{ color: theme.primary, fontWeight: "bold" }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  
  input: { borderBottomWidth: 1, borderBottomColor: "#444", paddingVertical: 10, color: "white", fontSize: 16, marginBottom: 20 },
  subInput: { backgroundColor: "#222", borderRadius: 8, padding: 12, color: "white", fontSize: 14 },
  
  // Row Layout
  rowContainer: { flexDirection: "row", alignItems: "flex-end", marginBottom: 20 },
  
  // Dropdown Styles
  dropdownWrapper: { width: 130, marginRight: 12, position: 'relative' },
  dropdownHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    backgroundColor: '#111', 
    borderWidth: 1, 
    borderColor: '#555', 
    borderRadius: 8, 
    paddingHorizontal: 10,
    height: 50 // 높이를 한 줄로 고정
  },
  dropdownLabel: { color: 'grey', fontSize: 14, fontWeight: 'bold' },
  dropdownValueContainer: { flexDirection: 'row', alignItems: 'center' },
  dropdownValueText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginRight: 4 },
  
  dropdownList: {
    position: 'absolute',
    top: 55, // 헤더 바로 아래
    left: 0,
    right: 0,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    zIndex: 3000, // 가장 위로
    elevation: 5,
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  dropdownItemText: { color: '#ccc', fontSize: 16, textAlign: 'center' },

  inputRow: { flexDirection: "row", alignItems: "center" },
  unitText: { color: "white", fontSize: 18, marginLeft: 8 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  
  tipBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#333", marginRight: 10 },
  tipBtnSelected: { backgroundColor: theme.primary },
  tipText: { color: "white", fontWeight: "bold" },
  customTipContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 15, backgroundColor: '#222', padding: 10, borderRadius: 8 },
  customTipInput: { color: theme.primary, fontSize: 18, fontWeight: 'bold', minWidth: 50, borderBottomWidth: 1, borderBottomColor: theme.primary, textAlign: 'center' },
  receipt: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 20, marginTop: 30, borderWidth: 1, borderColor: "rgba(204, 255, 0, 0.5)" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  submitBtn: { backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", backgroundColor: "#2C2C2C", borderRadius: 16, padding: 24 },
  modalBtn: { alignSelf: "flex-end", marginTop: 20 },
  mapContainer: { height: 150, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
});
