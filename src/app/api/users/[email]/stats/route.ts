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
    { params }: { params: { Email: string } }
) {
    try {
        const { Email: userEmail } = await params;
        if (!userEmail) {
            return NextResponse.json({ error: '사용자 이메일이 필요합니다.' }, { status: 400 });
        }

        // 1. 모든 관련 데이터 한 번에 가져오기
        const [matchesSnapshot, scrimsSnapshot, usersSnapshot] = await Promise.all([
            db.collection('matches').get(),
            db.collection('scrims').get(),
            db.collection('users').get(),
        ]);

        // 2. 빠른 조회를 위해 데이터를 Map 형태로 가공
        const usersMap = new Map<string, string>();
        usersSnapshot.forEach(doc => usersMap.set(doc.data().email, doc.data().nickname));

        const scrimsMap = new Map<string, any>();
        scrimsSnapshot.forEach(doc => scrimsMap.set(doc.id, doc.data()));

        // 3. 통계를 담을 객체 초기화
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

        // 4. 모든 경기 기록을 순회하며 통계 계산
        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            const scrim = scrimsMap.get(match.scrimId);
            if (!scrim) return;

            const blueTeamEmails = (match.blueTeam || []).map((p: PlayerRecord) => p.email);
            const redTeamEmails = (match.redTeam || []).map((p: PlayerRecord) => p.email);

            let playerTeamColor: 'blue' | 'red' | undefined;
            if (blueTeamEmails.includes(userEmail)) {
                playerTeamColor = 'blue';
            } else if (redTeamEmails.includes(userEmail)) {
                playerTeamColor = 'red';
            } else {
                return; // 사용자가 참여한 경기가 아니면 건너뛰기
            }

            const didWin = match.winningTeam === playerTeamColor;

            // 5. scrimType에 따라 전적을 분리하여 기록
            if (scrim.scrimType === '칼바람') {
                stats.aramGames++;
                if (didWin) stats.aramWins++; else stats.aramLosses++;
                return; // 칼바람 경기는 여기서 계산 종료
            }

            // --- 이하 로직은 칼바람이 아닌 경기에 대해서만 실행됨 ---

            const matchRecordInScrim = (scrim.matchChampionHistory || []).find((h: any) => h.matchId === doc.id);
            if (!matchRecordInScrim) return;

            const playerTeamData = playerTeamColor === 'blue' ? matchRecordInScrim.blueTeamChampions : matchRecordInScrim.redTeamChampions;
            const opponentTeamData = playerTeamColor === 'blue' ? matchRecordInScrim.redTeamChampions : matchRecordInScrim.blueTeamChampions;

            const playerInfo = playerTeamData?.find((p: PlayerRecord) => p.email === userEmail);
            if (!playerInfo) return;

            // 종합 전적 (일반 + 피어리스)
            stats.totalGames++;
            if (didWin) stats.totalWins++; else stats.totalLosses++;

            // 챔피언별 전적
            const champion = playerInfo.champion;
            if (champion && champion !== '미입력') {
                if (!stats.championStats[champion]) stats.championStats[champion] = { wins: 0, losses: 0 };
                if (didWin) stats.championStats[champion].wins++; else stats.championStats[champion].losses++;
            }

            // 포지션별 전적 및 상대 전적
            const position = playerInfo.position;
            if (position && stats.positions[position as keyof typeof stats.positions]) {
                if (didWin) stats.positions[position as keyof typeof stats.positions].wins++;
                else stats.positions[position as keyof typeof stats.positions].losses++;

                const opponentInfo = opponentTeamData?.find((p: PlayerRecord) => p.position === position);
                if (opponentInfo) {
                    const opponentEmail = opponentInfo.email;
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

        return NextResponse.json(stats);

    } catch (error) {
        console.error('GET User Stats API Error:', error);
        return NextResponse.json({ error: '유저 통계 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}