// FILE: src/app/navigation/routes.js

export const ROUTES = {
  LOGIN: "Login",
  HOME: "Home",
  
  // 게시글 관련
  WRITE: "Write",
  WRITE_FREE: "WriteFree",
  DETAIL: "Detail",
  FREE_DETAIL: "FreeDetail",

  // ✅ [추가] 스토어(핫플레이스) 관련 라우트
  STORE_WRITE: "StoreWrite",   // 가게 등록 작성
  STORE_LIST: "StoreList",     // 가게 목록
  STORE_DETAIL: "StoreDetail", // 가게 상세 정보
  
  // 프로필 관련
  PROFILE: "Profile",
  MY_LISTINGS: "MyListings",
  PREMIUM: "Premium",
  
  // ✅ [신규 추가] 약관 및 정책 페이지 라우트
  TERMS_OF_SERVICE: "TermsOfService",   // 서비스 이용약관
  PRIVACY_POLICY: "PrivacyPolicy",      // 개인정보 처리방침
  OPERATION_POLICY: "OperationPolicy",  // 운영정책
  
  // ✅ [신규 추가] 고객센터 라우트
  CUSTOMER_CENTER: "CustomerCenter",    // 고객센터 (1:1 문의 등)

  // ✅ [중요] 관리자 신고 화면 및 알림 화면 추가
  ADMIN_REPORT: "AdminReport",
  NOTIFICATION: "Notification",

  // 채팅 관련
  CHAT_ROOMS: "ChatRooms",
  CHAT_ROOM: "ChatRoom",
};