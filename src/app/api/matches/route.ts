import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// GET: 모든 경기 기록을 가져오는 함수
export async function GET() {
    try {
        const matchesCollection = db.collection('matches');
        // matchDate 필드를 기준으로 최신순으로 정렬합니다.
        const snapshot = await matchesCollection.orderBy('matchDate', 'desc').get();

        if (snapshot.empty) {
            return NextResponse.json([]);
        }

        const matches: unknown[] = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Firestore 타임스탬프를 ISO 문자열로 변환
            const matchDate = data.matchDate?.toDate ? data.matchDate.toDate().toISOString() : null;
            matches.push({
                matchId: doc.id,
                ...data,
                matchDate,
            });
        });

        return NextResponse.json(matches);

    } catch (error) {
        console.error('GET Matches API Error:', error);
        return NextResponse.json({ error: '경기 기록을 불러오는 데 실패했습니다.' }, { status: 500 });
    }
}
