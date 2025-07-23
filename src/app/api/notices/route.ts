import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// GET: 모든 공지사항 목록을 가져오는 함수 (닉네임, 내용 포함하도록 수정)
export async function GET() {
  try {
    const usersSnapshot = await db.collection('users').get();
    const userMap: { [email: string]: string } = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.email && data.nickname) {
        userMap[data.email] = data.nickname;
      }
    });

    const noticesCollection = db.collection('notices');
    const snapshot = await noticesCollection.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return NextResponse.json([]);
    }

    const notices: unknown[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      const authorEmail = data.authorEmail || '';
      const authorNickname = userMap[authorEmail] || authorEmail.split('@')[0];

      notices.push({
        noticeId: doc.id,
        ...data,
        createdAt,
        authorNickname,
      });
    });

    return NextResponse.json(notices);
  } catch (error) {
    console.error('GET Notices API Error:', error);
    return NextResponse.json({ error: '공지사항을 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새로운 공지사항을 작성하는 함수 (이전과 동일)
export async function POST(request: Request) {
  try {
    const { title, content, authorEmail, imageUrls } = await request.json();

    if (!title || !content || !authorEmail) {
      return NextResponse.json({ error: '제목, 내용, 작성자 정보가 필요합니다.' }, { status: 400 });
    }

    const usersCollection = db.collection('users');
    const userSnapshot = await usersCollection.where('email', '==', authorEmail).limit(1).get();

    if (userSnapshot.empty) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const userData = userSnapshot.docs[0].data();
    if (userData.role !== '총관리자' && userData.role !== '관리자') {
      return NextResponse.json({ error: '공지사항을 작성할 권한이 없습니다.' }, { status: 403 });
    }

    const newNotice = {
      title,
      content,
      authorEmail,
      imageUrls: imageUrls || [], // 이미지가 없으면 빈 배열로 저장
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('notices').add(newNotice);

    return NextResponse.json({ message: '공지사항이 성공적으로 작성되었습니다.', noticeId: docRef.id });

  } catch (error) {
    console.error('POST Notice API Error:', error);
    return NextResponse.json({ error: '공지사항 작성에 실패했습니다.' }, { status: 500 });
  }
}