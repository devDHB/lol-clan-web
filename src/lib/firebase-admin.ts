// src/lib/firebase-admin.ts
import admin from 'firebase-admin';

// 앱이 이미 초기화되었는지 확인하여 중복 초기화를 방지합니다.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // privateKey에서 \n 문자를 실제 줄바꿈으로 변경합니다.
      privateKey: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
    }),
  });
}

// Firestore 데이터베이스 객체를 내보냅니다.
const db = admin.firestore();
export { db };