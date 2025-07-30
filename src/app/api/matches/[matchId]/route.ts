import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

// --- 타입 정의 ---
interface ChampionInfo {
    id: string;
    name: string;
    imageUrl: string;
}

interface MatchPlayer {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
    champion?: string;
    assignedPosition?: string;
    championImageUrl?: string;
}

// Firestore 데이터를 위한 타입 정의
interface FirestoreTimestamp {
    toDate(): Date;
}

// 직렬화 가능한 값들의 타입 정의
type SerializableValue = string | number | boolean | null | undefined | Date | FirestoreTimestamp | SerializableObject | SerializableValue[];

interface SerializableObject {
    [key: string]: SerializableValue;
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

// --- 공통 함수: 총관리자 권한 확인 ---
async function isSuperAdmin(email: string): Promise<boolean> {
    if (!email) return false;
    const usersCollection = db.collection('users');
    const snapshot = await usersCollection.where('email', '==', email).limit(1).get();
    if (snapshot.empty) return false;
    return snapshot.docs[0].data().role === '총관리자';
}

// --- API 핸들러: GET (매치 상세 정보 조회) ---
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ matchId: string }> }  // Promise로 변경
) {
    try {
        const { matchId } = await params;  // 이미 await 사용하고 있으니 OK
        if (!matchId) {
            return NextResponse.json({ error: '매치 ID가 필요합니다.' }, { status: 400 });
        }

        const allChampions = await getChampionList();
        const championImageMap = new Map(allChampions.map((c: ChampionInfo) => [c.name, c.imageUrl]));

        const matchRef = db.collection('matches').doc(matchId);
        const doc = await matchRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = doc.data();

        if (data) {
            const addImageUrl = (teamData: MatchPlayer[]) => (teamData || []).map(player => ({
                ...player,
                // ✅ [수정] player.champion이 존재할 때만 get을 호출하도록 변경
                championImageUrl: player.champion ? championImageMap.get(player.champion) || null : null
            }));

            data.blueTeam = addImageUrl(data.blueTeam);
            data.redTeam = addImageUrl(data.redTeam);
        }

        const serializeData = (obj: SerializableObject): SerializableObject => {
            if (!obj) return obj;

            const newObj: SerializableObject = {};
            for (const key in obj) {
                const value = obj[key];
                if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
                    newObj[key] = (value as FirestoreTimestamp).toDate().toISOString();
                } else if (Array.isArray(value)) {
                    newObj[key] = value.map(item => 
                        (typeof item === 'object' && item !== null) ? serializeData(item as SerializableObject) : item
                    );
                } else if (typeof value === 'object' && value !== null) {
                    newObj[key] = serializeData(value as SerializableObject);
                } else {
                    newObj[key] = value;
                }
            }
            return newObj;
        };

        const finalData = serializeData({
            matchId: doc.id,
            ...data,
        } as SerializableObject);

        return NextResponse.json(finalData);

    } catch (error) {
        console.error('GET Match Detail API Error:', error);
        return NextResponse.json({ error: '매치 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}



// PATCH: 챔피언 정보 수정을 처리하는 함수
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ matchId: string }> }  // Promise로 변경
) {
    try {
        const { matchId } = await params;
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
        const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
        const teamData: MatchPlayer[] = matchData?.[teamKey] || [];

        const playerIndex = teamData.findIndex((p) => p.email === playerEmail);
        if (playerIndex === -1) {
            return NextResponse.json({ error: '해당 플레이어를 찾을 수 없습니다.' }, { status: 404 });
        }

        teamData[playerIndex].champion = newChampion;

        await matchRef.update({ [teamKey]: teamData });

        return NextResponse.json({ message: '챔피언 정보가 성공적으로 수정되었습니다.' });

    } catch (error) {
        console.error('PATCH Match API Error:', error);
        return NextResponse.json({ error: '챔피언 정보 수정에 실패했습니다.' }, { status: 500 });
    }
}


// DELETE: 매치 기록을 삭제하는 함수 (총관리자 전용)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ matchId: string }> }  // Promise로 변경
) {
    try {
        const { matchId } = await params;
        const { requesterEmail } = await request.json();

        if (!matchId || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const hasPermission = await isSuperAdmin(requesterEmail);
        if (!hasPermission) {
            return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
        }

        const matchRef = db.collection('matches').doc(matchId);
        const doc = await matchRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: '삭제할 매치를 찾을 수 없습니다.' }, { status: 404 });
        }

        await matchRef.delete();

        return NextResponse.json({ message: '매치 기록이 성공적으로 삭제되었습니다.' });

    } catch (error) {
        console.error('DELETE Match API Error:', error);
        return NextResponse.json({ error: '매치 기록 삭제에 실패했습니다.' }, { status: 500 });
    }
}