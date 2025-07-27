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

// --- API 핸들러: GET (매치 상세 정보 조회) ---
export async function GET(
  _request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
      const { matchId } = await params;
      if (!matchId) {
          return NextResponse.json({ error: '매치 ID가 필요합니다.' }, { status: 400 });
      }

      // 1. 전체 챔피언 목록 (이미지 URL 포함) 가져오기
      const allChampions = await getChampionList();
      const championInfoMap = new Map(allChampions.map((c: ChampionInfo) => [c.name, { id: c.id, imageUrl: c.imageUrl }]));

      const matchRef = db.collection('matches').doc(matchId);
      const doc = await matchRef.get();

      if (!doc.exists) {
          return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
      }

      const data = doc.data();
      
      // 2. ✅ [핵심] blueTeam과 redTeam 데이터에 이미지 URL을 추가합니다.
      if (data) {
          const addImageUrl = (teamData: any[]) => (teamData || []).map(player => ({
              ...player,
              championImageUrl: championInfoMap.get(player.champion)?.imageUrl || null
          }));

          data.blueTeam = addImageUrl(data.blueTeam);
          data.redTeam = addImageUrl(data.redTeam);
      }

      // 3. Scrim 정보 가져오기
      let scrimData = { scrimName: '내전 경기', scrimType: '일반' };
      if (data?.scrimId) {
          const scrimRef = db.collection('scrims').doc(data.scrimId);
          const scrimDoc = await scrimRef.get();
          if (scrimDoc.exists) {
              scrimData.scrimName = scrimDoc.data()?.scrimName || scrimData.scrimName;
              scrimData.scrimType = scrimDoc.data()?.scrimType || scrimData.scrimType;
          }
      }
      
      // 4. 모든 Timestamp를 문자열로 변환 (직렬화)
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
          ...scrimData,
      });

      return NextResponse.json(finalData);

  } catch (error) {
      console.error('GET Match Detail API Error:', error);
      return NextResponse.json({ error: '매치 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// --- API 핸들러: PATCH (매치 정보 수정) ---
export async function PATCH(
    request: NextRequest,
    { params }: { params: { matchId: string } }
) {
    try {
        const { matchId } = await params;
        const { team, playerEmail, newChampion, requesterEmail } = await request.json();

        if (!matchId || !team || !playerEmail || !newChampion || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const hasPermission = await checkAdminPermission(requesterEmail);
        if (!hasPermission) {
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

        teamData[playerIndex].champion = newChampion;

        await matchRef.update({ [teamKey]: teamData });

        return NextResponse.json({ message: '챔피언 정보가 성공적으로 수정되었습니다.' });

    } catch (error) {
        console.error('PATCH Match API Error:', error);
        return NextResponse.json({ error: '챔피언 정보 수정에 실패했습니다.' }, { status: 500 });
    }
}