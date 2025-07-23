'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { DndContext, useDraggable, useDroppable, closestCenter, DragEndEvent } from '@dnd-kit/core';

// 타입 정의
interface Applicant {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
    champion?: string;
}

interface ScrimData {
    scrimId: string;
    scrimName: string;
    creatorEmail: string;
    status: string;
    createdAt: string;
    startTime: string | null;
    applicants: Applicant[];
    waitlist: Applicant[];
    blueTeam: Applicant[];
    redTeam: Applicant[];
    winningTeam?: 'blue' | 'red';
}

interface UserProfile {
    nickname: string;
    role: string;
}

interface RankedPosition {
    name: string;
    rank: number;
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

// 드래그 가능한 플레이어 카드 컴포넌트
function PlayerCard({ player }: { player: Applicant }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: player.email,
        data: player,
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 10,
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
            className="flex justify-between items-center bg-gray-700 p-3 rounded-md cursor-grab active:cursor-grabbing shadow-lg">
            <span className="font-semibold text-white">{player.nickname} ({player.tier})</span>
            <div className="flex gap-1">{player.positions.map(p => <span key={p} className="bg-blue-500 text-xs px-2 py-1 rounded-full text-white">{p}</span>)}</div>
        </div>
    );
}

// 드롭 가능한 팀 영역 컴포넌트
function TeamColumn({ id, title, players, color = 'gray' }: { id: string; title: string; players: Applicant[]; color?: string }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    const borderColor = color === 'blue' ? 'border-blue-500' : color === 'red' ? 'border-red-500' : 'border-gray-600';

    return (
        <div ref={setNodeRef} className={`bg-gray-800 p-4 rounded-lg w-full border-2 ${isOver ? 'border-green-500' : borderColor}`}>
            <h3 className={`text-xl font-bold mb-4 text-center text-white`}>{title} ({players.length})</h3>
            <div className="space-y-2 min-h-[300px]">
                {players.map(player => <PlayerCard key={player.email} player={player} />)}
            </div>
        </div>
    );
}

