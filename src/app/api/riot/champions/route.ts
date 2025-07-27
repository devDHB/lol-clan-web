import { NextResponse } from 'next/server';

// 타입 정의
interface ChampionData {
    id: string;
    name: string;
    imageUrl: string; // 👈 [추가]
}

let championList: ChampionData[] = [];
let lastFetched: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1시간 캐시

async function fetchChampionList() {
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
            // 👈 [추가]
            imageUrl: `http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champions[key].id}.png`
        }));
        lastFetched = Date.now();
    } catch (error) {
        console.error("Failed to fetch champion list from Riot:", error);
    }
}

export async function GET(request: Request) {
    if (Date.now() - lastFetched > CACHE_DURATION || championList.length === 0) {
        await fetchChampionList();
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase() || '';

    if (!query) {
        return NextResponse.json(championList);
    }

    const filteredChampions = championList.filter(champion => 
        champion.name.toLowerCase().includes(query)
    );

    return NextResponse.json(filteredChampions);
}