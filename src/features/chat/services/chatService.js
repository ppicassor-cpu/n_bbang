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
  deleteField,
} from "firebase/firestore";
// ✅ [추가] 로컬 저장소 임포트
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// ✅ [추가] 캐시 키 생성
const getCacheKey = (roomId) => `CHAT_CACHE_V1_${roomId}`;

// ✅ [추가] 로컬 메시지 불러오기
export const loadCachedMessages = async (roomId) => {
  try {
    const json = await AsyncStorage.getItem(getCacheKey(roomId));
    if (!json) return [];
    const parsed = JSON.parse(json);
    return parsed.map((msg) => ({
      ...msg,
      createdAt: safeToDate(msg.createdAt),
    }));
  } catch (e) {
    return [];
  }
};

// ✅ [추가] 로컬 메시지 저장하기
export const saveCachedMessages = async (roomId, messages) => {
  try {
    // 용량 관리를 위해 최신 500개만 저장
    const toSave = messages.slice(0, 500);
    const json = JSON.stringify(toSave);
    await AsyncStorage.setItem(getCacheKey(roomId), json);
  } catch (e) {
    console.error("캐시 저장 실패", e);
  }
};

const isValidRoomId = (roomId) => typeof roomId === "string" && roomId.trim().length > 0;

const getMyDisplayName = async () => {
  try {
    const uid = auth?.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data() || {};
        const name = String(data.displayName || "").trim();
        if (name) return name;
      }
    }
  } catch (e) {}

  const u = auth?.currentUser;
  const fromAuth = String(u?.displayName || "").trim();
  if (fromAuth) return fromAuth;

  const fromEmail = u?.email ? String(u.email).split("@")[0] : "";
  return fromEmail || "사용자";
};

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
  // ✅ 무료나눔 방도 판별 추가
  const isFreeRoom = typeof roomId === "string" && roomId.startsWith("free_");

  // ✅ N빵(post_)과 무료나눔(free_) 각각의 규칙에 맞게 postId 추출
  let postId = null;
  if (isPostRoom) {
    postId = roomId.replace("post_", "");
  } else if (isFreeRoom) {
    // free_게시글ID_유저ID 형식에서 게시글ID만 가져옴
    postId = roomId.split("_")[1];
  }
  let resolvedPostOwnerId = ownerId;
