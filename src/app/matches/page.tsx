// src/app/matches/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

// ⭐️ 1. 타입 정의 수정
interface Match {
  matchId: string;
  scrimName: string;
  winningTeam: 'blue' | 'red';
  matchDate: string;
  scrimType: string;
  creatorEmail: string;
}

interface UserMap {
  [email: string]: string;
}

// ⭐️ scrimType에 따른 스타일 추가
const scrimTypeStyles: { [key: string]: string } = {
  '일반': 'border-blue-500/50 text-blue-300',
  '피어리스': 'border-purple-500/50 text-purple-300',
  '칼바람': 'border-teal-500/50 text-teal-300',
};

export default function MatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({}); // ⭐️ 유저 맵 상태 추가
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // ⭐️ 2. 유저 정보와 매치 정보를 함께 가져오기
        const [matchesRes, usersRes] = await Promise.all([
          fetch('/api/matches'),
          fetch('/api/users')
        ]);

        if (!matchesRes.ok) throw new Error('Failed to fetch matches');
        const matchesData = await matchesRes.json();
        setMatches(matchesData);

        if (usersRes.ok) {
          const usersData: { email: string; nickname: string }[] = await usersRes.json();
          const map: UserMap = {};
          usersData.forEach(u => { map[u.email] = u.nickname; });
          setUserMap(map);
        }

      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (!user) { /* ... 로그인 필요 UI (기존과 동일) ... */ }
  if (loading) { /* ... 로딩 UI (기존과 동일) ... */ }

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-blue-400">매치 기록</h1>
      </div>

      <div className="space-y-4">
        {matches.length > 0 ? (
          matches.map((match) => {
            const hostNickname = userMap[match.creatorEmail] || match.creatorEmail.split('@')[0];
            const typeStyle = scrimTypeStyles[match.scrimType] || 'border-gray-500/50 text-gray-300';

            return (
              // ⭐️ 3. 카드 내부 UI 전체 수정
              <Link key={match.matchId} href={`/matches/${match.matchId}`} className="block bg-gray-800 p-4 rounded-lg shadow-lg hover:bg-gray-700/50 transition-colors duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className='flex-grow'>
                    <p className="text-xs text-gray-400">{new Date(match.matchDate).toLocaleString('ko-KR')}</p>
                    <h2 className="text-xl font-bold text-white mt-1 truncate" title={match.scrimName}>
                      {match.scrimName || '내전 경기'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 self-stretch sm:self-center">
                    <span className={`text-sm font-semibold px-2 py-1 border rounded-full ${typeStyle}`}>
                      {match.scrimType}
                    </span>
                    <span className="text-sm text-gray-400 hidden md:block">
                      주최: {hostNickname}
                    </span>
                    <div className={`text-lg font-bold px-4 py-2 rounded-md ${match.winningTeam === 'blue' ? 'bg-blue-500/20 text-blue-300' : 'bg-red-500/20 text-red-300'}`}>
                      {match.winningTeam === 'blue' ? '블루팀 승리' : '레드팀 승리'}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="p-6 text-center text-gray-400 bg-gray-800 rounded-lg">
            <p>기록된 경기가 없습니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}