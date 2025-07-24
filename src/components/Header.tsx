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
    nickname: string;
}

export default function Header() {
    const { user } = useAuth();
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
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

    if (!user) {
        return null;
    }

    return (
        <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/50 shadow-lg">
            <div className="container mx-auto flex justify-between items-center p-4 text-gray-300">
                <nav className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 text-xl font-bold text-yellow-400 hover:text-yellow-300 transition-colors">
                        <Image src="/banana-logo.png" alt="바나나단 로고" width={24} height={24} />
                        <span>홈</span>
                    </Link>
                    <div className="w-px h-6 bg-gray-700"></div>
                    <Link href="/parties" className="text-lg font-medium hover:text-white transition-colors">파티</Link>
                    <Link href="/scrims" className="text-lg font-medium hover:text-white transition-colors">내전</Link>
                    <Link href="/notices" className="text-lg font-medium hover:text-white transition-colors">공지사항</Link>
                    <Link href="/matches" className="text-lg font-medium hover:text-white transition-colors">매치 기록</Link>
                </nav>

                <div className="flex items-center gap-4">
                    {(profile?.role === '총관리자' || profile?.role === '관리자') && (
                        <Link href="/admin/user-management" className="text-base font-semibold text-yellow-400 hover:text-yellow-300 transition-colors">
                            사용자 관리
                        </Link>
                    )}
                    <Link href="/profile" className="text-base font-medium hover:text-white transition-colors">{profile?.nickname || user.email?.split('@')[0]}</Link>
                    <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 border border-red-500/50 text-white font-semibold rounded-md text-sm transition-colors"
                    >
                        로그아웃
                    </button>
                </div>
            </div>
        </header>
    );
}
