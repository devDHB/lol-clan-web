'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { DndContext, useDraggable, useDroppable, closestCenter, DragEndEvent } from '@dnd-kit/core';
import Image from 'next/image';
import ProtectedRoute from '@/components/ProtectedRoute';

// --- 타입 정의 ---
interface Applicant {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
    champion?: string;
    assignedPosition?: string;
    championImageUrl?: string;
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
    scrimType: string;
    matchChampionHistory?: {
        matchId: string;
        matchDate: string;
        blueTeamChampions: { playerEmail: string; champion: string; position: string; }[];
        redTeamChampions: { playerEmail: string; champion: string; position: string; }[];
    }[];
    fearlessUsedChampions?: string[];
    aramMatchHistory?: {
        matchId: string;
        matchDate: string;
        blueTeamEmails: string[];
        redTeamEmails: string[];
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

interface ChampionInfo {
    id: string;
    name: string;
    imageUrl: string;
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
function ChampionSearchInput({
    value, onChange, placeholder, playerId, disabled,
    disabledChampions // � 1. props 추가 (Set<string> 타입)
}: {
    value: string;
    onChange: (championName: string) => void;
    placeholder: string;
    playerId: string;
    disabled?: boolean;
    disabledChampions?: Set<string>; // 👈 2. 타입 정의 추가
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const [searchResults, setSearchResults] = useState<ChampionInfo[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            // '미입력'이 아닐 때만 요청하도록 조건
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
        // 선택 시 한번 더 체크
        if (disabledChampions?.has(champion.name)) {
            alert('이미 사용된 챔피언입니다.');
            return;
        }
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
                {players.map(player => (
                    <PlayerCard key={`player-${player.email}`} player={player} scrimType={scrimType} />
                ))}
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

    const usedChampionsForPeerless = useMemo(() => {
        if (!scrim || scrim.scrimType !== '피어리스') {
            return new Set<string>();
        }

        // 영구 전적이 아닌, '임시 금지 목록'인 fearlessUsedChampions를 참조
        const fearlessBans = scrim.fearlessUsedChampions || [];

        // 현재 경기에서 실시간으로 선택 중인 챔피언 목록
        const currentPicks = Object.values(championSelections).filter(Boolean);

        // 두 목록을 합쳐 최종 금지 목록을 생성합니다.
        return new Set([...fearlessBans, ...currentPicks]);

    }, [scrim?.fearlessUsedChampions, championSelections]); // 의존성 배열도 수정

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
            if (scrim) {
                if (scrim.status === '팀 구성중' || scrim.status === '경기중' || scrim.status === '종료') {
                    const newBlueSlots: Record<string, Applicant | null> = { ...initialTeamState };
                    const newRedSlots: Record<string, Applicant | null> = { ...initialTeamState };

                    if (scrim.scrimType === '칼바람') {
                        // 칼바람 모드: 포지션 상관없이 순서대로 채움
                        (scrim.blueTeam || []).forEach((player, index) => {
                            newBlueSlots[POSITIONS[index]] = player;
                        });
                        (scrim.redTeam || []).forEach((player, index) => {
                            newRedSlots[POSITIONS[index]] = player;
                        });
                    } else {
                        // 일반/피어리스 모드: assignedPosition 기준으로 채움
                        (scrim.blueTeam || []).forEach(player => {
                            if (player.assignedPosition && POSITIONS.includes(player.assignedPosition)) {
                                newBlueSlots[player.assignedPosition] = player;
                            }
                        });
                        (scrim.redTeam || []).forEach(player => {
                            if (player.assignedPosition && POSITIONS.includes(player.assignedPosition)) {
                                newRedSlots[player.assignedPosition] = player;
                            }
                        });
                    }

                    setBlueTeamSlots(newBlueSlots);
                    setRedTeamSlots(newRedSlots);
                    setApplicants(scrim.applicants || []);

                } else { // '모집중' 상태
                    setApplicants(scrim.applicants || []);
                    setBlueTeamSlots(initialTeamState);
                    setRedTeamSlots(initialTeamState);
                }
            }
        }
    }, [scrim]);

    // 팀을 랜덤으로 섞는 함수
    const handleRandomizeTeams = () => {
        if (!confirm('현재 팀을 랜덤으로 재구성하시겠습니까?')) return;

        const allPlayers = [
            ...applicants,
            ...Object.values(blueTeamSlots).filter(Boolean),
            ...Object.values(redTeamSlots).filter(Boolean)
        ].filter((value, index, self) => self.findIndex(v => v!.email === value!.email) === index) as Applicant[];

        if (allPlayers.length < 10) {
            return alert('팀을 나누려면 10명의 선수가 필요합니다.');
        }

        const shuffledPlayers = [...allPlayers].sort(() => 0.5 - Math.random());

        const newBlueTeam = shuffledPlayers.slice(0, 5);
        const newRedTeam = shuffledPlayers.slice(5, 10);

        const newBlueTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };
        const newRedTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };

        newBlueTeam.forEach((player, index) => {
            newBlueTeamSlots[POSITIONS[index]] = player;
        });
        newRedTeam.forEach((player, index) => {
            newRedTeamSlots[POSITIONS[index]] = player;
        });

        setBlueTeamSlots(newBlueTeamSlots);
        setRedTeamSlots(newRedTeamSlots);
        setApplicants([]); // 모든 플레이어가 팀에 배정되었으므로 참가자 목록은 비움
    };


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
                const blueTeam = Object.keys(blueTeamSlots)
                    .filter(pos => blueTeamSlots[pos])
                    .map(pos => ({ ...blueTeamSlots[pos]!, assignedPosition: pos }));

