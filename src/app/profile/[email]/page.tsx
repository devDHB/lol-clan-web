'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute';

// --- 타입 정의 ---
interface PositionStats {
    wins: number;
    losses: number;
}
interface ChampionStats {
    [championName: string]: PositionStats;
}
interface MatchupStats {
    [position: string]: {
        [opponentEmail: string]: {
            nickname: string;
            wins: number;
            losses: number;
        };
    };
}
interface UserStats {
    totalGames: number;
    totalWins: number;
    totalLosses: number;
    aramGames: number;
    aramWins: number;
    aramLosses: number;
    positions: Record<string, PositionStats>;
    championStats: ChampionStats;
    matchups: MatchupStats;
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
interface UserInfo {
    email: string;
    nickname: string;
}

// --- 메인 컴포넌트 ---
export default function ProfilePage() {
    const params = useParams();
    const router = useRouter();
    const email = Array.isArray(params.email) ? params.email[0] : params.email ? decodeURIComponent(params.email) : undefined;

    const [stats, setStats] = useState<UserStats | null>(null);
    const [userProfile, setUserProfile] = useState<{ nickname: string } | null>(null);
    const [championMap, setChampionMap] = useState<Map<string, { id: string; imageUrl: string }>>(new Map());
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!email) return;
        try {
            setLoading(true);
            setError(null);
            const [statsRes, userRes, championsRes, allUsersRes] = await Promise.all([
                fetch(`/api/users/${email}/stats`),
                fetch(`/api/users/${email}`),
                fetch('/api/riot/champions'),
                fetch('/api/users'),
            ]);

            if (!statsRes.ok || !userRes.ok) throw new Error('데이터를 불러오는 데 실패했습니다.');

            const statsData = await statsRes.json();
            const userData = await userRes.json();

            setStats(statsData);
            setUserProfile(userData);

            if (championsRes.ok) {
                const championsData: ChampionInfo[] = await championsRes.json();
                setChampionMap(new Map(championsData.map(c => [c.name, { id: c.id, imageUrl: c.imageUrl }])));
            }
            if (allUsersRes.ok) {
                setAllUsers(await allUsersRes.json());
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [email]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = () => {
        if (!searchTerm.trim()) return;
        const foundUser = allUsers.find(u => u.nickname.toLowerCase() === searchTerm.trim().toLowerCase());
        if (foundUser) {
            router.push(`/profile/${foundUser.email}`);
        } else {
            alert('해당 닉네임의 유저를 찾을 수 없습니다.');
        }
    };

    const calculateWinRate = (wins: number, losses: number) => {
        const total = wins + losses;
        if (total === 0) return '0.0%';
        return `${((wins / total) * 100).toFixed(1)}%`;
    };

    if (loading) return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">전적 데이터를 불러오는 중...</main>;
    if (error || !stats) return <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white"><p>{error || '전적 데이터 없음'}</p><Link href="/" className="text-blue-400 hover:underline mt-4">← 홈으로</Link></main>;

    const sortedChampions = Object.entries(stats.championStats).sort(([, a], [, b]) => (b.wins + b.losses) - (a.wins + a.losses));

    return (
        <ProtectedRoute>
            <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
                <div className="mb-8 p-4 bg-gray-800 rounded-lg flex flex-col sm:flex-row gap-2 justify-center">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="다른 유저 닉네임 검색..."
                        className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-md w-full sm:w-auto sm:max-w-xs"
                    />
                    <button onClick={handleSearch} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">검색</button>
                </div>

                <header className="text-center mb-10">
                    <h1 className="text-4xl font-bold text-yellow-400">{userProfile?.nickname || email}</h1>
                    <p className="text-lg text-gray-400">개인 전적 기록</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <section className="bg-gray-800 p-6 rounded-lg">
                            <h2 className="text-2xl font-bold mb-4 border-l-4 border-blue-400 pl-4">종합 전적 (일반/피어리스)</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div><p className="text-sm text-gray-400">총 게임</p><p className="text-3xl font-bold">{stats.totalGames}</p></div>
                                <div><p className="text-sm text-gray-400">승리</p><p className="text-3xl font-bold text-green-400">{stats.totalWins}</p></div>
                                <div><p className="text-sm text-gray-400">패배</p><p className="text-3xl font-bold text-red-400">{stats.totalLosses}</p></div>
                                <div><p className="text-sm text-gray-400">승률</p><p className="text-3xl font-bold">{calculateWinRate(stats.totalWins, stats.totalLosses)}</p></div>
                            </div>
                        </section>

                        {stats.aramGames > 0 && (
                            <section className="bg-gray-800 p-6 rounded-lg">
                                <h2 className="text-2xl font-bold mb-4 border-l-4 border-teal-400 pl-4">칼바람 나락 전적</h2>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                    <div><p className="text-sm text-gray-400">총 게임</p><p className="text-3xl font-bold">{stats.aramGames}</p></div>
                                    <div><p className="text-sm text-gray-400">승리</p><p className="text-3xl font-bold text-green-400">{stats.aramWins}</p></div>
                                    <div><p className="text-sm text-gray-400">패배</p><p className="text-3xl font-bold text-red-400">{stats.aramLosses}</p></div>
                                    <div><p className="text-sm text-gray-400">승률</p><p className="text-3xl font-bold">{calculateWinRate(stats.aramWins, stats.aramLosses)}</p></div>
                                </div>
                            </section>
                        )}

                        <section className="bg-gray-800 p-6 rounded-lg">
                            <h2 className="text-2xl font-bold mb-4 border-l-4 border-blue-400 pl-4">포지션별 승패</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead><tr className="border-b border-gray-700"><th className="p-2">포지션</th><th className="p-2 text-center">승</th><th className="p-2 text-center">패</th><th className="p-2 text-center">승률</th><th className="p-2 text-center">게임 수</th></tr></thead>
                                    <tbody>
                                        {Object.entries(stats.positions).map(([pos, data]) => (
                                            <tr key={pos} className="border-b border-gray-700/50">
                                                <td className="p-2 font-bold">{pos}</td>
                                                <td className="p-2 text-center text-green-400">{data.wins}</td>
                                                <td className="p-2 text-center text-red-400">{data.losses}</td>
                                                <td className="p-2 text-center">{calculateWinRate(data.wins, data.losses)}</td>
                                                <td className="p-2 text-center">{data.wins + data.losses}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    <div className="lg:col-span-1 space-y-8">
                        <section className="bg-gray-800 p-6 rounded-lg">
                            {/* ✅ [수정] "최근 5경기"를 "최근 10경기"로 변경 */}
                            <h2 className="text-2xl font-bold mb-4 border-l-4 border-purple-400 pl-4">최근 10경기</h2>
                            <div className="flex flex-col gap-3">
                                {stats.recentGames.length > 0 ? (
                                    stats.recentGames.map((game, index) => (
                                        <Link href={`/matches/${game.matchId}`} key={index} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md hover:bg-gray-700/80 transition-colors">
                                            <div className="flex items-center gap-3">
                                                {game.championImageUrl ? (
                                                    <Image src={game.championImageUrl} alt={game.champion} width={36} height={36} className="rounded-full" />
                                                ) : (
                                                    <div className="w-9 h-9 bg-gray-600 rounded-full" />
                                                )}
                                                <span className="font-semibold">{game.champion}</span>
                                            </div>
                                            <span className={`font-bold px-3 py-1 rounded-md text-sm ${game.win ? 'bg-blue-500/80 text-white' : 'bg-red-500/80 text-white'}`}>
                                                {game.win ? '승리' : '패배'}
                                            </span>
                                        </Link>
                                    ))
                                ) : (
                                    <p className="text-gray-400 text-center">최근 경기 기록이 없습니다.</p>
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                <div className="mt-8 space-y-8">
                    <section className="bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-4 border-l-4 border-blue-400 pl-4">챔피언별 승패</h2>
                        <div className="overflow-x-auto max-h-[400px]">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-gray-800"><tr className="border-b border-gray-700"><th className="p-2">챔피언</th><th className="p-2 text-center">승</th><th className="p-2 text-center">패</th><th className="p-2 text-center">승률</th><th className="p-2 text-center">게임 수</th></tr></thead>
                                <tbody>
                                    {sortedChampions.map(([name, data]) => {
                                        const champInfo = championMap.get(name);
                                        return (
                                            <tr key={name} className="border-b border-gray-700/50">
                                                <td className="p-2 flex items-center gap-3">
                                                    {champInfo?.imageUrl && (
                                                        <Image src={champInfo.imageUrl} alt={name} width={32} height={32} className="rounded-full" />
                                                    )}
                                                    <span className="font-semibold">{name}</span>
                                                </td>
                                                <td className="p-2 text-center text-green-400">{data.wins}</td>
                                                <td className="p-2 text-center text-red-400">{data.losses}</td>
                                                <td className="p-2 text-center">{calculateWinRate(data.wins, data.losses)}</td>
                                                <td className="p-2 text-center">{data.wins + data.losses}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-4 border-l-4 border-blue-400 pl-4">상대 전적 (포지션별)</h2>
                        {Object.keys(stats.matchups).length > 0 ? (
                            Object.entries(stats.matchups).map(([position, opponents]) => (
                                <div key={position} className="mb-6">
                                    <h3 className="text-xl font-semibold text-yellow-500 mb-3">{position}</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-gray-800"><tr className="border-b border-gray-700"><th className="p-2">상대</th><th className="p-2 text-center">승</th><th className="p-2 text-center">패</th><th className="p-2 text-center">승률</th></tr></thead>
                                            <tbody>
                                                {Object.entries(opponents).sort(([, a], [, b]) => (b.wins + b.losses) - (a.wins + a.losses)).map(([email, data]) => (
                                                    <tr key={email} className="border-b border-gray-700/50">
                                                        <td className="p-2">
                                                            <Link href={`/profile/${email}`} className="hover:text-yellow-400 transition-colors">{data.nickname}</Link>
                                                        </td>
                                                        <td className="p-2 text-center text-green-400">{data.wins}</td>
                                                        <td className="p-2 text-center text-red-400">{data.losses}</td>
                                                        <td className="p-2 text-center">{calculateWinRate(data.wins, data.losses)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))
                        ) : (<p className="text-gray-400">기록된 상대 전적이 없습니다.</p>)}
                    </section>
                </div>
            </main>
        </ProtectedRoute>
    );
}
