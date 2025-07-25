// src/app/api/matches/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const matchesCollection = db.collection('matches');
    const scrimsCollection = db.collection('scrims');
    const snapshot = await matchesCollection.orderBy('matchDate', 'desc').get();

    if (snapshot.empty) {
      return NextResponse.json([]);
    }

    // 모든 Scrim 정보를 Map으로 미리 불러옵니다. (효율성)
    const scrimsSnapshot = await scrimsCollection.get();
    const scrimsMap = new Map();
    scrimsSnapshot.forEach(doc => {
      scrimsMap.set(doc.id, doc.data());
    });

    const matches = snapshot.docs.map(doc => {
      const data = doc.data();
      const scrimData = scrimsMap.get(data.scrimId) || {}; // scrimId로 해당 scrim 정보 찾기

      return {
        matchId: doc.id,
        scrimId: data.scrimId,
        winningTeam: data.winningTeam,
        matchDate: data.matchDate?.toDate ? data.matchDate.toDate().toISOString() : null,
        // ⭐️ Scrim에서 필요한 정보 추가
        scrimName: scrimData.scrimName || '내전 경기',
        scrimType: scrimData.scrimType || '일반',
        creatorEmail: scrimData.creatorEmail || '정보 없음',
      };
    });

    return NextResponse.json(matches);

  } catch (error) {
    console.error('GET Matches API Error:', error);
    return NextResponse.json({ error: '경기 기록을 불러오는 데 실패했습니다.' }, { status: 500 });
  }
}