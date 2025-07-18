'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// 타입 정의
interface StatRow {
  [key: string]: string | number;
}

interface PlayerRank {
  닉네임: string;
  value: number;
}

interface Rankings {
  꾸준왕: PlayerRank[];
  다승: PlayerRank[];
  승률: PlayerRank[];
  TOP: PlayerRank[];
  JG: PlayerRank[];
  MID: PlayerRank[];
  AD: PlayerRank[];
  SUP: PlayerRank[];
}

// 랭킹 카드를 만드는 컴포넌트
function RankingCard({ title, emoji, players, unit = '승' }: { title: string; emoji: string; players: PlayerRank[]; unit?: string; }) {
  if (!Array.isArray(players) || players.length === 0) {
    return (
      <div className="bg-gray-800 p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2 text-center">{emoji} {title}</h2>
        <p className="text-gray-400 text-center">데이터 없음</p>
      </div>
    );
  }
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h2 className="text-lg font-bold mb-2 text-center">{emoji} {title}</h2>
      <ol className="list-decimal list-inside">
        {players.map((player, index) => (
          <li key={index} className="truncate">
            {player.닉네임} - {unit === '%' ? `${(player.value * 100).toFixed(1)}%` : `${player.value}${unit}`}
          </li>
        ))}
      </ol>
    </div>
  );
}

// 메인 페이지
export default function HomePage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatRow[]>([]);
  const [rankings, setRankings] = useState<Rankings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          const [statsRes, rankingsRes] = await Promise.all([
            fetch('/api/stats'),
            fetch('/api/rankings')
          ]);
          const statsData: StatRow[] = await statsRes.json();
          const rankingsData: Rankings = await rankingsRes.json();
          setStats(statsData);
          setRankings(rankingsData);
        } catch (error) {
          console.error("Failed to fetch data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-3xl mb-4">접근 권한이 없습니다.</h1>
        <p className="mb-8">로그인 후 이용해주세요.</p>
        <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p>데이터를 불러오는 중입니다...</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-6 text-center text-blue-400">
        🏆 내전 전적 통계 🏆
      </h1>

      {rankings && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
          <RankingCard title="꾸준왕" emoji="💪" players={rankings.꾸준왕} unit="경기" />
          <RankingCard title="다승" emoji="👑" players={rankings.다승} />
          <RankingCard title="승률" emoji="📈" players={rankings.승률} unit="%" />
          <RankingCard title="TOP" emoji="🛡️" players={rankings.TOP} />
          <RankingCard title="JG" emoji="🌳" players={rankings.JG} />
          <RankingCard title="MID" emoji="🔥" players={rankings.MID} />
          <RankingCard title="AD" emoji="🏹" players={rankings.AD} />
          <RankingCard title="SUP" emoji="❤️" players={rankings.SUP} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-gray-800 rounded-lg">
          <thead className="bg-gray-700">
            <tr>
              {stats.length > 0 && Object.keys(stats[0]).map((key) => (
                <th key={key} className="p-3 text-sm font-semibold text-left tracking-wide">{key}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600">
            {stats.map((player, index) => (
              <tr key={index} className="hover:bg-gray-700">
                {Object.values(player).map((value, i) => (
                  <td key={i} className="p-3 text-sm text-gray-300 whitespace-nowrap">
                    {i === 4 ? `${(Number(value) * 100).toFixed(1)}%` : String(value)}
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