if (isPostRoom && !resolvedPostOwnerId && postId) {
  try {
    const postSnap = await getDoc(doc(db, "posts", postId));
    if (postSnap.exists()) {
      const postData = postSnap.data() || {};
      resolvedPostOwnerId =
        postData.ownerId ||
        postData.uid ||
        postData.userId ||
        postData.senderId ||
        postData.fromUserId ||
        null;
    }
  } catch (e) {}
}
  if (!roomSnap.exists()) {
    const resolvedOwnerId = isPostRoom ? (resolvedPostOwnerId || userId) : (ownerId || userId);

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
      postId: postId, // ✅ postId 필드를 명시적으로 저장 (나중에 쿼리용)
      title: roomName,
      type: type || "group",
      ownerId: resolvedOwnerId,
      isClosed: false,
      participants: participantList,

      // ✅ unreadCounts 초기화 (참여자별 0 세팅)
      unreadCounts: participantList.reduce((acc, uid) => {
        acc[uid] = 0;
        return acc;
      }, {}),

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

    // ✅ 핵심:
    // 1) participants 추가는 "participants만" 단독 update로 먼저 처리 (rules 통과)
    // 2) updatedAt/joinedAt/type/ownerId 같은 메타는 "내가 참여자인 상태"에서만 별도 update로 처리
    // 3) post_ 방에서 게스트는 ensureRoom이 메타 update를 하면 rules에 막히므로, 여기서는 아무것도 건드리지 않고 종료

    // ✅ post_ 방: 게스트는 여기서 업데이트 금지 (참여는 DetailScreen 트랜잭션에서 처리)
    if (isPostRoom) {
      const resolvedOwnerId = resolvedPostOwnerId || data.ownerId;

      // 방장 본인이면 누락된 joinedAt 정도만 보정 가능(이미 participants에 있으니까)
      if (userId === resolvedOwnerId) {
        if (!data[`joinedAt_${resolvedOwnerId}`]) updateData[`joinedAt_${resolvedOwnerId}`] = serverTimestamp();
        updateData.updatedAt = serverTimestamp();

        if (Object.keys(updateData).length > 0) {
          await updateDoc(roomRef, updateData);
        }
      }

      return;
    }

    // ✅ non-post 방: 참여자 추가 필요 여부 수집
    if (!currentParticipants.includes(userId)) {
      participantsToAdd.push(userId);
    }

    if (ownerId && ownerId !== userId && !currentParticipants.includes(ownerId)) {
      participantsToAdd.push(ownerId);
    }

    // 1) participants 추가는 "participants만" 단독 update
    if (participantsToAdd.length > 0) {
      await updateDoc(roomRef, {
        participants: arrayUnion(...participantsToAdd),
      });

      // ✅ [추가] 내가 참여자로 추가되는 경우(신규/재입장) 시스템 입장 메시지 전송
      if (participantsToAdd.includes(userId)) {
        const myName = await getMyDisplayName();
        await addDoc(collection(db, "chatRooms", roomId, "messages"), {
          text: `${myName}님이 입장했습니다.`,
          senderId: "system",
          senderNickname: "시스템",
          actorId: userId,
          displayName: myName,
          type: "system",
          createdAt: serverTimestamp(),
          readBy: [userId],
        });
      }
    }

    // ✅ 이제부터 메타 업데이트 (내가 참여자인 상태에서만)
    const willBeParticipant = currentParticipants.includes(userId) || participantsToAdd.includes(userId);
    if (!willBeParticipant) return;

    updateData.updatedAt = serverTimestamp();

    if (type && data.type !== type) updateData.type = type;

    // ✅ [수정] 재입장(명단에 없었음)이거나 필드가 아예 없으면 -> 시간을 '지금'으로 강제 갱신
    // 이렇게 해야 나갔다 들어왔을 때 과거 대화가 안 보입니다.
    const leftDate = safeToDate(data[`leftAt_${userId}`]);
    const joinedDate = safeToDate(data[`joinedAt_${userId}`]);

    if (
  participantsToAdd.includes(userId) ||
  !data[`joinedAt_${userId}`] ||
  (leftDate && (!joinedDate || leftDate.getTime() >= joinedDate.getTime()))
) {
  updateData[`joinedAt_${userId}`] = serverTimestamp();
}
    if (ownerId && ownerId !== userId && !data[`joinedAt_${ownerId}`]) {
      updateData[`joinedAt_${ownerId}`] = serverTimestamp();
    }

    if (ownerId && !data.ownerId) updateData.ownerId = ownerId;

    const existingUnreadCounts =
      data.unreadCounts && typeof data.unreadCounts === "object" ? data.unreadCounts : {};
    const roomOwnerId = data.ownerId || ownerId || null;

    if (existingUnreadCounts[userId] === undefined) {
      updateData[`unreadCounts.${userId}`] = 0;
    }

    if (roomOwnerId && existingUnreadCounts[roomOwnerId] === undefined) {
      updateData[`unreadCounts.${roomOwnerId}`] = 0;
    }

    for (const uid of participantsToAdd) {
      if (!uid) continue;
      if (existingUnreadCounts[uid] === undefined) {
        updateData[`unreadCounts.${uid}`] = 0;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await updateDoc(roomRef, updateData);
    }
  }
};

