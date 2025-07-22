'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface Notice {
  noticeId: string;
  title: string;
  authorEmail: string;
  createdAt: string;
}

interface UserProfile {
  role: string;
}

export default function NoticesPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          // 공지사항 목록과 사용자 프로필 정보를 동시에 가져옵니다.
          const [noticesRes, profileRes] = await Promise.all([
            fetch('/api/notices'),
            fetch(`/api/users/${user.email}`)
          ]);
          
          const noticesData = await noticesRes.json();
          const profileData = await profileRes.json();

          setNotices(noticesData);
          setProfile(profileData);

        } catch (error) {
          console.error('Failed to fetch data:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="mb-4">공지사항을 보려면 로그인이 필요합니다.</p>
        <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">공지사항을 불러오는 중...</main>;
  }

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-blue-400">공지사항</h1>
        {/* --- 수정된 부분: '총관리자' 또는 '관리자'일 때 버튼 표시 --- */}
        {(profile?.role === '총관리자' || profile?.role === '관리자') && (
          <Link href="/admin/write-notice" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md text-sm">
            글쓰기
          </Link>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg">
        <ul className="divide-y divide-gray-700">
          {notices.length > 0 ? (
            notices.map((notice) => (
              <li key={notice.noticeId} className="p-4 hover:bg-gray-700/50 transition-colors">
                <Link href={`/notices/${notice.noticeId}`} className="block">
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-semibold text-white truncate">{notice.title}</p>
                    <span className="text-sm text-gray-400 hidden md:block">
                      {new Date(notice.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">작성자: {notice.authorEmail}</p>
                </Link>
              </li>
            ))
          ) : (
            <li className="p-4 text-center text-gray-400">작성된 공지사항이 없습니다.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
