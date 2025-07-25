'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import Image from 'next/image';

// 타입 정의
interface MatchPlayer {
  nickname: string;
  tier: string;
  email: string;
  champion: string; // 이제 영문 ID가 저장됩니다 (예: "Aatrox")
}

interface MatchData {
  matchId: string;
  scrimName: string;
  winningTeam: 'blue' | 'red';
  matchDate: string;
  blueTeam: MatchPlayer[];
  redTeam: MatchPlayer[];
  scrimType: string; // 이 줄 추가
}

interface UserProfile {
  role: string;
}

interface ChampionInfo {
  id: string; // 영문 ID
  name: string; // 한글 이름
}

// 내전 타입별 색상 정의
const scrimTypeColors: { [key: string]: string } = {
  '일반': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '피어리스': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  '칼바람': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

// 챔피언 검색 입력 컴포넌트 (수정됨)
function ChampionSearchInput({ initialChampionName, onChampionSelect, placeholder }: {
  initialChampionName: string;
  onChampionSelect: (championId: string) => void;
  placeholder: string;
}) {
  const [searchTerm, setSearchTerm] = useState(initialChampionName);
  const [searchResults, setSearchResults] = useState<ChampionInfo[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.trim().length > 0) {
        setLoadingResults(true);
        try {
          const res = await fetch(`/api/riot/champions?q=${encodeURIComponent(searchTerm)}`);
          if (res.ok) {
            const data: ChampionInfo[] = await res.json();
            setSearchResults(data);
            setShowResults(true);
          } else {
            setSearchResults([]);
          }
        } catch (error) {
          console.error('Error searching champions:', error);
        } finally {
          setLoadingResults(false);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSelectChampion = (champion: ChampionInfo) => {
    onChampionSelect(champion.id); // 부모에게는 영문 ID 전달
    setSearchTerm(champion.name); // 화면에는 한글 이름 표시
    setShowResults(false);
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        placeholder={placeholder}
        className="w-full px-3 py-1 bg-gray-600 rounded"
      />
      {showResults && (
        <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
          {loadingResults ? <li className="p-2 text-gray-400">검색 중...</li> :
            searchResults.map(champion => (
              <li
                key={champion.id}
                onMouseDown={() => handleSelectChampion(champion)}
                className="p-2 cursor-pointer hover:bg-gray-600 text-white"
              >
                {champion.name}
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}

export default function MatchDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const matchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;

  const [match, setMatch] = useState<MatchData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [championMap, setChampionMap] = useState<Map<string, string>>(new Map());
  const [nameToIdMap, setNameToIdMap] = useState<Map<string, string>>(new Map()); // ⭐️ 이 상태 추가
  const [loading, setLoading] = useState(true);

  const [editingPlayerEmail, setEditingPlayerEmail] = useState<string | null>(null);
  const [newChampionId, setNewChampionId] = useState('');

  const fetchData = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    try {
      const fetchPromises = [
        fetch(`/api/matches/${matchId}`),
        fetch('/api/riot/champions') // 전체 챔피언 목록 가져오기
      ];
      if (user) {
        fetchPromises.push(fetch(`/api/users/${user.email}`));
      }
      const [matchRes, championRes, profileRes] = await Promise.all(fetchPromises);

      if (!matchRes.ok) throw new Error('매치 정보를 불러오는 데 실패했습니다.');
      const matchData = await matchRes.json();
      setMatch(matchData);

      if (championRes.ok) {
        const championData: ChampionInfo[] = await championRes.json();
        // 기존 맵 (ID -> 이름)
        setChampionMap(new Map(championData.map(c => [c.id, c.name])));
        // ⭐️ 추가된 맵 (이름 -> ID)
        setNameToIdMap(new Map(championData.map(c => [c.name, c.id])));
      }

      if (profileRes && profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }, [matchId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdateChampion = async (team: 'blue' | 'red', playerEmail: string) => {
    if (!user || !newChampionId.trim()) return;
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team,
          playerEmail,
          newChampion: newChampionId,
          requesterEmail: user.email,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '챔피언 수정 실패');
      }
      alert('챔피언 정보가 수정되었습니다.');
      setEditingPlayerEmail(null);
      fetchData();
    } catch (error: any) {
      alert(`오류: ${error.message}`);
    }
  };

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
  }

  if (!match) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p>매치 정보를 찾을 수 없습니다.</p>
        <Link href="/matches" className="text-blue-400 hover:underline mt-4">← 매치 기록으로 돌아가기</Link>
      </main>
    );
  }

  const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자';
  const latestVersion = "14.14.1"; // 이 부분은 나중에 API에서 동적으로 가져올 수 있습니다.
  const typeStyle = scrimTypeColors[match.scrimType] || 'bg-gray-600'; // ⭐️ scrimType 스타일 가져오기


  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="mb-6">
        <Link href="/matches" className="text-blue-400 hover:underline">← 매치 기록으로 돌아가기</Link>
      </div>

      <header className="text-center mb-8 bg-gray-800 p-6 rounded-lg">
        <div className="flex justify-center items-center gap-4 mb-2">
          <h1 className="text-4xl font-bold text-white">{match.scrimName}</h1>
          <span className={`text-sm font-semibold px-3 py-1 border rounded-full ${typeStyle}`}>
            {match.scrimType}
          </span>
        </div>
        <p className="text-lg text-gray-400 mt-1">{new Date(match.matchDate).toLocaleString('ko-KR')}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 블루팀 */}
        <div className={`p-6 rounded-lg ${match.winningTeam === 'blue' ? 'bg-blue-900/50 border-2 border-blue-500' : 'bg-gray-800'}`}>
          <h2 className="text-3xl font-bold mb-4 text-center text-blue-400">블루팀 {match.winningTeam === 'blue' && ' (승리)'}</h2>
          <div className="space-y-3">
            {match.blueTeam.map(player => {
              const championId = nameToIdMap.get(player.champion) || player.champion;
              return (
                <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                  <Image
                    // ⭐️ championId를 사용하도록 수정
                    src={`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${championId}.png`}
                    alt={player.champion}
                    width={48}
                    height={48}
                    className="rounded-md"
                  />
                  <div className="flex-grow">
                    <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:underline">
                      {player.nickname}
                    </Link>
                    <p className="text-sm text-gray-400">{player.tier}</p>
                  </div>
                  <div className="w-1/3">
                    {editingPlayerEmail === player.email ? (
                      <div className="flex items-center gap-2">
                        <ChampionSearchInput initialChampionName={championMap.get(player.champion) || player.champion} onChampionSelect={setNewChampionId} placeholder="챔피언..." />
                        <button onClick={() => handleUpdateChampion('blue', player.email)} className="bg-green-600 p-1 rounded-md text-xs">✓</button>
                        <button onClick={() => setEditingPlayerEmail(null)} className="bg-gray-600 p-1 rounded-md text-xs">X</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-semibold text-yellow-400">{championMap.get(player.champion) || player.champion}</span>
                        {isAdmin && <button onClick={() => { setEditingPlayerEmail(player.email); setNewChampionId(player.champion); }} className="text-xs bg-gray-600 p-1 rounded-md">✏️</button>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 레드팀 */}
        <div className={`p-6 rounded-lg ${match.winningTeam === 'red' ? 'bg-red-900/50 border-2 border-red-500' : 'bg-gray-800'}`}>
          <h2 className="text-3xl font-bold mb-4 text-center text-red-500">레드팀 {match.winningTeam === 'red' && ' (승리)'}</h2>
          <div className="space-y-3">
            {match.redTeam.map(player => {
              const championId = nameToIdMap.get(player.champion) || player.champion;
              return (
                <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                  <Image
                    // ⭐️ championId를 사용하도록 수정
                    src={`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${championId}.png`}
                    alt={player.champion}
                    width={48}
                    height={48}
                    className="rounded-md"
                  />
                  <div className="flex-grow">
                    <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:underline">
                      {player.nickname}
                    </Link>
                    <p className="text-sm text-gray-400">{player.tier}</p>
                  </div>
                  <div className="w-1/3">
                    {editingPlayerEmail === player.email ? (
                      <div className="flex items-center gap-2">
                        <ChampionSearchInput initialChampionName={championMap.get(player.champion) || player.champion} onChampionSelect={setNewChampionId} placeholder="챔피언..." />
                        <button onClick={() => handleUpdateChampion('red', player.email)} className="bg-green-600 p-1 rounded-md text-xs">✓</button>
                        <button onClick={() => setEditingPlayerEmail(null)} className="bg-gray-600 p-1 rounded-md text-xs">X</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-semibold text-yellow-400">{championMap.get(player.champion) || player.champion}</span>
                        {isAdmin && <button onClick={() => { setEditingPlayerEmail(player.email); setNewChampionId(player.champion); }} className="text-xs bg-gray-600 p-1 rounded-md">✏️</button>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
