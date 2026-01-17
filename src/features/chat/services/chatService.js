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
  runTransaction,
  increment,
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

  const isPostRoom = typeof roomId === "string" && roomId.startsWith("post_");

  if (!roomSnap.exists()) {
    const resolvedOwnerId = ownerId || userId;

    // ✅ [수정] post_ 방은 "방 생성"과 "참여(=participants 추가)"를 분리
    // - 방 생성 시점에는 방장만 participants에 포함
    // - 참여자(게스트) 추가는 "참여가 DB에 기록되는 순간" 기준 로직에서 처리
    const participantSet = isPostRoom ? new Set([resolvedOwnerId]) : new Set([userId]);

    // ✅ [수정] post_ 방은 방장(ownerId)만 기본 포함, 일반 방은 기존대로 방장 포함
    if (!isPostRoom && ownerId) {
      participantSet.add(ownerId);
    }
    if (isPostRoom && resolvedOwnerId === userId) {
      participantSet.add(userId);
    }

    const participantList = Array.from(participantSet);

    // joinedAt 필드도 방장 몫까지 미리 생성
    const joinedAtData = {
      [`joinedAt_${resolvedOwnerId}`]: serverTimestamp(),
    };
    if (!isPostRoom) {
      joinedAtData[`joinedAt_${userId}`] = serverTimestamp();
      if (ownerId && ownerId !== userId) {
        joinedAtData[`joinedAt_${ownerId}`] = serverTimestamp();
      }
    } else {
      if (resolvedOwnerId === userId) {
        joinedAtData[`joinedAt_${userId}`] = serverTimestamp();
      }
    }

    await setDoc(roomRef, {
      id: roomId,
      title: roomName,
      type: type || "group",
      ownerId: resolvedOwnerId,
      isClosed: false,
      participants: participantList,
      ...joinedAtData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "채팅방이 개설되었습니다.",
    });
  } else {
    // 이미 방이 존재할 때 (업데이트 로직)
    const data = roomSnap.data() || {};
    const currentParticipants = Array.isArray(data.participants) ? data.participants : [];
    const updateData = {};
    const participantsToAdd = [];

    updateData.updatedAt = serverTimestamp();

    if (type && data.type !== type) updateData.type = type;

    // ✅ [수정] post_ 방은 ensureRoom에서 게스트를 participants에 자동 추가하지 않음
    if (!isPostRoom) {
      // 내(게스트)가 없으면 추가
      if (!data[`joinedAt_${userId}`]) updateData[`joinedAt_${userId}`] = serverTimestamp();
      if (!currentParticipants.includes(userId)) {
        participantsToAdd.push(userId);
      }
    }

    // 방장 정보 업데이트 (없으면 채워넣기)
    if (ownerId && !data.ownerId) updateData.ownerId = ownerId;

    // ✅ [수정] 방이 이미 있어도, 방장이 리스트에 없으면 강제로 다시 추가 (오류 복구)
    if (ownerId && ownerId !== userId) {
      if (!currentParticipants.includes(ownerId)) {
        participantsToAdd.push(ownerId);
      }
      if (!data[`joinedAt_${ownerId}`]) {
        updateData[`joinedAt_${ownerId}`] = serverTimestamp();
      }
    }

    // ✅ [수정] post_ 방은 방장 joinedAt 누락만 보정
    if (isPostRoom) {
      const resolvedOwnerId = ownerId || data.ownerId;
      if (resolvedOwnerId && !data[`joinedAt_${resolvedOwnerId}`]) {
        updateData[`joinedAt_${resolvedOwnerId}`] = serverTimestamp();
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

// 2. 메시지 전송 (✅ 수정됨: imageUrl 파라미터 추가 및 image 필드 저장)
export const sendMessage = async (roomId, text, imageUrl = null) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  // 텍스트가 있거나 이미지가 있어야 전송 가능
  const hasText = text && String(text).trim().length > 0;
  if (!hasText && !imageUrl) return;

  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) throw new Error("ROOM_NOT_FOUND");
  if (roomSnap.data()?.isClosed) throw new Error("ROOM_CLOSED");

  const user = auth.currentUser;
  const fallbackNickname = user.displayName || (user.email ? user.email.split("@")[0] : "사용자");
  const safeText = hasText ? String(text) : "";

  // ✅ image 필드 추가
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: safeText,
    image: imageUrl || null,
    senderId: user.uid,
    senderEmail: user.email || null,
    senderNickname: fallbackNickname,
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  // ✅ 미리보기 메시지 처리 (이미지일 경우)
  const lastMessageText = imageUrl
    ? (safeText ? `📷 ${safeText}` : "📷 사진을 보냈습니다.")
    : safeText;

  await updateDoc(roomRef, {
    lastMessage: lastMessageText,
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
          body: `${senderNickname}: ${lastMessageText}`, // ✅ 알림 본문도 이미지 표시 적용
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

  const isPostRoom = typeof roomId === "string" && roomId.startsWith("post_");
  const postId = isPostRoom ? roomId.replace(/^post_/, "") : null;
  const postRef = isPostRoom && postId ? doc(db, "posts", postId) : null;

  let ownerIdFromRoom = null;
  let wasParticipant = false;

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) return;

    const roomData = roomSnap.data() || {};
    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    ownerIdFromRoom = roomData.ownerId;

    const systemText = `${nickname}님이 채팅방을 떠났습니다.`;

    // ✅ 트랜잭션 안에서 메시지/참여자만 처리 (원자성 보장)
    const msgRef = doc(collection(db, "chatRooms", roomId, "messages"));
    tx.set(msgRef, {
      text: systemText,
      senderId: "system",
      senderNickname: "시스템",
      createdAt: serverTimestamp(),
      readBy: [user.uid],
    });

    // 이미 참가자가 아니면 participants 변경 없이 lastMessage만 갱신
    if (!participants.includes(user.uid)) {
      tx.update(roomRef, {
        lastMessage: `${nickname}님이 퇴장하셨습니다.`,
        updatedAt: serverTimestamp(),
      });
      wasParticipant = false;
      return;
    }

    wasParticipant = true;

    tx.update(roomRef, {
      participants: arrayRemove(user.uid),
      lastMessage: `${nickname}님이 퇴장하셨습니다.`,
      updatedAt: serverTimestamp(),
    });
  });

  // post_ 방: 게스트만 카운트 -1 (방장은 leaveRoomAsOwner 경로)
  // ✅ 카운트는 트랜잭션 밖에서 시도 (실패해도 나가기는 유지)
  if (postRef && ownerIdFromRoom && user.uid !== ownerIdFromRoom && wasParticipant) {
    try {
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const postData = postSnap.data() || {};
        const cur = Number(postData.currentParticipants || 0);
        if (cur > 0) {
          await updateDoc(postRef, { currentParticipants: increment(-1) });
        }
      }
    } catch (e) {}
  }
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

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) return;

    const msgRef = doc(collection(db, "chatRooms", roomId, "messages"));
    tx.set(msgRef, {
      text: systemText,
      senderId: "system",
      senderNickname: "시스템",
      createdAt: serverTimestamp(),
      readBy: [user.uid],
    });

    tx.update(roomRef, {
      isClosed: true,
      closedBy: user.uid,
      closedAt: serverTimestamp(),
      participants: arrayRemove(user.uid),
      lastMessage: systemText,
      updatedAt: serverTimestamp(),
    });
  });
};
