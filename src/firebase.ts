// src/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // ✅ Firestore import 추가
import { getDatabase } from "firebase/database";   // ✅ Realtime Database import 추가


const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    // ✅ Realtime Database URL 추가 (Firebase 콘솔에서 확인 가능)
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

// Vercel 배포 환경 등에서 중복 초기화를 방지하기 위한 코드
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);     // ✅ Firestore 인스턴스 export
export const rtdb = getDatabase(app);    // ✅ Realtime Database 인스턴스 export
