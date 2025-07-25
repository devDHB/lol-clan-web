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
    champion?: string; // 챔피언 필드는 경기 중/종료 시에만 사용될 수 있음
    assignedPosition?: string; // <-- 추가: 플레이어가 할당된 실제 포지션 슬롯 (클라이언트에서만 사용)
}

// ScrimData 타입: matchChampionHistory 필드 포함
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
    scrimType: string;
    matchChampionHistory?: { // 각 경기의 챔피언 사용 기록을 담을 배열
        matchId: string; // 각 경기 기록의 고유 ID (서버에서 추가)
        matchDate: string; // 클라이언트에서는 ISO string으로 받음
        blueTeamChampions: { playerEmail: string; champion: string; position: string; }[];
        redTeamChampions: { playerEmail: string; champion: string; position: string; }[];
    }[];
}

interface UserProfile {
    nickname: string;
    role: string;
}

interface UserMap {
    [email: string]: string;
}

interface RankedPosition {
    name: string;
    rank: number;
}

// ChampionInfo 인터페이스 정의
interface ChampionInfo {
    id: string; // 영문 ID (예: "Aatrox")
    name: string; // 한글 이름 (예: "아트록스")
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

// 초기 빈 팀 슬롯 구조
const initialTeamState: Record<string, Applicant | null> = {
    TOP: null,
    JG: null,
    MID: null,
    AD: null,
    SUP: null,
};

// 내전 타입별 색상 정의
const scrimTypeColors: { [key: string]: string } = {
    '일반': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    '피어리스': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    '칼바람': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
};

// 챔피언 검색 입력 컴포넌트
function ChampionSearchInput({ value, onChange, placeholder, playerId, disabled }: { // disabled 추가
    value: string;
    onChange: (championName: string) => void;
    placeholder: string;
    playerId: string; // 고유 ID를 위해 사용
    disabled?: boolean; // disabled 타입 추가
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const [searchResults, setSearchResults] = useState<ChampionInfo[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            // ⭐️ [수정된 부분] '미입력'이 아닐 때만 요청하도록 조건 추가 ⭐️
            if (searchTerm.trim().length > 0 && searchTerm.trim() !== '미입력') {
                setLoadingResults(true);
                try {
                    const res = await fetch(`/api/riot/champions?q=${encodeURIComponent(searchTerm)}`);
                    if (res.ok) {
                        const data: ChampionInfo[] = await res.json();
                        setSearchResults(data);
                        setShowResults(true);
                    } else {
                        console.error('Failed to fetch champions:', await res.json());
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

    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

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
                onFocus={() => setShowResults(searchResults.length > 0 || searchTerm.trim().length > 0)}
                onBlur={() => setTimeout(() => setShowResults(false), 100)}
                placeholder={placeholder}
                disabled={disabled} // input에 disabled 속성 전달
                // disabled일 때 스타일 변경
                className={`w-full px-3 py-1 bg-gray-700 rounded ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
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
function PlayerCard({ player, scrimType }: { player: Applicant; scrimType: string; }) {
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
            className="flex justify-between items-center bg-gray-700 p-3 rounded-md cursor-grab active:cursor-grabbing shadow-lg w-full">
            <span className="font-semibold text-white truncate">
                {player.nickname}
                {scrimType !== '칼바람' && ` (${player.tier})`}
            </span>
            <div className="flex gap-1 flex-shrink-0">
                {(player.positions || []).map(p => {
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
function PositionSlot({ id, positionName, player, teamId, onRemovePlayer, scrimType }: { // scrimType 추가
    id: string;
    positionName: string;
    player: Applicant | null;
    teamId: string;
    onRemovePlayer?: (player: Applicant, position: string, teamId: string) => void;
    scrimType: string; // scrimType 타입 추가
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { positionName, teamId }
    });
    const isOccupied = player !== null;

    return (
        <div ref={setNodeRef} className={`p-2 rounded-md border border-dashed ${isOver ? 'border-green-400 bg-green-900/20' : 'border-gray-600'} ${isOccupied ? 'bg-gray-700' : 'bg-gray-800/50'} flex items-center justify-between min-h-[60px]`}>
            <span className="font-semibold text-gray-400 text-sm w-1/4 flex-shrink-0">{positionName}:</span>
            {player ? (
                <PlayerCard player={player} scrimType={scrimType} /> // scrimType 전달
            ) : (
                <span className="text-gray-500 text-sm italic w-3/4 text-center">드래그하여 배치</span>
            )}
            {player && onRemovePlayer && (
                <button
                    onClick={() => onRemovePlayer(player, positionName, teamId)}
                    className="ml-2 text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                >
                    X
                </button>
            )}
        </div>
    );
}

// 드롭 가능한 팀 영역 컴포넌트
function TeamColumn({ id, title, players, color = 'gray', scrimType }: { // scrimType 추가
    id: string;
    title: string;
    players: Applicant[];
    color?: string;
    scrimType: string; // scrimType 타입 추가
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    const borderColor = color === 'blue' ? 'border-blue-500' : color === 'red' ? 'border-red-500' : 'border-gray-600';

    return (
        <div ref={setNodeRef} className={`bg-gray-800 p-4 rounded-lg w-full border-2 ${isOver ? 'border-green-500' : borderColor}`}>
            <h3 className={`text-xl font-bold mb-4 text-center text-white`}>{title} ({players.length})</h3>
            <div className="space-y-2 min-h-[300px]">
                {id === 'applicants' ? (
                    players.map(player => (
                        <PlayerCard key={`applicant-${player.email}`} player={player} scrimType={scrimType} /> // scrimType 전달
                    ))
                ) : (
                    null
                )}
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
    const [userMap, setUserMap] = useState<UserMap>({});
    const [loading, setLoading] = useState(true);

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [newScrimName, setNewScrimName] = useState('');

    // ⭐️ 2개의 신청 폼을 위한 상태 분리
    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);
    const [waitlistTier, setWaitlistTier] = useState('');
    const [waitlistSelectedPositions, setWaitlistSelectedPositions] = useState<RankedPosition[]>([]);
    const [showWaitlistForm, setShowWaitlistForm] = useState(false);

    const [applicants, setApplicants] = useState<Applicant[]>([]);

    const [blueTeamSlots, setBlueTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);
    const [redTeamSlots, setRedTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);

    const [championSelections, setChampionSelections] = useState<{ [email: string]: string }>({});
    // allChampionNames의 타입을 명시적으로 Set<string>으로 지정
    const [allChampionNames, setAllChampionNames] = useState<Set<string>>(new Set());


    const fetchData = useCallback(async () => {
        if (!scrimId) return;
        setLoading(true);
        try {
            const fetchPromises = [
                fetch(`/api/scrims/${scrimId}`),
                fetch('/api/users'),
                fetch(`/api/riot/champions`)
            ];
            if (user) {
                fetchPromises.push(fetch(`/api/users/${user.email}`));
            }
            const [scrimRes, usersRes, allChampionsRes, profileRes] = await Promise.all(fetchPromises);

            if (!scrimRes.ok) throw new Error('내전 정보를 불러오는 데 실패했습니다.');
            if (!usersRes.ok) throw new Error('유저 정보를 불러오는 데 실패했습니다.');

            const scrimData = await scrimRes.json();
            const usersData: { email: string; nickname: string }[] = await usersRes.json();

            // 이메일을 key, 닉네임을 value로 하는 맵 생성
            const map: UserMap = {};
            usersData.forEach(u => { map[u.email] = u.nickname; });
            setUserMap(map);

            setScrim(scrimData);

            if (allChampionsRes.ok) {
                const championsData: ChampionInfo[] = await allChampionsRes.json();
                setAllChampionNames(new Set(championsData.map(c => c.name.toLowerCase())));
            } else {
                console.error('Failed to fetch all champion names:', await allChampionsRes.json());
            }
            if (profileRes && profileRes.ok) {
                const profileData = await profileRes.json();
                setProfile(profileData);
            }
        } catch (error) {
            console.error("Failed to fetch scrim data or champions:", error);
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
            const newChampionSelections: { [email: string]: string } = {};
            [...(scrim.blueTeam || []), ...(scrim.redTeam || [])].forEach(p => {
                if (p.champion) {
                    newChampionSelections[p.email] = p.champion;
                }
            });
            setChampionSelections(newChampionSelections);

            if (scrim.status === '팀 구성중' || scrim.status === '경기중' || scrim.status === '종료') {
                const newBlueTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };
                const newRedTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };

                // 1. 서버에서 받아온 blueTeam을 슬롯에 배치
                const tempBlueTeamPlayers = [...(scrim.blueTeam || [])];

                POSITIONS.forEach(pos => { // 선호 포지션 우선 할당
                    const playerIndex = tempBlueTeamPlayers.findIndex(player =>
                        player.positions.some(p => p.split('(')[0].trim() === pos)
                    );
                    if (playerIndex !== -1 && newBlueTeamSlots[pos] === null) {
                        newBlueTeamSlots[pos] = tempBlueTeamPlayers[playerIndex];
                        tempBlueTeamPlayers.splice(playerIndex, 1);
                    }
                });
                // 남은 블루팀 플레이어(ALL 포지션 또는 선호 포지션이 이미 차있는 경우)를 빈 슬롯에 채움
                tempBlueTeamPlayers.forEach(player => {
                    const emptySlot = POSITIONS.find(pos => newBlueTeamSlots[pos] === null);
                    if (emptySlot) {
                        newBlueTeamSlots[emptySlot] = player;
                    }
                });

                // 2. 서버에서 받아온 redTeam을 슬롯에 배치
                const tempRedTeamPlayers = [...(scrim.redTeam || [])];

                POSITIONS.forEach(pos => { // 선호 포지션 우선 할당
                    const playerIndex = tempRedTeamPlayers.findIndex(player =>
                        player.positions.some(p => p.split('(')[0].trim() === pos)
                    );
                    if (playerIndex !== -1 && newRedTeamSlots[pos] === null) {
                        newRedTeamSlots[pos] = tempRedTeamPlayers[playerIndex];
                        tempRedTeamPlayers.splice(playerIndex, 1);
                    }
                });
                // 남은 레드팀 플레이어(ALL 포지션 또는 선호 포지션이 이미 차있는 경우)를 빈 슬롯에 채움
                tempRedTeamPlayers.forEach(player => {
                    const emptySlot = POSITIONS.find(pos => newRedTeamSlots[pos] === null);
                    if (emptySlot) {
                        newRedTeamSlots[emptySlot] = player;
                    }
                });

                setBlueTeamSlots(newBlueTeamSlots);
                setRedTeamSlots(newRedTeamSlots);

                setApplicants(scrim.applicants || []);

            } else { // scrim.status === '모집중'
                setApplicants(scrim.applicants || []);
                setBlueTeamSlots(initialTeamState);
                setRedTeamSlots(initialTeamState);
            }
        }
    }, [scrim]);
    const handleScrimAction = async (action: string, payload?: any) => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');

        let body: any = { action, userEmail: user.email };

        try {
            // --- 신청 및 대기열 신청 처리 ---
            if (action === 'apply' || action === 'apply_waitlist') {
                const isRecruitingPhase = scrim?.status === '모집중';
                const currentTier = isRecruitingPhase ? tier : waitlistTier;
                const currentPositions = isRecruitingPhase ? selectedPositions : waitlistSelectedPositions;

                const profileRes = await fetch(`/api/users/${user.email}`);
                if (!profileRes.ok) throw new Error('사용자 프로필을 가져올 수 없습니다.');
                const profileData: UserProfile = await profileRes.json();

                const applicantData: Partial<Applicant> = {
                    email: user.email,
                    nickname: profileData.nickname,
                };

                if (scrim?.scrimType !== '칼바람') {
                    if (!currentTier.trim()) return alert('티어를 선택해주세요.');
                    if (currentPositions.length === 0) return alert('하나 이상의 포지션을 선택해주세요.');
                    applicantData.tier = currentTier;
                    applicantData.positions = currentPositions.map(p => `${p.name} (${p.rank}순위)`);
                } else {
                    applicantData.tier = 'U';
                    applicantData.positions = [];
                }
                body.applicantData = applicantData;
            }

            // --- 참가 및 대기열 취소 처리 ---
            else if (action === 'leave' || action === 'leave_waitlist') {
                body.applicantData = { email: user.email };
            }

            // --- 멤버 제외 처리 ---
            else if (action === 'remove_member') {
                if (!confirm(`'${payload.nickname}'님을 내전에서 제외하시겠습니까?`)) return;
                body.memberEmailToRemove = payload.memberEmailToRemove;
            }

            // --- 경기 시작 처리 ---
            else if (action === 'start_game') {
                const blueTeam = Object.values(blueTeamSlots).filter(p => p);
                const redTeam = Object.values(redTeamSlots).filter(p => p);
                if (blueTeam.length !== 5 || redTeam.length !== 5) {
                    return alert('블루팀과 레드팀은 각각 5명으로 구성되어야 합니다.');
                }
                body.teams = { blueTeam, redTeam };
            }

            // --- 경기 종료 처리 (assignedPosition 포함하도록 수정) ---
            else if (action === 'end_game') {
                body.winningTeam = payload.winningTeam;
                body.championData = {
                    blueTeam: Object.keys(blueTeamSlots).filter(pos => blueTeamSlots[pos]).map(pos => ({
                        ...blueTeamSlots[pos]!,
                        champion: championSelections[blueTeamSlots[pos]!.email] || '미입력',
                        assignedPosition: pos,
                    })),
                    redTeam: Object.keys(redTeamSlots).filter(pos => redTeamSlots[pos]).map(pos => ({
                        ...redTeamSlots[pos]!,
                        champion: championSelections[redTeamSlots[pos]!.email] || '미입력',
                        assignedPosition: pos,
                    })),
                };
            }

            // --- 상태 되돌리기 처리 ---
            else if (action === 'reset_to_team_building' || action === 'reset_to_recruiting' || action === 'reset_peerless') {
                if (!confirm('정말로 이 작업을 실행하시겠습니까?')) return;
            }

            // --- API 호출 ---
            const res = await fetch(`/api/scrims/${scrimId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '작업에 실패했습니다.');
            }

            // --- 작업 성공 후 처리 ---
            if (action.includes('apply') || action.includes('leave')) {
                setTier('');
                setSelectedPositions([]);
                setWaitlistTier('');
                setWaitlistSelectedPositions([]);
                setShowWaitlistForm(false);
            }

            alert('작업이 완료되었습니다.');
            fetchData();

        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    // --- 내전 제목 수정 함수 ---
    const handleUpdateScrimName = async () => {
        if (!newScrimName.trim() || !user || !user.email || !scrim) return;
        try {
            const res = await fetch(`/api/scrims/${scrimId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newScrimName, userEmail: user.email }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '제목 변경 실패');
            }
            alert('내전 제목이 변경되었습니다.');
            setIsEditingTitle(false);
            fetchData();
        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    // --- 내전 해체 함수 ---
    const handleDisbandScrim = async () => {
        if (!user || !user.email || !scrim) return;

        if (confirm(`정말로 "${scrim.scrimName}" 내전을 해체하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
            try {
                const res = await fetch(`/api/scrims/${scrimId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userEmail: user.email }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || '내전 해체 실패');
                }

                alert('내전이 해체되었습니다.');
                router.push('/scrims');
            } catch (error: any) {
                alert(`오류: ${error.message}`);
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const draggedPlayer = active.data.current as Applicant;
        const destinationId = over.id.toString();

        setApplicants(prev => prev.filter(p => p.email !== draggedPlayer.email));
        setBlueTeamSlots(prev => {
            const newTeam = { ...prev };
            for (const pos of POSITIONS) {
                if (newTeam[pos]?.email === draggedPlayer.email) {
                    newTeam[pos] = null;
                    break;
                }
            }
            return newTeam;
        });
        setRedTeamSlots(prev => {
            const newTeam = { ...prev };
            for (const pos of POSITIONS) {
                if (newTeam[pos]?.email === draggedPlayer.email) {
                    newTeam[pos] = null;
                    break;
                }
            }
            return newTeam;
        });

        if (destinationId === 'applicants') {
            setApplicants(prev => {
                if (prev.some(p => p.email === draggedPlayer.email)) return prev;
                return [...prev, draggedPlayer];
            });
        } else if (destinationId.includes('-')) {
            const [destinationTeamId, destinationPositionName] = destinationId.split('-');

            const targetSetState = destinationTeamId === 'blueTeam' ? setBlueTeamSlots : setRedTeamSlots;
            targetSetState(prev => {
                const newTeam = { ...prev };
                const existingPlayerInSlot = newTeam[destinationPositionName];

                newTeam[destinationPositionName] = draggedPlayer;

                if (existingPlayerInSlot) {
                    // 참가자 목록에 추가하기 전에 중복 확인
                    setApplicants(oldApplicants => {
                        // 이미 목록에 있으면 추가하지 않고 그대로 반환
                        if (oldApplicants.some(p => p.email === existingPlayerInSlot.email)) {
                            return oldApplicants;
                        }
                        // 목록에 없으면 추가
                        return [...oldApplicants, existingPlayerInSlot];
                    });
                }
                return newTeam;
            });
        }
    };

    const handleRemovePlayerFromSlot = (player: Applicant, position: string, teamId: string) => {
        if (teamId === 'blueTeam') {
            setBlueTeamSlots(prev => ({ ...prev, [position]: null }));
        } else if (teamId === 'redTeam') {
            setRedTeamSlots(prev => ({ ...prev, [position]: null }));
        }
        setApplicants(prev => {
            if (prev.some(p => p.email === player.email)) return prev;
            return [...prev, player];
        });
    };

    const handleSaveTeams = async () => {
        // 이 함수는 현재 사용되지 않습니다. (start_game 액션에서 팀을 저장함)
        // 필요하다면 다시 활성화할 수 있습니다.
    };

    const handlePositionClick = (posName: string, isWaitlist: boolean) => {
        const setState = isWaitlist ? setWaitlistSelectedPositions : setSelectedPositions;
        setState(prev => {
            if (posName === 'ALL') {
                return prev.some(p => p.name === 'ALL') ? [] : [{ name: 'ALL', rank: 1 }];
            }
            if (prev.some(p => p.name === 'ALL')) {
                return prev;
            }
            const isSelected = prev.some(p => p.name === posName);
            let newPositions: RankedPosition[];
            if (isSelected) {
                newPositions = prev.filter(p => p.name !== posName);
            } else {
                if (prev.length < 3) {
                    newPositions = [...prev, { name: posName, rank: 0 }];
                } else {
                    return prev;
                }
            }
            return newPositions.sort((a, b) => a.rank - b.rank).map((p, index) => ({
                ...p,
                rank: index + 1
            }));
        });
    };

    const handleRankChange = (posName: string, newRank: number, isWaitlist: boolean) => {
        const setState = isWaitlist ? setWaitlistSelectedPositions : setSelectedPositions;
        setState(prev => {
            const targetPos = prev.find(p => p.name === posName);
            if (!targetPos) return prev;
            const existingRankedPos = prev.find(p => p.rank === newRank);
            let updatedPositions = prev.map(p => {
                if (p.name === posName) {
                    return { ...p, rank: newRank };
                } else if (existingRankedPos && p.name === existingRankedPos.name) {
                    return { ...p, rank: targetPos.rank };
                }
                return p;
            });
            return updatedPositions.sort((a, b) => a.rank - b.rank).map((p, index) => ({
                ...p,
                rank: index + 1
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
    const creatorNickname = userMap[scrim.creatorEmail] || scrim.creatorEmail.split('@')[0];

    const currentApplicantsForDisplay = scrim.status === '모집중' ? (scrim.applicants || []) : applicants;
    const waitlist = scrim.waitlist || [];
    const isApplicant = user ? currentApplicantsForDisplay.some(a => a.email === user.email) : false;
    const isInWaitlist = user ? waitlist.some(w => w.email === user.email) : false;
    const isFull = currentApplicantsForDisplay.length >= 10;
    const isWaitlistFull = waitlist.length >= 10;

    const typeStyle = scrimTypeColors[scrim.scrimType] || 'bg-gray-600';

    return (
        <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
            <div className="mb-6">
                <Link href="/scrims" className="text-blue-400 hover:underline">← 내전 로비로 돌아가기</Link>
                {canManage && scrim.status !== '종료' && (
                    <button
                        onClick={handleDisbandScrim}
                        className="py-1 px-3 ml-3 bg-red-800 hover:bg-red-700 text-white font-semibold rounded-md text-sm"
                    >
                        내전 해체
                    </button>
                )}
            </div>

            <header className="text-center mb-8">
                {isEditingTitle && canManage ? (
                    <div className="flex items-center justify-center gap-2">
                        <input
                            type="text"
                            value={newScrimName}
                            onChange={(e) => setNewScrimName(e.target.value)}
                            className="text-4xl font-bold text-yellow-400 bg-gray-700 rounded-md px-2 py-1 text-center"
                        />
                        <button onClick={handleUpdateScrimName} className="bg-green-600 px-3 py-1 rounded-md text-sm">저장</button>
                        <button onClick={() => setIsEditingTitle(false)} className="bg-gray-600 px-3 py-1 rounded-md text-sm">취소</button>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-4">
                        <h1 className="text-4xl font-bold text-yellow-400">{scrim.scrimName}</h1>
                        {canManage && scrim.status !== '종료' && (
                            <button
                                onClick={() => {
                                    setIsEditingTitle(true);
                                    setNewScrimName(scrim.scrimName);
                                }}
                                className="text-xs bg-gray-600 p-2 rounded-md hover:bg-gray-500"
                                title="내전 제목 수정"
                            >
                                ✏️
                            </button>
                        )}
                    </div>
                )}
                <p className="text-lg text-gray-400 mt-2">
                    상태: <span className="font-semibold text-green-400">{scrim.status}</span>
                    <span className={`ml-3 px-2 py-0.5 text-xs font-semibold rounded-full border ${typeStyle}`}>
                        {scrim.scrimType}
                    </span>
                </p>
                <p className="text-sm text-gray-500 mt-1">주최자: {creatorNickname}</p>
            </header>

            {canManage && scrim.status === '모집중' && (
                <div className="mb-8 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center">
                    <p className="mb-2">관리자/생성자 전용</p>
                    <button
                        onClick={() => handleScrimAction('start_team_building')}
                        disabled={currentApplicantsForDisplay.length < 10}
                        className="py-2 px-6 bg-yellow-600 hover:bg-yellow-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        {currentApplicantsForDisplay.length < 10 ? `팀 구성을 위해 ${10 - currentApplicantsForDisplay.length}명이 더 필요합니다` : '팀 구성 시작하기'}
                    </button>
                </div>
            )}

            {scrim.status === '팀 구성중' && canManage && (
                <>
                    <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <TeamColumn id="applicants" title="남은 참가자" players={applicants} scrimType={scrim.scrimType} />
                            <div className="bg-gray-800 p-4 rounded-lg w-full border-2 border-blue-500">
                                <h3 className={`text-xl font-bold mb-4 text-center text-white`}>블루팀 ({Object.values(blueTeamSlots).filter(p => p !== null).length})</h3>
                                <div className="space-y-2 min-h-[300px]">
                                    {POSITIONS.map(pos => (
                                        <PositionSlot
                                            key={`blueTeam-${pos}`}
                                            id={`blueTeam-${pos}`}
                                            positionName={pos}
                                            player={blueTeamSlots[pos]}
                                            teamId="blueTeam"
                                            onRemovePlayer={handleRemovePlayerFromSlot}
                                            scrimType={scrim.scrimType}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="bg-gray-800 p-4 rounded-lg w-full border-2 border-red-500">
                                <h3 className={`text-xl font-bold mb-4 text-center text-white`}>레드팀 ({Object.values(redTeamSlots).filter(p => p !== null).length})</h3>
                                <div className="space-y-2 min-h-[300px]">
                                    {POSITIONS.map(pos => (
                                        <PositionSlot
                                            key={`redTeam-${pos}`}
                                            id={`redTeam-${pos}`}
                                            positionName={pos}
                                            player={redTeamSlots[pos]}
                                            teamId="redTeam"
                                            onRemovePlayer={handleRemovePlayerFromSlot}
                                            scrimType={scrim.scrimType}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </DndContext>
                    <div className="text-center space-x-4 mt-6">
                        <button onClick={() => handleScrimAction('start_game')} className="py-2 px-8 bg-green-600 hover:bg-green-700 rounded-md font-semibold">경기 시작</button>
                        <button
                            onClick={() => handleScrimAction('reset_to_recruiting')}
                            className="py-2 px-8 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold"
                        >
                            모집중 상태로 되돌리기
                        </button>
                    </div>
                    {/* ==================== 대기열 섹션 시작 ==================== */}
                    <div className="mt-8 pt-6 border-t border-gray-700">
                        <h3 className="text-2xl font-bold mb-4 text-center text-yellow-400">
                            대기자 목록 ({waitlist.length} / 10)
                        </h3>

                        {/* 대기자 신청/취소 버튼 및 폼 */}
                        {user && !isApplicant && (
                            <div className="text-center mb-6 max-w-sm mx-auto">
                                {isInWaitlist ? (
                                    <button
                                        onClick={() => handleScrimAction('leave_waitlist')}
                                        className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                                    >
                                        대기열 나가기
                                    </button>
                                ) : showWaitlistForm ? (
                                    <div className="p-4 bg-gray-700 rounded-lg text-left space-y-4">
                                        <h4 className="font-bold text-center">대기열 참가 신청</h4>

                                        {/* --- 티어 선택 UI --- */}
                                        <div>
                                            <label htmlFor="tier-waitlist" className="block text-sm font-medium text-gray-300 mb-1">현재 티어</label>
                                            <select id="tier-waitlist" value={waitlistTier} onChange={(e) => setWaitlistTier(e.target.value)} className="w-full px-3 py-2 bg-gray-800 rounded-md">
                                                <option value="" disabled>티어를 선택하세요</option>
                                                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>

                                        {/* --- 포지션 선택 UI --- */}
                                        <div>
                                            <p className="text-sm font-medium text-gray-300 mb-2">희망 포지션 (ALL 또는 최대 3개, 순위 지정)</p>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                <button
                                                    onClick={() => handlePositionClick('ALL', true)}
                                                    // ⭐️ [수정] selectedPositions -> waitlistSelectedPositions 로 변경
                                                    className={`px-3 py-1 text-sm rounded-full ${waitlistSelectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600 hover:bg-gray-500'} transition-colors duration-200 active:scale-95`}
                                                >
                                                    ALL
                                                </button>
                                                <div className="w-full border-t border-gray-600 my-2"></div>
                                                {POSITIONS.map(pos => (
                                                    <button
                                                        key={pos}
                                                        onClick={() => handlePositionClick(pos, true)}
                                                        // ⭐️ [수정] 모든 selectedPositions -> waitlistSelectedPositions 로 변경
                                                        disabled={waitlistSelectedPositions.some(p => p.name === 'ALL') || (waitlistSelectedPositions.length >= 3 && !waitlistSelectedPositions.some(p => p.name === pos))}
                                                        className={`px-3 py-1 text-sm rounded-full ${waitlistSelectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 active:scale-95`}
                                                    >
                                                        {pos}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* ⭐️ [수정] 모든 selectedPositions -> waitlistSelectedPositions 로 변경 */}
                                            {waitlistSelectedPositions.length > 0 && !waitlistSelectedPositions.some(p => p.name === 'ALL') && (
                                                <div className="space-y-2 mt-4">
                                                    <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                                    {waitlistSelectedPositions.map((p) => (
                                                        <div key={p.name} className="flex items-center gap-2 bg-gray-800 p-2 rounded-md">
                                                            <span className="font-semibold text-white">{p.name}</span>
                                                            <select
                                                                value={p.rank}
                                                                onChange={(e) => handleRankChange(p.name, parseInt(e.target.value), true)}
                                                                className="ml-auto px-2 py-1 bg-gray-600 rounded-md text-white"
                                                            >
                                                                {[...Array(waitlistSelectedPositions.length)].map((_, i) => (
                                                                    <option key={i + 1} value={i + 1}>{i + 1} 순위</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button onClick={() => handleScrimAction('apply_waitlist')} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
                                                참가 확정
                                            </button>
                                            <button onClick={() => setShowWaitlistForm(false)} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-md">
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (scrim.scrimType === '칼바람') {
                                                handleScrimAction('apply_waitlist');
                                            } else {
                                                setShowWaitlistForm(true);
                                            }
                                        }}
                                        disabled={isWaitlistFull}
                                        className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                                    >
                                        {isWaitlistFull ? '대기열이 가득 찼습니다' : '대기열 참가'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 대기자 목록 표시 (기존과 동일) */}
                        <div className="space-y-2 max-w-2xl mx-auto">
                            {waitlist.length > 0 ? (
                                waitlist.map((applicant) => (
                                    <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">
                                            {applicant.nickname || applicant.email}
                                            {scrim.scrimType !== '칼바람' && ` (${applicant.tier})`}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            {scrim.scrimType !== '칼바람' && applicant.positions.map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/);
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos;
                                                return (
                                                    <span key={pos} className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full">
                                                        {displayValue}
                                                    </span>
                                                );
                                            })}
                                            {canManage && (
                                                <button
                                                    onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })}
                                                    className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600"
                                                >
                                                    제외
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-400 text-center">아직 대기자가 없습니다.</p>
                            )}
                        </div>
                    </div>
                    {/* ==================== 대기열 섹션 끝 ==================== */}
                </>
            )}

            {scrim.status === '경기중' && (
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            {(scrim.blueTeam || []).map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">
                                        {player.nickname}
                                        {scrim.scrimType !== '칼바람' && ` (${player.tier})`}
                                    </span>
                                    <ChampionSearchInput
                                        playerId={player.email}
                                        value={championSelections[player.email] || ''}
                                        onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                        placeholder="챔피언 검색..."
                                        disabled={scrim.scrimType === '칼바람'} // 이 줄을 추가!
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            {(scrim.redTeam || []).map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">
                                        {player.nickname}
                                        {scrim.scrimType !== '칼바람' && ` (${player.tier})`}
                                    </span>
                                    <ChampionSearchInput
                                        playerId={player.email}
                                        value={championSelections[player.email] || ''}
                                        onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                        placeholder="챔피언 검색..."
                                        disabled={scrim.scrimType === '칼바람'} // 이 줄을 추가!
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* 피어리스 내전에서 사용된 챔피언 목록 표시 (경기중) */}
                    {scrim.scrimType === '피어리스' && scrim.matchChampionHistory && scrim.matchChampionHistory.length > 0 && (
                        <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-yellow-700">
                            <h3 className="text-xl font-bold mb-3 text-center text-yellow-400">
                                사용된 챔피언 기록
                            </h3>
                            {scrim.matchChampionHistory.map((matchRecord, index) => {
                                // 포지션 정렬 헬퍼 함수 정의 (컴포넌트 외부에 정의하는 것이 더 효율적)
                                const getPositionSortOrder = (position: string) => {
                                    const posIndex = POSITIONS.indexOf(position);
                                    // POSITIONS에 없는 포지션은 가장 뒤로 보냅니다.
                                    return posIndex === -1 ? POSITIONS.length : posIndex;
                                };

                                return (
                                    <div key={matchRecord.matchId || index} className="mb-4 p-3 bg-gray-700 rounded-md">
                                        <p className="text-gray-400 text-sm mb-2">
                                            경기 {scrim.matchChampionHistory!.length - index} ({new Date(matchRecord.matchDate).toLocaleString()})
                                        </p>
                                        <div className="flex flex-wrap justify-between gap-4">
                                            {/* 블루팀 챔피언 */}
                                            <div className="w-full md:w-[calc(50%-0.5rem)]">
                                                <h4 className="text-blue-300 font-semibold mb-1">블루팀</h4>
                                                <div className="space-y-1">
                                                    {matchRecord.blueTeamChampions
                                                        .sort((a, b) => getPositionSortOrder(a.position) - getPositionSortOrder(b.position)) // 포지션 순서대로 정렬
                                                        .map(champData => (
                                                            <span key={champData.playerEmail} className="block text-sm">
                                                                {userMap[champData.playerEmail] || champData.playerEmail.split('@')[0]}: <span className="font-bold text-yellow-400">{champData.champion}</span>
                                                                <span className="text-gray-400 ml-1 text-xs">({champData.position})</span>
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>
                                            {/* 레드팀 챔피언 */}
                                            <div className="w-full md:w-[calc(50%-0.5rem)]">
                                                <h4 className="text-red-300 font-semibold mb-1">레드팀</h4>
                                                <div className="space-y-1">
                                                    {matchRecord.redTeamChampions
                                                        .sort((a, b) => getPositionSortOrder(a.position) - getPositionSortOrder(b.position)) // 포지션 순서대로 정렬
                                                        .map(champData => (
                                                            <span key={champData.playerEmail} className="block text-sm">
                                                                {userMap[champData.playerEmail] || champData.playerEmail.split('@')[0]}: <span className="font-bold text-yellow-400">{champData.champion}</span>
                                                                {champData.position && <span className="text-gray-400 ml-1 text-xs">({champData.position})</span>}
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {canManage && (
                        <div className="text-center space-x-4 mt-6">
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'blue' })} className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">블루팀 승리</button>
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'red' })} className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold">레드팀 승리</button>
                            <button
                                onClick={() => handleScrimAction('reset_to_team_building')}
                                className="py-2 px-8 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold"
                            >
                                팀 구성 상태로 되돌리기
                            </button>
                            {/* 피어리스일 때만 초기화 버튼 표시 (경기중 상태) */}
                            {scrim.scrimType === '피어리스' && (
                                <button
                                    onClick={() => handleScrimAction('reset_peerless')}
                                    className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                                >
                                    피어리스 챔피언 목록 초기화
                                </button>
                            )}
                        </div>
                    )}
                    {/* ==================== 대기열 섹션 시작 ==================== */}
                    <div className="mt-8 pt-6 border-t border-gray-700">
                        <h3 className="text-2xl font-bold mb-4 text-center text-yellow-400">
                            대기자 목록 ({waitlist.length} / 10)
                        </h3>

                        {/* 대기자 신청/취소 버튼 및 폼 */}
                        {user && !isApplicant && (
                            <div className="text-center mb-6 max-w-sm mx-auto">
                                {isInWaitlist ? (
                                    <button
                                        onClick={() => handleScrimAction('leave_waitlist')}
                                        className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                                    >
                                        대기열 나가기
                                    </button>
                                ) : showWaitlistForm ? (
                                    <div className="p-4 bg-gray-700 rounded-lg text-left space-y-4">
                                        <h4 className="font-bold text-center">대기열 참가 신청</h4>

                                        {/* --- 티어 선택 UI --- */}
                                        <div>
                                            <label htmlFor="tier-waitlist" className="block text-sm font-medium text-gray-300 mb-1">현재 티어</label>
                                            <select id="tier-waitlist" value={tier} onChange={(e) => setTier(e.target.value)} className="w-full px-3 py-2 bg-gray-800 rounded-md">
                                                <option value="" disabled>티어를 선택하세요</option>
                                                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>

                                        {/* ▼▼▼ [수정된 부분] 포지션 선택 UI 전체 코드 ▼▼▼ */}
                                        <div>
                                            <p className="text-sm font-medium text-gray-300 mb-2">희망 포지션 (ALL 또는 최대 3개, 순위 지정)</p>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                <button
                                                    onClick={() => handlePositionClick('ALL', true)}
                                                    className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600'}`}
                                                >
                                                    ALL
                                                </button>
                                                <div className="w-full border-t border-gray-700 my-2"></div>
                                                {POSITIONS.map(pos => (
                                                    <button
                                                        onClick={() => handlePositionClick('ALL', true)}
                                                        className={`px-3 py-1 text-sm rounded-full ${waitlistSelectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600 hover:bg-gray-500'}`}
                                                    >
                                                        ALL
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedPositions.length > 0 && !selectedPositions.some(p => p.name === 'ALL') && (
                                                <div className="space-y-2 mt-4">
                                                    <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                                    {selectedPositions.map((p) => (
                                                        <div key={p.name} className="flex items-center gap-2 bg-gray-800 p-2 rounded-md">
                                                            <span className="font-semibold text-white">{p.name}</span>
                                                            <select
                                                                value={p.rank}
                                                                onChange={(e) => handleRankChange(p.name, parseInt(e.target.value), false)}
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
                                        {/* ▲▲▲ [수정된 부분] 포지션 선택 UI 전체 코드 ▲▲▲ */}

                                        <div className="flex gap-2 pt-2">
                                            <button onClick={() => handleScrimAction('apply_waitlist')} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
                                                참가 확정
                                            </button>
                                            <button onClick={() => setShowWaitlistForm(false)} className="w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-md">
                                                취소
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (scrim.scrimType === '칼바람') {
                                                handleScrimAction('apply_waitlist');
                                            } else {
                                                setShowWaitlistForm(true);
                                            }
                                        }}
                                        disabled={isWaitlistFull}
                                        className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
                                    >
                                        {isWaitlistFull ? '대기열이 가득 찼습니다' : '대기열 참가'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 대기자 목록 표시 (기존과 동일) */}
                        <div className="space-y-2 max-w-2xl mx-auto">
                            {waitlist.length > 0 ? (
                                waitlist.map((applicant) => (
                                    <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">
                                            {applicant.nickname || applicant.email}
                                            {scrim.scrimType !== '칼바람' && ` (${applicant.tier})`}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            {scrim.scrimType !== '칼바람' && applicant.positions.map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/);
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos;
                                                return (
                                                    <span key={pos} className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full">
                                                        {displayValue}
                                                    </span>
                                                );
                                            })}
                                            {canManage && (
                                                <button
                                                    onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })}
                                                    className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600"
                                                >
                                                    제외
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-gray-400 text-center">아직 대기자가 없습니다.</p>
                            )}
                        </div>
                    </div>
                    {/* ==================== 대기열 섹션 끝 ==================== */}
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
                                    {scrim.scrimType !== '칼바람' && (
                                        <>
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
                                                    <button
                                                        onClick={() => handlePositionClick('ALL', false)} // ⭐️ isWaitlist: false 추가
                                                        className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600'}`}
                                                    >
                                                        ALL
                                                    </button>
                                                    <div className="w-full border-t border-gray-700 my-2"></div>
                                                    {POSITIONS.map(pos => (
                                                        <button
                                                            key={pos}
                                                            onClick={() => handlePositionClick(pos, false)} // ⭐️ isWaitlist: false 추가
                                                            disabled={selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos))}
                                                            className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                        >
                                                            {pos}
                                                        </button>
                                                    ))}
                                                </div>
                                                {selectedPositions.length > 0 && !selectedPositions.some(p => p.name === 'ALL') && (
                                                    <div className="space-y-2 mt-4">
                                                        <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                                        {selectedPositions.map((p) => (
                                                            <div key={p.name} className="flex items-center gap-2 bg-gray-700 p-2 rounded-md">
                                                                <span className="font-semibold text-white">{p.name}</span>
                                                                <select
                                                                    value={p.rank}
                                                                    onChange={(e) => handleRankChange(p.name, parseInt(e.target.value), false)} // ⭐️ isWaitlist: false 추가
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
                                        </>
                                    )}
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
                        <h2 className="text-2xl font-bold mb-4">참가자 목록 ({(scrim.applicants || []).length} / 10)</h2>
                        <div className="space-y-2 mb-6">
                            {(scrim.applicants || []).length > 0 ? (
                                (scrim.applicants || []).map((applicant) => (
                                    <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">
                                            {applicant.nickname || applicant.email}
                                            {scrim.scrimType !== '칼바람' && ` (${applicant.tier})`}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            {scrim.scrimType !== '칼바람' && (applicant.positions || []).map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/);
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos;
                                                return <span key={pos} className="bg-blue-500 text-xs px-2 py-1 rounded-full">{displayValue}</span>;
                                            })}
                                            {canManage && (
                                                <button onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })} className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600">
                                                    제외
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (<p className="text-gray-400">아직 참가 신청자가 없습니다.</p>)}
                        </div>

                        <h2 className="text-2xl font-bold mb-4">대기자 목록 ({(scrim.waitlist || []).length} / 10)</h2>
                        <div className="space-y-2">
                            {(scrim.waitlist || []).length > 0 ? (
                                (scrim.waitlist || []).map((applicant) => (
                                    <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">
                                            {applicant.nickname || applicant.email}
                                            {scrim.scrimType !== '칼바람' && ` (${applicant.tier})`}
                                        </span>
                                        <div className="flex gap-2 items-center">
                                            {scrim.scrimType !== '칼바람' && (applicant.positions || []).map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/);
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos;
                                                return <span key={pos} className="bg-yellow-500 text-xs px-2 py-1 rounded-full">{displayValue}</span>;
                                            })}
                                            {canManage && (
                                                <button onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })} className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600">
                                                    제외
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (<p className="text-gray-400">아직 대기자가 없습니다.</p>)}
                        </div>
                    </section>
                </div>
            )}

            {/* ▼▼▼ [수정된 부분] '종료' 상태 UI 전체 ▼▼▼ */}
            {scrim.status === '종료' && (
                <div>
                    <h2 className="text-3xl font-bold text-center mb-6">
                        경기 종료:
                        <span className={scrim.winningTeam === 'blue' ? 'text-blue-400' : 'text-red-500'}>
                            {scrim.winningTeam === 'blue' ? ' 블루팀 승리!' : ' 레드팀 승리!'}
                        </span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* 블루팀 */}
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-blue-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            <div className="space-y-2">
                                {(scrim.blueTeam || []).map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname} {scrim.scrimType !== '칼바람' && `(${player.tier})`}</span>
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* 레드팀 */}
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-red-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            <div className="space-y-2">
                                {(scrim.redTeam || []).map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname} {scrim.scrimType !== '칼바람' && `(${player.tier})`}</span>
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 피어리스 챔피언 기록 */}
                    {scrim.scrimType === '피어리스' && (scrim.matchChampionHistory || []).length > 0 && (
                        <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-yellow-700">
                            <h3 className="text-xl font-bold mb-3 text-center text-yellow-400">사용된 챔피언 기록</h3>
                            {(scrim.matchChampionHistory || []).map((matchRecord, index) => (
                                <div key={matchRecord.matchId || index} className="mb-4 p-3 bg-gray-700 rounded-md">
                                    <p className="text-gray-400 text-sm mb-2">경기 {(scrim.matchChampionHistory || []).length - index} ({new Date(matchRecord.matchDate).toLocaleString()})</p>
                                    <div className="flex flex-wrap justify-between gap-4">
                                        {/* 블루팀 챔피언 */}
                                        <div className="w-full md:w-[calc(50%-0.5rem)]">
                                            <h4 className="text-blue-300 font-semibold mb-1">블루팀</h4>
                                            <div className="space-y-1">
                                                {(matchRecord.blueTeamChampions || []).map(champData => (
                                                    <span key={champData.playerEmail} className="block text-sm">
                                                        {userMap[champData.playerEmail] || champData.playerEmail.split('@')[0]}: <span className="font-bold text-yellow-400">{champData.champion}</span>
                                                        <span className="text-gray-400 ml-1 text-xs">({champData.position})</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        {/* 레드팀 챔피언 */}
                                        <div className="w-full md:w-[calc(50%-0.5rem)]">
                                            <h4 className="text-red-300 font-semibold mb-1">레드팀</h4>
                                            <div className="space-y-1">
                                                {(matchRecord.redTeamChampions || []).map(champData => (
                                                    <span key={champData.playerEmail} className="block text-sm">
                                                        {userMap[champData.playerEmail] || champData.playerEmail.split('@')[0]}: <span className="font-bold text-yellow-400">{champData.champion}</span>
                                                        {champData.position && <span className="text-gray-400 ml-1 text-xs">({champData.position})</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                    )}
                    {canManage && (
                        <div className="text-center mt-6 space-x-4">
                            <button
                                onClick={() => handleScrimAction('reset_to_team_building')}
                                className="py-2 px-6 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold text-sm"
                            >
                                팀 구성으로 되돌리기
                            </button>
                            <button
                                onClick={() => handleScrimAction('reset_to_recruiting')}
                                className="py-2 px-6 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold text-sm"
                            >
                                모집중으로 되돌리기
                            </button>
                            {scrim.scrimType === '피어리스' && (
                                <button
                                    onClick={() => handleScrimAction('reset_peerless')}
                                    className="py-2 px-6 bg-red-800 hover:bg-red-700 rounded-md font-semibold text-sm"
                                >
                                    피어리스 기록 초기화
                                </button>
                            )}
                        </div>
                    )}
                </div>

            )}

        </main >
    )
}