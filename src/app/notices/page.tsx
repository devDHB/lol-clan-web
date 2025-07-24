'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// 타입 정의
interface Notice {
  noticeId: string;
  title: string;
  content: string;
  authorEmail: string;
  authorNickname: string;
  createdAt: string;
  imageUrls?: string[];
}

interface UserProfile {
  role: string;
}

export default function NoticesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (user) {
      try {
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

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleDelete = async (noticeId: string) => {
    if (!user || !confirm('정말로 이 공지사항을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/notices/${noticeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: user.email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제 실패');
      }
      alert('공지사항이 삭제되었습니다.');
      fetchData();
    } catch (error: any) {
      alert(error.message);
    }
  };

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
        {(profile?.role === '총관리자' || profile?.role === '관리자') && (
          <Link href="/admin/write-notice" className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md text-sm">
            글쓰기
          </Link>
        )}
      </div>

      <div className="space-y-8">
        {notices.length > 0 ? (
          notices.map((notice) => {
            const canModify = profile?.role === '총관리자' || (profile?.role === '관리자' && user.email === notice.authorEmail);
            return (
              <div key={notice.noticeId} className="group/item relative bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all duration-300 flex flex-col md:flex-row md:h-64">
                {notice.imageUrls && notice.imageUrls.length > 0 && (
                  <Link href={`/notices/${notice.noticeId}`} className="block md:w-2/5 flex-shrink-0">
                    <div className="w-full h-64 md:h-full relative">
                      <Image src={notice.imageUrls[0]} alt={notice.title} layout="fill" objectFit="cover" className="group-hover/item:scale-105 transition-transform duration-300" />
                    </div>
                  </Link>
                )}
                <div className="p-6 flex flex-col flex-grow">
                  <Link href={`/notices/${notice.noticeId}`} className="block flex-grow">
                    <h2 className="text-2xl font-semibold text-white group-hover/item:text-yellow-400 transition-colors">{notice.title}</h2>
                    <p className="text-sm text-gray-400 mt-2 line-clamp-4">{notice.content}</p>
                  </Link>
                  <div className="flex justify-between items-center mt-auto text-xs text-gray-500 pt-4 border-t border-gray-700">
                    <span>{notice.authorNickname}</span>
                    <span>{new Date(notice.createdAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                </div>
                {canModify && (
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <button onClick={() => router.push(`/admin/edit-notice/${notice.noticeId}`)} className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md">수정</button>
                    <button onClick={() => handleDelete(notice.noticeId)} className="text-xs bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md">삭제</button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-6 text-center text-gray-400 bg-gray-800 rounded-lg">
            <p>작성된 공지사항이 없습니다.</p>
          </div>
        )}
      </div>
    </main>
  );
}
