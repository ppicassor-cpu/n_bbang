// ================================================================================
//  FILE: src/features/chat/services/chatService.js
// ================================================================================

import { db, auth } from "../../../firebaseConfig";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  where,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";

// ✅ 공통 Timestamp → Date 안전 변환 유틸
const safeToDate = (v) => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    if (v instanceof Date) return v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
};

// ✅ 공통 roomId 타입/값 가드 (Firestore doc/collection 크래시 방지)
const isValidRoomId = (roomId) => typeof roomId === "string" && roomId.trim().length > 0;

// ✅ 1. 채팅방 생성 또는 입장 (재입장 시 시간 갱신 로직 정밀화)
export const ensureRoom = async (roomId, roomName, type, ownerId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const userId = auth.currentUser.uid;
  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    const participantList = [userId];
    if (ownerId && ownerId !== userId) {
      participantList.push(ownerId);
    }

    await setDoc(roomRef, {
      id: roomId,
      title: roomName,
      type: type || "group",
      ownerId: ownerId || userId,
      isClosed: false,
      participants: participantList,
      [`joinedAt_${userId}`]: serverTimestamp(),
      ...(ownerId && ownerId !== userId ? { [`joinedAt_${ownerId}`]: serverTimestamp() } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "채팅방이 개설되었습니다.",
    });
  } else {
    const data = roomSnap.data() || {};
    const currentParticipants = Array.isArray(data.participants) ? data.participants : [];
    const updateData = {};
    const participantsToAdd = [];

    // [수정 4번 해결] 재입장 시 목록 상단 노출을 위해 updatedAt 갱신
    updateData.updatedAt = serverTimestamp();

    if (type && data.type !== type) {
      updateData.type = type;
    }

    if (!data[`joinedAt_${userId}`]) {
      updateData[`joinedAt_${userId}`] = serverTimestamp();
    }

    if (!currentParticipants.includes(userId)) {
      participantsToAdd.push(userId);
      updateData[`joinedAt_${userId}`] = serverTimestamp();
    }

    if (ownerId && !data.ownerId) {
      updateData.ownerId = ownerId;
    }

    if (ownerId && ownerId !== userId) {
      if (!currentParticipants.includes(ownerId)) {
        participantsToAdd.push(ownerId);
      }
      if (!data[`joinedAt_${ownerId}`]) {
        updateData[`joinedAt_${ownerId}`] = serverTimestamp();
      }
    }

    if (participantsToAdd.length > 0) {
      updateData.participants = arrayUnion(...participantsToAdd);
    }

    if (Object.keys(updateData).length > 0) {
      await updateDoc(roomRef, updateData);
    }
  }
};

// ✅ 2. 메시지 전송 (+ 수신자 알림 자동 생성: users/{uid}/notifications)
export const sendMessage = async (roomId, text) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;
  if (!text || !String(text).trim()) return;

  // ✅ 종료된 방 전송 차단 + 방 존재 확인 (없는 방 updateDoc 크래시 방지)
  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);

  // [확인 1번] 방이 없으면 에러를 던져서 크래시 방지 (이미 적용됨)
  if (!roomSnap.exists()) {
    throw new Error("ROOM_NOT_FOUND");
  }

  if (roomSnap.data()?.isClosed) {
    throw new Error("ROOM_CLOSED");
  }

  const user = auth.currentUser;
  const fallbackNickname = user.displayName || (user.email ? user.email.split("@")[0] : "사용자");
  const safeText = String(text);

  // ✅ 메시지 저장
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: safeText,
    senderId: user.uid,
    senderEmail: user.email || null,
    senderNickname: fallbackNickname,
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  // ✅ 방 업데이트
  await updateDoc(roomRef, {
    lastMessage: safeText,
    updatedAt: serverTimestamp(),
  });

  // ✅ 알림 생성 (참여자 중 "나" 제외)
  try {
    const roomData = roomSnap.data() || {};
    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    const targets = participants.filter((uid) => uid && uid !== user.uid);

    if (targets.length === 0) return;

    const roomTitle = roomData.title || "채팅방";
    const senderNickname = fallbackNickname;

    await Promise.all(
      targets.map((targetUid) =>
        addDoc(collection(db, "users", targetUid, "notifications"), {
          type: "chat",
          roomId,
          roomName: roomTitle,
          title: roomTitle,
          body: `${senderNickname}: ${safeText}`,
          isRead: false,
          createdAt: serverTimestamp(),
          senderId: user.uid,
        })
      )
    );
  } catch (e) {
    // 알림 생성 실패는 메시지 전송을 막지 않음
  }
};

