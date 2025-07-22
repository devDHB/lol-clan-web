import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// 타입 정의
interface PositionStats { wins: number; losses: number; }
interface UserData {
  nickname: string;
  positionStats?: { [key: string]: PositionStats };
}
interface StatRow {
  '닉네임': string;
  '총 경기': number;
  '총 승': number;
  '승률': number;
  'TOP 승': number;
  'JG 승': number;
  'MID 승': number;
  'AD 승': number;
  'SUP 승': number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  try {
    const usersSnapshot = await db.collection('users').get();
    if (usersSnapshot.empty) {
      const emptyRankings = { 꾸준왕: [], 다승: [], 승률: [], TOP: [], JG: [], MID: [], AD: [], SUP: [] };
      return NextResponse.json(emptyRankings);
    }

    const stats: StatRow[] = usersSnapshot.docs.map(doc => {
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
            '승률': winRate,
            'TOP 승': posStats['TOP']?.wins || 0,
            'JG 승': posStats['JG']?.wins || 0,
            'MID 승': posStats['MID']?.wins || 0,
            'AD 승': posStats['AD']?.wins || 0,
            'SUP 승': posStats['SUP']?.wins || 0,
        };
    });

    const getTop3 = (data: StatRow[], key: keyof StatRow, gameKey?: keyof StatRow, minGames = 0) => {
      return [...data]
        // --- 오류 수정: Number()로 타입을 명확하게 변환 ---
        .filter(p => gameKey ? Number(p[gameKey]) >= minGames : true)
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, 3)
        .map(p => ({ 닉네임: p['닉네임'], value: p[key] as number }));
    };
    
    const rankings = {
      꾸준왕: getTop3(stats, '총 경기'),
      다승: getTop3(stats, '총 승'),
      승률: getTop3(stats, '승률', '총 경기', 5),
      TOP: getTop3(stats, 'TOP 승'),
      JG: getTop3(stats, 'JG 승'),
      MID: getTop3(stats, 'MID 승'),
      AD: getTop3(stats, 'AD 승'),
      SUP: getTop3(stats, 'SUP 승'),
    };

    return NextResponse.json(rankings);

  } catch (error) {
    console.error('Rankings API Error:', error);
    return NextResponse.json({ error: '랭킹 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}
