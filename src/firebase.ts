import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp, getDocs, deleteDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQM_x6e8ihuPL7ToHMoFtFO-qWoupCg30",
  authDomain: "jktai1st.firebaseapp.com",
  projectId: "jktai1st",
  storageBucket: "jktai1st.firebasestorage.app",
  messagingSenderId: "984215151935",
  appId: "1:984215151935:web:805366bf13ae19be471f8a"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "wordcloud-db");

// Firestore WordCloud 集合名稱
export const WORDS_COLLECTION = "wordcloud";

export interface WordEntry {
  text: string;
  weight: number;
  createdAt: Timestamp;
}

// 送出新詞到 Firestore
export async function submitWord(text: string, weight: number = 1) {
  if (!text.trim()) return;
  await addDoc(collection(db, WORDS_COLLECTION), {
    text: text.trim(),
    weight: weight,
    createdAt: Timestamp.now()
  });
}

// 清空所有 Firestore 詞彙資料
export async function clearAllWords() {
  const snapshot = await getDocs(collection(db, WORDS_COLLECTION));
  const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, WORDS_COLLECTION, d.id)));
  await Promise.all(deletePromises);
}
