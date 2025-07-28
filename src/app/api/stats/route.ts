import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// 타입 정의
interface RankedPlayer {
    email: string;
    nickname: string;
    value: number; // 승수 또는 게임 수
}

interface UserStats {
    email: string;
    nickname: string;
    totalGames: number;
    totalWins: number;
    aramGames: number;
    aramWins: number;
    positions: { [key: string]: { games: number; wins: number; } };
    championStats: { [key: string]: { games: number; wins: number; } };
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
                        totalGames: 0, totalWins: 0, aramGames: 0, aramWins: 0,
                        positions: {}, championStats: {},
                    };

                    if (match.scrimType === '칼바람') {
                        userStats.aramGames++;
                        if (isWinner) userStats.aramWins++;
                    } else {
                        userStats.totalGames++;
                        if (isWinner) userStats.totalWins++;
                        const position = player.assignedPosition;
                        if (position) {
                            if (!userStats.positions[position]) userStats.positions[position] = { games: 0, wins: 0 };
                            userStats.positions[position].games++;
                            if (isWinner) userStats.positions[position].wins++;
                        }
                    }
                    statsMap.set(player.email, userStats);
                });
            };
            processTeam(match.blueTeam, match.winningTeam === 'blue');
            processTeam(match.redTeam, match.winningTeam === 'red');
        });

        const allStats = Array.from(statsMap.values());

        // --- 명예의 전당 데이터 계산 ---
        const getTop3 = (key: 'totalWins' | 'totalGames'): RankedPlayer[] => {
            return allStats
                .sort((a, b) => b[key] - a[key])
                .slice(0, 3)
                .map(s => ({ email: s.email, nickname: s.nickname, value: s[key] }));
        };

        const getTop3ByPosition = (position: string): RankedPlayer[] => {
            return allStats
                .filter(s => s.positions[position] && s.positions[position].wins > 0)
                .sort((a, b) => (b.positions[position]?.wins || 0) - (a.positions[position]?.wins || 0))
                .slice(0, 3)
                .map(s => ({ email: s.email, nickname: s.nickname, value: s.positions[position].wins }));
        };

        const hallOfFame = {
            mostWins: getTop3('totalWins'),
            mostGames: getTop3('totalGames'),
            positions: {
                TOP: getTop3ByPosition('TOP'),
                JG: getTop3ByPosition('JG'),
                MID: getTop3ByPosition('MID'),
                AD: getTop3ByPosition('AD'),
                SUP: getTop3ByPosition('SUP'),
            }
        };

        return NextResponse.json({ hallOfFame, allStats });

    } catch (error) {
        console.error('GET All User Stats API Error:', error);
        return NextResponse.json({ error: '전체 통계 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}
