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
  deleteDoc
} from "firebase/firestore";

// ✅ 1. 채팅방 생성 또는 입장 (재입장 시 시간 갱신 로직 정밀화)
export const ensureRoom = async (roomId, roomName, type, ownerId) => {
  if (!auth.currentUser) return;
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
    const data = roomSnap.data();
    const currentParticipants = data.participants || [];
    const updateData = {};
    const participantsToAdd = [];

    // ✅ [수정됨] 기존 방이라도 타입(type)이 다르면 업데이트 (예: 'free' 아이콘 적용을 위해)
    if (type && data.type !== type) {
      updateData.type = type;
    }

    // ✅ [핵심 보강] 이미 participants에 있어도 joinedAt_* 이 없으면 반드시 채워준다.
    if (!data[`joinedAt_${userId}`]) {
      updateData[`joinedAt_${userId}`] = serverTimestamp();
    }

    // 유저가 participants에 없으면 추가 + joinedAt 갱신
    if (!currentParticipants.includes(userId)) {
      participantsToAdd.push(userId);
      updateData[`joinedAt_${userId}`] = serverTimestamp();
    }

    // ✅ ownerId 보강 (기존 방 데이터에도 ownerId가 없으면 채움)
    if (ownerId && !data.ownerId) {
      updateData.ownerId = ownerId;
    }

    // 방장(owner) 처리: 기존 방(이전 로직)에서 owner가 뒤늦게 participants에 추가되는 경우 joinedAt_owner가 없어서 메시지 구독이 막힘
    if (ownerId && ownerId !== userId) {
      // owner가 participants에 없으면 추가
      if (!currentParticipants.includes(ownerId)) {
        participantsToAdd.push(ownerId);
      }
      // ✅ owner가 participants에 이미 있거나(또는 이번에 추가되거나) joinedAt_owner가 없으면 반드시 채운다
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

// ✅ 2. 메시지 전송
export const sendMessage = async (roomId, text) => {
  if (!auth.currentUser || !text.trim()) return;

  // ✅ 종료된 방 전송 차단
  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (roomSnap.exists() && roomSnap.data()?.isClosed) {
    throw new Error("ROOM_CLOSED");
  }

  const user = auth.currentUser;
  
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: text,
    senderId: user.uid,
    senderEmail: user.email,
    senderNickname: user.displayName || user.email.split("@")[0],
    createdAt: serverTimestamp(),
    readBy: [user.uid],
  });

  await updateDoc(roomRef, {
    lastMessage: text,
    updatedAt: serverTimestamp(),
  });
};

// ✅ 3. 메시지 실시간 구독 (중복 구독 해제 및 로직 강화)
export const subscribeMessages = (roomId, callback) => {
  if (!auth.currentUser) return () => {};
  const userId = auth.currentUser.uid;
  const roomRef = doc(db, "chatRooms", roomId);
  const messagesRef = collection(db, "chatRooms", roomId, "messages");
  const q = query(messagesRef, orderBy("createdAt", "asc"));

  let msgUnsubscribe = null;

  const roomUnsubscribe = onSnapshot(roomRef, (roomSnap) => {
    if (!roomSnap.exists()) return;
    
    const roomData = roomSnap.data();
    const joinedAt = roomData[`joinedAt_${userId}`];
    
    if (!joinedAt) return;
    const joinedDate = joinedAt.toDate();

    if (msgUnsubscribe) msgUnsubscribe();

    msgUnsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));

      const filterTime = joinedDate.getTime() - 1000; // 오차 범위를 1초로 확대
      const filtered = allMessages.filter(m => m.createdAt.getTime() >= filterTime);
      
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
  const q = query(
    collection(db, "chatRooms"),
    where("participants", "array-contains", auth.currentUser.uid),
    orderBy("updatedAt", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const rooms = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date()
    }));
    callback(rooms);
  });
};

// ✅ 5. 메시지 읽음 처리
export const markAsRead = async (roomId, messageIds) => {
  if (!auth.currentUser || !messageIds || messageIds.length === 0) return;
  const batch = writeBatch(db);
  const userId = auth.currentUser.uid;

  messageIds.forEach((msgId) => {
    const msgRef = doc(db, "chatRooms", roomId, "messages", msgId);
    batch.update(msgRef, { readBy: arrayUnion(userId) });
  });
  await batch.commit();
};

// ✅ 6. 채팅방 나가기 (일반)
export const leaveRoom = async (roomId) => {
  if (!auth.currentUser) return;
  const user = auth.currentUser;
  const nickname = user.displayName || user.email.split("@")[0];
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
    updatedAt: serverTimestamp()
  });
};

// ✅ 7. 방장 나가기 (게시물 삭제 + 채팅 종료/비활성화)
export const leaveRoomAsOwner = async (roomId) => {
  if (!auth.currentUser) return;
  const user = auth.currentUser;
  const roomRef = doc(db, "chatRooms", roomId);

  // ✅ 게시물 삭제 (post_{postId} 규칙)
  if (typeof roomId === "string" && roomId.startsWith("post_")) {
    const postId = roomId.replace(/^post_/, "");
    if (postId) {
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch (e) {
        // 게시물이 이미 삭제된 경우 등은 무시 (채팅 종료는 계속 진행)
      }
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