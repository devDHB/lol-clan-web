import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// 타입 정의
interface PositionStats { wins: number; losses: number; }
interface UserData {
  nickname: string;
  positionStats?: { [key: string]: PositionStats };
}

export async function GET() {
  try {
    const usersSnapshot = await db.collection('users').get();
    if (usersSnapshot.empty) {
      return NextResponse.json([]);
    }

    const statsData = usersSnapshot.docs.map(doc => {
      const user = doc.data() as UserData;
      const posStats = user.positionStats || {};
      
      const totalWins = Object.values(posStats).reduce((sum, pos) => sum + pos.wins, 0);
      const totalLosses = Object.values(posStats).reduce((sum, pos) => sum + pos.losses, 0);
      const totalGames = totalWins + totalLosses;
      const winRate = totalGames > 0 ? totalWins / totalGames : 0;

      return {
        '닉네임': user.nickname || doc.id,
        '총 경기': totalGames,
        '총 승': totalWins,
        '총 패': totalLosses,
        '승률': winRate,
        'TOP 승': posStats['TOP']?.wins || 0,
        'TOP 패': posStats['TOP']?.losses || 0,
        'JG 승': posStats['JG']?.wins || 0,
        'JG 패': posStats['JG']?.losses || 0,
        'MID 승': posStats['MID']?.wins || 0,
        'MID 패': posStats['MID']?.losses || 0,
        'AD 승': posStats['AD']?.wins || 0,
        'AD 패': posStats['AD']?.losses || 0,
        'SUP 승': posStats['SUP']?.wins || 0,
        'SUP 패': posStats['SUP']?.losses || 0,
      };
    });

    return NextResponse.json(statsData);

  } catch (error) {
    console.error('GET Stats API Error:', error);
    return NextResponse.json({ error: '전적 통계 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}
