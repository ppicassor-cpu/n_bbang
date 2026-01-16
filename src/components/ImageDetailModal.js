import React from "react";
import ImageView from "react-native-image-viewing";

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
    />
  );
}