'use client';

import { useAuth } from '@/components/AuthProvider';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';

interface UserData {
    id: string;
    email: string;
    nickname: string;
    role: string;
}

interface UserProfile {
    role: string;
}

export default function UserManagementPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null);
    const [newNickname, setNewNickname] = useState('');

    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserNickname, setNewUserNickname] = useState('');
    const [newUserRole, setNewUserRole] = useState('일반');

    const fetchUsers = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/admin/users?requesterEmail=${user.email}`);
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
        } catch (error) {
            console.error(error);
        }
    }, [user]);

    useEffect(() => {
        const checkAdminAndFetch = async () => {
            if (user) {
                try {
                    const profileRes = await fetch(`/api/users/${user.email}`);
                    const profileData = await profileRes.json();
                    setProfile(profileData);
                    if (profileData.role === '총관리자' || profileData.role === '관리자') {
                        await fetchUsers();
                    } else {
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
        checkAdminAndFetch();
    }, [user, fetchUsers, router]);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newUserEmail, password: newUserPassword, nickname: newUserNickname, role: newUserRole, requesterEmail: user.email }),
            });
            if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
            alert('사용자가 추가되었습니다.');
            setNewUserEmail(''); setNewUserPassword(''); setNewUserNickname('');
            fetchUsers();
        } catch (error: any) {
            alert(`사용자 추가 실패: ${error.message}`);
        }
    };

    const handleUpdateRole = async (userId: string, newRole: string) => {
        if (!user) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newRole, requesterEmail: user.email })
            });
            if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
            fetchUsers();
        } catch (error: any) {
            alert(`역할 변경 실패: ${error.message}`);
            fetchUsers();
        }
    };

    const handleUpdateNickname = async (userId: string) => {
        if (!user || !newNickname.trim()) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newNickname, requesterEmail: user.email })
            });
            if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
            setEditingNicknameId(null);
            fetchUsers();
        } catch (error: any) { alert(`닉네임 변경 실패: ${error.message}`); }
    };

    const handleDeleteUser = async (userId: string, userEmail: string) => {
        if (!user || !confirm(`${userEmail} 사용자를 정말로 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, userEmail, requesterEmail: user.email })
            });
            if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
            fetchUsers();
        } catch (error: any) { alert(`사용자 삭제 실패: ${error.message}`); }
    };

    if (loading) {
        return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">권한 확인 중...</main>;
    }

    if (!user || (profile?.role !== '총관리자' && profile?.role !== '관리자')) {
        return (
            <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                <h1 className="text-3xl mb-4">접근 권한이 없습니다.</h1>
                <p className="mb-8">이 페이지는 관리자만 접근할 수 있습니다.</p>
                <Link href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md">홈으로</Link>
            </main>
        );
    }

    return (
        <ProtectedRoute>
            <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
                <h1 className="text-4xl font-bold mb-8 text-blue-400">사용자 관리</h1>

                <div className="bg-gray-800 p-6 rounded-lg mb-8">
                    <h2 className="text-2xl font-bold mb-4">신규 사용자 추가</h2>
                    <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="이메일" required className="bg-gray-700 p-2 rounded" />
                        <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="초기 비밀번호" required className="bg-gray-700 p-2 rounded" />
                        <input type="text" value={newUserNickname} onChange={e => setNewUserNickname(e.target.value)} placeholder="닉네임" required className="bg-gray-700 p-2 rounded" />
                        <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className="bg-gray-700 p-2 rounded">
                            <option value="일반">일반</option>
                            <option value="내전관리자">내전관리자</option>
                            {profile?.role === '총관리자' && <option value="관리자">관리자</option>}
                        </select>
                        <button type="submit" className="md:col-span-4 py-2 bg-green-600 hover:bg-green-700 rounded">사용자 추가</button>
                    </form>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full bg-gray-800 rounded-lg">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="p-3 text-left">이메일</th>
                                <th className="p-3 text-left">닉네임</th>
                                <th className="p-3 text-left">역할</th>
                                <th className="p-3 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {users.map(u => {
                                const canEditRole = profile?.role === '총관리자' || (profile?.role === '관리자' && u.role !== '총관리자' && u.role !== '관리자');
                                
                                return (
                                    <tr key={u.id}>
                                        <td className="p-3">{u.email}</td>
                                        <td className="p-3">
                                            {editingNicknameId === u.id ? (
                                                <div className="flex gap-2">
                                                    <input type="text" value={newNickname} onChange={e => setNewNickname(e.target.value)} className="bg-gray-700 p-1 rounded w-full" />
                                                    <button onClick={() => handleUpdateNickname(u.id)} className="bg-green-600 px-2 rounded">저장</button>
                                                    <button onClick={() => setEditingNicknameId(null)} className="bg-gray-600 px-2 rounded">취소</button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-between items-center">
                                                    <span>{u.nickname}</span>
                                                    {profile?.role === '총관리자' && (
                                                        <button onClick={() => { setEditingNicknameId(u.id); setNewNickname(u.nickname); }} className="text-xs ml-2 text-blue-400 hover:underline">변경</button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            {u.role === '총관리자' ? (
                                                <span className="px-2 py-1 bg-yellow-600 text-yellow-100 text-sm rounded">총관리자</span>
                                            ) : (
                                                <select
                                                    value={u.role}
                                                    onChange={e => handleUpdateRole(u.id, e.target.value)}
                                                    className="bg-gray-700 p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    disabled={!canEditRole}
                                                >
                                                    {/* ✅ [수정] 역할 옵션 표시 로직 개선 */}
                                                    {profile?.role === '총관리자' && <option value="관리자">관리자</option>}
                                                    {u.role === '관리자' && profile?.role === '관리자' && <option value="관리자">관리자</option>}
                                                    <option value="내전관리자">내전관리자</option>
                                                    <option value="일반">일반</option>
                                                </select>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            {profile?.role === '총관리자' && u.role !== '총관리자' && (
                                                <button onClick={() => handleDeleteUser(u.id, u.email)} className="text-red-500 hover:text-red-400">삭제</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </main>
        </ProtectedRoute>
    );
}
