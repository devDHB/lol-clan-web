'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import Image from 'next/image';

// --- 타입 정의 ---
interface NoticeDetail {
  noticeId: string;
  title: string;
  content: string;
  imageUrls?: string[];
  authorEmail: string;
  authorNickname: string;
  createdAt: string;
}
interface UserProfile {
  role: string;
}

// 본문 내용 중 이미지 링크를 실제 이미지로 변환해주는 컴포넌트
const ContentRenderer = ({ content }: { content: string }) => {
  // 정규식을 사용하여 Markdown 이미지 구문( ![alt](src) )을 찾습니다.
  const parts = content.split(/(!\[.*?\]\(.*?\))/g);

  return (
    // ✅ [수정] text-lg 클래스를 추가하여 기본 폰트 크기를 키웁니다.
    <div className="prose prose-invert max-w-none whitespace-pre-wrap text-lg">
      {parts.map((part, index) => {
        const match = part.match(/!\[.*?\]\((.*?)\)/);
        if (match) {
          // 이미지 구문을 만나면, Next.js의 Image 컴포넌트로 변환합니다.
          return (
            <div key={index} className="relative my-4 aspect-video">
              <Image
                src={match[1]}
                alt="공지사항 이미지"
                layout="fill"
                objectFit="contain"
                className="rounded-lg"
              />
            </div>
          );
        }
        // 일반 텍스트는 그대로 표시합니다.
        return part;
      })}
    </div>
  );
};


export default function NoticeDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const noticeId = Array.isArray(params.noticeId) ? params.noticeId[0] : params.noticeId;

  const [notice, setNotice] = useState<NoticeDetail | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof noticeId === 'string' && user) {
      setLoading(true);
      const fetchData = async () => {
        try {
          const [noticeRes, profileRes] = await Promise.all([
            fetch(`/api/notices/${noticeId}`),
            fetch(`/api/users/${user.email}`)
          ]);

          if (!noticeRes.ok) throw new Error('공지사항을 불러오는 데 실패했습니다.');
          const noticeData = await noticeRes.json();
          setNotice(noticeData);

          if (profileRes.ok) {
            const profileData = await profileRes.json();
            setProfile(profileData);
          }
        } catch (error) {
          console.error(error);
          setNotice(null);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    } else if (user === null) {
      setLoading(false);
    }
  }, [noticeId, user]);

  const handleDelete = async () => {
    if (!user || !notice || !confirm('정말로 이 공지사항을 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/notices/${notice.noticeId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: user.email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '삭제 실패');
      }
      alert('공지사항이 삭제되었습니다.');
      router.push('/notices');
    } catch (error: any) {
      alert(error.message);
    }
  };

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
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p>공지사항을 찾을 수 없거나 불러오는 데 실패했습니다.</p>
        <Link href="/notices" className="text-blue-400 hover:underline mt-4">← 목록으로 돌아가기</Link>
      </main>
    );
  }

  const canModify = profile?.role === '총관리자' || (profile?.role === '관리자' && user.email === notice.authorEmail);

  return (
    <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <Link href="/notices" className="text-blue-400 hover:underline">← 목록으로 돌아가기</Link>
          {canModify && (
            <div className="flex gap-2">
              <button onClick={() => router.push(`/admin/edit-notice/${notice.noticeId}`)} className="text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-md">수정</button>
              <button onClick={handleDelete} className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md">삭제</button>
            </div>
          )}
        </div>

        <article className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="p-8">
            <header className="border-b border-gray-700 pb-4 mb-6">
              <h1 className="text-4xl font-bold text-white">{notice.title}</h1>
              <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                <span>작성자: {notice.authorNickname}</span>
                <span>{new Date(notice.createdAt).toLocaleString('ko-KR')}</span>
              </div>
            </header>

            <ContentRenderer content={notice.content} />

          </div>
        </article>
      </div>
    </main>
  );
}
