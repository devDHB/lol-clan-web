'use client';

import { useAuth } from '@/components/AuthProvider';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// 랭킹 카드를 만드는 컴포넌트
function RankingCard({ title, emoji, players, unit = '승' }: any) {
  // players가 배열이 아니거나 비어있으면 렌더링하지 않음
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
        {players.map((player: any, index: number) => (
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
  const [stats, setStats] = useState([]);
  const [rankings, setRankings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 사용자가 로그인한 경우에만 데이터를 가져옵니다.
    if (user) {
      const fetchData = async () => {
        try {
          // stats와 rankings API를 동시에 호출
          const [statsRes, rankingsRes] = await Promise.all([
            fetch('/api/stats'),
            fetch('/api/rankings')
          ]);
          const statsData = await statsRes.json();
          const rankingsData = await rankingsRes.json();
          setStats(statsData);
          setRankings(rankingsData);
        } catch (error) {
          console.error("Failed to fetch data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [user]); // user 상태가 변경될 때마다 실행

  const handleLogout = async () => {
    await signOut(auth);
    // 로그아웃 후 로그인 페이지로 이동하거나, 현재 페이지에 머물러도 AuthProvider가 상태를 업데이트합니다.
  };

  // 1. 로그인하지 않은 경우
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

  // 2. 로그인했지만 데이터를 로딩 중인 경우
  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p>데이터를 불러오는 중입니다...</p>
      </main>
    )
  }

  // 3. 로그인도 했고 데이터 로딩도 완료된 경우
  return (
    <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          환영합니다, {user.email}님!
        </h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md">
          로그아웃
        </button>
      </div>

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
            {stats.map((player: any, index: number) => (
              <tr key={index} className="hover:bg-gray-700">
                {Object.values(player).map((value: any, i) => (
                  <td key={i} className="p-3 text-sm text-gray-300 whitespace-nowrap">
                    {i === 4 ? `${(Number(value) * 100).toFixed(1)}%` : value}
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