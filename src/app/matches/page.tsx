'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

// 타입 정의
interface MatchPlayer {
  nickname: string;
  champion: string;
}

interface Match {
  matchId: string;
  scrimName: string;
  winningTeam: 'blue' | 'red';
  matchDate: string;
  blueTeam: MatchPlayer[];
  redTeam: MatchPlayer[];
}

export default function MatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch('/api/matches');
        if (!res.ok) throw new Error('Failed to fetch matches');
        const data = await res.json();
        setMatches(data);
      } catch (error) {
        console.error('Failed to fetch matches:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, []);

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="mb-4">전적을 보려면 로그인이 필요합니다.</p>
        <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">경기 기록을 불러오는 중...</main>;
  }

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-blue-400">매치 기록</h1>
      </div>

      <div className="space-y-4">
        {matches.length > 0 ? (
          matches.map((match) => (
            <Link key={match.matchId} href={`/matches/${match.matchId}`} className="block bg-gray-800 p-4 rounded-lg shadow-lg hover:bg-gray-700/50 transition-colors duration-300">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">{new Date(match.matchDate).toLocaleString('ko-KR')}</p>
                  <h2 className="text-xl font-bold text-white mt-1">{match.scrimName || '내전 경기'}</h2>
                </div>
                <div className={`text-lg font-bold px-4 py-2 rounded-md ${match.winningTeam === 'blue' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'}`}>
                  {match.winningTeam === 'blue' ? '블루팀 승리' : '레드팀 승리'}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="p-6 text-center text-gray-400 bg-gray-800 rounded-lg">
            <p>기록된 경기가 없습니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}
