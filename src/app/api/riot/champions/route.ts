import { NextResponse } from 'next/server';

// 타입 정의
interface ChampionData {
  id: string; // 영문 ID (예: "Aatrox")
  name: string; // 한글 이름 (예: "아트록스")
}

let championList: ChampionData[] = [];
let lastFetched: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1시간 캐시

async function fetchChampionList() {
  try {
    // 1. 최신 버전 정보 가져오기
    const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await versionRes.json();
    const latestVersion = versions[0];

    // 2. 최신 버전의 챔피언 데이터 가져오기 (한국어)
    const res = await fetch(`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ko_KR/champion.json`);
    const fullData = await res.json();
    const champions = fullData.data;

    // 3. 필요한 정보만 추출하여 리스트 생성
    championList = Object.keys(champions).map(key => ({
      id: champions[key].id,
      name: champions[key].name,
    }));
    lastFetched = Date.now();
  } catch (error) {
    console.error("Failed to fetch champion list from Riot:", error);
  }
}

export async function GET(request: Request) {
  // 1시간이 지났거나, 리스트가 비어있으면 새로 가져오기
  if (Date.now() - lastFetched > CACHE_DURATION || championList.length === 0) {
    await fetchChampionList();
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase() || '';

  if (!query) {
    return NextResponse.json(championList); // 쿼리가 없으면 전체 목록 반환
  }

  // 쿼리가 있으면 필터링
  const filteredChampions = championList.filter(champion => 
    champion.name.toLowerCase().includes(query)
  );

  return NextResponse.json(filteredChampions);
}
