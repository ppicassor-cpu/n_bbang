import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  AppState,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context"; // ✅ SafeAreaView 추가
import { theme } from "../theme";
import CustomModal from "./CustomModal";

const SCREEN_WIDTH = Dimensions.get("window").width;
const NUM_COLS = 3;
const IMAGE_SIZE = SCREEN_WIDTH / NUM_COLS;

const PAGE_SIZE = 120;

const CustomImagePickerModal = ({
  visible,
  onClose,
  onSelect,
  maxImages = 10,
  currentCount = 0,
}) => {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [hasPermission, setHasPermission] = useState(null);
  const [loading, setLoading] = useState(false);

  // pagination
  const [endCursor, setEndCursor] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const resetState = useCallback(() => {
    setAssets([]);
    setSelected([]);
    setEndCursor(null);
    setHasNextPage(false);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  const checkPermissions = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      setHasPermission(status === "granted");
    } catch (e) {
      setHasPermission(false);
    }
  }, []);

  const resolveAssetUri = useCallback(async (asset) => {
    try {
      const uri = asset?.uri;
      // iOS의 ph:// 는 RN Image에서 종종 렌더가 불안정해서 localUri 우선 사용
      if (Platform.OS === "ios" && typeof uri === "string" && uri.startsWith("ph://")) {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        return info?.localUri || uri;
      }
      return uri;
    } catch (e) {
      return asset?.uri;
    }
  }, []);

  const loadAssets = useCallback(
    async ({ after = null, append = false } = {}) => {
      try {
        if (!hasPermission) return;

        if (!append) setLoading(true);
        else setLoadingMore(true);

        const res = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [MediaLibrary.SortBy.creationTime],
          first: PAGE_SIZE,
          after: after || undefined,
        });

        const list = res?.assets || [];
        // 썸네일 표시를 안정화하기 위해 iOS ph:// 는 가능한 localUri로 미리 치환
        let normalized = list;
        if (Platform.OS === "ios") {
          normalized = await Promise.all(
            list.map(async (a) => {
              if (typeof a?.uri === "string" && a.uri.startsWith("ph://")) {
                try {
                  const info = await MediaLibrary.getAssetInfoAsync(a);
                  return { ...a, uri: info?.localUri || a.uri };
                } catch {
                  return a;
                }
              }
              return a;
            })
          );
        }

        setAssets((prev) => (append ? [...prev, ...normalized] : normalized));
        setEndCursor(res?.endCursor ?? null);
        setHasNextPage(!!res?.hasNextPage);
      } catch (e) {
        // 권한/로드 실패 시 조용히 처리
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [hasPermission]
  );

  const requestPermissionAndLoad = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      const granted = status === "granted";
      setHasPermission(granted);
      if (granted) {
        await loadAssets({ after: null, append: false });
      }
    } catch (e) {
      setHasPermission(false);
    }
  }, [loadAssets]);

  // 앱 복귀 시 권한 상태 재확인
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (visible && nextAppState === "active") {
        checkPermissions();
      }
    });
    return () => {
      if (subscription) subscription.remove();
    };
  }, [visible, checkPermissions]);

  // 모달 열릴 때: 권한 체크 → 그리드 로드
  useEffect(() => {
    if (!visible) return;
    resetState();
    (async () => {
      await checkPermissions();
    })();
  }, [visible, resetState, checkPermissions]);

  // 권한이 이미 있으면 바로 로드
  useEffect(() => {
    if (!visible) return;
    if (hasPermission === true) {
      loadAssets({ after: null, append: false });
    }
  }, [visible, hasPermission, loadAssets]);

  const toggleSelect = useCallback(
    async (asset) => {
      if (!asset?.id) return;

      const exists = selected.some((s) => s.id === asset.id);
      if (exists) {
        setSelected((prev) => prev.filter((s) => s.id !== asset.id));
        return;
      }

      if (selected.length + currentCount >= maxImages) return;

      const resolvedUri = await resolveAssetUri(asset);
      if (!resolvedUri) return;

      setSelected((prev) => [...prev, { id: asset.id, uri: resolvedUri }]);
    },
    [selected, currentCount, maxImages, resolveAssetUri]
  );

  const handleComplete = useCallback(() => {
    const uris = selected.map((s) => s.uri).filter(Boolean);
    onSelect(uris);
    onClose();
  }, [selected, onSelect, onClose]);

  const renderItem = ({ item }) => {
    const isSelected = selected.some((s) => s.id === item.id);
    return (
      <TouchableOpacity onPress={() => toggleSelect(item)} style={styles.imageContainer}>
        {item?.uri ? (
          <Image source={{ uri: item.uri }} style={[styles.image, isSelected && styles.selectedImage]} />
        ) : (
          <View style={[styles.image, { backgroundColor: "#111", justifyContent: "center", alignItems: "center" }]}>
            <MaterialIcons name="image" size={22} color="#444" />
          </View>
        )}
        {isSelected && (
          <View style={styles.checkIcon}>
            <MaterialIcons name="check-circle" size={24} color={theme.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const onEndReached = () => {
    if (!hasPermission) return;
    if (loading || loadingMore) return;
    if (!hasNextPage) return;
    if (!endCursor) return;
    loadAssets({ after: endCursor, append: true });
  };

  return (
    <View>
      <Modal visible={visible && hasPermission === true} animationType="slide" transparent={false}>
        {/* ✅ View -> SafeAreaView로 변경하여 상단 침범 방지 */}
        <SafeAreaView style={styles.container}>
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
              onEndReached={onEndReached}
              onEndReachedThreshold={0.6}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 16 }}>
                    <ActivityIndicator size="small" color={theme.primary} />
                  </View>
                ) : null
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      <CustomModal
        visible={visible && hasPermission === false}
        title="갤러리 접근 권한 안내"
        message={
          "사진을 업로드하려면 갤러리 접근 권한이 필요합니다.\n'확인'을 누른 후 허용해주시거나,\n이미 거부하신 경우 설정에서 직접 허용해주세요."
        }
        onConfirm={requestPermissionAndLoad}
        onCancel={onClose}
        type="confirm"
      />
    </View>
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
    // ✅ marginTop 제거 (SafeAreaView가 자동으로 처리)
  },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  completeText: { color: theme.primary, fontSize: 16, fontWeight: "bold" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  imageContainer: { width: IMAGE_SIZE, height: IMAGE_SIZE, padding: 1 },
  image: { width: "100%", height: "100%" },
  selectedImage: { opacity: 0.6 },
  checkIcon: { position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: 12 },
});

export default CustomImagePickerModal;