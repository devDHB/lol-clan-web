import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// --- 타입 정의 ---
interface MatchPlayer {
    email: string;
    nickname: string;
    champion?: string;
    assignedPosition?: string;
}

interface UserStats {
    totalGames: number;
    totalWins: number;
    totalLosses: number;
    aramGames: number;
    aramWins: number;
    aramLosses: number;
    positions: Record<string, { wins: number; losses: number }>;
    championStats: Record<string, { wins: number; losses: number }>;
    matchups: Record<string, Record<string, { nickname: string; wins: number; losses: number }>>;
    recentGames: {
        champion: string;
        championImageUrl: string | null;
        win: boolean;
        matchId: string;
    }[];
}

interface ChampionInfo {
    id: string;
    name: string;
    imageUrl: string;
}

// --- 공통 함수: Riot API 챔피언 목록 가져오기 (캐싱 포함) ---
let championList: ChampionInfo[] = [];
let lastFetched: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1시간 캐시

async function getChampionList() {
    if (Date.now() - lastFetched > CACHE_DURATION || championList.length === 0) {
        try {
            const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
            const versions = await versionRes.json();
            const latestVersion = versions[0];
            const res = await fetch(`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ko_KR/champion.json`);
            const fullData = await res.json();
            const champions = fullData.data;
            championList = Object.keys(champions).map(key => ({
                id: champions[key].id,
                name: champions[key].name,
                imageUrl: `http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champions[key].id}.png`
            }));
            lastFetched = Date.now();
        } catch (error) {
            console.error("Failed to fetch champion list from Riot:", error);
        }
    }
    return championList;
}


export async function GET(
    _request: NextRequest,
    { params }: { params: { email: string } }
) {
    try {
        const resolvedParams = await params;
        const userEmail = decodeURIComponent(resolvedParams.email);

        if (!userEmail) {
            return NextResponse.json({ error: '사용자 이메일이 필요합니다.' }, { status: 400 });
        }

        // 1. 데이터 가져오기
        const [matchesSnapshot, usersSnapshot, allChampions] = await Promise.all([
            db.collection('matches').orderBy('matchDate', 'desc').get(),
            db.collection('users').get(),
            getChampionList(),
        ]);

        // 2. 데이터 가공
        const usersMap = new Map<string, string>();
        usersSnapshot.forEach(doc => usersMap.set(doc.data().email, doc.data().nickname));

        const championInfoMap = new Map(allChampions.map(c => [c.name, { id: c.id, imageUrl: c.imageUrl }]));

        // 3. 통계 객체 초기화
        const stats: UserStats = {
            totalGames: 0,
            totalWins: 0,
            totalLosses: 0,
            aramGames: 0,
            aramWins: 0,
            aramLosses: 0,
            positions: { TOP: { wins: 0, losses: 0 }, JG: { wins: 0, losses: 0 }, MID: { wins: 0, losses: 0 }, AD: { wins: 0, losses: 0 }, SUP: { wins: 0, losses: 0 } },
            championStats: {},
            matchups: {},
            recentGames: [],
        };

        const userNonAramMatches: any[] = [];

        // 4. matches 컬렉션을 기준으로 순회
        matchesSnapshot.forEach(doc => {
            const match = doc.data();
            const blueTeam: MatchPlayer[] = match.blueTeam || [];
            const redTeam: MatchPlayer[] = match.redTeam || [];

            const player = blueTeam.find(p => p.email === userEmail) || redTeam.find(p => p.email === userEmail);
            if (!player) return;

            const playerTeamColor = blueTeam.some(p => p.email === userEmail) ? 'blue' : 'red';
            const didWin = match.winningTeam === playerTeamColor;

            if (match.scrimType === '칼바람') {
                stats.aramGames++;
                if (didWin) stats.aramWins++;
            } else {
                userNonAramMatches.push({ ...match, matchId: doc.id, playerInfo: player, didWin });
            }
        });

        // 5. 일반/피어리스 경기 통계 계산
        userNonAramMatches.forEach(match => {
            stats.totalGames++;
            if (match.didWin) stats.totalWins++;

            const champion = match.playerInfo.champion;
            if (champion && champion.trim() !== '') {
                if (!stats.championStats[champion]) stats.championStats[champion] = { wins: 0, losses: 0 };
                if (match.didWin) stats.championStats[champion].wins++; else stats.championStats[champion].losses++;
            }

            const position = match.playerInfo.assignedPosition;
            if (position && stats.positions[position as keyof typeof stats.positions]) {
                if (match.didWin) stats.positions[position as keyof typeof stats.positions].wins++;
                else stats.positions[position as keyof typeof stats.positions].losses++;

                const opponentTeam = match.playerInfo.team === 'blue' ? match.redTeam : match.blueTeam;
                const opponentInfo = opponentTeam.find((p: any) => p.assignedPosition === position);

                if (opponentInfo) {
                    const opponentEmail = opponentInfo.email;
                    const opponentNickname = usersMap.get(opponentEmail) || '알 수 없음';
                    if (!stats.matchups[position]) stats.matchups[position] = {};
                    if (!stats.matchups[position][opponentEmail]) {
                        stats.matchups[position][opponentEmail] = { nickname: opponentNickname, wins: 0, losses: 0 };
                    }
                    if (match.didWin) stats.matchups[position][opponentEmail].wins++;
                    else stats.matchups[position][opponentEmail].losses++;
                }
            }
        });

        // ✅ [수정] 최근 10경기 정보 추출
        stats.recentGames = userNonAramMatches.slice(0, 10).map(match => {
            const championName = match.playerInfo.champion;
            const champInfo = championInfoMap.get(championName);
            return {
                champion: championName,
                championImageUrl: champInfo?.imageUrl || null,
                win: match.didWin,
                matchId: match.matchId,
            };
        });

        stats.totalLosses = stats.totalGames - stats.totalWins;
        stats.aramLosses = stats.aramGames - stats.aramWins;

        return NextResponse.json(stats);

    } catch (error) {
        console.error('GET User Stats API Error:', error);
        return NextResponse.json({ error: '유저 통계 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}
