'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// 타입 정의
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
  membersData: string | Member[];
  maxMembers: string;
  createdAt: string;
  requiredTier?: string;
  startTime?: string | null;
}
interface Scrim {
  scrimId: string;
  scrimName: string;
  creatorEmail: string;
  status: string;
  applicants: Member[];
  startTime: string;
}
interface Member {
  email: string;
  positions: string[];
}
interface UserMap {
  [email: string]: string;
}

// 헬퍼 함수
const safeParseClient = (data: unknown): Member[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  return [];
};

const partyTypeColors: { [key: string]: string } = {
  '자유랭크': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  '듀오랭크': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  '기타': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

export default function HomePage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [scrims, setScrims] = useState<Scrim[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [noticesRes, partiesRes, scrimsRes, usersRes] = await Promise.all([
            fetch('/api/notices', { cache: 'no-store' }).catch(() => null),
            fetch('/api/parties', { cache: 'no-store' }).catch(() => null),
            fetch('/api/scrims', { cache: 'no-store' }).catch(() => null),
            fetch('/api/users', { cache: 'no-store' }).catch(() => null),
          ]);

          if (noticesRes && noticesRes.ok) {
            const noticesData = await noticesRes.json();
            setNotices(noticesData.slice(0, 2));
          }
          if (partiesRes && partiesRes.ok) {
            const partiesData = await partiesRes.json();
            setParties(partiesData.slice(0, 10));
          }
          if (scrimsRes && scrimsRes.ok) {
            const scrimsData = await scrimsRes.json();
            setScrims(scrimsData.slice(0, 10));
          }
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
      };
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-3xl font-bold mb-4 flex items-center justify-center gap-2">
          <span>바나나단</span>
          <Image src="/banana-logo.png" alt="바나나단 로고" width={32} height={32} />
        </h1>
        <p className="mb-8">로그인 후 모든 기능을 이용할 수 있습니다.</p>
        <Link href="/login" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
          로그인
        </Link>
      </main>
    );
  }

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">대시보드 데이터를 불러오는 중...</main>;
  }

  return (
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
                    <p className="text-gray-300 text-base mb-2 line-clamp-2 h-12">{notice.content}</p>
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
                const members = safeParseClient(party.membersData);
                const leaderEmail = members.length > 0 ? members[0].email : '';
                const leaderNickname = userMap[leaderEmail] || leaderEmail.split('@')[0];
                const typeStyle = partyTypeColors[party.partyType] || 'bg-gray-600';
                return (
                  <li key={party.partyId} className="p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                    <Link href="/parties" className="block space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-lg text-white truncate pr-2">{party.partyName}</h4>
                        <span className={`flex-shrink-0 px-2 py-0.5 text-sm font-semibold rounded-full border ${typeStyle}`}>
                          {party.partyType}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-gray-400">
                        <span>👑 {leaderNickname}</span>
                        <span>{`${members.length}/${party.maxMembers}`} | ⏰ {party.startTime || '즉시 시작'}</span>
                      </div>
                      {(party.partyType === '자유랭크' || party.partyType === '듀오랭크') && party.requiredTier && (
                        <div className="text-sm text-orange-400">티어: {party.requiredTier}</div>
                      )}
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
                const applicants = safeParseClient(scrim.applicants);
                return (
                  <li key={scrim.scrimId} className="p-3 bg-gray-700/50 rounded-md hover:bg-gray-700 transition-colors">
                    <Link href={`/scrims/${scrim.scrimId}`} className="block space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-lg text-white truncate pr-2">{scrim.scrimName || '이름 없는 내전'}</h4>
                        <span className="flex-shrink-0 px-2 py-0.5 text-sm font-semibold rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                          {scrim.status}
                        </span>
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
  );
}
