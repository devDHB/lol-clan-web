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

// --- 공통 함수: 관리자 권한 확인 ---
async function checkAdminPermission(email: string): Promise<boolean> {
    try {
        const userDoc = await db.collection('users').where('email', '==', email).limit(1).get();
        if (userDoc.empty) return false;
        const userData = userDoc.docs[0].data();
        return userData?.role === '총관리자' || userData?.role === '관리자';
    } catch (error) {
        console.error('관리자 권한 확인 중 에러 발생:', error);
        return false;
    }
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
    { params }: { params: Promise<{ matchId: string }> }
) {
    try {
        const { matchId } = await params;
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
            const addImageUrl = (teamData: any[]) => (teamData || []).map(player => ({
                ...player,
                championImageUrl: championImageMap.get(player.champion) || null
            }));

            data.blueTeam = addImageUrl(data.blueTeam);
            data.redTeam = addImageUrl(data.redTeam);
        }

        const serializeData = (obj: any): any => {
            if (!obj) return obj;
            if (obj.toDate && typeof obj.toDate === 'function') return obj.toDate().toISOString();
            if (Array.isArray(obj)) return obj.map(serializeData);
            if (typeof obj === 'object') {
                const newObj: { [key: string]: any } = {};
                for (const key in obj) {
                    newObj[key] = serializeData(obj[key]);
                }
                return newObj;
            }
            return obj;
        };

        const finalData = serializeData({
            matchId: doc.id,
            ...data,
        });

        return NextResponse.json(finalData);

    } catch (error) {
        console.error('GET Match Detail API Error:', error);
        return NextResponse.json({ error: '매치 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}



// PATCH: 챔피언 정보 수정을 처리하는 함수
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ matchId: string }> }
) {
    try {
        const { matchId } = await params;
        const { team, playerEmail, newChampion, requesterEmail } = await request.json();

        if (!matchId || !team || !playerEmail || !newChampion || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        // 권한 확인 (총관리자 또는 관리자만 가능)
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
        const teamData = matchData?.[teamKey] || [];

        const playerIndex = teamData.findIndex((p: { email: string }) => p.email === playerEmail);
        if (playerIndex === -1) {
            return NextResponse.json({ error: '해당 플레이어를 찾을 수 없습니다.' }, { status: 404 });
        }

        // 해당 플레이어의 챔피언 정보만 업데이트
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
    { params }: { params: Promise<{ matchId: string }> }
) {
    try {
        const { matchId } = await params;
        const { requesterEmail } = await request.json();

        if (!matchId || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        // 오직 총관리자만 삭제 가능
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
