'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface NoticeDetail {
  noticeId: string;
  title: string;
  content: string;
  imageUrl?: string;
  authorNickname: string;
  createdAt: string;
}

export default function NoticeDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const noticeId = params.noticeId as string;

  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (noticeId) {
      const fetchNotice = async () => {
        try {
          const res = await fetch(`/api/notices/${noticeId}`);
          if (!res.ok) throw new Error('Failed to fetch notice');
          const data = await res.json();
          setNotice(data);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      };
      fetchNotice();
    }
  }, [noticeId]);

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="mb-4">이 페이지를 보려면 로그인이 필요합니다.</p>
        <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
  }

  if (!notice) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">공지사항을 찾을 수 없습니다.</main>;
  }

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/notices" className="text-blue-400 hover:underline">← 목록으로 돌아가기</Link>
        </div>

        <article className="bg-gray-800 rounded-lg shadow-lg p-8">
          <header className="border-b border-gray-700 pb-4 mb-6">
            <h1 className="text-4xl font-bold text-white">{notice.title}</h1>
            <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
              <span>작성자: {notice.authorNickname}</span>
              <span>{new Date(notice.createdAt).toLocaleString('ko-KR')}</span>
            </div>
          </header>

          {notice.imageUrl && (
            <div className="my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={notice.imageUrl} alt={notice.title} className="max-w-full h-auto rounded-md mx-auto" />
            </div>
          )}

          <div className="prose prose-invert max-w-none whitespace-pre-wrap">
            {notice.content}
          </div>
        </article>
      </div>
    </main>
  );
}
