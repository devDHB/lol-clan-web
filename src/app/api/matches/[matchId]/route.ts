import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const { matchId } = await params;
    if (!matchId) {
      return NextResponse.json({ error: '매치 ID가 필요합니다.' }, { status: 400 });
    }

    const matchRef = db.collection('matches').doc(matchId);
    const doc = await matchRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = doc.data();

    // ⭐️ Scrim 정보를 가져오는 로직 추가
    let scrimData = { scrimName: '내전 경기', scrimType: '일반' }; // 기본값
    if (data?.scrimId) {
      const scrimRef = db.collection('scrims').doc(data.scrimId);
      const scrimDoc = await scrimRef.get();
      if (scrimDoc.exists) {
        scrimData.scrimName = scrimDoc.data()?.scrimName || scrimData.scrimName;
        scrimData.scrimType = scrimDoc.data()?.scrimType || scrimData.scrimType;
      }
    }

    return NextResponse.json({
      matchId: doc.id,
      ...data,
      matchDate: data?.matchDate?.toDate ? data.matchDate.toDate().toISOString() : null,
      scrimName: scrimData.scrimName, // ⭐️ scrimName 추가
      scrimType: scrimData.scrimType, // ⭐️ scrimType 추가
    });

  } catch (error) {
    console.error('GET Match Detail API Error:', error);
    return NextResponse.json({ error: '매치 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// PATCH: 관리자가 챔피언 정보를 수정하는 함수
export async function PATCH(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const { matchId } = await params; // ⭐️ await 추가
    const { team, playerEmail, newChampion, requesterEmail } = await request.json();

    if (!matchId || !team || !playerEmail || !newChampion || !requesterEmail) {
      return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
    }

    const userSnapshot = await db.collection('users').where('email', '==', requesterEmail).limit(1).get();
    if (userSnapshot.empty) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 403 });
    }
    const userRole = userSnapshot.docs[0].data().role;
    if (userRole !== '총관리자' && userRole !== '관리자') {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const matchRef = db.collection('matches').doc(matchId);
    const doc = await matchRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
    }

    const matchData = doc.data();
    const teamData = matchData?.[team === 'blue' ? 'blueTeam' : 'redTeam'] || [];

    const playerIndex = teamData.findIndex((p: { email: string }) => p.email === playerEmail);
    if (playerIndex === -1) {
      return NextResponse.json({ error: '해당 플레이어를 찾을 수 없습니다.' }, { status: 404 });
    }

    teamData[playerIndex].champion = newChampion;

    await matchRef.update({
      [team === 'blue' ? 'blueTeam' : 'redTeam']: teamData
    });

    return NextResponse.json({ message: '챔피언 정보가 성공적으로 수정되었습니다.' });

  } catch (error) {
    console.error('PATCH Match API Error:', error);
    return NextResponse.json({ error: '챔피언 정보 수정에 실패했습니다.' }, { status: 500 });
  }
}
