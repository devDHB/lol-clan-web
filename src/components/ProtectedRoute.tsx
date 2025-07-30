'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const router = useRouter();
    const [isVerified, setIsVerified] = useState(false);

    useEffect(() => {
        // Firebase의 인증 상태가 변경될 때마다 확인합니다.
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                // 사용자가 없으면 로그인 페이지로 리디렉션합니다.
                router.push('/login');
            } else {
                // 사용자가 있으면 페이지를 보여줄 수 있도록 상태를 변경합니다.
                setIsVerified(true);
            }
        });

        // 컴포넌트가 언마운트될 때 리스너를 정리합니다.
        return () => unsubscribe();
    }, [router]);

    // 인증 확인이 완료된 사용자에게만 페이지 내용을 보여줍니다.
    if (isVerified) {
        return <>{children}</>;
    }

    // 인증을 확인하는 동안 로딩 화면을 보여줍니다.
    return (
        <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">
            인증 정보를 확인하는 중...
        </main>
    );
}
