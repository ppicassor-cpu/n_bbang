// ✅ 경로 수정됨: ../../../firebaseConfig
import { db, auth } from "../../../firebaseConfig";
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  arrayUnion, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot, 
  where,
  writeBatch // ✅ 일괄 업데이트를 위해 추가
} from "firebase/firestore";

// ✅ 1. 채팅방 생성 또는 입장 (Join)
export const ensureRoom = async (roomId, roomName, type) => {
  if (!auth.currentUser) return;

  const roomRef = doc(db, "chatRooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    await setDoc(roomRef, {
      id: roomId,
      title: roomName,
      type: type || "group",
      participants: [auth.currentUser.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "채팅방이 개설되었습니다.",
    });
  } else {
    await updateDoc(roomRef, {
      participants: arrayUnion(auth.currentUser.uid)
    });
  }
};

// ✅ 2. 메시지 전송 (읽은 사람 목록 readBy 추가)
export const sendMessage = async (roomId, text) => {
  if (!auth.currentUser || !text.trim()) return;

  const user = auth.currentUser;
  
  await addDoc(collection(db, "chatRooms", roomId, "messages"), {
    text: text,
    senderId: user.uid,
    senderEmail: user.email,
    createdAt: serverTimestamp(),
    readBy: [user.uid], // ✅ 보낸 사람은 무조건 읽은 상태
  });

  const roomRef = doc(db, "chatRooms", roomId);
  await updateDoc(roomRef, {
    lastMessage: text,
    updatedAt: serverTimestamp(),
  });
};

// ✅ 3. 메시지 실시간 구독
export const subscribeMessages = (roomId, callback) => {
  const q = query(
    collection(db, "chatRooms", roomId, "messages"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date()
    }));
    callback(messages);
  });
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

// ✅ 5. [신규 기능] 메시지 읽음 처리 (일괄 처리)
export const markAsRead = async (roomId, messageIds) => {
  if (!auth.currentUser || !messageIds || messageIds.length === 0) return;

  const batch = writeBatch(db);
  const userId = auth.currentUser.uid;

  messageIds.forEach((msgId) => {
    const msgRef = doc(db, "chatRooms", roomId, "messages", msgId);
    batch.update(msgRef, {
      readBy: arrayUnion(userId) // 내 ID를 읽은 사람 목록에 추가
    });
  });

  await batch.commit(); // 한 번에 전송 (효율적)
};