// ✅ 3. 메시지 실시간 구독 (중복 구독 해제 및 로직 강화)
export const subscribeMessages = (roomId, callback) => {
  if (!auth.currentUser) return () => {};
  if (!isValidRoomId(roomId)) return () => {};
  if (typeof callback !== "function") return () => {};

  const userId = auth.currentUser.uid;
  const roomRef = doc(db, "chatRooms", roomId);
  const messagesRef = collection(db, "chatRooms", roomId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  let msgUnsubscribe = null;

  const roomUnsubscribe = onSnapshot(roomRef, (roomSnap) => {
    if (!roomSnap.exists()) return;

    const roomData = roomSnap.data() || {};
    const joinedAtRaw = roomData[`joinedAt_${userId}`];
    const joinedDate = safeToDate(joinedAtRaw);

    // [수정 2번 해결] joinedDate가 없으면(과거 데이터 등) 0(1970년)으로 설정하여 메시지가 보이도록 수정
    const filterTime = joinedDate ? joinedDate.getTime() - 1000 : 0; 

    if (msgUnsubscribe) msgUnsubscribe();

    msgUnsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          ...data,
          createdAt: safeToDate(data.createdAt) || new Date(0),
        };
      });

      const filtered = allMessages.filter((m) => {
        const t = m?.createdAt instanceof Date ? m.createdAt.getTime() : new Date(0).getTime();
        return t >= filterTime;
      });

      callback(filtered);
    });
  });

  return () => {
    roomUnsubscribe();
    if (msgUnsubscribe) msgUnsubscribe();
  };
};

// ✅ 4. 내 채팅방 목록 구독
export const subscribeMyRooms = (callback) => {
  if (!auth.currentUser) return () => {};
  if (typeof callback !== "function") return () => {};

  // [주의 3번] 이 쿼리는 Firestore 콘솔에서 'participants(array-contains)' + 'updatedAt(desc)' 복합 인덱스를 생성해야 함
  const q = query(
    collection(db, "chatRooms"),
    where("participants", "array-contains", auth.currentUser.uid),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const rooms = snapshot.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        updatedAt: safeToDate(data.updatedAt) || new Date(0),
      };
    });
    callback(rooms);
  });
};

// ✅ 5. 메시지 읽음 처리
export const markAsRead = async (roomId, messageIds) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  if (!Array.isArray(messageIds) || messageIds.length === 0) return;

  const batch = writeBatch(db);
  const userId = auth.currentUser.uid;

  messageIds.forEach((msgId) => {
    if (!msgId) return;
    const msgRef = doc(db, "chatRooms", roomId, "messages", msgId);
    batch.update(msgRef, { readBy: arrayUnion(userId) });
  });

  await batch.commit();
};

// ✅ 6. 채팅방 나가기 (일반)
export const leaveRoom = async (roomId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const user = auth.currentUser;
  const nickname = user.displayName || (user.email ? user.email.split("@")[0] : "사용자");
  const roomRef = doc(db, "chatRooms", roomId);

  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: `${nickname}님이 채팅방을 떠났습니다.`,
    senderId: "system",
    senderNickname: "시스템",
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  await updateDoc(roomRef, {
    participants: arrayRemove(user.uid),
    lastMessage: `${nickname}님이 퇴장하셨습니다.`,
    updatedAt: serverTimestamp(),
  });
};

// ✅ 7. 방장 나가기 (게시물 삭제 + 채팅 종료/비활성화)
export const leaveRoomAsOwner = async (roomId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const user = auth.currentUser;
  const roomRef = doc(db, "chatRooms", roomId);

  // ✅ 게시물 삭제 (post_{postId} 규칙)
  if (typeof roomId === "string" && roomId.startsWith("post_")) {
    const postId = roomId.replace(/^post_/, "");
    if (postId) {
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch (e) {}
    }
  }

  const systemText = "방장이 채팅방을 떠났습니다. 채팅이 종료되었습니다.";

  // ✅ 시스템 메시지 기록
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: systemText,
    senderId: "system",
    senderNickname: "시스템",
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  // ✅ 채팅 비활성화(종료)
  await updateDoc(roomRef, {
    isClosed: true,
    closedBy: user.uid,
    closedAt: serverTimestamp(),
    participants: arrayRemove(user.uid),
    lastMessage: systemText,
    updatedAt: serverTimestamp(),
  });
};