// 2. 메시지 전송 (✅ 수정됨: imageUrl 파라미터 추가 및 image 필드 저장)
export const sendMessage = async (roomId, text, imageUrl = null, replyTo = null) => {
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
  const senderDisplayName = await getMyDisplayName();
  const safeText = hasText ? String(text) : "";

  const roomData = roomSnap.data() || {};
  const rawParticipants = Array.isArray(roomData.participants) ? roomData.participants : [];
  const participants = rawParticipants
    .map((p) => (p && typeof p === "object" ? p.uid : p))
    .filter(Boolean);
  const ownerId = roomData.ownerId || null;

  // ✅ 채팅방 리스트 “안읽음(1)”용 대상자(=보낸 사람 제외, 방장도 보정 포함)
  const targets = Array.from(
    new Set([...(participants || []), ownerId].filter(Boolean))
  ).filter((uid) => uid !== user.uid);

  // ✅ replyTo 정규화 (잘못된 값이면 null로)
  const normalizedReplyTo =
    replyTo && typeof replyTo === "object"
      ? {
          id: replyTo.id ?? replyTo.messageId ?? null,
          messageId: replyTo.messageId ?? replyTo.id ?? null,
          text: replyTo.text ?? "",
          senderName: replyTo.senderName ?? "사용자",
        }
      : null;

  // ✅ image + replyTo 필드 저장 (메시지ID 확보)
  // ✅ senderNickname => displayName 기준으로 고정 저장
  const msgDocRef = await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: safeText,
    image: imageUrl || null,
    senderId: user.uid,
    senderEmail: user.email || null,
    senderNickname: senderDisplayName,
    createdAt: serverTimestamp(),
    readBy: [user.uid],
    replyTo: normalizedReplyTo,
  });

  // ✅ 미리보기 메시지 처리 (이미지일 경우)
  const lastMessageText = imageUrl
    ? (safeText ? `📷 ${safeText}` : "📷 사진을 보냈습니다.")
    : safeText;

  // ✅ 채팅방 문서에 lastMessage + lastMessageId + unreadBy 저장(리스트 배지용)
  const unreadCountsUpdate = {};
  targets.forEach((uid) => {
    unreadCountsUpdate[`unreadCounts.${uid}`] = increment(1);
  });

  await updateDoc(roomRef, {
    lastMessage: lastMessageText,
    updatedAt: serverTimestamp(),
    lastMessageId: msgDocRef.id,
    lastMessageSenderId: user.uid,
    lastMessageCreatedAt: serverTimestamp(),
    ...unreadCountsUpdate,
  });

  try {
    if (targets.length === 0) return;

    const roomTitle = roomData.title || "채팅방";

    await Promise.all(
      targets.map((targetUid) =>
        addDoc(collection(db, "users", targetUid, "notifications"), {
          type: "chat",
          roomId,
          roomName: roomTitle,
          title: roomTitle,
          body: `${senderDisplayName}: ${lastMessageText}`,
          isRead: false,
          createdAt: serverTimestamp(),
          senderId: user.uid,
        })
      )
    );
  } catch (e) {}
};



