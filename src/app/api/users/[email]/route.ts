import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// GET: 특정 이메일의 사용자 정보를 가져오는 함수 (이전과 동일)
export async function GET(
  _request: Request,
  { params }: { params: { email: string } }
) {
  try {
    const email = params.email;
    if (!email) {
      return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 });
    }

    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json({ 
        email: email, 
        nickname: email.split('@')[0],
        role: '일반유저' 
      });
    }

    const userData = snapshot.docs[0].data();
    
    return NextResponse.json({
      id: snapshot.docs[0].id,
      ...userData
    });

  } catch (error) {
    console.error('GET User API Error:', error);
    return NextResponse.json({ error: '사용자 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 사용자 프로필을 생성하거나 업데이트하는 함수 (새로 추가)
export async function POST(
  request: Request,
  { params }: { params: { email: string } }
) {
  try {
    const email = params.email;
    const { nickname } = await request.json();

    if (!nickname) {
      return NextResponse.json({ error: '닉네임이 필요합니다.' }, { status: 400 });
    }

    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      // 사용자가 없으면 새로 생성 (기본 역할: 일반유저)
      await usersCollection.add({
        email: email,
        nickname: nickname,
        role: '일반유저',
      });
      return NextResponse.json({ message: '프로필이 성공적으로 생성되었습니다.' });
    } else {
      // 사용자가 있으면 닉네임만 업데이트
      const docId = snapshot.docs[0].id;
      await usersCollection.doc(docId).update({
        nickname: nickname,
      });
      return NextResponse.json({ message: '닉네임이 성공적으로 업데이트되었습니다.' });
    }

  } catch (error) {
    console.error('POST User API Error:', error);
    return NextResponse.json({ error: '프로필 업데이트에 실패했습니다.' }, { status: 500 });
  }
}
