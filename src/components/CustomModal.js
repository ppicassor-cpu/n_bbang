import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { theme } from "../theme";

const CustomModal = ({ visible, title, message, onConfirm, onCancel, type = "alert", loading = false, children }) => {
  return (
    <Modal transparent={true} visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
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
        </View>
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
