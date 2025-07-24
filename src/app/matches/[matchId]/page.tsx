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
}

interface UserProfile {
  role: string;
}

interface ChampionInfo {
    id: string; // 영문 ID
    name: string; // 한글 이름
}

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
        setChampionMap(new Map(championData.map(c => [c.id, c.name])));
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

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="mb-6">
        <Link href="/matches" className="text-blue-400 hover:underline">← 매치 기록으로 돌아가기</Link>
      </div>

      <header className="text-center mb-8 bg-gray-800 p-6 rounded-lg">
        <h1 className="text-4xl font-bold text-white">{match.scrimName}</h1>
        <p className="text-lg text-gray-400 mt-2">{new Date(match.matchDate).toLocaleString('ko-KR')}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 블루팀 */}
        <div className={`p-6 rounded-lg ${match.winningTeam === 'blue' ? 'bg-blue-900/50 border-2 border-blue-500' : 'bg-gray-800'}`}>
          <h2 className="text-3xl font-bold mb-4 text-center text-blue-400">블루팀 {match.winningTeam === 'blue' && ' (승리)'}</h2>
          <div className="space-y-3">
            {match.blueTeam.map(player => (
              <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                <Image src={`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${player.champion}.png`} alt={player.champion} width={48} height={48} className="rounded-md" />
                <div className="flex-grow">
                  <p className="font-bold text-lg">{player.nickname}</p>
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
            ))}
          </div>
        </div>

        {/* 레드팀 */}
        <div className={`p-6 rounded-lg ${match.winningTeam === 'red' ? 'bg-red-900/50 border-2 border-red-500' : 'bg-gray-800'}`}>
          <h2 className="text-3xl font-bold mb-4 text-center text-red-500">레드팀 {match.winningTeam === 'red' && ' (승리)'}</h2>
          <div className="space-y-3">
            {match.redTeam.map(player => (
              <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                <Image src={`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${player.champion}.png`} alt={player.champion} width={48} height={48} className="rounded-md" />
                <div className="flex-grow">
                  <p className="font-bold text-lg">{player.nickname}</p>
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
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