export default function ScrimDetailPage() {
    const { user } = useAuth();
    const params = useParams();
    const router = useRouter();
    const scrimId = Array.isArray(params.scrimId) ? params.scrimId[0] : params.scrimId;

    const [scrim, setScrim] = useState<ScrimData | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);

    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [blueTeam, setBlueTeam] = useState<Applicant[]>([]);
    const [redTeam, setRedTeam] = useState<Applicant[]>([]);

    const [championSelections, setChampionSelections] = useState<{ [email: string]: string }>({});

    const fetchData = useCallback(async () => {
        if (!scrimId) return;
        setLoading(true);
        try {
            const fetchPromises = [fetch(`/api/scrims/${scrimId}`)];
            if (user) {
                fetchPromises.push(fetch(`/api/users/${user.email}`));
            }
            const [scrimRes, profileRes] = await Promise.all(fetchPromises);

            if (!scrimRes.ok) throw new Error('내전 정보를 불러오는 데 실패했습니다.');
            const scrimData = await scrimRes.json();
            setScrim(scrimData);

            if (profileRes && profileRes.ok) {
                const profileData = await profileRes.json();
                setProfile(profileData);
            }
        } catch (error) {
            console.error("Failed to fetch scrim data:", error);
            setScrim(null);
        } finally {
            setLoading(false);
        }
    }, [scrimId, user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (scrim) {
            if (scrim.status === '팀 구성중') {
                const teamEmails = [...(scrim.blueTeam || []).map(p => p.email), ...(scrim.redTeam || []).map(p => p.email)];
                setApplicants((scrim.applicants || []).filter(p => !teamEmails.includes(p.email)));
                setBlueTeam(scrim.blueTeam || []);
                setRedTeam(scrim.redTeam || []);
            } else {
                setApplicants(scrim.applicants || []);
            }
        }
    }, [scrim]);

    const handleScrimAction = async (action: 'apply' | 'leave' | 'apply_waitlist' | 'leave_waitlist' | 'start_team_building' | 'start_game' | 'end_game', payload?: any) => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');

        let body: any = { action, userEmail: user.email };

        if (['apply', 'apply_waitlist'].includes(action)) {
            if (!tier.trim()) return alert('티어를 선택해주세요.');

            // ALL이 아닌 경우에만 순위 유효성 검사
            if (!selectedPositions.some(p => p.name === 'ALL')) {
                if (selectedPositions.length === 0) return alert('하나 이상의 포지션을 선택해주세요.');
                // 모든 선택된 포지션에 순위가 부여되었는지 확인
                if (selectedPositions.some(p => p.rank === 0 || p.rank === undefined)) {
                    return alert('선택된 모든 포지션의 순위를 지정해주세요.');
                }
            }

            const profileRes = await fetch(`/api/users/${user.email}`);
            if (!profileRes.ok) throw new Error('사용자 정보를 불러올 수 없습니다.');
            const profileData: UserProfile = await profileRes.json();

            // 서버로 보낼 positions 데이터 조정 (순위 포함)
            body.applicantData = {
                email: user.email,
                nickname: profileData.nickname,
                tier: tier,
                positions: selectedPositions.map(p => `${p.name} (${p.rank}순위)`) // 예시: "TOP (1순위)"
            };
        }

        if (action === 'start_game') {
            if (blueTeam.length !== 5 || redTeam.length !== 5) {
                return alert('블루팀과 레드팀 각각 5명을 구성해야 합니다.');
            }
            body.teams = { blueTeam, redTeam };
        } else if (action === 'end_game') {
            const allPlayers = [...(scrim?.blueTeam || []), ...(scrim?.redTeam || [])];
            if (Object.keys(championSelections).length !== allPlayers.length) {
                return alert('모든 플레이어의 챔피언을 선택해주세요.');
            }
            body.winningTeam = payload.winningTeam;
            body.championData = {
                blueTeam: scrim?.blueTeam.map(p => ({ ...p, champion: championSelections[p.email] || '미입력', team: 'blue' })),
                redTeam: scrim?.redTeam.map(p => ({ ...p, champion: championSelections[p.email] || '미입력', team: 'red' })),
            };
        }

        try {
            const res = await fetch(`/api/scrims/${scrimId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '작업에 실패했습니다.');
            }
            alert('작업이 완료되었습니다.');
            fetchData();
        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const draggedPlayer = active.data.current as Applicant;
        setApplicants(prev => prev.filter(p => p.email !== draggedPlayer.email));
        setBlueTeam(prev => prev.filter(p => p.email !== draggedPlayer.email));
        setRedTeam(prev => prev.filter(p => p.email !== draggedPlayer.email));
        if (over.id === 'applicants') setApplicants(prev => [...prev, draggedPlayer]);
        if (over.id === 'blueTeam') setBlueTeam(prev => [...prev, draggedPlayer]);
        if (over.id === 'redTeam') setRedTeam(prev => [...prev, draggedPlayer]);
    };

    const handleSaveTeams = async () => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');
        try {
            const res = await fetch(`/api/scrims/${scrimId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_teams',
                    userEmail: user.email,
                    teams: { blueTeam, redTeam }
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '팀 저장에 실패했습니다.');
            }
            alert('팀이 성공적으로 저장되었습니다.');
            fetchData();
        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    // --- 포지션 선택 로직 수정 ---
    const handlePositionClick = (posName: string) => {
        setSelectedPositions(prev => {
            // 'ALL' 선택 시 로직 (기존과 동일)
            if (posName === 'ALL') {
                return prev.some(p => p.name === 'ALL') ? [] : [{ name: 'ALL', rank: 1 }];
            }

            // 'ALL'이 이미 선택되어 있다면 다른 포지션 선택 불가
            if (prev.some(p => p.name === 'ALL')) {
                return prev;
            }

            const isSelected = prev.some(p => p.name === posName);
            let newPositions: RankedPosition[];

            if (isSelected) {
                // 이미 선택된 포지션이라면 제거
                newPositions = prev.filter(p => p.name !== posName);
            } else {
                // 새로 선택하는 포지션이라면
                if (prev.length < 3) {
                    // 최대 3개까지 선택 가능
                    newPositions = [...prev, { name: posName, rank: 0 }]; // 초기 순위는 0으로 설정, 나중에 선택
                } else {
                    // 3개 이상이면 추가 안 함
                    return prev;
                }
            }

            // 순위를 재정렬 (제거 후 남은 포지션들의 순위를 1, 2, 3으로 다시 부여)
            return newPositions.sort((a, b) => a.rank - b.rank).map((p, index) => ({
                ...p,
                rank: index + 1 // 1부터 시작하는 순위 부여
            }));
        });
    };

    const handleRankChange = (posName: string, newRank: number) => {
        setSelectedPositions(prev => {
            const targetPos = prev.find(p => p.name === posName);
            if (!targetPos) return prev; // 해당 포지션이 없으면 변경하지 않음

            // 선택하려는 순위에 이미 다른 포지션이 있다면 그 포지션의 순위를 바꿉니다.
            const existingRankedPos = prev.find(p => p.rank === newRank);

            let updatedPositions = prev.map(p => {
                if (p.name === posName) {
                    return { ...p, rank: newRank };
                } else if (existingRankedPos && p.name === existingRankedPos.name) {
                    // 기존에 해당 순위에 있던 포지션의 순위를 현재 포지션의 원래 순위로 바꿈 (스왑)
                    return { ...p, rank: targetPos.rank };
                }
                return p;
            });

            // 순위가 겹치지 않도록 최종적으로 정렬
            return updatedPositions.sort((a, b) => a.rank - b.rank).map((p, index) => ({
                ...p,
                rank: index + 1 // 1부터 시작하는 순위 재부여
            }));
        });
    };


    if (loading) {
        return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">내전 정보를 불러오는 중...</main>;
    }

    if (!scrim) {
        return (
            <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
                <p>내전 정보를 찾을 수 없습니다.</p>
                <Link href="/scrims" className="text-blue-400 hover:underline mt-4">← 내전 로비로 돌아가기</Link>
            </main>
        );
    }

    const isCreator = user?.email === scrim.creatorEmail;
    const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자';
    const canManage = isAdmin || isCreator;

    const currentApplicants = scrim.applicants || [];
    const waitlist = scrim.waitlist || [];
    const isApplicant = user ? currentApplicants.some(a => a.email === user.email) : false;
    const isInWaitlist = user ? waitlist.some(w => w.email === user.email) : false;
    const isFull = currentApplicants.length >= 10;
    const isWaitlistFull = waitlist.length >= 10;

    return (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
            <div className="mb-6">
                <Link href="/scrims" className="text-blue-400 hover:underline">← 내전 로비로 돌아가기</Link>
            </div>

            <header className="text-center mb-8">
                <h1 className="text-4xl font-bold text-yellow-400">{scrim.scrimName}</h1>
                <p className="text-lg text-gray-400 mt-2">상태: <span className="font-semibold text-green-400">{scrim.status}</span></p>
            </header>

            {canManage && scrim.status === '모집중' && (
                <div className="mb-8 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center">
                    <p className="mb-2">관리자/생성자 전용</p>
                    <button
                        onClick={() => handleScrimAction('start_team_building')}
                        disabled={currentApplicants.length < 10}
                        className="py-2 px-6 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        {currentApplicants.length < 10 ? `팀 구성을 위해 ${10 - currentApplicants.length}명이 더 필요합니다` : '팀 구성 시작하기'}
                    </button>
                </div>
            )}

            {scrim.status === '팀 구성중' && canManage && (
                <>
                    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <TeamColumn id="applicants" title="남은 참가자" players={applicants} />
                            <TeamColumn id="blueTeam" title="블루팀" players={blueTeam} color="blue" />
                            <TeamColumn id="redTeam" title="레드팀" players={redTeam} color="red" />
                        </div>
                    </DndContext>
                    <div className="text-center space-x-4">
                        <button onClick={handleSaveTeams} className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">팀 저장하기</button>
                        <button onClick={() => handleScrimAction('start_game')} className="py-2 px-8 bg-green-600 hover:bg-green-700 rounded-md font-semibold">경기 시작</button>
                    </div>
                </>
            )}

            {scrim.status === '경기중' && (
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            {scrim.blueTeam.map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">{player.nickname}</span>
                                    <input type="text" placeholder="챔피언 입력..." onChange={(e) => setChampionSelections(prev => ({ ...prev, [player.email]: e.target.value }))} className="w-1/2 bg-gray-700 p-1 rounded" />
                                </div>
                            ))}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            {scrim.redTeam.map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">{player.nickname}</span>
                                    <input type="text" placeholder="챔피언 입력..." onChange={(e) => setChampionSelections(prev => ({ ...prev, [player.email]: e.target.value }))} className="w-1/2 bg-gray-700 p-1 rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                    {canManage && (
                        <div className="text-center space-x-4">
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'blue' })} className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">블루팀 승리</button>
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'red' })} className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold">레드팀 승리</button>
                        </div>
                    )}
                </div>
            )}

            {scrim.status === '모집중' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <section className="lg:col-span-1 bg-gray-800 p-6 rounded-lg h-fit">
                        <h2 className="text-2xl font-bold mb-4">참가 신청</h2>
                        {user ? (
                            (isApplicant || isInWaitlist) ? (
                                <div>
                                    <p className="text-green-400 mb-4">
                                        {isApplicant ? '이미 이 내전에 참가 신청했습니다.' : '현재 대기열에 있습니다.'}
                                    </p>
                                    <button
                                        onClick={() => handleScrimAction(isApplicant ? 'leave' : 'leave_waitlist')}
                                        className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                                    >
                                        {isApplicant ? '신청 취소' : '대기열 나가기'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="tier" className="block text-sm font-medium text-gray-300 mb-1">현재 티어</label>
                                        {/* 티어 선택 드롭다운으로 변경 */}
                                        <select
                                            id="tier"
                                            value={tier}
                                            onChange={(e) => setTier(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-700 rounded-md"
                                        >
                                            <option value="" disabled>티어를 선택하세요</option>
                                            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-300 mb-2">희망 포지션 (ALL 또는 최대 3개, 순위 지정)</p>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <button
                                                onClick={() => handlePositionClick('ALL')}
                                                className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600'}`}
                                            >
                                                ALL
                                            </button>
                                            <div className="w-full border-t border-gray-700 my-2"></div>
                                            {POSITIONS.map(pos => (
                                                <button
                                                    key={pos}
                                                    onClick={() => handlePositionClick(pos)}
                                                    // 'ALL'이 선택됐거나, 이미 3개 선택되었고 현재 포지션이 선택된 상태가 아니면 비활성화
                                                    disabled={selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos))}
                                                    className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600'} ${selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {pos}
                                                </button>
                                            ))}
                                        </div>
                                        {/* 선택된 포지션들의 순위 선택 UI */}
                                        {selectedPositions.length > 0 && !selectedPositions.some(p => p.name === 'ALL') && (
                                            <div className="space-y-2 mt-4">
                                                <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                                {selectedPositions.map((p, index) => (
                                                    <div key={p.name} className="flex items-center gap-2 bg-gray-700 p-2 rounded-md">
                                                        <span className="font-semibold text-white">{p.name}</span>
                                                        <select
                                                            value={p.rank}
                                                            onChange={(e) => handleRankChange(p.name, parseInt(e.target.value))}
                                                            className="ml-auto px-2 py-1 bg-gray-600 rounded-md text-white"
                                                        >
                                                            {[...Array(selectedPositions.length)].map((_, i) => (
                                                                <option key={i + 1} value={i + 1}>{i + 1} 순위</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {isFull ? (
                                        <button onClick={() => handleScrimAction('apply_waitlist')} disabled={isWaitlistFull} className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">
                                            {isWaitlistFull ? '대기열이 가득 찼습니다' : '대기열 참가'}
                                        </button>
                                    ) : (
                                        <button onClick={() => handleScrimAction('apply')} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
                                            신청하기
                                        </button>
                                    )}
                                </div>
                            )
                        ) : (
                            <p className="text-gray-400">참가 신청을 하려면 로그인이 필요합니다.</p>
                        )}
                    </section>
                    <section className="lg:col-span-2 bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-4">참가자 목록 ({currentApplicants.length} / 10)</h2>
                        <div className="space-y-2 mb-6">
                            {currentApplicants.length > 0 ? (
                                currentApplicants.map((applicant, index) => (
                                    <div key={index} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">{applicant.nickname || applicant.email} ({applicant.tier})</span>
                                        <div className="flex gap-2">
                                            {applicant.positions.map(pos => (<span key={pos} className="bg-blue-500 text-xs px-2 py-1 rounded-full">{pos}</span>))}
                                        </div>
                                    </div>
                                ))
                            ) : (<p className="text-gray-400">아직 참가 신청자가 없습니다.</p>)}
                        </div>

                        <h2 className="text-2xl font-bold mb-4">대기자 목록 ({waitlist.length} / 10)</h2>
                        <div className="space-y-2">
                            {waitlist.length > 0 ? (
                                waitlist.map((applicant, index) => (
                                    <div key={index} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">{applicant.nickname || applicant.email} ({applicant.tier})</span>
                                        <div className="flex gap-2">
                                            {applicant.positions.map(pos => (<span key={pos} className="bg-yellow-500 text-xs px-2 py-1 rounded-full">{pos}</span>))}
                                        </div>
                                    </div>
                                ))
                            ) : (<p className="text-gray-400">아직 대기자가 없습니다.</p>)}
                        </div>
                    </section>
                </div>
            )}

            {scrim.status === '종료' && (
                <div>
                    <h2 className="text-3xl font-bold text-center mb-6">
                        경기 종료:
                        <span className={scrim.winningTeam === 'blue' ? 'text-blue-400' : 'text-red-500'}>
                            {scrim.winningTeam === 'blue' ? ' 블루팀 승리!' : ' 레드팀 승리!'}
                        </span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-blue-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            <div className="space-y-2">
                                {scrim.blueTeam.map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname}</span>
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-red-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            <div className="space-y-2">
                                {scrim.redTeam.map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname}</span>
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}