// 3. 메시지 구독 (최신 100개 + 화면 시간순)
export const subscribeMessages = (roomId, callback, lastDate = null) => {
  if (!auth.currentUser) return () => {};
  if (!isValidRoomId(roomId)) return () => {};
  if (typeof callback !== "function") return () => {};

  const userId = auth.currentUser.uid;
  const roomRef = doc(db, "chatRooms", roomId);
  const messagesRef = collection(db, "chatRooms", roomId, "messages");

  // ✅ [수정] lastDate가 있으면 '이후' 데이터만 쿼리(비용 절감), 없으면 기존처럼 '최신' 쿼리
  let q;
  if (lastDate) {
    // 캐시 이후 데이터는 시간순(ASC)으로 가져옴
    q = query(messagesRef, orderBy("createdAt", "asc"), where("createdAt", ">", lastDate));
  } else {
    // 캐시 없을 땐 최신 50개(DESC)
    q = query(messagesRef, orderBy("createdAt", "desc"), limit(50));
  }

  let msgUnsubscribe = null;

  const roomUnsubscribe = onSnapshot(roomRef, (roomSnap) => {
    if (!roomSnap.exists()) return;

    const roomData = roomSnap.data() || {};
    const joinedAtRaw = roomData[`joinedAt_${userId}`];
    const leftAtRaw = roomData[`leftAt_${userId}`];

    const joinedDate = safeToDate(joinedAtRaw);
    const leftDate = safeToDate(leftAtRaw);

    const effectiveDate =
      joinedDate && leftDate ? (leftDate > joinedDate ? leftDate : joinedDate)
      : (joinedDate || leftDate);

    const filterTime = effectiveDate ? effectiveDate.getTime() - 1000 : 0;
    if (msgUnsubscribe) msgUnsubscribe();

    msgUnsubscribe = onSnapshot(q, (snapshot) => {
      let allMessages = snapshot.docs.map((d) => {
        const data = d.data() || {};

        const normalizedSenderId =
          data.senderId || data.uid || data.userId || data.senderUid || data.fromUserId || data.ownerId || null;

        return {
          ...data,
          senderId: normalizedSenderId,
          createdAt: safeToDate(data.createdAt) || new Date(0),
          id: d.id,
        };
      });

      // ✅ [수정] DESC 쿼리(캐시 없을 때)인 경우에만 뒤집어서 시간순(과거->미래) 정렬 맞춤
      // ASC 쿼리(캐시 있을 때)는 이미 시간순이므로 reverse 불필요
      if (!lastDate) {
        allMessages = allMessages.reverse();
      }

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

  // ✅ 채팅방 리스트 “안읽음(1)” 배지 제거용: unreadBy에서 나 제거
  try {
    const roomRef = doc(db, "chatRooms", roomId);
    await updateDoc(roomRef, { [`unreadCounts.${userId}`]: 0 });
  } catch (e) {}
};


// 6. 채팅방 나가기 (방 문서/메시지 고아 방지: 방 삭제 없음)
// 6. 채팅방 나가기 (방 문서/메시지 고아 방지: 방 삭제 없음)
// 6. 채팅방 나가기
export const leaveRoom = async (roomId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const user = auth.currentUser;
  const roomRef = doc(db, "chatRooms", roomId);

  // ✅ 1. 최신 닉네임 조회
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const latestNickname = userSnap.exists() 
    ? (userSnap.data().displayName || "사용자") 
    : "사용자";

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

    const systemText = `${latestNickname}님이 퇴장하셨습니다.`;

    const msgRef = doc(collection(db, "chatRooms", roomId, "messages"));
    tx.set(msgRef, {
      text: systemText,
      senderId: "system",
      senderNickname: "시스템",
      actorId: user.uid,
      displayName: latestNickname,
      type: "system",
      createdAt: serverTimestamp(),
      readBy: [user.uid],
    });

    // ✅ 2. 중복 제거된 깔끔한 참여 로직
    if (!participants.includes(user.uid)) {
      tx.update(roomRef, {
  lastMessage: systemText,
  updatedAt: serverTimestamp(),
  [`leftAt_${user.uid}`]: serverTimestamp(),
  [`joinedAt_${user.uid}`]: deleteField(),
});
      wasParticipant = false;
      return;
    }

    wasParticipant = true;
    tx.update(roomRef, {
  participants: arrayRemove(user.uid),
  lastMessage: systemText,
  updatedAt: serverTimestamp(),
  [`leftAt_${user.uid}`]: serverTimestamp(),
  [`joinedAt_${user.uid}`]: deleteField(),
});
    // ❌ (기존의 412~420행 중복 코드는 여기서 삭제됨)
  });

  // ✅ 3. 카운트 감소 로직 (생략 없음)
  if (postRef && ownerIdFromRoom && user.uid !== ownerIdFromRoom && wasParticipant) {
    try {
      await runTransaction(db, async (tx) => {
        const postSnap = await tx.get(postRef);
        if (!postSnap.exists()) return;
        const postData = postSnap.data() || {};
        const cur = Number(postData.currentParticipants || 0);
        if (cur <= 1) return;
        tx.update(postRef, { currentParticipants: cur - 1 });
      });
    } catch (e) {
      console.error("카운트 감소 실패:", e);
    }
  }
};

// 7. 방장 나가기 (종료 처리)
export const leaveRoomAsOwner = async (roomId) => {
  if (!auth.currentUser) return;
  if (!isValidRoomId(roomId)) return;

  const user = auth.currentUser;
  const roomRef = doc(db, "chatRooms", roomId);

  // ✅ 1. DB에서 방장의 최신 닉네임을 가져옵니다. (닉네임 해결 핵심)
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const latestNickname = userSnap.exists() 
    ? (userSnap.data().displayName || "방장") 
    : "방장";

  if (typeof roomId === "string" && roomId.startsWith("post_")) {
    const postId = roomId.replace(/^post_/, "");
    if (postId) {
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch (e) {}
    }
  }

  // ✅ 2. 닉네임이 포함된 종료 메시지 구성
  const systemText = `${latestNickname}님이 채팅방을 떠났습니다. 채팅이 종료되었습니다.`;

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) return;

    const msgRef = doc(collection(db, "chatRooms", roomId, "messages"));
    tx.set(msgRef, {
      text: systemText,
      senderId: "system",
      senderNickname: "시스템",
      actorId: user.uid,           // ✅ 방장 ID 저장
      displayName: latestNickname, // ✅ 방장 닉네임 저장
      type: "system",              // ✅ 타입 명시
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