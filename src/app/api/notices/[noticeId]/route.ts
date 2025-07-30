import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// 요청 시에 항상 동적으로 실행
export const dynamic = 'force-dynamic';

// GET
export async function GET(
  _request: Request,
  context: { params: Promise<{ noticeId: string }> }
) {
  try {
    const { noticeId } = await context.params;

    if (!noticeId) {
      return NextResponse.json({ error: '공지사항 ID가 필요합니다.' }, { status: 400 });
    }

    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeDoc = await noticeRef.get();

    if (!noticeDoc.exists) {
      return NextResponse.json({ error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
    }

    const noticeData = noticeDoc.data();
    if (!noticeData) {
      return NextResponse.json({ error: '공지사항 데이터를 불러올 수 없습니다.' }, { status: 500 });
    }

    let authorNickname = noticeData.authorEmail;
    const usersCollection = db.collection('users');
    const userSnapshot = await usersCollection
      .where('email', '==', noticeData.authorEmail)
      .limit(1)
      .get();

    if (!userSnapshot.empty) {
      authorNickname = userSnapshot.docs[0].data().nickname || authorNickname;
    }

    const finalData = {
      noticeId: noticeDoc.id,
      ...noticeData,
      authorNickname,
      createdAt: noticeData.createdAt?.toDate
        ? noticeData.createdAt.toDate().toISOString()
        : new Date().toISOString(),
    };

    return NextResponse.json(finalData);
  } catch (error) {
    console.error('GET Notice Detail API Error:', error);
    return NextResponse.json({ error: '공지사항을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// 사용자 권한을 확인하는 헬퍼 함수
async function checkPermissions(userEmail: string, noticeAuthorEmail: string) {
  const usersCollection = db.collection('users');
  const userSnapshot = await usersCollection.where('email', '==', userEmail).limit(1).get();
  if (userSnapshot.empty) return false;

  const userRole = userSnapshot.docs[0].data().role;
  if (userRole === '총관리자') return true;
  if (userRole === '관리자' && userEmail === noticeAuthorEmail) return true;

  return false;
}
// PATCH
export async function PATCH(
  request: Request,
  context: { params: Promise<{ noticeId: string }> }
) {
  try {
    const { noticeId } = await context.params; // 🔥 await 필요
    const { title, content, userEmail, imageUrls } = await request.json();

    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeDoc = await noticeRef.get();
    if (!noticeDoc.exists) {
      return NextResponse.json({ error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
    }

    const hasPermission = await checkPermissions(userEmail, noticeDoc.data()?.authorEmail);
    if (!hasPermission) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    await noticeRef.update({ title, content, imageUrls });
    return NextResponse.json({ message: '공지사항이 성공적으로 수정되었습니다.' });
  } catch (error) {
    console.error('PATCH Notice API Error:', error);
    return NextResponse.json({ error: '공지사항 수정에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  request: Request,
  context: { params: Promise<{ noticeId: string }> }
) {
  try {
    const { noticeId } = await context.params; // 🔥 await 필요
    const { userEmail } = await request.json();

    const noticeRef = db.collection('notices').doc(noticeId);
    const noticeDoc = await noticeRef.get();
    if (!noticeDoc.exists) {
      return NextResponse.json({ error: '공지사항을 찾을 수 없습니다.' }, { status: 404 });
    }

    const hasPermission = await checkPermissions(userEmail, noticeDoc.data()?.authorEmail);
    if (!hasPermission) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await noticeRef.delete();
    return NextResponse.json({ message: '공지사항이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('DELETE Notice API Error:', error);
    return NextResponse.json({ error: '공지사항 삭제에 실패했습니다.' }, { status: 500 });
  }
}
