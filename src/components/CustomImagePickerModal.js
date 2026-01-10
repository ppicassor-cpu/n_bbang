import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, FlatList, Image, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { MaterialIcons } from "@expo/vector-icons";
import { theme } from "../theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const NUM_COLS = 3;
const IMAGE_SIZE = SCREEN_WIDTH / NUM_COLS;

const CustomImagePickerModal = ({ visible, onClose, onSelect, maxImages = 10, currentCount = 0 }) => {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [hasPermission, setHasPermission] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      checkPermissions();
      setSelected([]);
    }
  }, [visible]);

  const checkPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setHasPermission(status === "granted");
    if (status === "granted") {
      loadAssets();
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    let targetAlbum = null;
    
    // ✅ [수정] 앨범 목록을 먼저 가져와 "Camera" 또는 "DCIM" 폴더 찾기
    try {
        const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        // 안드로이드는 보통 "Camera" 또는 "DCIM", iOS는 "Recents"
        targetAlbum = albums.find(a => a.title === "Camera" || a.title === "DCIM" || a.title === "카메라" || a.title === "Recents");
    } catch (e) {
        console.log("앨범 가져오기 실패, 전체 로드 시도", e);
    }

    const albumId = targetAlbum ? targetAlbum.id : null;

    // 해당 앨범 또는 전체에서 사진 가져오기
    const result = await MediaLibrary.getAssetsAsync({
      first: 100,
      album: albumId, 
      mediaType: ["photo"],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    setAssets(result.assets);
    setLoading(false);
  };

  const toggleSelect = (uri) => {
    if (selected.includes(uri)) {
      setSelected(selected.filter((item) => item !== uri));
    } else {
      if (selected.length + currentCount >= maxImages) {
        return;
      }
      setSelected([...selected, uri]);
    }
  };

  const handleComplete = () => {
    onSelect(selected);
    onClose();
  };

  const renderItem = ({ item }) => {
    const isSelected = selected.includes(item.uri);
    return (
      <TouchableOpacity onPress={() => toggleSelect(item.uri)} style={styles.imageContainer}>
        <Image source={{ uri: item.uri }} style={[styles.image, isSelected && styles.selectedImage]} />
        {isSelected && (
          <View style={styles.checkIcon}>
             <MaterialIcons name="check-circle" size={24} color={theme.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (hasPermission === false) {
    return (
        <Modal visible={visible} transparent={true}>
            <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: "white" }}>갤러리 접근 권한이 필요합니다.</Text>
                <TouchableOpacity onPress={onClose} style={{ marginTop: 20 }}>
                    <Text style={{ color: theme.primary }}>닫기</Text>
                </TouchableOpacity>
            </View>
        </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>사진 선택</Text>
          <TouchableOpacity onPress={handleComplete} disabled={selected.length === 0}>
            <Text style={[styles.completeText, selected.length === 0 && { color: "#555" }]}>
              첨부 ({selected.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={NUM_COLS}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  header: {
    height: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    marginTop: 10,
  },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  completeText: { color: theme.primary, fontSize: 16, fontWeight: "bold" },
  
  imageContainer: { width: IMAGE_SIZE, height: IMAGE_SIZE, padding: 1 },
  image: { width: "100%", height: "100%" },
  selectedImage: { opacity: 0.5, borderWidth: 2, borderColor: theme.primary },
  checkIcon: { position: "absolute", top: 5, right: 5 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});

export default CustomImagePickerModal;
