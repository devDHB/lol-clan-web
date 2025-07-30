'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/AuthProvider';
import ProtectedRoute from '@/components/ProtectedRoute';

// --- 타입 정의 ---
interface MatchPlayer {
    nickname: string;
    tier: string;
    champion: string;
    email: string;
    championImageUrl?: string;
}

interface MatchData {
    scrimName: string;
    scrimType: string;
    winningTeam?: 'blue' | 'red';
    matchDate: string;
    blueTeam: MatchPlayer[];
    redTeam: MatchPlayer[];
}

interface UserProfile {
    role: string;
}

interface ChampionInfo {
    id: string;
    name: string;
    imageUrl: string;
}

// --- 헬퍼 함수 및 스타일 ---
const scrimTypeColors: { [key: string]: string } = {
    '일반': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    '피어리스': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    '칼바람': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

// --- 서브 컴포넌트: 챔피언 검색 ---
function ChampionSearchInput({ value, onChange, placeholder }: {
    value: string;
    onChange: (championName: string) => void;
    placeholder: string;
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const [searchResults, setSearchResults] = useState<ChampionInfo[]>([]);
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchTerm.trim().length > 0) {
                try {
                    const res = await fetch(`/api/riot/champions?q=${encodeURIComponent(searchTerm)}`);
                    if (res.ok) {
                        const data: ChampionInfo[] = await res.json();
                        setSearchResults(data);
                        setShowResults(true);
                    }
                } catch (error) {
                    console.error('Error searching champions:', error);
                }
            } else {
                setSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    const handleSelectChampion = (champion: ChampionInfo) => {
        onChange(champion.name);
        setSearchTerm(champion.name);
        setShowResults(false);
    };

    return (
        <div className="relative w-32">
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    onChange(e.target.value);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder={placeholder}
                className="w-full px-2 py-1 bg-gray-600 text-white rounded"
            />
            {showResults && searchResults.length > 0 && (
                <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {searchResults.map(champion => (
                        <li
                            key={champion.id}
                            onMouseDown={() => handleSelectChampion(champion)}
                            className="p-2 cursor-pointer hover:bg-gray-600 flex items-center gap-2"
                        >
                            <Image src={champion.imageUrl} alt={champion.name} width={24} height={24} className="rounded" />
                            <span className="text-sm">{champion.name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}


// --- 메인 페이지 컴포넌트 ---
export default function MatchDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const matchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;

    const [match, setMatch] = useState<MatchData | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const [editingPlayer, setEditingPlayer] = useState<{ team: 'blue' | 'red', email: string } | null>(null);
    const [newChampion, setNewChampion] = useState('');

    const fetchData = useCallback(async () => {
        if (!matchId) return;
        setLoading(true);
        try {
            const [matchRes, profileRes] = await Promise.all([
                fetch(`/api/matches/${matchId}`),
                user ? fetch(`/api/users/${user.email}`) : Promise.resolve(null)
            ]);

            if (!matchRes.ok) throw new Error('매치 정보를 불러오는 데 실패했습니다.');
            const matchData = await matchRes.json();
            setMatch(matchData);

            if (profileRes && profileRes.ok) {
                setProfile(await profileRes.json());
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

    const handleUpdateChampion = async () => {
        if (!editingPlayer || !newChampion.trim() || !user) return;

        try {
            const res = await fetch(`/api/matches/${matchId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team: editingPlayer.team,
                    playerEmail: editingPlayer.email,
                    newChampion,
                    requesterEmail: user.email,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '챔피언 수정 실패');
            }
            alert('챔피언이 수정되었습니다.');
            setEditingPlayer(null);
            fetchData();
        } catch (error) {
            if (error instanceof Error) {
                alert(error.message);
            } else {
                alert('알 수 없는 오류가 발생했습니다.');
            }
        }
    };

    const handleDeleteMatch = async () => {
        if (!user || !confirm('정말로 이 경기 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

        try {
            const res = await fetch(`/api/matches/${matchId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterEmail: user.email }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '삭제 실패');
            }
            alert('경기 기록이 삭제되었습니다.');
            router.push('/matches');
        } catch (error) {
            if (error instanceof Error) {
                alert(error.message);
            } else {
                alert('알 수 없는 오류가 발생했습니다.');
            }
        }
    };

    const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자';
    const isSuperAdmin = profile?.role === '총관리자';

    return (
        <ProtectedRoute>
            {loading ? (
                <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>
            ) : !match ? (
                <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                    <p>매치 정보를 찾을 수 없습니다.</p>
                    <Link href="/matches" className="text-blue-400 hover:underline mt-4">← 매치 기록으로 돌아가기</Link>
                </main>
            ) : (
                <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
                    {/* 삭제 버튼 추가 */}
                    <div className="flex justify-between items-center mb-6">
                        <Link href="/matches" className="text-blue-400 hover:underline">← 매치 기록으로 돌아가기</Link>
                        {isSuperAdmin && (
                            <button
                                onClick={handleDeleteMatch}
                                className="py-1 px-3 bg-red-800 hover:bg-red-700 text-white font-semibold rounded-md text-sm"
                            >
                                기록 삭제
                            </button>
                        )}
                    </div>

                    <header className="text-center mb-8 bg-gray-800 p-6 rounded-lg">
                        <div className="flex justify-center items-center gap-4 mb-2">
                            <h1 className="text-4xl font-bold text-white">{match.scrimName}</h1>
                            <span className={`text-sm font-semibold px-3 py-1 border rounded-full ${scrimTypeColors[match.scrimType] || 'bg-gray-600'}`}>
                                {match.scrimType}
                            </span>
                        </div>
                        <p className="text-lg text-gray-400 mt-1">{new Date(match.matchDate).toLocaleString('ko-KR')}</p>
                    </header>

                    <h2 className="text-3xl font-bold text-center mb-6">
                        경기 결과:
                        <span className={match.winningTeam === 'blue' ? 'text-blue-400' : 'text-red-500'}>
                            {match.winningTeam === 'blue' ? ' 블루팀 승리!' : ' 레드팀 승리!'}
                        </span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 블루팀 */}
                        <div className={`p-6 rounded-lg ${match.winningTeam === 'blue' ? 'bg-blue-900/50 border-2 border-blue-500' : 'bg-gray-800'}`}>
                            <h3 className="text-3xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            <div className="space-y-3">
                                {match.blueTeam.map(player => (
                                    <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                                        {player.championImageUrl ? (
                                            <Image src={player.championImageUrl} alt={player.champion || '챔피언'} width={48} height={48} className="rounded-md" />
                                        ) : (
                                            <div className="w-12 h-12 bg-gray-600 rounded-md flex-shrink-0"></div>
                                        )}
                                        <div className="flex-grow">
                                            <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:text-yellow-400">{player.nickname}</Link>
                                            <p className="text-sm text-gray-400">{player.tier}</p>
                                        </div>

                                        {editingPlayer?.email === player.email ? (
                                            <div className="flex items-center gap-1">
                                                <ChampionSearchInput value={newChampion} onChange={setNewChampion} placeholder="챔피언 검색" />
                                                <button onClick={handleUpdateChampion} className="p-1 bg-green-600 rounded text-xs">✓</button>
                                                <button onClick={() => setEditingPlayer(null)} className="p-1 bg-gray-600 rounded text-xs">X</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-yellow-400">{player.champion}</span>
                                                {isAdmin && <button onClick={() => { setEditingPlayer({ team: 'blue', email: player.email }); setNewChampion(player.champion); }} className="text-xs p-1 hover:bg-gray-600 rounded">✏️</button>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 레드팀 */}
                        <div className={`p-6 rounded-lg ${match.winningTeam === 'red' ? 'bg-red-900/50 border-2 border-red-500' : 'bg-gray-800'}`}>
                            <h3 className="text-3xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            <div className="space-y-3">
                                {match.redTeam.map(player => (
                                    <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                                        {player.championImageUrl ? (
                                            <Image src={player.championImageUrl} alt={player.champion || '챔피언'} width={48} height={48} className="rounded-md" />
                                        ) : (
                                            <div className="w-12 h-12 bg-gray-600 rounded-md flex-shrink-0"></div>
                                        )}
                                        <div className="flex-grow">
                                            <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:text-yellow-400">{player.nickname}</Link>
                                            <p className="text-sm text-gray-400">{player.tier}</p>
                                        </div>

                                        {editingPlayer?.email === player.email ? (
                                            <div className="flex items-center gap-1">
                                                <ChampionSearchInput value={newChampion} onChange={setNewChampion} placeholder="챔피언 검색" />
                                                <button onClick={handleUpdateChampion} className="p-1 bg-green-600 rounded text-xs">✓</button>
                                                <button onClick={() => setEditingPlayer(null)} className="p-1 bg-gray-600 rounded text-xs">X</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-yellow-400">{player.champion}</span>
                                                {isAdmin && <button onClick={() => { setEditingPlayer({ team: 'red', email: player.email }); setNewChampion(player.champion); }} className="text-xs p-1 hover:bg-gray-600 rounded">✏️</button>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </main>
            )}
        </ProtectedRoute>
    );
}