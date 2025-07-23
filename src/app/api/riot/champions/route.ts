import { NextRequest, NextResponse } from 'next/server';

// 라이엇 Data Dragon API의 최신 버전 정보를 가져오는 함수
// 실제 서비스에서는 이 버전을 동적으로 가져오거나, 정기적으로 업데이트하는 로직이 필요합니다.
// 여기서는 편의를 위해 특정 버전을 사용합니다.
const DDRAGON_VERSION = '14.10.1'; // 최신 버전에 따라 변경될 수 있습니다.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || ''; // 클라이언트에서 넘어온 검색 쿼리

    // Data Dragon 챔피언 데이터 API URL
    const ddragonUrl = `http://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/ko_KR/champion.json`;

    const response = await fetch(ddragonUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch champion data from Data Dragon: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: '챔피언 데이터를 불러오는 데 실패했습니다.' }, { status: response.status });
    }

    const data = await response.json();
    const champions = data.data; // 챔피언 데이터는 'data' 필드 안에 있습니다.

    const championNames: string[] = [];
    for (const key in champions) {
      if (champions.hasOwnProperty(key)) {
        championNames.push(champions[key].name);
      }
    }

    // 검색 쿼리가 있다면 필터링
    const filteredChampions = query
      ? championNames.filter(name => name.toLowerCase().includes(query.toLowerCase()))
      : championNames;

    // 알파벳 순으로 정렬 (선택 사항)
    filteredChampions.sort();

    return NextResponse.json(filteredChampions);

  } catch (error) {
    console.error('Riot Champions API Error:', error);
    return NextResponse.json({ error: '챔피언 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
