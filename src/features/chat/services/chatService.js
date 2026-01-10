// src/features/chat/services/chatService.js

// 지금은 실제 서버가 없으므로 로그만 출력하고 성공으로 처리합니다.
export const ensureRoom = async (roomId, roomName, type) => {
  // ✅ 문법 오류 수정
  console.log(`[ChatService] 방 생성/확인: ${roomId} (${roomName}) - 타입: ${type}`);
  return Promise.resolve(true);
};

export const sendMessage = async (roomId, message) => {
  // ✅ 문법 오류 수정
  console.log(`[ChatService] 메시지 전송: ${message} -> 방: ${roomId}`);
  return Promise.resolve(true);
};
