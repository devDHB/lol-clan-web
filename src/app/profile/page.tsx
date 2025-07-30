'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '@/firebase';
import ProtectedRoute from '@/components/ProtectedRoute';

interface UserProfile {
  email: string;
  nickname: string;
  role: string;
}

export default function MyProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 닉네임 관련 상태
  const [nickname, setNickname] = useState('');
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  // 비밀번호 관련 상태
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const fetchProfile = useCallback(async () => {
    // ProtectedRoute가 user를 보장하므로, user.email을 바로 사용
    if (user && user.email) {
      setLoading(true);
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

  const handleUpdateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nickname.trim()) return;
    setNicknameMessage('');
    setNicknameError('');

    try {
      const res = await fetch(`/api/users/${user.email}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업데이트 실패');
      setNicknameMessage(data.message);
      setTimeout(() => setNicknameMessage(''), 3000);
    } catch (error: unknown) {
      if (error instanceof Error) setNicknameError(error.message);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (!user || !user.email) return setPasswordError('로그인 상태가 아닙니다.');
    if (newPassword !== confirmPassword) return setPasswordError('새 비밀번호가 일치하지 않습니다.');
    if (newPassword.length < 6) return setPasswordError('비밀번호는 6자 이상이어야 합니다.');

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setPasswordMessage('비밀번호가 성공적으로 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setPasswordError('현재 비밀번호가 잘못되었거나 오류가 발생했습니다.');
    }
  };

  return (
    <ProtectedRoute>
      {loading ? (
        <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>
      ) : (
        <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
          <h1 className="text-4xl font-bold mb-6 text-blue-400">내 정보 수정</h1>
          <div className="max-w-md mx-auto bg-gray-800 p-8 rounded-lg divide-y divide-gray-700">
            {/* 닉네임 변경 폼 */}
            <form onSubmit={handleUpdateNickname} className="space-y-4 pb-8">
              <h2 className="text-2xl font-semibold text-white">프로필 정보</h2>
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
                  className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md">닉네임 저장</button>
              {nicknameMessage && <p className="text-center text-sm text-green-400">{nicknameMessage}</p>}
              {nicknameError && <p className="text-center text-sm text-red-500">{nicknameError}</p>}
            </form>

            {/* 비밀번호 변경 폼 */}
            <form onSubmit={handlePasswordChange} className="space-y-4 pt-8">
              <h2 className="text-2xl font-semibold text-white">비밀번호 변경</h2>
              <div>
                <label htmlFor="current-password" className="block text-sm font-medium text-gray-400">현재 비밀번호</label>
                <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md" />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-400">새 비밀번호</label>
                <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md" />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-400">새 비밀번호 확인</label>
                <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md" />
              </div>
              <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md">비밀번호 변경</button>
              {passwordMessage && <p className="text-center text-sm text-green-400">{passwordMessage}</p>}
              {passwordError && <p className="text-center text-sm text-red-500">{passwordError}</p>}
            </form>
          </div>
        </main>
      )}
    </ProtectedRoute>
  );
}
