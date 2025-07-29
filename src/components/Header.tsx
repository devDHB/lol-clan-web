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
    const [isMenuOpen, setIsMenuOpen] = useState(false); // ✅ 모바일 메뉴 상태 추가

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
                <Link href="/" className="flex items-center gap-2 text-xl font-bold text-yellow-400 hover:text-yellow-300 transition-colors">
                    <Image src="/banana-logo.png" alt="바나나단 로고" width={24} height={24} />
                    <span className="hidden sm:inline">홈</span>
                </Link>

                {/* --- 데스크탑 메뉴 --- */}
                <nav className="hidden md:flex items-center gap-4">
                    <div className="w-px h-6 bg-gray-700"></div>
                    {/* ✅ [수정] 공지사항 위치 이동 */}
                    <Link href="/notices" className="text-lg font-medium hover:text-white transition-colors">공지사항</Link>
                    <Link href="/parties" className="text-lg font-medium hover:text-white transition-colors">파티</Link>
                    <Link href="/scrims" className="text-lg font-medium hover:text-white transition-colors">내전</Link>
                    <Link href="/matches" className="text-lg font-medium hover:text-white transition-colors">매치 기록</Link>
                    <Link href={`/profile/${user.email}`} className="text-lg font-medium hover:text-white transition-colors">개인 전적</Link>
                    <Link href="/stats" className="text-lg font-medium hover:text-white transition-colors">전적 통계</Link>
                </nav>

                <div className="hidden md:flex items-center gap-4">
                    {(profile?.role === '총관리자' || profile?.role === '관리자') && (
                        <Link href="/admin/user-management" className="text-base font-semibold text-yellow-400 hover:text-yellow-300 transition-colors">사용자 관리</Link>
                    )}
                    <Link href="/profile" className="text-base font-medium hover:text-white transition-colors">내 정보</Link>
                    <div className="w-px h-6 bg-gray-700"></div>
                    <span className="text-base font-medium text-white">{profile?.nickname || user.email?.split('@')[0]}</span>
                    <button onClick={handleLogout} className="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 border border-red-500/50 text-white font-semibold rounded-md text-sm transition-colors">로그아웃</button>
                </div>

                {/* --- 모바일 메뉴 버튼 --- */}
                <div className="md:hidden">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 rounded-md hover:bg-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                        </svg>
                    </button>
                </div>
            </div>

            {/* --- 모바일 메뉴 패널 --- */}
            {isMenuOpen && (
                <div className="md:hidden bg-gray-800 border-t border-gray-700/50">
                    <nav className="container mx-auto flex flex-col items-center gap-4 p-4">
                        {/* ✅ [수정] 공지사항 위치 이동 */}
                        <Link href="/notices" className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>공지사항</Link>
                        <Link href="/parties" className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>파티</Link>
                        <Link href="/scrims" className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>내전</Link>
                        <Link href="/matches" className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>매치 기록</Link>
                        <Link href={`/profile/${user.email}`} className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>개인 전적</Link>
                        <Link href="/stats" className="text-lg font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>전적 통계</Link>
                        <div className="w-full border-b border-gray-700 my-2"></div>
                        <Link href="/profile" className="text-base font-medium hover:text-white transition-colors" onClick={() => setIsMenuOpen(false)}>내 정보</Link>
                        {(profile?.role === '총관리자' || profile?.role === '관리자') && (
                            <Link href="/admin/user-management" className="text-base font-semibold text-yellow-400 hover:text-yellow-300 transition-colors" onClick={() => setIsMenuOpen(false)}>사용자 관리</Link>
                        )}
                        <button onClick={handleLogout} className="w-full mt-2 py-2 bg-red-600/50 hover:bg-red-600 border border-red-500/50 text-white font-semibold rounded-md text-sm transition-colors">로그아웃</button>
                    </nav>
                </div>
            )}
        </header>
    );
}
