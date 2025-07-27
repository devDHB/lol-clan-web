import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 권한 확인 헬퍼 함수
async function checkScrimCreationPermission(email: string): Promise<boolean> {
  if (!email) return false;
  
  const usersCollection = db.collection('users');
  const userSnapshot = await usersCollection.where('email', '==', email).limit(1).get();
  
  if (userSnapshot.empty) return false;

  const userData = userSnapshot.docs[0].data();
  const userRole = userData.role;

  // 총관리자 또는 관리자는 항상 생성 가능
  if (userRole === '총관리자' || userRole === '관리자') {
    return true;
  }

  // 일반 유저는 내전 참여 횟수 확인
  const totalScrimsPlayed = userData.totalScrimsPlayed || 0;
  if (totalScrimsPlayed >= 15) {
    return true;
  }
  
  return false;
}

// GET: 모든 내전 목록을 가져오는 함수
export async function GET() {
  try {
    const scrimsCollection = db.collection('scrims');
    const snapshot = await scrimsCollection.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return NextResponse.json([]);
    }

    const scrims: unknown[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      scrims.push({
        scrimId: doc.id,
        ...data,
        createdAt,
      });
    });

    return NextResponse.json(scrims);

  } catch (error) {
    console.error('GET Scrims API Error:', error);
    return NextResponse.json({ error: '내전 목록을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새로운 내전을 만드는 함수 (scrimType 추가)
export async function POST(request: Request) {
  try {
    const { scrimName, creatorEmail, scrimType } = await request.json();

    if (!scrimName || !creatorEmail || !scrimType) {
      return NextResponse.json({ error: '내전 이름, 생성자, 타입 정보가 필요합니다.' }, { status: 400 });
    }

    // 내전 생성 권한 확인
    const hasPermission = await checkScrimCreationPermission(creatorEmail);
    if (!hasPermission) {
      return NextResponse.json({ error: '내전을 생성할 권한이 없습니다. (관리자 또는 15회 이상 참여자)' }, { status: 403 });
    }

    const newScrim = {
      scrimName,
      creatorEmail,
      scrimType, // --- 내전 타입 저장 ---
      status: '모집중',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startTime: null,
      applicants: [],
      waitlist: [],
      blueTeam: [],
      redTeam: [],
    };

    const docRef = await db.collection('scrims').add(newScrim);

    return NextResponse.json({ message: '내전이 성공적으로 생성되었습니다.', scrimId: docRef.id });

  } catch (error) {
    console.error('POST Scrim API Error:', error);
    return NextResponse.json({ error: '내전 생성에 실패했습니다.' }, { status: 500 });
  }
}