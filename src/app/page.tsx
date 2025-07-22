'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// 타입 정의 업데이트
interface Notice {
  noticeId: string;
  title: string;
  content: string;
  authorNickname: string;
}
interface Party {
  partyId: string;
  partyName: string;
  partyType: string;
  membersData: string | Member[];
  maxMembers: string;
}
interface Scrim {
  scrimId: string;
  scrimName: string; // 내전 이름 추가 (API에서 제공해야 함)
  status: string;
  applicants: string;
  startTime: string; // 시작 시간
}
interface Member {
  email: string;
  positions: string[];
}

// 안전한 데이터 파싱을 위한 헬퍼 함수
const safeParseClient = (data: unknown): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

// 시간 포맷팅 헬퍼 함수 (예: "22:00")
const formatTime = (isoString: string) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
        return '';
    }
}

export default function HomePage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [scrims, setScrims] = useState<Scrim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const [noticesRes, partiesRes, scrimsRes] = await Promise.all([
            fetch('/api/notices', { cache: 'no-store' }).catch(() => null),
            fetch('/api/parties', { cache: 'no-store' }).catch(() => null),
            fetch('/api/scrims', { cache: 'no-store' }).catch(() => null),
          ]);

          if (noticesRes && noticesRes.ok) {
            const noticesData = await noticesRes.json();
            setNotices(noticesData.slice(0, 1)); // 최신 공지 1개만 표시
          }
          if (partiesRes && partiesRes.ok) {
            const partiesData = await partiesRes.json();
            setParties(partiesData.slice(0, 5)); // 최신 파티 5개 표시
          }
          if (scrimsRes && scrimsRes.ok) {
            const scrimsData = await scrimsRes.json();
            setScrims(scrimsData.slice(0, 5)); // 최신 내전 5개 표시
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

  // 로그인하지 않은 사용자를 위한 화면
  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-3xl font-bold mb-4">바나나단!</h1>
        <p className="mb-8">로그인 후 모든 기능을 이용할 수 있습니다.</p>
        <Link href="/login" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md">
          로그인
        </Link>
      </main>
    );
  }

  // 로딩 중 화면
  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">대시보드 데이터를 불러오는 중...</main>;
  }

  // 로그인한 사용자를 위한 대시보드
  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-8 text-center text-blue-400">
      바나나단 🍌 
      </h1>

      <div className="space-y-8">
        {/* 1행: 공지사항 섹션 */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">📢 공지사항</h2>
          {notices.length > 0 ? notices.map(notice => (
            <div key={notice.noticeId}>
              <h3 className="text-xl font-semibold text-yellow-400 mb-2">{notice.title}</h3>
              <p className="text-gray-300 mb-3 whitespace-pre-wrap truncate h-24">{notice.content}</p>
              <div className="text-right text-sm text-gray-500">
                <span>작성자 : {notice.authorNickname}</span>
              </div>
            </div>
          )) : <p className="text-gray-400">새로운 공지사항이 없습니다.</p>}
          <Link href="/notices" className="text-blue-400 hover:underline mt-4 inline-block text-sm">전체 공지 보기 →</Link>
        </section>

        {/* 2행: 파티 및 내전 현황 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 파티 현황 섹션 */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">🔥 파티 현황</h2>
            <ul className="space-y-3">
               {parties.length > 0 ? parties.map(party => {
                   const members = safeParseClient(party.membersData);
                   return (
                      <li key={party.partyId} className="truncate hover:text-blue-400 transition-colors">
                          <Link href="/parties">
                              {`[${party.partyType}] ${party.partyName} (${members.length}/${party.maxMembers})`}
                          </Link>
                      </li>
                   )
               }) : <p className="text-gray-400">진행중인 파티가 없습니다.</p>}
            </ul>
             <Link href="/parties" className="text-blue-400 hover:underline mt-4 inline-block text-sm">전체 파티 보기 →</Link>
          </section>

          {/* 내전 현황 섹션 */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">⚔️ 내전 현황</h2>
             <ul className="space-y-3">
               {scrims.length > 0 ? scrims.map(scrim => {
                   const applicants = safeParseClient(scrim.applicants);
                   const time = formatTime(scrim.startTime);
                   return (
                      <li key={scrim.scrimId} className="truncate hover:text-blue-400 transition-colors">
                          <Link href={`/scrims/${scrim.scrimId}`}>
                              {`[${time}] ${scrim.scrimName || '내전'} - ${scrim.status} (${applicants.length}/10)`}
                          </Link>
                      </li>
                   )
               }) : <p className="text-gray-400">진행중인 내전이 없습니다.</p>}
            </ul>
             <Link href="/scrims" className="text-blue-400 hover:underline mt-4 inline-block text-sm">전체 내전 보기 →</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
