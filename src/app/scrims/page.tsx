'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// 타입 정의
interface Scrim {
    scrimId: string;
    scrimName: string;
    creatorEmail: string;
    status: string;
    createdAt: string;
    applicants: unknown[];
}

interface UserProfile {
    role: string;
    totalScrimsPlayed?: number;
}

interface UserMap {
    [email: string]: string;
}

// 상태별 색상을 정의하는 객체
const statusColors: { [key: string]: string } = {
    '모집중': 'bg-green-500/20 text-green-300 border-green-500/30',
    '팀 구성중': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    '경기중': 'bg-red-500/20 text-red-300 border-red-500/30',
    '종료': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function ScrimsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [scrims, setScrims] = useState<Scrim[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [userMap, setUserMap] = useState<UserMap>({});
    const [loading, setLoading] = useState(true);
    const [scrimName, setScrimName] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const fetchPromises = [
                fetch('/api/scrims', { cache: 'no-store' }),
                fetch('/api/users', { cache: 'no-store' })
            ];
            if (user) {
                fetchPromises.push(fetch(`/api/users/${user.email}`, { cache: 'no-store' }));
            }
            const [scrimsRes, usersRes, profileRes] = await Promise.all(fetchPromises);

            if (!scrimsRes.ok) throw new Error('내전 목록을 불러오는 데 실패했습니다.');
            if (!usersRes.ok) throw new Error('유저 정보를 불러오는 데 실패했습니다.');

            const scrimsData = await scrimsRes.json();
            const usersData: { email: string; nickname: string }[] = await usersRes.json();

            const map: UserMap = {};
            usersData.forEach(u => { map[u.email] = u.nickname; });

            setScrims(scrimsData);
            setUserMap(map);

            if (profileRes && profileRes.ok) {
                const profileData = await profileRes.json();
                setProfile(profileData);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreateScrim = async () => {
        if (!scrimName.trim() || !user || !user.email) {
            alert('내전 이름을 입력해주세요.');
            return;
        }
        try {
            const res = await fetch('/api/scrims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scrimName, creatorEmail: user.email }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '내전 생성 실패');
            }
            alert('내전이 성공적으로 생성되었습니다.');
            setScrimName('');
            fetchData();
        } catch (error: any) {
            alert(`내전 생성 실패: ${error.message}`);
        }
    };

    const canCreateScrim = profile?.role === '총관리자' || profile?.role === '관리자' || (profile?.totalScrimsPlayed || 0) >= 15;

    if (loading) {
        return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">로딩 중...</main>;
    }

    return (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-blue-400">내전 로비</h1>
            </div>

            {user && canCreateScrim && (
                <div className="mb-8 p-6 bg-gray-800 rounded-lg shadow-lg">
                    <h2 className="text-xl font-bold mb-4">새로운 내전 만들기</h2>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={scrimName}
                            onChange={(e) => setScrimName(e.target.value)}
                            placeholder="내전 이름 (예: 7월 23일 1차 내전)"
                            className="flex-grow px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                        <button
                            onClick={handleCreateScrim}
                            className="py-2 px-6 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
                        >
                            생성하기
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {scrims.length > 0 ? (
                    scrims.map((scrim) => {
                        const creatorNickname = userMap[scrim.creatorEmail] || scrim.creatorEmail.split('@')[0];
                        const applicantsCount = Array.isArray(scrim.applicants) ? scrim.applicants.length : 0;
                        const statusStyle = statusColors[scrim.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

                        return (
                            <Link key={scrim.scrimId} href={`/scrims/${scrim.scrimId}`} className="block bg-gray-800 p-6 rounded-lg shadow-lg hover:bg-gray-700/50 hover:-translate-y-1 border border-transparent hover:border-blue-500/50 transition-all duration-300">
                                <div className="flex justify-between items-start mb-3">
                                    <h2 className="text-xl font-bold text-yellow-400 truncate pr-2">{scrim.scrimName}</h2>
                                    <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full border ${statusStyle}`}>
                                        {scrim.status}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 mb-4">👑 주최자: {creatorNickname}</p>
                                <div className="flex justify-between items-center text-sm text-gray-400">
                                    <span>참가자: {applicantsCount} / 10</span>
                                    <span>{new Date(scrim.createdAt).toLocaleDateString('ko-KR')}</span>
                                </div>
                            </Link>
                        )
                    })
                ) : (
                    <p className="col-span-full text-center text-gray-400 py-10">현재 진행 중인 내전이 없습니다.</p>
                )}
            </div>
        </main>
    );
}
