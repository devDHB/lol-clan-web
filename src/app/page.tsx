'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute'; // ✅ 1. ProtectedRoute 컴포넌트를 import 합니다.

// --- 타입 정의 ---
interface Notice {
  noticeId: string;
  title: string;
  content: string;
  authorNickname: string;
  imageUrls?: string[];
  createdAt: string;
}
interface Party {
  partyId: string;
  partyName: string;
  partyType: string;
  membersData: Member[];
  maxMembers: number;
  createdAt: string;
  requiredTier?: string;
  startTime?: string | null;
  playStyle?: '즐겜' | '빡겜';
}
interface Scrim {
  scrimId: string;
  scrimName: string;
  creatorEmail: string;
  status: string;
  applicants: Member[];
  startTime: string;
  scrimType: string;
}
interface Member {
  email: string;
  positions: string[];
}
interface UserMap {
  [email: string]: string;
}

// --- 헬퍼 함수 및 스타일 ---
const partyTypeStyles: { [key: string]: { bg: string; text: string; border: string; } } = {
  '자유랭크': { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30' },
  '솔로/듀오랭크': { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
  '기타': { bg: 'bg-teal-500/20', text: 'text-teal-300', border: 'border-teal-500/30' },
};

const scrimTypeStyles: { [key: string]: string } = {
  '일반': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '피어리스': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  '칼바람': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

const playStyleStyles: { [key: string]: { bg: string; text: string; border: string; } } = {
  '즐겜': { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
  '빡겜': { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
};

const requiredTierStyles = {
  bg: 'bg-orange-500/20',
  text: 'text-orange-300',
  border: 'border-orange-500/30',
};

const stripImageMarkdown = (content: string) => {
  return content
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
};

export default function HomePage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [scrims, setScrims] = useState<Scrim[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [noticesRes, partiesRes, scrimsRes, usersRes] = await Promise.all([
        fetch('/api/notices', { cache: 'no-store' }).catch(() => null),
        fetch('/api/parties', { cache: 'no-store' }).catch(() => null),
        fetch('/api/scrims', { cache: 'no-store' }).catch(() => null),
        fetch('/api/users', { cache: 'no-store' }).catch(() => null),
      ]);

      if (noticesRes && noticesRes.ok) setNotices((await noticesRes.json()).slice(0, 2));
      if (partiesRes && partiesRes.ok) setParties((await partiesRes.json()).slice(0, 10));
      if (scrimsRes && scrimsRes.ok) setScrims((await scrimsRes.json()).slice(0, 10));

      if (usersRes && usersRes.ok) {
        const usersData: { email: string; nickname: string }[] = await usersRes.json();
        const map: UserMap = {};
        usersData.forEach(u => { map[u.email] = u.nickname; });
        setUserMap(map);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ProtectedRoute>
      {loading ? (
        <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">대시보드 데이터를 불러오는 중...</main>
      ) : (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
          <h1 className="text-4xl font-bold mb-8 text-center text-yellow-400 flex items-center justify-center gap-3">
            <span>바나나단</span>
            <Image src="/banana-logo.png" alt="바나나단 로고" width={40} height={40} />
          </h1>

          <div className="space-y-8">
            <section className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">📢 공지사항</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {notices.length > 0 ? notices.map(notice => (
                  <Link key={notice.noticeId} href={`/notices/${notice.noticeId}`} className="block group bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors">
                    <div className="flex gap-4 items-start">
                      {notice.imageUrls && notice.imageUrls.length > 0 && (
                        <div className="w-24 h-24 relative flex-shrink-0">
                          <Image src={notice.imageUrls[0]} alt={notice.title} layout="fill" objectFit="cover" className="rounded-md" />
                        </div>
                      )}
                      <div className="flex-grow min-w-0">
                        <h3 className="text-xl font-semibold text-yellow-400 mb-1 truncate group-hover:text-yellow-300">{notice.title}</h3>
                        <p className="text-gray-300 text-base mb-2 line-clamp-2 h-12 whitespace-pre-wrap">{stripImageMarkdown(notice.content)}</p>
                        <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                          <span>{notice.authorNickname}</span>
                          <span>{new Date(notice.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )) : <p className="text-gray-400 md:col-span-2 text-center py-8">새로운 공지사항이 없습니다.</p>}
              </div>
              <Link href="/notices" className="text-blue-400 hover:underline mt-6 inline-block text-base">전체 공지 보기 →</Link>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">🔥 파티 현황</h2>
                <ul className="space-y-3">
                  {parties.length > 0 ? parties.map(party => {
                    const members = party.membersData as Member[];
                    const leaderEmail = members.length > 0 ? members[0].email : '';
                    const leaderNickname = userMap[leaderEmail] || leaderEmail.split('@')[0];
                    const typeStyle = partyTypeStyles[party.partyType] || {};
                    return (
                      <li key={party.partyId} className="p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                        <Link href="/parties" className="block space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-lg text-white truncate pr-2">{party.partyName}</h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {party.requiredTier && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${requiredTierStyles.bg} ${requiredTierStyles.text} ${requiredTierStyles.border}`}>{party.requiredTier}</span>}
                              {party.playStyle && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${playStyleStyles[party.playStyle].bg} ${playStyleStyles[party.playStyle].text} ${playStyleStyles[party.playStyle].border}`}>{party.playStyle}</span>}
                              <span className={`px-2 py-0.5 text-sm font-semibold rounded-full border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                                {party.partyType}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-sm text-gray-400">
                            <span>👑 {leaderNickname}</span>
                            <span>{`${members.length}/${party.maxMembers}`} | ⏰ {party.startTime || '즉시 시작'}</span>
                          </div>
                        </Link>
                      </li>
                    )
                  }) : <p className="text-gray-400">진행중인 파티가 없습니다.</p>}
                </ul>
                <Link href="/parties" className="text-blue-400 hover:underline mt-4 inline-block text-base">전체 파티 보기 →</Link>
              </section>

              <section className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">⚔️ 내전 현황</h2>
                <ul className="space-y-3">
                  {scrims.length > 0 ? scrims.map(scrim => {
                    const creatorNickname = userMap[scrim.creatorEmail] || scrim.creatorEmail.split('@')[0];
                    const applicants = scrim.applicants as Member[];
                    const scrimStyle = scrimTypeStyles[scrim.scrimType] || 'bg-gray-600';
                    return (
                      <li key={scrim.scrimId} className="p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                        <Link href={`/scrims/${scrim.scrimId}`} className="block space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-lg text-white truncate pr-2">{scrim.scrimName || '이름 없는 내전'}</h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-0.5 text-sm font-semibold rounded-full border ${scrimStyle}`}>
                                {scrim.scrimType}
                              </span>
                              <span className="px-2 py-0.5 text-sm font-semibold rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                                {scrim.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-sm text-gray-400">
                            <span>👑 주최자: {creatorNickname}</span>
                            <span>{`${applicants.length}/10`}</span>
                          </div>
                        </Link>
                      </li>
                    )
                  }) : <p className="text-gray-400">진행중인 내전이 없습니다.</p>}
                </ul>
                <Link href="/scrims" className="text-blue-400 hover:underline mt-4 inline-block text-base">전체 내전 보기 →</Link>
              </section>
            </div>
          </div>
        </main>
      )}
    </ProtectedRoute>
  );
}
