'use client'; // 이 페이지는 사용자 상호작용이 필요하므로 클라이언트 컴포넌트로 지정합니다.

import { useState } from 'react';
import { auth } from '../../firebase'; // 5단계에서 만든 firebase 설정 파일을 가져옵니다.
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault(); // 폼 제출 시 페이지가 새로고침되는 것을 방지
        setError('');

        try {
            // Firebase에 이메일과 비밀번호를 보내 로그인을 시도합니다.
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            alert(`로그인 성공! ${userCredential.user.email}`);
            // 여기에 로그인 성공 후 메인 페이지로 이동하는 코드를 추가할 수 있습니다.
            window.location.href = '/';
        } catch (firebaseError: any) {
            // 로그인 실패 시 에러 메시지를 표시합니다.
            setError('이메일 또는 비밀번호가 잘못되었습니다.');
            console.error("Firebase aath error:", firebaseError);
        }
    };

    return (
        <main className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-lg shadow-lg">
                <h1 className="text-3xl font-bold text-center text-white">로그인</h1>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">이메일</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-300 block mb-2">비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                    <button
                        type="submit"
                        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition duration-200"
                    >
                        로그인
                    </button>
                </form>
            </div>
        </main>
    );
}