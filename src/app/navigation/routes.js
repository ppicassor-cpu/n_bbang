// FILE: src/app/navigation/routes.js

export const ROUTES = {
  LOGIN: "Login",
  HOME: "Home",
  
  // 게시글 관련
  WRITE: "Write",
  WRITE_FREE: "WriteFree",
  DETAIL: "Detail",
  FREE_DETAIL: "FreeDetail",

  // ✅ [추가] 스토어 글쓰기 라우트
  STORE_WRITE: "StoreWrite",
  
  // 프로필 관련
  PROFILE: "Profile",
  MY_LISTINGS: "MyListings",
  PREMIUM: "Premium",
  
  // ✅ [중요] 관리자 신고 화면 및 알림 화면 추가
  ADMIN_REPORT: "AdminReport",
  NOTIFICATION: "Notification",

  // 채팅 관련
  CHAT_ROOMS: "ChatRooms",
  CHAT_ROOM: "ChatRoom",
};
