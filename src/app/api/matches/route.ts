// /src/app/api/matches/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await db.collection('matches').orderBy('matchDate', 'desc').get();

    if (snapshot.empty) {
      return NextResponse.json([]);
    }

    const matches = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        matchId: doc.id,
        scrimId: data.scrimId,
        winningTeam: data.winningTeam,
        matchDate: data.matchDate?.toDate().toISOString() || null,
        scrimName: data.scrimName || '내전 경기',
        scrimType: data.scrimType || '일반',
        creatorEmail: data.creatorEmail || '정보 없음',
      };
    });

    return NextResponse.json(matches);

  } catch (error) {
    console.error('GET Matches API Error:', error);
    return NextResponse.json({ error: '경기 기록을 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}