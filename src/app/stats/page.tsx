'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';

// 타입 정의: API 응답에 맞춰 칼바람 필드 추가
interface UserStats {
    email: string;
    nickname: string;
    totalGames: number;
    totalWins: number;
    aramGames: number;
    aramWins: number;
    positions: {
        [key: string]: { games: number; wins: number; }
    };
}

type SortKey = 'nickname' | 'totalGames' | 'winRate' | 'aramGames' | 'aramWinRate' | 'TOP' | 'JG' | 'MID' | 'AD' | 'SUP';

export default function StatsPage() {
    const [stats, setStats] = useState<UserStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'totalGames', direction: 'desc' });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const calculateWinRate = (wins: number, games: number) => {
        if (games === 0) return 0;
        return (wins / games) * 100;
    };

    const sortedStats = useMemo(() => {
        let sortableItems = [...stats];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const key = sortConfig.key;
                let aValue: string | number;
                let bValue: string | number;

                if (key === 'winRate') {
                    aValue = calculateWinRate(a.totalWins, a.totalGames);
                    bValue = calculateWinRate(b.totalWins, b.totalGames);
                } else if (key === 'aramWinRate') {
                    aValue = calculateWinRate(a.aramWins, a.aramGames);
                    bValue = calculateWinRate(b.aramWins, b.aramGames);
                } else if (key === 'nickname' || key === 'totalGames' || key === 'aramGames') {
                    aValue = a[key];
                    bValue = b[key];
                } else {
                    aValue = a.positions[key]?.games || 0;
                    bValue = b.positions[key]?.games || 0;
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [stats, sortConfig]);

    const requestSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const SortableHeader = ({ sortKey, label }: { sortKey: SortKey, label: string }) => (
        <th className="p-3 cursor-pointer" onClick={() => requestSort(sortKey)}>
            {label}
            {sortConfig.key === sortKey ? (sortConfig.direction === 'desc' ? ' ▼' : ' ▲') : ''}
        </th>
    );

    if (loading) return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">통계 데이터를 집계하는 중...</main>;

    return (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
            <h1 className="text-4xl font-bold text-blue-400 mb-8">전체 유저 통계</h1>
            <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-gray-700/50">
                        <tr className="border-b border-gray-700">
                            <th className="p-3">순위</th>
                            <SortableHeader sortKey="nickname" label="닉네임" />
                            <SortableHeader sortKey="totalGames" label="일반/피어리스" />
                            <SortableHeader sortKey="winRate" label="승률" />
                            <SortableHeader sortKey="aramGames" label="칼바람" />
                            <SortableHeader sortKey="aramWinRate" label="승률" />
                            <SortableHeader sortKey="TOP" label="TOP" />
                            <SortableHeader sortKey="JG" label="JG" />
                            <SortableHeader sortKey="MID" label="MID" />
                            <SortableHeader sortKey="AD" label="AD" />
                            <SortableHeader sortKey="SUP" label="SUP" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedStats.map((s, index) => (
                            <tr key={s.email} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                <td className="p-3 text-center">{index + 1}</td>
                                <td className="p-3 font-bold">
                                    <Link href={`/profile/${s.email}`} className="hover:text-yellow-400">{s.nickname}</Link>
                                </td>
                                <td className="p-3 text-center">{s.totalGames}</td>
                                <td className="p-3 text-center">
                                    {calculateWinRate(s.totalWins, s.totalGames).toFixed(1)}%
                                    <span className="text-xs text-gray-400 ml-1">({s.totalWins}승 {s.totalGames - s.totalWins}패)</span>
                                </td>
                                {/* ✅ [추가] 칼바람 전적 표시 */}
                                <td className="p-3 text-center">{s.aramGames}</td>
                                <td className="p-3 text-center">
                                    {calculateWinRate(s.aramWins, s.aramGames).toFixed(1)}%
                                    <span className="text-xs text-gray-400 ml-1">({s.aramWins}승 {s.aramGames - s.aramWins}패)</span>
                                </td>
                                {['TOP', 'JG', 'MID', 'AD', 'SUP'].map(pos => (
                                    <td key={pos} className="p-3 text-center">
                                        {s.positions[pos] ? `${calculateWinRate(s.positions[pos].wins, s.positions[pos].games).toFixed(0)}% (${s.positions[pos].games})` : '-'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </main>
    );
}
