// FILE: src/components/ImageDetailModal.js

import React from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import ImageView from "react-native-image-viewing";
import { MaterialIcons } from "@expo/vector-icons";

/**
 * @param {boolean} visible - 모달 표시 여부
 * @param {Array} images - 이미지 배열 (문자열 배열 혹은 객체 배열)
 * @param {number} index - 처음 보여줄 이미지 번호
 * @param {function} onClose - 닫기 함수
 */
export default function ImageDetailModal({ visible, images, index, onClose }) {
  if (!images || images.length === 0) return null;

  // 어떤 형태의 이미지 데이터가 들어와도 라이브러리 규격({uri: '...'})에 맞게 변환
  const formattedImages = images.map((img) => {
    if (typeof img === "string") return { uri: img };
    return { uri: img.uri || img };
  });

  // ✅ [추가] 커스텀 헤더 (왼쪽 상단 뒤로가기 버튼)
  const HeaderComponent = () => (
    <View style={styles.headerContainer}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <MaterialIcons name="arrow-back-ios-new" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );

  return (
    <ImageView
      images={formattedImages}
      imageIndex={index}
      visible={visible}
      onRequestClose={onClose}
      swipeToCloseEnabled={true}
      doubleTapToZoomEnabled={true}
      // 아래쪽에서 위로 올리는 제스처 등으로 닫기 최적화
      presentationStyle="overFullScreen"
      // ✅ [추가] HeaderComponent 연결
      HeaderComponent={HeaderComponent}
    />
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: "absolute",
    width: "100%",
    zIndex: 1,
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 70 : 50, // 노치/상태바 고려
    left: 10, // ✅ 왼쪽 정렬
    zIndex: 1,
    padding: 10,
  },
});