import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// GET: 특정 ID의 공지사항 하나만 가져오는 함수
export async function GET(
  _request: Request,
  { params }: { params: { noticeId: string } }
) {
  try {
    const noticeId = params.noticeId;
    if (!noticeId) {
      return NextResponse.json({ error: '공지사항 ID가 필요합니다.' }, { status: 400 });
    }

    // 1. 'notices' 컬렉션에서 해당 ID의 문서를 찾습니다.
    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeDoc = await noticeRef.get();

    if (!noticeDoc.exists) {
      return NextResponse.json({ error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
    }

    const noticeData = noticeDoc.data();
    if (!noticeData) {
        return NextResponse.json({ error: '공지사항 데이터를 불러올 수 없습니다.' }, { status: 500 });
    }

    // 2. 작성자 이메일을 이용해 'users' 컬렉션에서 닉네임을 찾습니다.
    let authorNickname = noticeData.authorEmail; // 기본값은 이메일
    const usersCollection = db.collection('users');
    const userSnapshot = await usersCollection.where('email', '==', noticeData.authorEmail).limit(1).get();

    if (!userSnapshot.empty) {
      authorNickname = userSnapshot.docs[0].data().nickname || authorNickname;
    }
    
    // 3. 최종 데이터를 조합하여 반환합니다.
    const finalData = {
      noticeId: noticeDoc.id,
      ...noticeData,
      authorNickname, // 닉네임 추가
      createdAt: noticeData.createdAt?.toDate ? noticeData.createdAt.toDate().toISOString() : new Date().toISOString(),
    };

    return NextResponse.json(finalData);

  } catch (error) {
    console.error('GET Notice Detail API Error:', error);
    return NextResponse.json({ error: '공지사항을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}
