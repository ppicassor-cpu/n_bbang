﻿import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Image, Modal, KeyboardAvoidingView, Platform, Keyboard } from "react-native";
import * as ImagePicker from "expo-image-picker";
import MapView, { Marker } from "react-native-maps";
import { useAppContext } from "../../../app/providers/AppContext";
import { theme } from "../../../theme";
import { MaterialIcons } from "@expo/vector-icons";
import CustomModal from "../../../components/CustomModal";
import CustomImagePickerModal from "../../../components/CustomImagePickerModal";
import { auth, storage } from "../../../firebaseConfig";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const WRITABLE_CATEGORIES = ["마트/식품", "생활용품", "기타"];

export default function WriteScreen({ navigation, route }) {
  const {
    addPost,
    updatePost,
    currentLocation,
    myCoords,
    posts,
    // ✅ 프리미엄 제한 로직용 (AppContext에서 제공한다고 가정)
    isPremium,
    dailyPostCount,
    dailyPostCountDate,
    incrementDailyPostCount,
  } = useAppContext();
  
  const editPostData = route.params?.post;
  const isEditMode = !!editPostData;

  const [category, setCategory] = useState("마트/식품");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(""); 
  const [buyPrice, setBuyPrice] = useState("");
  const [participants, setParticipants] = useState(2);
  const [selectedTip, setSelectedTip] = useState(0);
  const [images, setImages] = useState([]);
  const [pickupPoint, setPickupPoint] = useState("");
  
  const [isParticipantsDropdownOpen, setParticipantsDropdownOpen] = useState(false);
  const [participantsDropdownCoords, setParticipantsDropdownCoords] = useState({ x: 0, y: 0, width: 0 });
  const participantsButtonRef = useRef(null);

  const [isTipDropdownOpen, setTipDropdownOpen] = useState(false);
  const [tipDropdownCoords, setTipDropdownCoords] = useState({ x: 0, y: 0, width: 0 });
  const tipButtonRef = useRef(null);
  
  const [isCustomTip, setIsCustomTip] = useState(false);
  
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [galleryVisible, setGalleryVisible] = useState(false);

  const [region, setRegion] = useState({
    latitude: 37.5665, longitude: 126.9780,
    latitudeDelta: 0.005, longitudeDelta: 0.005,
  });

  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    if (isEditMode) {
      setCategory(editPostData.category || "마트/식품");
      setTitle(editPostData.title || "");
      setContent(editPostData.content || "");
      setBuyPrice(editPostData.price ? editPostData.price.toString() : "");
      setParticipants(editPostData.maxParticipants || 2);
      setSelectedTip(editPostData.tip || 0);
      setImages(editPostData.images || []);
      setPickupPoint(editPostData.pickup_point || "");
      if (editPostData.coords) {
        setRegion({ ...region, ...editPostData.coords });
      }
      navigation.setOptions({ title: "게시글 수정" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPostData]);

  useEffect(() => {
    if (!isEditMode && myCoords) {
      setRegion({ ...region, latitude: myCoords.latitude, longitude: myCoords.longitude });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCoords]);

  const showAlert = (msg) => {
    setAlertMsg(msg);
    setAlertVisible(true);
  };

  // ✅ KST 기준 YYYY-MM-DD
  const getTodayKST = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  };

  // ✅ 프리미엄 제한: 일반 유저 하루 1개
  const checkDailyWriteLimit = () => {
    if (isEditMode) return true; // 수정은 제한 없음(작성 제한만)
    if (isPremium) return true;  // 프리미엄은 제한 없음

    const today = getTodayKST();
    const cnt = typeof dailyPostCount === "number" ? dailyPostCount : 0;
    const date = typeof dailyPostCountDate === "string" ? dailyPostCountDate : "";

    // 날짜가 다르면 0으로 취급(새날)
    const effectiveCount = date === today ? cnt : 0;

    if (effectiveCount >= 1) {
      showAlert("일반 유저는 하루 1개까지만 작성 가능합니다.\n프리미엄(월 2,900원)으로 제한 없이 작성할 수 있어요.");
      return false;
    }
    return true;
  };

  const toggleParticipantsDropdown = () => {
    if (isParticipantsDropdownOpen) setParticipantsDropdownOpen(false);
    else {
      Keyboard.dismiss();
      setTimeout(() => {
        participantsButtonRef.current?.measure((fx, fy, width, height, px, py) => {
           if (!width || !height) return;
           setParticipantsDropdownCoords({ x: px, y: py + height + 5, width: width });
           setParticipantsDropdownOpen(true);
        });
      }, 100);
    }
  };

  const toggleTipDropdown = () => {
    if (isTipDropdownOpen) setTipDropdownOpen(false);
    else {
      Keyboard.dismiss();
      setTimeout(() => {
        tipButtonRef.current?.measure((fx, fy, width, height, px, py) => {
            if (!width || !height) return;
            setTipDropdownCoords({ x: px, y: py + height + 5, width: width });
            setTipDropdownOpen(true);
        });
      }, 100);
    }
  };

  const handleParticipantChange = (num) => {
    setParticipants(num);
    setParticipantsDropdownOpen(false);
  };

  const handleTipChange = (tip) => {
    setIsCustomTip(false);
    setTipDropdownOpen(false);
    checkTipLimit(tip);
  };

  const openGallery = () => {
    if (images.length >= 10) {
      showAlert("사진은 최대 10장까지입니다.");
      return;
    }
    setGalleryVisible(true);
  };

  const handleGallerySelect = (selectedUris) => {
    setImages((prev) => [...prev, ...(selectedUris || [])]);
  };

  const takePhoto = async () => {
    if (images.length >= 10) {
      showAlert("사진은 최대 10장까지입니다.");
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") return showAlert("카메라 권한이 필요합니다.");
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1 });
    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri;
      if (uri) setImages((prev) => [...prev, uri]);
    }
  };

  const removeImage = (index) => setImages(images.filter((_, i) => i !== index));

  // ✅ A안 반영: 수고비 합계는 "방장 제외 인원"만 낸다고 가정 (participants - 1)
  const checkTipLimit = (tipAmount, isDirectInput = false) => {
    if (!buyPrice) {
      showAlert("구매 금액을 먼저 입력해주세요.");
      if (isDirectInput) setSelectedTip(0);
      return;
    }

    const price = buyPrice ? parseInt(buyPrice.replace(/,/g, ""), 10) : 0;
    const payers = Math.max(participants - 1, 0);
    const totalTip = tipAmount * payers;

    const limitRate = isPremium ? 0.15 : 0.1;
    const limit = price * limitRate;

    if (tipAmount > 0 && totalTip > limit) {
      showAlert(
        "수고비 합계(" +
          totalTip.toLocaleString() +
          "원)가\n구매 금액의 " +
          Math.round(limitRate * 100) +
          "%(" +
          limit.toLocaleString() +
          "원)를\n초과할 수 없습니다."
      );
    } else {
      setSelectedTip(tipAmount);
    }
  };

  const handlePriceChange = (text) => {
    const clean = text.replace(/,/g, "");
    if (clean === "") { setBuyPrice(""); return; }
    const num = parseInt(clean, 10);
    if (!isNaN(num)) {
      setBuyPrice(num.toLocaleString());
      setIsCustomTip(false);
    }
  };

  const uriToBlob = (uri) =>
    new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(xhr.response); };
        xhr.onerror = function () { reject(new TypeError("BLOB_REQUEST_FAILED")); };
        xhr.responseType = "blob";
        xhr.open("GET", uri, true);
        xhr.send(null);
      } catch (e) {
        reject(e);
      }
    });

  const uploadImagesIfNeeded = async (uris) => {
    if (!uris || uris.length === 0) return [];
    const user = auth.currentUser;
    if (!user) throw new Error("NO_USER");

    const out = [];
    for (let i = 0; i < uris.length; i++) {
      const u = uris[i];

      if (typeof u === "string" && u.startsWith("http")) {
        out.push(u);
        continue;
      }

      const rawExt = (typeof u === "string" ? u.split(".").pop() : "jpg") || "jpg";
      const ext = String(rawExt).split("?")[0] || "jpg";
      const fileName = `${Date.now()}_${i}.${ext}`;
      const path = `posts/n_bbang/${user.uid}/${fileName}`;

      const blob = await uriToBlob(u);
      const r = storageRef(storage, path);
      await uploadBytes(r, blob);
      try { blob.close && blob.close(); } catch {}
      const url = await getDownloadURL(r);
      out.push(url);
    }
    return out;
  };

  const waitForUpdate = (targetId, nextUpdatedAt) =>
    new Promise((resolve) => {
      let count = 0;
      const interval = setInterval(() => {
        const list = postsRef.current || [];
        const found = list.find((p) => p.id === targetId);

        if (found) {
          if (!nextUpdatedAt) {
            clearInterval(interval);
            resolve();
            return;
          }
          const u = found.updatedAt;
          if (u && typeof u === "string" && u >= nextUpdatedAt) {
            clearInterval(interval);
            resolve();
            return;
          }
        }

        if (count > 30) {
          clearInterval(interval);
          resolve();
          return;
        }
        count++;
      }, 200);
    });

  const handleSubmit = async () => {
    if (isEditMode && !editPostData?.id) { showAlert("수정할 게시글 정보가 없습니다."); return; }

    // ✅ 프리미엄 작성 제한(일반: 하루 1개) - 업로드/저장 전에 차단
    if (!checkDailyWriteLimit()) return;

    if (!title) { showAlert("상품명을 입력해주세요."); return; }
    if (!buyPrice) { showAlert("구매 금액을 입력해주세요."); return; }

    const priceInt = buyPrice ? parseInt(buyPrice.replace(/,/g, ""), 10) : 0;
    const perPerson = Math.ceil(priceInt / participants);

    let uploadedImages = images;
    try {
      uploadedImages = await uploadImagesIfNeeded(images);
    } catch (e) {
      if (String(e && e.message) === "NO_USER") {
        showAlert("로그인이 필요합니다.");
      } else {
        showAlert("이미지 업로드에 실패했습니다.");
      }
      return;
    }

    const nextUpdatedAt = new Date().toISOString();

    const postData = {
      category,
      title,
      content,
      location: isEditMode ? editPostData.location : currentLocation,
      coords: { latitude: region.latitude, longitude: region.longitude },
      pickup_point: pickupPoint,
      price: priceInt,
      pricePerPerson: perPerson,
      tip: selectedTip,
      maxParticipants: participants,
      images: uploadedImages,
      status: isEditMode ? editPostData.status : "모집중",
      currentParticipants: isEditMode ? editPostData.currentParticipants : 1,
      updatedAt: nextUpdatedAt,
    };

    if (isEditMode) {
      try {
        await updatePost(editPostData.id, postData);
        await waitForUpdate(editPostData.id, nextUpdatedAt);
        setAlertMsg("게시글이 성공적으로 수정되었습니다.");
        setAlertVisible(true);
      } catch (e) {
        console.error("수정 오류:", e);
        showAlert("저장에 실패했습니다.");
      }
    } else {
      const newPost = {
        id: Date.now().toString(),
        ownerId: "me",
        ...postData
      };
      addPost(newPost);

      // ✅ 작성 성공 후에만 카운트 +1 (AppContext에 구현되어 있으면)
      try {
        if (!isPremium && typeof incrementDailyPostCount === "function") {
          await incrementDailyPostCount();
        }
      } catch (e) {
        // 카운트 실패는 글 작성 자체를 막지 않음(UX 유지)
        console.warn("incrementDailyPostCount failed:", e);
      }

      navigation.goBack();
    }
  };

  const priceInt = buyPrice ? parseInt(buyPrice.replace(/,/g, ""), 10) : 0;
  const perPerson = participants > 0 ? Math.ceil(priceInt / participants) : 0;

  // ✅ A안 기준: "참여자(방장 제외)"가 내는 1인 최종 금액(물건값 + 수고비)
  const finalPerPerson = perPerson + selectedTip;

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
          
          <View style={styles.categoryContainer}>
            {WRITABLE_CATEGORIES.map((cat) => (
                <TouchableOpacity 
                    key={cat} 
                    style={[styles.catBtn, category === cat && styles.catBtnActive]}
                    onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.catText, category === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
            ))}
          </View>

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
                <Image source={{ uri: typeof uri === "string" ? uri : uri?.uri }} style={styles.imagePreview} />
                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeImage(idx)}>
                   <MaterialIcons name="close" size={16} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TextInput 
            style={styles.input} placeholder="상품명 (제목)" placeholderTextColor="grey"
            value={title} onChangeText={setTitle}
          />
          
          <TextInput 
            style={styles.contentInput}
            multiline
            placeholder={"[상세 내용 예시]\n\n- 같이 살 물건: 코스트코 베이글 1+1\n- 소분 방식: 반반 나눔\n- 만날 시간: 내일 저녁 7시쯤\n"}
            placeholderTextColor="#777"
            value={content}
            onChangeText={setContent}
            textAlignVertical="top"
          />
          
          <View style={[styles.rowContainer, { zIndex: 1 }]}>
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity 
                ref={participantsButtonRef}
                style={styles.dropdownHeader} 
                onPress={toggleParticipantsDropdown}
              >
                <Text style={styles.dropdownLabel}>인원</Text>
                <View style={styles.dropdownValueContainer}>
                  <Text style={styles.dropdownValueText}>{participants}명</Text>
                  <MaterialIcons name={isParticipantsDropdownOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={24} color="white" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.inputRow}>
                <TextInput 
                  style={[styles.input, { flex: 1, fontSize: 20, color: theme.primary, fontWeight: "bold", marginBottom: 0, borderBottomWidth: 0, textAlign: 'right' }]} 
                  placeholder="구매 금액" placeholderTextColor="grey" keyboardType="numeric"
                  value={buyPrice} 
                  onChangeText={handlePriceChange}
                />
                <Text style={styles.unitText}>원</Text>
              </View>
              <View style={{ height: 1, backgroundColor: "#444", marginTop: 4 }} />
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.label}>방장 수고비 (1인당)</Text>
            {!isCustomTip && (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.dropdownWrapper, { width: 150 }]}>
                        <TouchableOpacity 
                            ref={tipButtonRef}
                            style={styles.dropdownHeader} 
                            onPress={toggleTipDropdown}
                        >
                            <Text style={styles.dropdownValueText}>
                                {selectedTip === 0 ? "무료봉사" : "+" + selectedTip.toLocaleString() + "원"}
                            </Text>
                            <MaterialIcons name={isTipDropdownOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={24} color="white" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={styles.directInputBtn}
                        onPress={() => {
                            if (!buyPrice) { showAlert("구매 금액을 먼저 입력해주세요."); return; }
                            setIsCustomTip(true); 
                            setSelectedTip(0); 
                        }}
                    >
                        <Text style={{ color: "black", fontWeight: 'bold' }}>직접입력</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isCustomTip && (
                <View style={styles.customTipContainer}>
                    <Text style={{color:'grey', marginRight: 10}}>입력:</Text>
                    <TextInput
                        style={styles.customTipInput} placeholder="0" placeholderTextColor="#777" keyboardType="numeric"
                        value={selectedTip === 0 ? "" : selectedTip.toLocaleString()}
                        onChangeText={(t) => {
                            const clean = t.replace(/,/g, "");
                            if(clean==="") setSelectedTip(0);
                            else if(!isNaN(parseInt(clean))) checkTipLimit(parseInt(clean), true);
                        }}
                    />
                    <Text style={{color:'white', marginLeft: 5, marginRight: 20}}>원</Text>
                    
                    <TouchableOpacity onPress={() => { setIsCustomTip(false); setSelectedTip(0); }}>
                        <MaterialIcons name="cancel" size={24} color="grey" />
                    </TouchableOpacity>
                </View>
            )}
          </View>

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

          <View style={{ marginTop: 30, marginBottom: 20 }}>
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
                placeholder="예: 스타벅스 앞, 101동 입구" 
                placeholderTextColor="grey"
                value={pickupPoint} onChangeText={setPickupPoint}
              />
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                {isEditMode ? "수정 완료" : "작성 완료"}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={isParticipantsDropdownOpen} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setParticipantsDropdownOpen(false)}
        >
          <View style={[styles.dropdownList, { top: participantsDropdownCoords.y, left: participantsDropdownCoords.x, width: participantsDropdownCoords.width }]}>
            <ScrollView nestedScrollEnabled={true}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <TouchableOpacity 
                  key={num} 
                  style={[styles.dropdownItem, participants === num && { backgroundColor: '#333' }]}
                  onPress={() => handleParticipantChange(num)}
                >
                  <Text style={[styles.dropdownItemText, participants === num && { color: theme.primary, fontWeight: 'bold' }]}>{num}명</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={isTipDropdownOpen} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setTipDropdownOpen(false)}
        >
          <View style={[styles.dropdownList, { top: tipDropdownCoords.y, left: tipDropdownCoords.x, width: tipDropdownCoords.width }]}>
            <ScrollView nestedScrollEnabled={true}>
              {[0, 500, 1000, 1500, 2000].map((tip) => (
                <TouchableOpacity 
                  key={tip} 
                  style={[styles.dropdownItem, selectedTip === tip && { backgroundColor: '#333' }]}
                  onPress={() => handleTipChange(tip)}
                >
                  <Text style={[styles.dropdownItemText, selectedTip === tip && { color: theme.primary, fontWeight: 'bold' }]}>
                    {tip === 0 ? "무료봉사" : "+" + tip.toLocaleString() + "원"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

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
        onConfirm={() => {
          setAlertVisible(false);
          if (alertMsg.includes("수정되었습니다")) navigation.goBack();
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  categoryContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  catBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8, backgroundColor: "#222", marginHorizontal: 4 },
  catBtnActive: { backgroundColor: theme.primary },
  catText: { color: "grey", fontSize: 12, fontWeight: "bold" },
  catTextActive: { color: "black", fontSize: 13 },

  imageBtn: { width: 80, height: 80, borderColor: "#444", borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 10 },
  btnText: { color: "grey", fontSize: 11, marginTop: 4 },
  imageContainer: { position: "relative", marginRight: 10 },
  imagePreview: { width: 80, height: 80, borderRadius: 12 },
  deleteBtn: { position: "absolute", top: -5, right: -5, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  
  input: { borderBottomWidth: 1, borderBottomColor: "#444", paddingVertical: 10, color: "white", fontSize: 16, marginBottom: 20 },
  contentInput: { 
    minHeight: 120, backgroundColor: "#151515", borderRadius: 8, padding: 15, 
    color: "#DDD", fontSize: 15, lineHeight: 22, textAlignVertical: "top", marginBottom: 25,
    borderWidth: 1, borderColor: "#333"
  },
  subInput: { backgroundColor: "#222", borderRadius: 8, padding: 12, color: "white", fontSize: 14 },
  
  rowContainer: { flexDirection: "row", alignItems: "flex-end", marginBottom: 20 },
  dropdownWrapper: { width: 130, marginRight: 12 },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111', borderWidth: 1, borderColor: '#555', borderRadius: 8, paddingHorizontal: 10, height: 50 },
  dropdownLabel: { color: 'grey', fontSize: 14, fontWeight: 'bold' },
  dropdownValueContainer: { flexDirection: 'row', alignItems: 'center' },
  dropdownValueText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginRight: 4 },
  dropdownBackdrop: { flex: 1, backgroundColor: 'transparent' }, 
  dropdownList: { position: 'absolute', backgroundColor: '#222', borderWidth: 1, borderColor: '#555', borderRadius: 8, maxHeight: 200, elevation: 10, shadowColor: "#000", shadowOffset: {width:0, height:4}, shadowOpacity: 0.5, shadowRadius: 5 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#333' },
  dropdownItemText: { color: '#ccc', fontSize: 16, textAlign: 'center' },

  inputRow: { flexDirection: "row", alignItems: "center" },
  unitText: { color: "white", fontSize: 18, marginLeft: 8 },
  label: { color: theme.primary, fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  
  directInputBtn: { height: 50, paddingHorizontal: 20, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  customTipContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 5, backgroundColor: '#222', padding: 10, borderRadius: 8 },
  customTipInput: { color: theme.primary, fontSize: 18, fontWeight: 'bold', minWidth: 50, borderBottomWidth: 1, borderBottomColor: theme.primary, textAlign: 'center' },
  
  receipt: { backgroundColor: theme.cardBg, borderRadius: 16, padding: 20, marginTop: 30, borderWidth: 1, borderColor: "rgba(204, 255, 0, 0.5)" },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  submitBtn: { backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: "center", marginTop: 40 },
  
  mapContainer: { height: 150, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#444" },
  map: { width: "100%", height: "100%" },
});
