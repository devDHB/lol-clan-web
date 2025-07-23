'use client';

import { useAuth } from '@/components/AuthProvider';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';

// 사용자 프로필 타입을 정의합니다.
interface UserProfile {
    role: string;
}

export default function Header() {
    const { user } = useAuth();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        // 사용자가 로그인하면 프로필 정보를 가져옵니다.
        if (user) {
            const fetchProfile = async () => {
                try {
                    const res = await fetch(`/api/users/${user.email}`);
                    if (res.ok) {
                        const data: UserProfile = await res.json();
                        setProfile(data);
                    }
                } catch (error) {
                    console.error("Failed to fetch user profile in header:", error);
                }
            };
            fetchProfile();
        } else {
            // 로그아웃하면 프로필 정보를 비웁니다.
            setProfile(null);
        }
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (error) {
            console.error('Logout Error:', error);
        }
    };

    // 로그인하지 않은 상태에서는 헤더를 보여주지 않습니다.
    if (!user) {
        return null;
    }

    return (
        <header className="bg-gray-800 text-white p-4 sticky top-0 z-50">
            <div className="container mx-auto flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 text-lg font-bold hover:text-yellow-300">
                        <Image src="/banana-logo.png" alt="바나나단 로고" width={24} height={24} />
                        <span>홈</span>
                    </Link>
                    <Link href="/parties" className="text-lg font-bold hover:text-blue-400">파티</Link>
                    <Link href="/scrims" className="text-lg font-bold hover:text-blue-400">내전</Link>
                    <Link href="/notices" className="text-lg font-bold hover:text-blue-400">공지사항</Link>
                    <Link href="/profile" className="text-lg font-bold hover:text-blue-400">내 프로필</Link>
                </div>
                <div className="flex items-center gap-4">
                    {(profile?.role === '총관리자' || profile?.role === '관리자') && (
                        <Link href="/admin/user-management" className="text-lg font-bold text-yellow-400 hover:text-yellow-300">
                            사용자 관리
                        </Link>
                    )}
                    <span>{user.email}</span>
                    <button
                        onClick={handleLogout}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md text-sm"
                    >
                        로그아웃
                    </button>
                </div>
            </div>
        </header>
    );
}
