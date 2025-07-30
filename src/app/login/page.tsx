'use client';

import { useState } from 'react';
import { auth } from '../../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push('/'); // 로그인 성공 후 메인 페이지로 이동
        } catch (firebaseError: unknown) {
            setError('이메일 또는 비밀번호가 잘못되었습니다.');
            console.error("Firebase auth error:", firebaseError);
        }
    };

    return (
        <main className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
                <div className="text-center">
                    <Image src="/banana-logo.png" alt="바나나단 로고" width={80} height={80} className="mx-auto mb-4" />
                    <h1 className="text-4xl font-bold text-yellow-400">바나나단</h1>
                    <p className="text-gray-300 mt-2">커뮤니티에 오신 것을 환영합니다!</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">이메일</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <button
                        type="submit"
                        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition duration-200"
                    >
                        로그인
                    </button>
                </form>
            </div>
        </main>
    );
}
