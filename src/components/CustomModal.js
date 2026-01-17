import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
  Animated,
} from "react-native";
import { theme } from "../theme";

const CustomModal = ({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  type = "alert",
  loading = false,
  children,

  // ✅ [추가] 특정 모달만 키보드 뜰 때 위로 이동시키기 위한 옵션 (기본 false)
  moveUpOnKeyboard = false,

  // ✅ [추가] 하드웨어(안드로이드) 뒤로가기 버튼으로 모달 닫힘 방지 (기본 false)
  disableBackClose = false,
}) => {
  // ✅ [추가] 키보드 높이에 따라 모달을 위로 이동 (센터 고정은 유지하되, 필요한 경우만 translateY 적용)
  const translateY = useRef(new Animated.Value(0)).current;
  const keyboardHeightRef = useRef(0);

  useEffect(() => {
    if (!moveUpOnKeyboard || !visible) return;

    const animateTo = (toValue) => {
      Animated.timing(translateY, {
        toValue,
        duration: 180,
        useNativeDriver: true,
      }).start();
    };

    const onShow = (e) => {
      const h = e?.endCoordinates?.height || 0;
      keyboardHeightRef.current = h;

      // ✅ 키보드가 올라오면 모달을 위로 이동 (너무 과하게 올라가지 않도록 적당히)
      // - 보통 "키보드 높이의 절반 정도"가 가장 자연스럽게 버튼 가림을 해소함
      // - 최소/최대 클램프 적용
      const raw = -Math.round(h * 0.5);
      const clamped = Math.max(raw, -260); // 최대 260px까지만 위로
      animateTo(clamped);
    };

    const onHide = () => {
      keyboardHeightRef.current = 0;
      animateTo(0);
    };

    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      onShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      onHide
    );

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
      // 모달 닫힐 때 원위치
      translateY.setValue(0);
      keyboardHeightRef.current = 0;
    };
  }, [moveUpOnKeyboard, visible, translateY]);

  useEffect(() => {
    // moveUpOnKeyboard가 아니거나 모달이 닫히면 항상 원위치
    if (!visible || !moveUpOnKeyboard) {
      translateY.setValue(0);
      keyboardHeightRef.current = 0;
    }
  }, [visible, moveUpOnKeyboard, translateY]);

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (disableBackClose) return;
        if (typeof onCancel === "function") {
          onCancel();
          return;
        }
        if (typeof onConfirm === "function") {
          onConfirm();
        }
      }}
    >
      <View style={styles.overlay}>
        {/* ✅ [수정] 모달 박스만 Animated로 감싸서(센터는 유지) 키보드 뜰 때만 위로 이동 */}
        <Animated.View style={[styles.modalContainer, moveUpOnKeyboard ? { transform: [{ translateY }] } : null]}>
          {loading ? (
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.loadingText}>{message || "처리 중..."}</Text>
            </View>
          ) : (
            <>
              {title && <Text style={styles.title}>{title}</Text>}
              {message && <Text style={styles.message}>{message}</Text>}

              {/* 커스텀 내용(버튼 등)이 있으면 렌더링, 없으면 기본 버튼 렌더링 */}
              {children ? (
                children
              ) : (
                <View style={styles.buttonRow}>
                  {type === "confirm" && (
                    <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
                      <Text style={styles.cancelButtonText}>취소</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={onConfirm}>
                    <Text style={styles.confirmButtonText}>확인</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "80%",
    backgroundColor: theme.cardBg,
    borderRadius: 15,
    padding: 25,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3.84,
    borderWidth: 1,
    borderColor: "#333",
  },
  loadingContent: {
    alignItems: "center",
    padding: 10,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: theme.text,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.primary,
    marginBottom: 15,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: "#DDD",
    textAlign: "center",
    marginBottom: 25,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButton: {
    backgroundColor: theme.primary,
  },
  cancelButton: {
    backgroundColor: "#333",
  },
  confirmButtonText: {
    color: "black",
    fontSize: 16,
    fontWeight: "bold",
  },
  cancelButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default CustomModal;