                const redTeam = Object.keys(redTeamSlots)
                    .filter(pos => redTeamSlots[pos])
                    .map(pos => ({ ...redTeamSlots[pos]!, assignedPosition: pos }));

                if (blueTeam.length !== 5 || redTeam.length !== 5) {
                    return alert('블루팀과 레드팀은 각각 5명으로 구성되어야 합니다.');
                }
                body.teams = { blueTeam, redTeam };
                setChampionSelections({});
            }

            // --- 경기 종료 처리 (assignedPosition 포함하도록 수정) ---
            else if (action === 'end_game') {
                // 승리팀 확정 시 확인 창 추가
                if (!confirm(`${payload.winningTeam === 'blue' ? '블루팀' : '레드팀'}의 승리를 확정하시겠습니까?`)) {
                    return;
                }

                if (scrim?.scrimType !== '칼바람') {
                    const allPlayers = [...Object.values(blueTeamSlots), ...Object.values(redTeamSlots)].filter(Boolean);

                    // 모든 플레이어가 챔피언을 선택했는지 확인
                    for (const player of allPlayers) {
                        if (!player || !championSelections[player.email] || championSelections[player.email].trim() === '') {
                            return alert(`'${player?.nickname}' 님의 챔피언을 선택해주세요.`);
                        }
                    }
                }

                if (scrim?.scrimType === '피어리스') {
                    const currentPicks = Object.values(championSelections).filter(Boolean);
                    const isDuplicateInCurrentPicks = new Set(currentPicks).size !== currentPicks.length;
                    if (isDuplicateInCurrentPicks) {
                        return alert('팀 내에 중복된 챔피언이 있습니다. 수정해주세요.');
                    }
                    const fearlessBans = scrim.fearlessUsedChampions || [];
                    const usedBannedChampion = currentPicks.find(pick => fearlessBans.includes(pick));
                    if (usedBannedChampion) {
                        return alert(`'${usedBannedChampion}' 챔피언은 이전 경기에서 사용되어 금지되었습니다.`);
                    }
                }

                body.winningTeam = payload.winningTeam;
                body.scrimType = scrim?.scrimType;
                body.championData = {
                    blueTeam: Object.keys(blueTeamSlots).filter(pos => blueTeamSlots[pos]).map(pos => ({
                        ...blueTeamSlots[pos]!,
                        champion: championSelections[blueTeamSlots[pos]!.email] || '',
                        assignedPosition: pos,
                    })),
                    redTeam: Object.keys(redTeamSlots).filter(pos => redTeamSlots[pos]).map(pos => ({
                        ...redTeamSlots[pos]!,
                        champion: championSelections[redTeamSlots[pos]!.email] || '',
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
        if (!over || !scrim) return;

        const draggedPlayer = active.data.current as Applicant;
        const destinationId = over.id.toString();

        // 1. 현재 상태를 복사하여 새로운 상태 변수 생성
        let newApplicants = [...applicants];
        let newBlueTeamSlots = { ...blueTeamSlots };
        let newRedTeamSlots = { ...redTeamSlots };

        // 2. 드래그된 플레이어를 원래 위치에서 제거
        const applicantIndex = newApplicants.findIndex(p => p.email === draggedPlayer.email);
        if (applicantIndex > -1) {
            newApplicants.splice(applicantIndex, 1);
        } else {
            for (const pos of POSITIONS) {
                if (newBlueTeamSlots[pos]?.email === draggedPlayer.email) {
                    newBlueTeamSlots[pos] = null;
                }
                if (newRedTeamSlots[pos]?.email === draggedPlayer.email) {
                    newRedTeamSlots[pos] = null;
                }
            }
        }

        // 3. 목적지에 플레이어 추가
        if (destinationId === 'applicants') {
            newApplicants.push(draggedPlayer);
        }
        // 일반/피어리스 모드: 포지션 슬롯에 드롭
        else if (destinationId.includes('-')) {
            const [destTeamId, destPos] = destinationId.split('-');
            const targetSlots = destTeamId === 'blueTeam' ? newBlueTeamSlots : newRedTeamSlots;

            const existingPlayer = targetSlots[destPos];
            if (existingPlayer) {
                newApplicants.push(existingPlayer);
            }
            targetSlots[destPos] = draggedPlayer;
        }
        // 칼바람 모드: 팀 컬럼에 드롭
        else if (scrim.scrimType === '칼바람' && (destinationId === 'blueTeam' || destinationId === 'redTeam')) {
            const targetSlots = destinationId === 'blueTeam' ? newBlueTeamSlots : newRedTeamSlots;
            const teamSize = Object.values(targetSlots).filter(Boolean).length;

            if (teamSize < 5) {
                const emptySlot = POSITIONS.find(pos => !targetSlots[pos]);
                if (emptySlot) {
                    targetSlots[emptySlot] = draggedPlayer;
                }
            } else {
                // 팀이 꽉 찼으면, 다시 참가자 목록으로 되돌림
                newApplicants.push(draggedPlayer);
            }
        }

        // 4. 모든 상태를 한 번에 업데이트
        setApplicants(newApplicants);
        setBlueTeamSlots(newBlueTeamSlots);
        setRedTeamSlots(newRedTeamSlots);
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
                // 이미 선택된 포지션을 클릭하면 제거
                newPositions = prev.filter(p => p.name !== posName);
            } else {
                // 3개 미만일 때만 새로 추가
                if (prev.length < 3) {
                    // rank는 잠시 0으로 두고, 아래에서 순서대로 재할당
                    newPositions = [...prev, { name: posName, rank: 0 }];
                } else {
                    return prev; // 3개 꽉 찼으면 아무것도 안 함
                }
            }

            // 배열의 순서(index)에 따라 1, 2, 3 순위를 다시 매김
            return newPositions.map((p, index) => ({
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
    const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자' || profile?.role === '내전관리자';
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
        <ProtectedRoute>
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

                                {/* 칼바람 모드일 때와 아닐 때 UI를 분리 */}
                                {scrim.scrimType === '칼바람' ? (
                                    <>
                                        <TeamColumn id="blueTeam" title="블루팀" players={Object.values(blueTeamSlots).filter(Boolean) as Applicant[]} color="blue" scrimType={scrim.scrimType} />
                                        <TeamColumn id="redTeam" title="레드팀" players={Object.values(redTeamSlots).filter(Boolean) as Applicant[]} color="red" scrimType={scrim.scrimType} />
                                    </>
                                ) : (
                                    <>
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
                                    </>
                                )}
                            </div>
                        </DndContext>
                        <div className="text-center space-x-4 mt-6">
                            <button onClick={() => handleScrimAction('start_game')} className="py-2 px-8 bg-green-600 hover:bg-green-700 rounded-md font-semibold">경기 시작</button>
                            {/* 랜덤 팀 구성 버튼 */}
                            <button
                                onClick={handleRandomizeTeams}
                                className="py-2 px-8 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold"
                            >
                                랜덤 팀
                            </button>
                            <button
                                onClick={() => handleScrimAction('reset_to_recruiting')}
                                className="py-2 px-8 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold"
                            >
                                모집중 상태로 되돌리기
                            </button>
                            {/* '팀 구성중'일 때만 보이는 팀 초기화 버튼 */}
                            <button
                                onClick={() => {
                                    if (confirm('모든 선수를 참가자 목록으로 되돌리고 팀을 초기화하시겠습니까?')) {
                                        handleScrimAction('reset_teams_and_move_to_applicants');
                                    }
                                }}
                                className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                            >
                                팀 초기화
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
                                                        className={`px-3 py-1 text-sm rounded-full ${waitlistSelectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600 hover:bg-gray-500'} transition-colors duration-200 active:scale-95`}
                                                    >
                                                        ALL
                                                    </button>
                                                    <div className="w-full border-t border-gray-600 my-2"></div>
                                                    {POSITIONS.map(pos => (
                                                        <button
                                                            key={pos}
                                                            onClick={() => handlePositionClick(pos, true)}
                                                            disabled={waitlistSelectedPositions.some(p => p.name === 'ALL') || (waitlistSelectedPositions.length >= 3 && !waitlistSelectedPositions.some(p => p.name === pos))}
                                                            className={`px-3 py-1 text-sm rounded-full ${waitlistSelectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 active:scale-95`}
                                                        >
                                                            {pos}
                                                        </button>
                                                    ))}
                                                </div>
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

                            {/* 대기자 목록 표시 */}
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
                                            value={championSelections[player.email] || ''} // 이제 빈 문자열이 전달됩니다.
                                            onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                            // 🔽 [변경] placeholder를 원하는 텍스트로 설정 🔽
                                            placeholder="챔피언 선택..."
                                            disabled={scrim.scrimType === '칼바람'}
                                            disabledChampions={usedChampionsForPeerless}
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
                                            value={championSelections[player.email] || ''} // 이제 빈 문자열이 전달됩니다.
                                            onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                            placeholder="챔피언 선택..."
                                            disabled={scrim.scrimType === '칼바람'}
                                            disabledChampions={usedChampionsForPeerless}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* 임시 금지 목록 (fearlessUsedChampions) - 경기별로 묶어서 표시 */}
                        {scrim.scrimType === '피어리스' && scrim.fearlessUsedChampions && scrim.fearlessUsedChampions.length > 0 && (
                            <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-purple-700">
                                <h3 className="text-xl font-bold mb-4 text-center text-purple-400">
                                    금지 챔피언 (초기화 가능)
                                </h3>
                                <div className="space-y-4">
                                    {/* (scrim.fearlessUsedChampions || []) 로 변경하여 에러 해결 */}
                                    {Array.from({ length: Math.ceil((scrim.fearlessUsedChampions || []).length / 10) }, (_, i) =>
                                        (scrim.fearlessUsedChampions || []).slice(i * 10, i * 10 + 10)
                                    ).map((gameChampions, index) => (
                                        <div key={index} className="p-3 bg-gray-700/50 rounded-md">
                                            <p className="text-sm font-semibold text-gray-400 mb-2">
                                                {index + 1}번째 경기 사용 챔피언
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {gameChampions.map(championName => (
                                                    <span key={championName} className="px-3 py-1 bg-gray-700 text-sm rounded-md line-through">
                                                        {championName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canManage && (
                            <div className="text-center space-x-4 mt-6">
                                <button
                                    onClick={() => handleScrimAction('end_game', { winningTeam: 'blue', scrimType: scrim.scrimType })}
                                    className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold"
                                >
                                    블루팀 승리
                                </button>
                                <button
                                    onClick={() => handleScrimAction('end_game', { winningTeam: 'red', scrimType: scrim.scrimType })}
                                    className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold"
                                >
                                    레드팀 승리
                                </button>

                                <button
                                    onClick={() => handleScrimAction('reset_to_team_building')}
                                    className="py-2 px-8 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold"
                                >
                                    팀 구성으로 이동
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

                                            {/* [수정된 부분] 포지션 선택 UI 전체 코드 */}
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
                                                            key={pos} // ← key 추가
                                                            onClick={() => handlePositionClick(pos, false)} // ← pos 사용하도록 수정
                                                            className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-green-500' : 'bg-gray-600 hover:bg-gray-500'}`} // ← pos 사용하도록 수정
                                                        >
                                                            {pos} {/* ← pos 렌더링하도록 수정 */}
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
                                            {/* 포지션 선택 UI 전체 코드 */}

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

                {/* '종료' 상태 UI 전체 */}
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
                                <div className="space-y-3">
                                    {POSITIONS.map(pos => {
                                        const player = blueTeamSlots[pos];
                                        if (!player) return <div key={pos} className="h-[68px]"></div>; // 빈 슬롯 높이 유지
                                        return (
                                            <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                                                {player.championImageUrl ? (
                                                    <Image
                                                        src={player.championImageUrl}
                                                        alt={player.champion || '챔피언'}
                                                        width={48}
                                                        height={48}
                                                        className="rounded-md"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 bg-gray-600 rounded-md flex-shrink-0"></div>
                                                )}
                                                <div className="flex-grow">
                                                    <p className="font-bold text-lg">{player.nickname}</p>
                                                    <p className="text-sm text-gray-400">{player.tier}</p>
                                                </div>
                                                <span className="font-semibold text-yellow-400">{player.champion}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* 레드팀 */}
                            <div className="bg-gray-800 p-4 rounded-lg border-2 border-red-500">
                                <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                                <div className="space-y-3">
                                    {POSITIONS.map(pos => {
                                        const player = redTeamSlots[pos];
                                        if (!player) return <div key={pos} className="h-[68px]"></div>; // 빈 슬롯 높이 유지
                                        return (
                                            <div key={player.email} className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-md">
                                                {player.championImageUrl ? (
                                                    <Image
                                                        src={player.championImageUrl}
                                                        alt={player.champion || '챔피언'}
                                                        width={48}
                                                        height={48}
                                                        className="rounded-md"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 bg-gray-600 rounded-md flex-shrink-0"></div>
                                                )}
                                                <div className="flex-grow">
                                                    <p className="font-bold text-lg">{player.nickname}</p>
                                                    <p className="text-sm text-gray-400">{player.tier}</p>
                                                </div>
                                                <span className="font-semibold text-yellow-400">{player.champion}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* 임시 금지 목록 (fearlessUsedChampions) - 경기별로 묶어서 표시 */}
                        {scrim.scrimType === '피어리스' && scrim.fearlessUsedChampions && scrim.fearlessUsedChampions.length > 0 && (
                            <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-purple-700">
                                <h3 className="text-xl font-bold mb-4 text-center text-purple-400">
                                    금지 챔피언 (초기화 가능)
                                </h3>
                                <div className="space-y-4">
                                    {/* (scrim.fearlessUsedChampions || []) 로 변경하여 에러 해결 */}
                                    {Array.from({ length: Math.ceil((scrim.fearlessUsedChampions || []).length / 10) }, (_, i) =>
                                        (scrim.fearlessUsedChampions || []).slice(i * 10, i * 10 + 10)
                                    ).map((gameChampions, index) => (
                                        <div key={index} className="p-3 bg-gray-700/50 rounded-md">
                                            <p className="text-sm font-semibold text-gray-400 mb-2">
                                                {index + 1}번째 경기 사용 챔피언
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {gameChampions.map(championName => (
                                                    <span key={championName} className="px-3 py-1 bg-gray-700 text-sm rounded-md line-through">
                                                        {championName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {canManage && (
                            <div className="text-center mt-6 space-x-4">
                                <button
                                    onClick={() => handleScrimAction('reset_to_team_building')}
                                    className="py-2 px-6 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold text-sm"
                                >
                                    팀 구성으로 이동
                                </button>
                                <button
                                    onClick={() => handleScrimAction('reset_to_recruiting')}
                                    className="py-2 px-6 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold text-sm"
                                >
                                    모집중으로 이동
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
            </main>
        </ProtectedRoute >
    )
}