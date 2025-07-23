'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from '@/firebase';

interface UserProfile {
  role: string;
}

export default function WriteNoticePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const res = await fetch(`/api/users/${user.email}`);
          const data: UserProfile = await res.json();
          setProfile(data);
          if (data.role !== '총관리자' && data.role !== '관리자') {
            alert('권한이 없습니다.');
            router.push('/');
          }
        } catch (error) {
          console.error(error);
          router.push('/');
        } finally {
          setLoading(false);
        }
      } else if (user === null) {
        router.push('/login');
      }
    };
    checkAdmin();
  }, [user, router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (files.length > 10) {
        alert('이미지는 최대 10개까지 첨부할 수 있습니다.');
        e.target.value = ''; // 파일 선택 초기화
        return;
      }
      setImageFiles(files);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !user) return;
    setIsSubmitting(true);

    try {
      const storage = getStorage(app);
      // 1. 여러 이미지를 Firebase Storage에 업로드하고 URL 배열을 받음
      const imageUrls = await Promise.all(
        imageFiles.map(async (file) => {
          const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          return await getDownloadURL(snapshot.ref);
        })
      );

      // 2. API에 데이터 전송
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          authorEmail: user.email,
          imageUrls, // 단일 URL -> URL 배열
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '공지 작성 실패');
      }

      alert('공지사항이 성공적으로 작성되었습니다.');
      router.push('/notices'); // 성공 후 공지사항 목록으로 이동

    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !profile || (profile.role !== '총관리자' && profile.role !== '관리자')) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">권한을 확인 중입니다...</main>;
  }

  return (
    <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-6 text-blue-400">공지사항 작성</h1>
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-lg space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-300">제목</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm"
          />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-300">내용</label>
          <textarea
            id="content"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm"
          />
        </div>
        <div>
          <label htmlFor="image" className="block text-sm font-medium text-gray-300">이미지 첨부 (최대 10개)</label>
          <input
            id="image"
            type="file"
            accept="image/*"
            multiple // multiple 속성 추가
            onChange={handleImageChange}
            className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-500"
        >
          {isSubmitting ? '작성 중...' : '공지사항 작성 완료'}
        </button>
      </form>
    </main>
  );
}
