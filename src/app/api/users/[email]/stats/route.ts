import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// 타입 정의
interface PlayerRecord {
    email: string;
    nickname: string;
    champion: string;
    position?: string;
}

export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    { params }: { params: { email: string } }
) {
    try {
        const { email: userEmail } = await params;
        if (!userEmail) {
            return NextResponse.json({ error: '사용자 이메일이 필요합니다.' }, { status: 400 });
        }

        // 1. 데이터 가져오기
        const [matchesSnapshot, scrimsSnapshot, usersSnapshot] = await Promise.all([
            db.collection('matches').get(),
            db.collection('scrims').get(),
            db.collection('users').get(),
        ]);

        // 2. 데이터 가공
        const usersMap = new Map<string, string>();
        usersSnapshot.forEach(doc => usersMap.set(doc.data().email, doc.data().nickname));

        const matchesMap = new Map<string, any>();
        matchesSnapshot.forEach(doc => matchesMap.set(doc.id, doc.data()));

        // 3. 통계 객체 초기화
        const stats = {
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            aramGames: 0,
            aramWins: 0,
            aramLosses: 0,
            positions: { TOP: { wins: 0, losses: 0 }, JG: { wins: 0, losses: 0 }, MID: { wins: 0, losses: 0 }, AD: { wins: 0, losses: 0 }, SUP: { wins: 0, losses: 0 } },
            championStats: {} as Record<string, { wins: number; losses: number }>,
            matchups: {} as Record<string, Record<string, { nickname: string; wins: number; losses: number }>>,
        };

        // ⭐️ 4. Scrims 컬렉션을 기준으로 순회 (더 정확한 데이터 소스)
        scrimsSnapshot.forEach(doc => {
            const scrim = doc.data();
            
            // 각 내전의 모든 경기 기록을 확인
            (scrim.matchChampionHistory || []).forEach((matchRecord: any) => {
                const matchData = matchesMap.get(matchRecord.matchId);
                if (!matchData) return; // 해당 경기가 matches 컬렉션에 없으면 건너뛰기

                const blueTeam = matchRecord.blueTeamChampions || [];
                const redTeam = matchRecord.redTeamChampions || [];

                let playerInfo: any, opponentTeam: any[], playerTeamColor: 'blue' | 'red' | undefined;

                const bluePlayer = blueTeam.find((p: any) => p.playerEmail === userEmail);
                const redPlayer = redTeam.find((p: any) => p.playerEmail === userEmail);

                if (bluePlayer) {
                    playerInfo = bluePlayer;
                    opponentTeam = redTeam;
                    playerTeamColor = 'blue';
                } else if (redPlayer) {
                    playerInfo = redPlayer;
                    opponentTeam = blueTeam;
                    playerTeamColor = 'red';
                } else {
                    return; // 이 경기에는 해당 유저가 없음
                }
                
                const didWin = matchData.winningTeam === playerTeamColor;

                // 5. scrimType에 따라 전적 분리 기록
                if (scrim.scrimType === '칼바람') {
                    stats.aramGames++;
                    if (didWin) stats.aramWins++; else stats.aramLosses++;
                    return; // 칼바람은 여기서 종료
                }

                // --- 이하 일반/피어리스 전적 계산 ---
                stats.totalGames++;
                if (didWin) stats.totalWins++; else stats.totalLosses++;
                
                const champion = playerInfo.champion;
                if (champion && champion !== '미입력') {
                    if (!stats.championStats[champion]) stats.championStats[champion] = { wins: 0, losses: 0 };
                    if (didWin) stats.championStats[champion].wins++; else stats.championStats[champion].losses++;
                }

                const position = playerInfo.position;
                if (position && stats.positions[position as keyof typeof stats.positions]) {
                    if (didWin) stats.positions[position as keyof typeof stats.positions].wins++;
                    else stats.positions[position as keyof typeof stats.positions].losses++;

                    const opponentInfo = opponentTeam.find((p: any) => p.position === position);
                    if (opponentInfo) {
                        const opponentEmail = opponentInfo.playerEmail;
                        const opponentNickname = usersMap.get(opponentEmail) || '알 수 없음';
                        if (!stats.matchups[position]) stats.matchups[position] = {};
                        if (!stats.matchups[position][opponentEmail]) {
                            stats.matchups[position][opponentEmail] = { nickname: opponentNickname, wins: 0, losses: 0 };
                        }
                        if (didWin) stats.matchups[position][opponentEmail].wins++;
                        else stats.matchups[position][opponentEmail].losses++;
                    }
                }
            });
        });

        return NextResponse.json(stats);

    } catch (error) {
        console.error('GET User Stats API Error:', error);
        return NextResponse.json({ error: '유저 통계 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}