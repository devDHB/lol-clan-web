
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET(
  _request: Request,
  context: { params: Promise<{ email: string }> } // 타입을 Promise로 지정
) {
  try {
    // params를 await해서 꺼내기
    const { email } = await context.params;

    if (!email) {
      return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 });
    }

    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json({
        email,
        nickname: email.split('@')[0],
        role: '일반',
      });
    }

    const userData = snapshot.docs[0].data();
    return NextResponse.json({
      id: snapshot.docs[0].id,
      ...userData,
    });
  } catch (error) {
    console.error('GET User API Error:', error);
    return NextResponse.json(
      { error: '사용자 정보를 가져오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ email: string }> }
) {
  try {
    const { email } = await context.params;

    const { nickname } = await request.json();
    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      return NextResponse.json({ error: '닉네임은 비워둘 수 없습니다.' }, { status: 400 });
    }

    const usersCollection = db.collection('users');

    // 닉네임 중복 확인
    const nicknameSnapshot = await usersCollection.where('nickname', '==', trimmedNickname).get();
    let isNicknameTaken = false;
    nicknameSnapshot.forEach(doc => {
      if (doc.data().email !== email) {
        isNicknameTaken = true;
      }
    });

    if (isNicknameTaken) {
      return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
    }

    const userSnapshot = await usersCollection.where('email', '==', email).limit(1).get();

    if (userSnapshot.empty) {
      await usersCollection.add({
        email,
        nickname: trimmedNickname,
        role: '일반',
      });
      return NextResponse.json({ message: '프로필이 성공적으로 생성되었습니다.' });
    } else {
      const docId = userSnapshot.docs[0].id;
      await usersCollection.doc(docId).update({
        nickname: trimmedNickname,
      });
      return NextResponse.json({ message: '닉네임이 성공적으로 업데이트되었습니다.' });
    }
  } catch (error) {
    console.error('POST User API Error:', error);
    return NextResponse.json({ error: '프로필 업데이트에 실패했습니다.' }, { status: 500 });
  }
}
