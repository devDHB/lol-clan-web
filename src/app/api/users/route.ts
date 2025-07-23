import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function GET() {
    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            return NextResponse.json([]);
        }

        const users: { email: string; nickname: string }[] = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            // 이메일과 닉네임이 모두 있는 유효한 데이터만 추가합니다.
            if (data.email && data.nickname) {
                users.push({
                    email: data.email,
                    nickname: data.nickname,
                });
            }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error('GET All Users API Error:', error);
        return NextResponse.json({ error: '모든 사용자 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}
