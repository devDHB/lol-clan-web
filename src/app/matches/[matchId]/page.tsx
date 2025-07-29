'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

// --- 타입 정의 ---
interface MatchPlayer {
    nickname: string;
    tier: string;
    champion: string;
    email: string; // 링크를 위해 email 필드가 필수입니다.
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

// --- 내전 타입별 색상 정의 ---
const scrimTypeColors: { [key: string]: string } = {
    '일반': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    '피어리스': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    '칼바람': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

export default function MatchDetailPage() {
    const params = useParams();
    const matchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;

    const [match, setMatch] = useState<MatchData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!matchId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/matches/${matchId}`);
            if (!res.ok) throw new Error('매치 정보를 불러오는 데 실패했습니다.');
            const data = await res.json();
            setMatch(data);
        } catch (error) {
            console.error("Failed to fetch data:", error);
            setMatch(null);
        } finally {
            setLoading(false);
        }
    }, [matchId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    const typeStyle = scrimTypeColors[match.scrimType] || 'bg-gray-600';

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
                                    <div className="w-12 h-12 bg-gray-600 rounded-md flex items-center justify-center text-xs">?</div>
                                )}
                                <div className="flex-grow">
                                    {/* ✅ [수정] 닉네임에 개인 전적 페이지 링크 추가 */}
                                    <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:text-yellow-400 transition-colors">{player.nickname}</Link>
                                    <p className="text-sm text-gray-400">{player.tier}</p>
                                </div>
                                <span className="font-semibold text-yellow-400">{player.champion}</span>
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
                                    <div className="w-12 h-12 bg-gray-600 rounded-md flex items-center justify-center text-xs">?</div>
                                )}
                                <div className="flex-grow">
                                    {/* ✅ [수정] 닉네임에 개인 전적 페이지 링크 추가 */}
                                    <Link href={`/profile/${player.email}`} className="font-bold text-lg hover:text-yellow-400 transition-colors">{player.nickname}</Link>
                                    <p className="text-sm text-gray-400">{player.tier}</p>
                                </div>
                                <span className="font-semibold text-yellow-400">{player.champion}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
