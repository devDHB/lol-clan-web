'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface UserProfile {
  email: string;
  nickname: string;
  role: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchProfile = useCallback(async () => {
    if (user) {
      try {
        const res = await fetch(`/api/users/${user.email}`);
        if (!res.ok) throw new Error('프로필 정보를 불러오지 못했습니다.');
        const data: UserProfile = await res.json();
        setProfile(data);
        setNickname(data.nickname);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nickname.trim()) return;

    try {
      const res = await fetch(`/api/users/${user.email}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업데이트 실패');
      setMessage(data.message);
      // 잠시 후 메시지 숨기기
      setTimeout(() => setMessage(''), 3000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setMessage(error.message);
      }
    }
  };

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="mb-4">프로필을 보려면 로그인이 필요합니다.</p>
        <Link href="/login" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  if (loading) {
    return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
  }

  return (
    <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-6 text-blue-400">내 프로필</h1>
      <div className="max-w-md mx-auto bg-gray-800 p-8 rounded-lg">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400">이메일</label>
            <p className="mt-1 text-lg">{profile?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400">역할</label>
            <p className="mt-1 text-lg">{profile?.role}</p>
          </div>
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-400">닉네임</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            닉네임 저장
          </button>
          {message && <p className="text-center text-green-400">{message}</p>}
        </form>
      </div>
    </main>
  );
}
