import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// ✅ [수정] 유저별 통계 타입에 칼바람 전적 필드 추가
interface UserStats {
    email: string;
    nickname: string;
    totalGames: number;
    totalWins: number;
    aramGames: number; // 칼바람 총 게임 수
    aramWins: number;  // 칼바람 총 승리 수
    positions: {
        [key: string]: { games: number; wins: number; }
    };
    championStats: {
        [key: string]: { games: number; wins: number; }
    };
}

interface MatchPlayer {
    email: string;
    champion?: string;
    assignedPosition?: string;
}

export async function GET() {
    try {
        const [matchesSnapshot, usersSnapshot] = await Promise.all([
            db.collection('matches').get(),
            db.collection('users').get(),
        ]);

        const usersMap = new Map<string, { nickname: string }>();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            usersMap.set(data.email, { nickname: data.nickname });
        });

        const statsMap = new Map<string, UserStats>();

        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            if (!match.winningTeam) return;

            const processTeam = (team: MatchPlayer[], isWinner: boolean) => {
                (team || []).forEach((player) => {
                    if (!player.email || !usersMap.has(player.email)) return;

                    let userStats = statsMap.get(player.email) || {
                        email: player.email,
                        nickname: usersMap.get(player.email)!.nickname,
                        totalGames: 0,
                        totalWins: 0,
                        aramGames: 0, // 초기값 설정
                        aramWins: 0,  // 초기값 설정
                        positions: {},
                        championStats: {},
                    };

                    // ✅ [수정] scrimType에 따라 전적을 분리하여 계산
                    if (match.scrimType === '칼바람') {
                        userStats.aramGames++;
                        if (isWinner) userStats.aramWins++;
                    } else {
                        // 일반/피어리스 모드 전적만 여기에 합산
                        userStats.totalGames++;
                        if (isWinner) userStats.totalWins++;

                        const position = player.assignedPosition;
                        if (position) {
                            if (!userStats.positions[position]) {
                                userStats.positions[position] = { games: 0, wins: 0 };
                            }
                            userStats.positions[position].games++;
                            if (isWinner) userStats.positions[position].wins++;
                        }
                        
                        const champion = player.champion;
                        if (champion && champion.trim() !== '') {
                            if (!userStats.championStats[champion]) {
                                userStats.championStats[champion] = { games: 0, wins: 0 };
                            }
                            userStats.championStats[champion].games++;
                            if (isWinner) userStats.championStats[champion].wins++;
                        }
                    }

                    statsMap.set(player.email, userStats);
                });
            };

            processTeam(match.blueTeam, match.winningTeam === 'blue');
            processTeam(match.redTeam, match.winningTeam === 'red');
        });

        const allStats = Array.from(statsMap.values());

        return NextResponse.json(allStats);

    } catch (error) {
        console.error('GET All User Stats API Error:', error);
        return NextResponse.json({ error: '전체 통계 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}




// import { NextResponse } from 'next/server';
// import { db } from '@/lib/firebase-admin';

// // 타입 정의
// interface PositionStats { wins: number; losses: number; }
// interface UserData {
//   nickname: string;
//   positionStats?: { [key: string]: PositionStats };
// }

// export async function GET() {
//   try {
//     const usersSnapshot = await db.collection('users').get();
//     if (usersSnapshot.empty) {
//       return NextResponse.json([]);
//     }

//     const statsData = usersSnapshot.docs.map(doc => {
//       const user = doc.data() as UserData;
//       const posStats = user.positionStats || {};
      
//       const totalWins = Object.values(posStats).reduce((sum, pos) => sum + pos.wins, 0);
//       const totalLosses = Object.values(posStats).reduce((sum, pos) => sum + pos.losses, 0);
//       const totalGames = totalWins + totalLosses;
//       const winRate = totalGames > 0 ? totalWins / totalGames : 0;

//       return {
//         '닉네임': user.nickname || doc.id,
//         '총 경기': totalGames,
//         '총 승': totalWins,
//         '총 패': totalLosses,
//         '승률': winRate,
//         'TOP 승': posStats['TOP']?.wins || 0,
//         'TOP 패': posStats['TOP']?.losses || 0,
//         'JG 승': posStats['JG']?.wins || 0,
//         'JG 패': posStats['JG']?.losses || 0,
//         'MID 승': posStats['MID']?.wins || 0,
//         'MID 패': posStats['MID']?.losses || 0,
//         'AD 승': posStats['AD']?.wins || 0,
//         'AD 패': posStats['AD']?.losses || 0,
//         'SUP 승': posStats['SUP']?.wins || 0,
//         'SUP 패': posStats['SUP']?.losses || 0,
//       };
//     });

//     return NextResponse.json(statsData);

//   } catch (error) {
//     console.error('GET Stats API Error:', error);
//     return NextResponse.json({ error: '전적 통계 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
//   }
// }
