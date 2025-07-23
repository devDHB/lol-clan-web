'use client';

import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Image from 'next/image'; // 1. Image 컴포넌트 불러오기

// 타입 정의
interface Notice {
  noticeId: string;
  title: string;
  content: string;
  authorNickname: string;
  imageUrls?: string[];
}
interface Party {
  partyId: string;
  partyName: string;
  partyType: string;
  membersData: string | Member[];
  maxMembers: string;
  requiredTier?: string; // 파티에 필요한 최소 티어
  startTime?: string | null; // 파티 시작 시간 (텍스트)
}
interface Scrim {
  scrimId: string;
  scrimName: string;
  status: string;
  applicants: string;
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

const formatTime = (isoString: string) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) { return ''; }
}

const partyTypeColors: { [key: string]: string } = {
  '자유랭크': 'bg-blue-600 text-white',
  '듀오랭크': 'bg-purple-600 text-white',
  '기타': 'bg-teal-600 text-white',
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

  // 로그인하지 않은 사용자를 위한 화면
  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-3xl font-bold mb-4 flex items-center justify-center gap-2">
          <span>바나나단</span>
          {/* public 폴더의 이미지를 사용합니다. 파일 이름은 실제 파일에 맞게 수정해주세요. */}
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
      {/* 2. 제목을 이미지와 텍스트로 변경 */}
      <h1 className="text-4xl font-bold mb-8 text-center text-yellow-400 flex items-center justify-center gap-3">
        <span>바나나단</span>
        {/* public 폴더의 이미지를 사용합니다. 파일 이름은 실제 파일에 맞게 수정해주세요. */}
        <Image src="/banana-logo.png" alt="바나나단 로고" width={40} height={40} />
      </h1>

      <div className="space-y-8">
        {/* 1행: 공지사항 섹션 */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">📢 공지사항</h2>
          <ul className="space-y-4">
            {notices.length > 0 ? notices.map(notice => (
              <li key={notice.noticeId} className="border-b border-gray-700/50 pb-4 last:border-b-0">
                <Link href={`/notices/${notice.noticeId}`} className="block group">
                  <div className="flex gap-4 items-start">
                    {notice.imageUrls && notice.imageUrls.length > 0 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={notice.imageUrls[0]} alt={notice.title} className="w-24 h-24 object-cover rounded-md flex-shrink-0" />
                    )}
                    <div className="flex-grow">
                      <h3 className="text-lg font-semibold text-yellow-400 mb-1 group-hover:text-yellow-300 transition-colors">{notice.title}</h3>
                      <p className="text-gray-300 text-sm mb-2 line-clamp-2">{notice.content}</p>
                      <div className="text-right text-xs text-gray-500">
                        <span>작성자: {notice.authorNickname}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            )) : <p className="text-gray-400">새로운 공지사항이 없습니다.</p>}
          </ul>
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
                const leaderEmail = members.length > 0 ? members[0].email : '';
                const leaderNickname = userMap[leaderEmail] || leaderEmail.split('@')[0];
                const typeStyle = partyTypeColors[party.partyType] || 'bg-gray-600 text-white';

                // 파티 정보 문자열 조합
                const displayTier = party.requiredTier && party.requiredTier.trim() !== '' ? party.requiredTier.trim() : '티어 제한 없음';
                const displayTime = party.startTime && party.startTime.trim() !== '' ? party.startTime.trim() : '즉시 시작';

                let partyInfoString = party.partyName;
                if (party.partyType === '자유랭크' || party.partyType === '듀오랭크') {
                    partyInfoString += ` / ${displayTier}`;
                }
                partyInfoString += ` / ${displayTime} - ${leaderNickname}`;


                return (
                  <li key={party.partyId} className="truncate hover:text-blue-400 transition-colors">
                    <Link href="/parties" className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${typeStyle}`}>
                        {party.partyType.replace('랭크', '').replace('게임', '')}
                      </span>
                      {/* 변경된 파티 정보 표시 */}
                      <span>
                        {partyInfoString}
                      </span>
                    </Link>
                  </li>
                );
              }) : <p className="text-gray-400">진행중인 파티가 없습니다.</p>}
            </ul>
            <Link href="/parties" className="text-blue-400 hover:underline mt-4 inline-block text-sm">전체 파티 보기 →</Link>
          </section>

          {/* 내전 현황 섹션 */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2">⚔️ 내전 현황</h2>
            <ul className="space-y-3">
              {scrims.length > 0 ? scrims.map(scrim => {
                const time = formatTime(scrim.startTime);
                return (
                  <li key={scrim.scrimId} className="truncate hover:text-blue-400 transition-colors">
                    <Link href={`/scrims/${scrim.scrimId}`}>
                      {`[${time}] ${scrim.scrimName || '피어리스 내전'}`}
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
