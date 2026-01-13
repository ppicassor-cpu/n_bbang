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
  limit,
} from "firebase/firestore";

const safeToDate = (v) => {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
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

const isValidRoomId = (roomId) => typeof roomId === "string" && roomId.trim().length > 0;

// ✅ (문제3) markAsRead 폭증 방지용: room 단위로 최근 처리한 메시지ID 캐시
// - 로직 구조는 그대로(배치 업데이트) 유지
// - 동일 messageIds가 반복 들어오면 write 생략
const __markAsReadCache = new Map(); // roomId -> Set(msgId)
const __CACHE_MAX_PER_ROOM = 300;

// 1. 채팅방 생성/입장
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

    updateData.updatedAt = serverTimestamp();

    if (type && data.type !== type) updateData.type = type;
    if (!data[`joinedAt_${userId}`]) updateData[`joinedAt_${userId}`] = serverTimestamp();

    if (!currentParticipants.includes(userId)) {
      participantsToAdd.push(userId);
      updateData[`joinedAt_${userId}`] = serverTimestamp();
    }

    if (ownerId && !data.ownerId) updateData.ownerId = ownerId;

    if (ownerId && ownerId !== userId) {
      if (!currentParticipants.includes(ownerId)) participantsToAdd.push(ownerId);
      if (!data[`joinedAt_${ownerId}`]) updateData[`joinedAt_${ownerId}`] = serverTimestamp();
    }

    if (participantsToAdd.length > 0) {
      updateData.participants = arrayUnion(...participantsToAdd);
    }

    if (Object.keys(updateData).length > 0) {
      await updateDoc(roomRef, updateData);
    }
  }
};

// 2. 메시지 전송
export const sendMessage = async (roomId, text) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;
  if (!text || !String(text).trim()) return;

  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("ROOM_NOT_FOUND");
  if (roomSnap.data()?.isClosed) throw new Error("ROOM_CLOSED");

  const user = auth.currentUser;
  const fallbackNickname = user.displayName || (user.email ? user.email.split("@")[0] : "사용자");
  const safeText = String(text);

  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: safeText,
    senderId: user.uid,
    senderEmail: user.email || null,
    senderNickname: fallbackNickname,
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  await updateDoc(roomRef, {
    lastMessage: safeText,
    updatedAt: serverTimestamp(),
  });

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
          // ✅ (문제1) 알림 createdAt 누락 대비: 항상 createdAt 세팅(원래도 있었지만 "누락 대비" 명시)
          createdAt: serverTimestamp(),
          senderId: user.uid,
        })
      )
    );
  } catch (e) {}
};

// 3. 메시지 구독 (최신 100개 + 화면 시간순)
export const subscribeMessages = (roomId, callback) => {
  if (!auth.currentUser) return () => {};
  if (!isValidRoomId(roomId)) return () => {};
  if (typeof callback !== "function") return () => {};

  const userId = auth.currentUser.uid;
  const roomRef = doc(db, "chatRooms", roomId);
  const messagesRef = collection(db, "chatRooms", roomId, "messages");

  const q = query(messagesRef, orderBy("createdAt", "desc"), limit(100));

  let msgUnsubscribe = null;

  const roomUnsubscribe = onSnapshot(roomRef, (roomSnap) => {
    if (!roomSnap.exists()) return;

    const roomData = roomSnap.data() || {};
    const joinedAtRaw = roomData[`joinedAt_${userId}`];
    const joinedDate = safeToDate(joinedAtRaw);
    const filterTime = joinedDate ? joinedDate.getTime() - 1000 : 0;

    if (msgUnsubscribe) msgUnsubscribe();

    msgUnsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs
        .map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            createdAt: safeToDate(data.createdAt) || new Date(0),
          };
        })
        .reverse();

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

// 4. 내 채팅방 목록 구독
export const subscribeMyRooms = (callback) => {
  if (!auth.currentUser) return () => {};
  if (typeof callback !== "function") return () => {};

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

// 5. 메시지 읽음 처리
export const markAsRead = async (roomId, messageIds) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;
  if (!Array.isArray(messageIds) || messageIds.length === 0) return;

  // ✅ (문제3) 중복 호출/중복 id로 write 폭증 방지
  // - 동일 roomId에서 이미 처리한 msgId는 제외
  // - 동시에 같은 배열이 여러 번 들어와도 batch가 비면 commit 안 함
  const userId = auth.currentUser.uid;

  let seenSet = __markAsReadCache.get(roomId);
  if (!seenSet) {
    seenSet = new Set();
    __markAsReadCache.set(roomId, seenSet);
  }

  const uniqueIds = [];
  for (const msgId of messageIds) {
    if (!msgId) continue;
    if (seenSet.has(msgId)) continue;
    seenSet.add(msgId);
    uniqueIds.push(msgId);

    // 캐시 폭주 방지(최대 N개 유지, 초과 시 초기화)
    if (seenSet.size > __CACHE_MAX_PER_ROOM) {
      __markAsReadCache.set(roomId, new Set([msgId]));
      seenSet = __markAsReadCache.get(roomId);
    }
  }

  if (uniqueIds.length === 0) return;

  const batch = writeBatch(db);

  uniqueIds.forEach((msgId) => {
    const msgRef = doc(db, "chatRooms", roomId, "messages", msgId);
    batch.update(msgRef, { readBy: arrayUnion(userId) });
  });

  await batch.commit();
};

// 6. 채팅방 나가기 (방 문서/메시지 고아 방지: 방 삭제 없음)
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

// 7. 방장 나가기 (종료 처리)
export const leaveRoomAsOwner = async (roomId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const user = auth.currentUser;
  const roomRef = doc(db, "chatRooms", roomId);

  if (typeof roomId === "string" && roomId.startsWith("post_")) {
    const postId = roomId.replace(/^post_/, "");
    if (postId) {
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch (e) {}
    }
  }

  const systemText = "방장이 채팅방을 떠났습니다. 채팅이 종료되었습니다.";

  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: systemText,
    senderId: "system",
    senderNickname: "시스템",
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  await updateDoc(roomRef, {
    isClosed: true,
    closedBy: user.uid,
    closedAt: serverTimestamp(),
    participants: arrayRemove(user.uid),
    lastMessage: systemText,
    updatedAt: serverTimestamp(),
  });
};
