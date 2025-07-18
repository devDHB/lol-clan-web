// src/components/AuthProvider.tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';

// 인증 context 생성
const AuthContext = createContext<{ user: User | null }>({ user: null });

// 다른 컴포넌트에서 user 정보를 쉽게 가져올 수 있는 hook
export const useAuth = () => useContext(AuthContext);

// 앱 전체를 감싸서 로그인 상태를 제공하는 Provider 컴포넌트
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        // Firebase의 로그인 상태 변경을 감지하는 리스너
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
        });

        // 컴포넌트가 언마운트될 때 리스너 정리
        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user }}>
            {children}
        </AuthContext.Provider>
    );
}