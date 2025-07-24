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

interface ChampionInfo {
    id: string;
    name: string;
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

const initialTeamState: Record<string, Applicant | null> = {
    TOP: null, JG: null, MID: null, AD: null, SUP: null,
};

// 챔피언 검색 입력 컴포넌트
function ChampionSearchInput({ value, onChange, placeholder }: {
    value: string;
    onChange: (championName: string) => void;
    placeholder: string;
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const [searchResults, setSearchResults] = useState<ChampionInfo[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchTerm.trim().length > 0) {
                setLoadingResults(true);
                try {
                    const res = await fetch(`/api/riot/champions?q=${encodeURIComponent(searchTerm)}`);
                    if (res.ok) {
                        const data: ChampionInfo[] = await res.json();
                        setSearchResults(data);
                        setShowResults(true);
                    } else {
                        setSearchResults([]);
                    }
                } catch (error) {
                    console.error('Error searching champions:', error);
                    setSearchResults([]);
                } finally {
                    setLoadingResults(false);
                }
            } else {
                setSearchResults([]);
                setShowResults(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);
    
    useEffect(() => { setSearchTerm(value); }, [value]);

    const handleSelectChampion = (champion: ChampionInfo) => {
        onChange(champion.name);
        setSearchTerm(champion.name);
        setShowResults(false);
    };

    return (
        <div className="relative w-1/2">
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    onChange(e.target.value);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                placeholder={placeholder}
                className="w-full px-3 py-1 bg-gray-700 rounded"
            />
            {showResults && searchResults.length > 0 && (
                <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {searchResults.map(champion => (
                        <li
                            key={champion.id}
                            onMouseDown={() => handleSelectChampion(champion)}
                            className="p-2 cursor-pointer hover:bg-gray-600 text-white"
                        >
                            {champion.name}
                        </li>
                    ))}
                </ul>
            )}
            {loadingResults && searchTerm.trim().length > 0 && (
                <div className="absolute top-0 right-2 h-full flex items-center text-gray-400 text-sm">
                    검색 중...
                </div>
            )}
        </div>
    );
}


// 드래그 가능한 플레이어 카드 컴포넌트
function PlayerCard({ player }: { player: Applicant }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: player.email,
        data: { player },
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 10,
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}
            className="flex justify-between items-center bg-gray-700 p-3 rounded-md cursor-grab active:cursor-grabbing shadow-lg w-full">
            <span className="font-semibold text-white truncate">{player.nickname} ({player.tier})</span>
            <div className="flex gap-1 flex-shrink-0">
                {player.positions.map(p => {
                    const match = p.match(/(.+)\((\d+)순위\)/);
                    const displayValue = match ? `${match[1].trim()}(${match[2]})` : p;
                    return (
                        <span key={p} className="bg-blue-500 text-xs px-2 py-1 rounded-full text-white">
                            {displayValue}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

// 개별 포지션 슬롯 컴포넌트
function PositionSlot({ id, positionName, player }: {
    id: string;
    positionName: string;
    player: Applicant | null;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={`p-2 rounded-md border-2 border-dashed ${isOver ? 'border-green-400 bg-green-900/20' : 'border-gray-600'} flex items-center justify-between min-h-[60px]`}>
            <span className="font-semibold text-gray-400 text-sm w-1/4 flex-shrink-0">{positionName}:</span>
            <div className="w-3/4">{player ? <PlayerCard player={player} /> : <span className="text-gray-500 text-sm italic w-full text-center block">드래그하여 배치</span>}</div>
        </div>
    );
}

// 드롭 가능한 팀/참가자 영역 컴포넌트
function DropZone({ id, title, children, color = 'gray' }: { id: string; title: string; children: React.ReactNode; color?: string }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    const borderColor = color === 'blue' ? 'border-blue-500' : color === 'red' ? 'border-red-500' : 'border-gray-600';
    
    return (
        <div ref={setNodeRef} className={`bg-gray-800 p-4 rounded-lg w-full border-2 ${isOver ? 'border-green-500' : borderColor}`}>
            <h3 className={`text-xl font-bold mb-4 text-center text-white`}>{title}</h3>
            <div className="space-y-2 min-h-[300px]">
                {children}
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
    
    const [unassignedPlayers, setUnassignedPlayers] = useState<Applicant[]>([]);
    const [blueTeamSlots, setBlueTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);
    const [redTeamSlots, setRedTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);
    
    const [championSelections, setChampionSelections] = useState<{ [email: string]: string }>({});
    const [allChampionNames, setAllChampionNames] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        if (!scrimId) return;
        setLoading(true);
        try {
            const fetchPromises = [fetch(`/api/scrims/${scrimId}`), fetch(`/api/riot/champions`)];
            if (user) { fetchPromises.push(fetch(`/api/users/${user.email}`)); }
            const [scrimRes, allChampionsRes, profileRes] = await Promise.all(fetchPromises);

            if (!scrimRes.ok) throw new Error('내전 정보를 불러오는 데 실패했습니다.');
            const scrimData = await scrimRes.json();
            setScrim(scrimData);

            if (allChampionsRes.ok) {
                const championsData: ChampionInfo[] = await allChampionsRes.json();
                setAllChampionNames(new Set(championsData.map(c => c.name.toLowerCase())));
            }
            if (profileRes && profileRes.ok) {
                const profileData = await profileRes.json();
                setProfile(profileData);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
            setScrim(null);
        } finally {
            setLoading(false);
        }
    }, [scrimId, user]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => {
        if (scrim) {
            const currentBlueSlots = { ...initialTeamState };
            const currentRedSlots = { ...initialTeamState };
            let currentUnassignedPlayers: Applicant[] = [];
            let currentChampionSelections: { [email: string]: string } = {};

            if (scrim.status === '팀 구성중' || scrim.status === '경기중' || scrim.status === '종료') {
                // '팀 구성중', '경기중', '종료' 상태에서는 DB에 저장된 blueTeam/redTeam을 바탕으로 슬롯을 채웁니다.
                // ALL 포지션도 올바르게 처리되도록 로직 강화
                (scrim.blueTeam || []).forEach(p => {
                    // 포지션 문자열에서 실제 포지션 이름만 추출
                    const actualPos = p.positions[0]?.split('(')[0].trim();
                    // TOP, JG, MID, AD, SUP 중 하나에 해당하면 슬롯에 할당
                    if (POSITIONS.includes(actualPos) && !currentBlueSlots[actualPos]) {
                        currentBlueSlots[actualPos] = p;
                    }
                    // ALL 포지션인 경우 특별히 처리할 필요는 없지만,
                    // 만약 ALL인 플레이어를 특정 슬롯에 고정하고 싶다면 추가 로직 필요
                    // 현재는 ALL이면 특정 포지션 슬롯에 들어가지 않으므로 "남은 참가자"로 갈 수 있음
                    
                    // 챔피언 정보는 경기중/종료 상태에서만 의미있지만, 미리 가져와서 설정
                    if (p.champion) {
                        currentChampionSelections[p.email] = p.champion;
                    }
                });

                (scrim.redTeam || []).forEach(p => {
                    const actualPos = p.positions[0]?.split('(')[0].trim();
                    if (POSITIONS.includes(actualPos) && !currentRedSlots[actualPos]) {
                        currentRedSlots[actualPos] = p;
                    }
                    if (p.champion) {
                        currentChampionSelections[p.email] = p.champion;
                    }
                });

                // 할당되지 않은 플레이어 계산 (팀 구성중일 때만 중요)
                // scrim.applicants에 포함된 모든 플레이어, 그리고 팀 슬롯에 들어가지 못한 ALL 포지션 플레이어를 포함
                const allPlayersInScrim = [...(scrim.applicants || []), ...(scrim.blueTeam || []), ...(scrim.redTeam || []), ...(scrim.waitlist || [])];
                const uniqueAllPlayersInScrim = Array.from(new Map(allPlayersInScrim.map(player => [player.email, player])).values());

                const assignedEmails = new Set([
                    ...Object.values(currentBlueSlots).filter(p => p).map(p => p!.email),
                    ...Object.values(currentRedSlots).filter(p => p).map(p => p!.email)
                ]);

                // 팀 슬롯에 할당되지 않은 모든 플레이어를 미할당으로 분류합니다.
                currentUnassignedPlayers = uniqueAllPlayersInScrim.filter(p => !assignedEmails.has(p.email));

                // '경기중' 또는 '종료' 상태일 때는 '남은 참가자' 목록은 비웁니다.
                if (scrim.status === '경기중' || scrim.status === '종료') {
                    currentUnassignedPlayers = [];
                }
                
            } else { // scrim.status === '모집중'
                // '모집중' 상태에서는 모든 신청자를 미할당으로 처리
                currentUnassignedPlayers = scrim.applicants || [];
                // 팀 슬롯은 initialTeamState로 이미 초기화되어 있으므로 추가 작업 불필요.
            }

            // 최종 상태 업데이트
            setBlueTeamSlots(currentBlueSlots);
            setRedTeamSlots(currentRedSlots);
            setUnassignedPlayers(currentUnassignedPlayers);
            setChampionSelections(currentChampionSelections);
        }
    }, [scrim]);

    const handleScrimAction = async (action: 'apply' | 'leave' | 'apply_waitlist' | 'leave_waitlist' | 'start_team_building' | 'start_game' | 'end_game' | 'reset_to_team_building' | 'reset_to_recruiting' | 'remove_member', payload?: any) => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');

        let body: any = { action, userEmail: user.email };

        if (['apply', 'apply_waitlist'].includes(action)) {
            if (!tier.trim()) return alert('티어를 선택해주세요.');
            if (selectedPositions.length === 0) return alert('하나 이상의 포지션을 선택해주세요.');
            if (!selectedPositions.some(p => p.name === 'ALL') && selectedPositions.some(p => p.rank === 0)) return alert('선택된 모든 포지션의 순위를 지정해주세요.');
            
            const profileRes = await fetch(`/api/users/${user.email}`);
            if (!profileRes.ok) throw new Error('사용자 정보를 불러올 수 없습니다.');
            const profileData: UserProfile = await profileRes.json();
            
            body.applicantData = {
                email: user.email, nickname: profileData.nickname, tier: tier,
                positions: selectedPositions.map(p => p.name === 'ALL' ? 'ALL' : `${p.name} (${p.rank}순위)`)
            };
        } else if (['leave', 'leave_waitlist', 'remove_member'].includes(action)) {
            body.applicantData = { email: user.email };
            if (action === 'remove_member') {
                body.memberEmailToRemove = payload.memberEmailToRemove;
            }
        }
        
        if (action === 'start_game') {
            const blueTeamArray = Object.values(blueTeamSlots).filter((p): p is Applicant => p !== null);
            const redTeamArray = Object.values(redTeamSlots).filter((p): p is Applicant => p !== null);
            if (blueTeamArray.length !== 5 || redTeamArray.length !== 5) {
                return alert('블루팀과 레드팀 각각 5명을 구성해야 합니다.');
            }
            body.teams = { blueTeam: blueTeamArray, redTeam: redTeamArray };
        } else if (action === 'end_game') {
            const allPlayers = [...(scrim?.blueTeam || []), ...(scrim?.redTeam || [])];
            const invalidChampionPlayers: string[] = [];
            allPlayers.forEach(player => {
                const selectedChampion = championSelections[player.email]?.trim();
                if (selectedChampion && !allChampionNames.has(selectedChampion.toLowerCase())) {
                    invalidChampionPlayers.push(player.nickname || player.email);
                }
            });
            if (invalidChampionPlayers.length > 0) {
                return alert(`다음 플레이어의 챔피언 이름이 유효하지 않습니다: ${invalidChampionPlayers.join(', ')}\n정확한 챔피언 이름을 입력하거나, 비워두세요.`);
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
        if (!over || !active.data.current?.player) return;
    
        const draggedPlayer = active.data.current.player as Applicant;
        const toId = over.id.toString();
    
        // 수정할 현재 상태의 복사본을 만듭니다.
        let newUnassignedPlayers = [...unassignedPlayers];
        let newBlueTeamSlots = { ...blueTeamSlots };
        let newRedTeamSlots = { ...redTeamSlots };
    
        // 먼저, 드래그된 플레이어를 현재 위치에서 제거합니다.
        // 미할당 플레이어 확인
        newUnassignedPlayers = newUnassignedPlayers.filter(p => p.email !== draggedPlayer.email);
    
        // 블루팀 슬롯 확인
        Object.keys(newBlueTeamSlots).forEach(pos => {
            if (newBlueTeamSlots[pos]?.email === draggedPlayer.email) {
                newBlueTeamSlots[pos] = null;
            }
        });
    
        // 레드팀 슬롯 확인
        Object.keys(newRedTeamSlots).forEach(pos => {
            if (newRedTeamSlots[pos]?.email === draggedPlayer.email) {
                newRedTeamSlots[pos] = null;
            }
        });
    
        // 이제 드래그된 플레이어를 새로운 목적지에 배치합니다.
        if (toId.startsWith('blueTeam-') || toId.startsWith('redTeam-')) {
            const [team, pos] = toId.split('-');
            const targetSlots = team === 'blueTeam' ? newBlueTeamSlots : newRedTeamSlots;
    
            // 대상 슬롯에 이미 플레이어가 있다면, 그 플레이어를 미할당 목록으로 다시 이동시킵니다.
            const existingPlayerInSlot = targetSlots[pos];
            if (existingPlayerInSlot) {
                newUnassignedPlayers.push(existingPlayerInSlot);
            }
    
            targetSlots[pos] = draggedPlayer;
        } else if (toId === 'unassigned') {
            newUnassignedPlayers.push(draggedPlayer);
        }
    
        // 마지막에 모든 상태를 한 번에 업데이트합니다.
        setUnassignedPlayers(newUnassignedPlayers);
        setBlueTeamSlots(newBlueTeamSlots);
        setRedTeamSlots(newRedTeamSlots);
    };
    
    const handlePositionClick = (posName: string) => {
        setSelectedPositions(prev => {
            if (posName === 'ALL') return prev.some(p => p.name === 'ALL') ? [] : [{ name: 'ALL', rank: 1 }];
            if (prev.some(p => p.name === 'ALL')) return prev;
            const isSelected = prev.some(p => p.name === posName);
            let newPositions: RankedPosition[];
            if (isSelected) {
                newPositions = prev.filter(p => p.name !== posName);
            } else {
                if (prev.length < 3) newPositions = [...prev, { name: posName, rank: 0 }];
                else return prev;
            }
            return newPositions.sort((a, b) => a.rank - b.rank || POSITIONS.indexOf(a.name) - POSITIONS.indexOf(b.name)).map((p, index) => ({ ...p, rank: index + 1 }));
        });
    };

    const handleRankChange = (posName: string, newRank: number) => {
        setSelectedPositions(prev => {
            const targetPos = prev.find(p => p.name === posName);
            if (!targetPos) return prev;
            const existingRankedPos = prev.find(p => p.rank === newRank);
            let updatedPositions = prev.map(p => {
                if (p.name === posName) return { ...p, rank: newRank };
                if (existingRankedPos && p.name === existingRankedPos.name) return { ...p, rank: targetPos.rank };
                return p;
            });
            return updatedPositions.sort((a, b) => a.rank - b.rank).map((p, index) => ({ ...p, rank: index + 1 }));
        });
    };

    if (loading) { return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">내전 정보를 불러오는 중...</main>; }
    if (!scrim) { return <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white"><p>내전 정보를 찾을 수 없습니다.</p><Link href="/scrims" className="text-blue-400 hover:underline mt-4">← 내전 로비로 돌아가기</Link></main>; }

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
            <div className="mb-6"><Link href="/scrims" className="text-blue-400 hover:underline">← 내전 로비로 돌아가기</Link></div>
            <header className="text-center mb-8"><h1 className="text-4xl font-bold text-yellow-400">{scrim.scrimName}</h1><p className="text-lg text-gray-400 mt-2">상태: <span className="font-semibold text-green-400">{scrim.status}</span></p></header>

            {canManage && scrim.status === '모집중' && (
                <div className="mb-8 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center">
                    <p className="mb-2">관리자/생성자 전용</p>
                    <button onClick={() => handleScrimAction('start_team_building')} disabled={currentApplicants.length < 10} className="py-2 px-6 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">
                        {currentApplicants.length < 10 ? `팀 구성을 위해 ${10 - currentApplicants.length}명이 더 필요합니다` : '팀 구성 시작하기'}
                    </button>
                </div>
            )}

            {scrim.status === '팀 구성중' && canManage && (
                <>
                    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <DropZone id="unassigned" title={`남은 참가자 (${unassignedPlayers.length})`}>
                                {unassignedPlayers.map(player => <PlayerCard key={player.email} player={player} />)}
                            </DropZone>
                            <DropZone id="blueTeam" title="블루팀" color="blue">
                                {POSITIONS.map(pos => <PositionSlot key={pos} id={`blueTeam-${pos}`} positionName={pos} player={blueTeamSlots[pos]} />)}
                            </DropZone>
                            <DropZone id="redTeam" title="레드팀" color="red">
                                {POSITIONS.map(pos => <PositionSlot key={pos} id={`redTeam-${pos}`} positionName={pos} player={redTeamSlots[pos]} />)}
                            </DropZone>
                        </div>
                    </DndContext>
                    <div className="text-center space-x-4 mt-6">
                        <button onClick={() => handleScrimAction('start_game')} className="py-2 px-8 bg-green-600 hover:bg-green-700 rounded-md font-semibold">경기 시작</button>
                        <button onClick={() => handleScrimAction('reset_to_recruiting')} className="py-2 px-8 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold">모집중 상태로 되돌리기</button>
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
                                    <span className="w-1/2">{player.nickname} ({player.tier})</span>
                                    <ChampionSearchInput value={championSelections[player.email] || ''} onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))} placeholder="챔피언 검색..."/>
                                </div>
                            ))}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            {scrim.redTeam.map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">{player.nickname} ({player.tier})</span>
                                    <ChampionSearchInput value={championSelections[player.email] || ''} onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))} placeholder="챔피언 검색..."/>
                                </div>
                            ))}
                        </div>
                    </div>
                    {canManage && (
                        <div className="text-center space-x-4 mt-6">
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'blue' })} className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">블루팀 승리</button>
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'red' })} className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold">레드팀 승리</button>
                            <button onClick={() => handleScrimAction('reset_to_team_building')} className="py-2 px-8 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold">팀 구성 상태로 되돌리기</button>
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
                                    <p className="text-green-400 mb-4">{isApplicant ? '이미 참가 신청했습니다.' : '현재 대기열에 있습니다.'}</p>
                                    <button onClick={() => handleScrimAction(isApplicant ? 'leave' : 'leave_waitlist')} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">{isApplicant ? '신청 취소' : '대기열 나가기'}</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="tier" className="block text-sm font-medium text-gray-300 mb-1">현재 티어</label>
                                        <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)} className="w-full px-3 py-2 bg-gray-700 rounded-md">
                                            <option value="" disabled>티어를 선택하세요</option>
                                            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-300 mb-2">희망 포지션 (ALL 또는 최대 3개, 순위 지정)</p>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <button onClick={() => handlePositionClick('ALL')} className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600'}`}>ALL</button>
                                            <div className="w-full border-t border-gray-700 my-2"></div>
                                            {POSITIONS.map(pos => (<button key={pos} onClick={() => handlePositionClick(pos)} disabled={selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos))} className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600'} ${selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos)) ? 'opacity-50 cursor-not-allowed' : ''}`}>{pos}</button>))}
                                        </div>
                                        {selectedPositions.length > 0 && !selectedPositions.some(p => p.name === 'ALL') && (
                                            <div className="space-y-2 mt-4">
                                                <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                                {selectedPositions.map(p => (
                                                    <div key={p.name} className="flex items-center gap-2 bg-gray-700 p-2 rounded-md">
                                                        <span className="font-semibold text-white">{p.name}</span>
                                                        <select value={p.rank} onChange={(e) => handleRankChange(p.name, parseInt(e.target.value))} className="ml-auto px-2 py-1 bg-gray-600 rounded-md text-white">
                                                            {[...Array(selectedPositions.length)].map((_, i) => (<option key={i + 1} value={i + 1}>{i + 1} 순위</option>))}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {isFull ? (<button onClick={() => handleScrimAction('apply_waitlist')} disabled={isWaitlistFull} className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">{isWaitlistFull ? '대기열이 가득 찼습니다' : '대기열 참가'}</button>) : (<button onClick={() => handleScrimAction('apply')} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">신청하기</button>)}
                                </div>
                            )
                        ) : (
                            <p className="text-gray-400">참가 신청을 하려면 로그인이 필요합니다.</p>
                        )}
                    </section>
                    <section className="lg:col-span-2 bg-gray-800 p-6 rounded-lg">
                        <h2 className="text-2xl font-bold mb-4">참가자 목록 ({currentApplicants.length} / 10)</h2>
                        <div className="space-y-2 mb-6">
                            {currentApplicants.map((applicant) => (
                                <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                    <span className="font-semibold">{applicant.nickname || applicant.email} ({applicant.tier})</span>
                                    <div className="flex gap-2 items-center">
                                        {applicant.positions.map(pos => { const match = pos.match(/(.+)\((\d+)순위\)/); const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos; return (<span key={pos} className="bg-blue-500 text-xs px-2 py-1 rounded-full">{displayValue}</span>);})}
                                        {canManage && (<button onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })} className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600">제외</button>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <h2 className="text-2xl font-bold mb-4">대기자 목록 ({waitlist.length} / 10)</h2>
                        <div className="space-y-2">
                            {waitlist.map((applicant) => (
                                <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                    <span className="font-semibold">{applicant.nickname || applicant.email} ({applicant.tier})</span>
                                    <div className="flex gap-2 items-center">
                                        {applicant.positions.map(pos => { const match = pos.match(/(.+)\((\d+)순위\)/); const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos; return (<span key={pos} className="bg-yellow-500 text-xs px-2 py-1 rounded-full">{displayValue}</span>);})}
                                        {canManage && (<button onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })} className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600">제외</button>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {scrim.status === '종료' && (
                <div>
                    <h2 className="text-3xl font-bold text-center mb-6">경기 종료: <span className={scrim.winningTeam === 'blue' ? 'text-blue-400' : 'text-red-500'}>{scrim.winningTeam === 'blue' ? ' 블루팀 승리!' : ' 레드팀 승리!'}</span></h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-blue-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            <div className="space-y-2">
                                {scrim.blueTeam.map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname} ({player.tier})</span>
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
                                        <span className="font-semibold">{player.nickname} ({player.tier})</span>
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
