// src/components/Header.tsx
'use client';

import { useAuth } from '@/components/AuthProvider';
import { auth } from '@/firebase';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // 1. useRouter 불러오기


export default function Header() {
    const { user } = useAuth();
    const router = useRouter(); // 2. router 객체 생성


    const handleLogout = async () => {
        try {
            await signOut(auth);
            // 로그아웃 후 별도의 페이지 이동이 필요하면 여기에 추가
            router.push('/login');
        } catch (error) {
            console.error('Logout Error:', error);
        }
    };

    // 로그인하지 않은 상태에서는 헤더를 보여주지 않음
    if (!user) {
        return null;
    }

    // 로그인한 상태에서 보여줄 헤더
    return (
        <header className="bg-gray-800 text-white p-4">
            <div className="container mx-auto flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-lg font-bold hover:text-blue-400">홈</Link>
                    <Link href="/parties" className="text-lg font-bold hover:text-blue-400">파티찾기</Link>
                </div>
                <div className="flex items-center gap-4">
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