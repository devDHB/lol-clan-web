import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 권한 확인 헬퍼 함수들
async function isSuperAdmin(email: string): Promise<boolean> {
    if (!email) return false;
    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();
    if (snapshot.empty) return false;
    return snapshot.docs[0].data().role === '총관리자';
}

async function isAdmin(email: string): Promise<boolean> {
    if (!email) return false;
    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();
    if (snapshot.empty) return false;
    const role = snapshot.docs[0].data().role;
    return role === '총관리자' || role === '관리자';
}

// GET: 모든 사용자 목록 조회 (관리자 이상)
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const requesterEmail = searchParams.get('requesterEmail');
        if (!requesterEmail || !(await isAdmin(requesterEmail))) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return NextResponse.json(users);
    } catch (error) {
        console.error('Admin GET Users Error:', error);
        return NextResponse.json({ error: '사용자 목록 조회에 실패했습니다.' }, { status: 500 });
    }
}

// POST: 신규 사용자 생성 (관리자 이상)
export async function POST(request: Request) {
    try {
        const { email, password, nickname, role, requesterEmail } = await request.json();
        if (!requesterEmail || !(await isAdmin(requesterEmail))) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }
        if (role === '총관리자') {
            return NextResponse.json({ error: '총관리자 역할은 부여할 수 없습니다.' }, { status: 403 });
        }

        const usersCollection = db.collection('users');
        const nicknameSnapshot = await usersCollection.where('nickname', '==', nickname.trim()).get();
        if (!nicknameSnapshot.empty) {
            return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
        }

        const userRecord = await admin.auth().createUser({ email, password });
        await usersCollection.doc(userRecord.uid).set({ // UID를 문서 ID로 사용
            email: userRecord.email,
            nickname: nickname.trim(),
            role,
        });

        return NextResponse.json({ message: '사용자가 성공적으로 생성되었습니다.' });
    } catch (error) {
        console.error('Admin POST User Error:', error);
        return NextResponse.json({ error: '사용자 생성에 실패했습니다.' }, { status: 500 });
    }
}

// PUT: 사용자 역할 수정
export async function PUT(request: Request) {
    try {
        const { userId, newRole, requesterEmail } = await request.json();

        if (!userId || !newRole || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const usersCollection = db.collection('users');
        const requesterSnapshot = await usersCollection.where('email', '==', requesterEmail).limit(1).get();
        if (requesterSnapshot.empty) {
            return NextResponse.json({ error: '요청자 정보를 찾을 수 없습니다.' }, { status: 403 });
        }
        const requesterRole = requesterSnapshot.docs[0].data().role;

        const targetUserRef = usersCollection.doc(userId);
        const targetUserDoc = await targetUserRef.get();
        if (!targetUserDoc.exists) {
            return NextResponse.json({ error: '대상 사용자를 찾을 수 없습니다.' }, { status: 404 });
        }
        const targetUserRole = targetUserDoc.data()?.role;

        // 권한 검증 로직
        if (requesterRole === '총관리자') {
            if (targetUserRole === '총관리자') {
                return NextResponse.json({ error: '총관리자의 역할은 변경할 수 없습니다.' }, { status: 403 });
            }
            if (newRole === '총관리자') {
                return NextResponse.json({ error: '총관리자 역할은 부여할 수 없습니다.' }, { status: 403 });
            }
        } else if (requesterRole === '관리자') {
            if (targetUserRole === '총관리자' || targetUserRole === '관리자') {
                return NextResponse.json({ error: '자신과 같거나 더 높은 등급의 역할은 수정할 수 없습니다.' }, { status: 403 });
            }
            if (newRole === '총관리자' || newRole === '관리자') {
                return NextResponse.json({ error: '관리자 역할 이상을 부여할 수 없습니다.' }, { status: 403 });
            }
        } else {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        await targetUserRef.update({ role: newRole });
        return NextResponse.json({ message: '사용자 역할이 성공적으로 수정되었습니다.' });

    } catch (error) {
        console.error('Admin PUT User Error:', error);
        return NextResponse.json({ error: '사용자 역할 수정에 실패했습니다.' }, { status: 500 });
    }
}

// PATCH: 사용자 닉네임 수정 (총관리자만)
export async function PATCH(request: Request) {
    try {
        const { userId, newNickname, requesterEmail } = await request.json();
        if (!requesterEmail || !(await isSuperAdmin(requesterEmail))) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        const usersCollection = db.collection('users');
        const nicknameSnapshot = await usersCollection.where('nickname', '==', newNickname.trim()).get();
        if (!nicknameSnapshot.empty && nicknameSnapshot.docs[0].id !== userId) {
            return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
        }

        await db.collection('users').doc(userId).update({ nickname: newNickname.trim() });
        return NextResponse.json({ message: '닉네임이 성공적으로 수정되었습니다.' });
    } catch (error) {
        console.error('Admin PATCH User Error:', error);
        return NextResponse.json({ error: '닉네임 수정에 실패했습니다.' }, { status: 500 });
    }
}

// DELETE: 사용자 삭제 (총관리자만)
export async function DELETE(request: Request) {
    try {
        const { userEmail, userId, requesterEmail } = await request.json();
        if (!requesterEmail || !(await isSuperAdmin(requesterEmail))) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        const userToDelete = await db.collection('users').doc(userId).get();
        if (userToDelete.data()?.role === '총관리자') {
            return NextResponse.json({ error: '총관리자는 삭제할 수 없습니다.' }, { status: 403 });
        }

        const user = await admin.auth().getUserByEmail(userEmail);
        await admin.auth().deleteUser(user.uid);
        await db.collection('users').doc(userId).delete();

        return NextResponse.json({ message: '사용자가 성공적으로 삭제되었습니다.' });
    } catch (error) {
        console.error('Admin DELETE User Error:', error);
        return NextResponse.json({ error: '사용자 삭제에 실패했습니다.' }, { status: 500 });
    }
}
