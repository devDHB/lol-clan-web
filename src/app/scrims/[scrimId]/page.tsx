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

interface UserMap {
    [email: string]: string;
}

interface RankedPosition {
    name: string;
    rank: number;
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

// 챔피언 검색 입력 컴포넌트
function ChampionSearchInput({ value, onChange, placeholder, playerId }: {
    value: string;
    onChange: (championName: string) => void;
    placeholder: string;
    playerId: string; // 고유 ID를 위해 사용
}) {
    const [searchTerm, setSearchTerm] = useState(value);
    const [searchResults, setSearchResults] = useState<string[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [loadingResults, setLoadingResults] = useState(false);

    // 디바운스된 검색 로직
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchTerm.trim().length > 0) {
                setLoadingResults(true);
                try {
                    const res = await fetch(`/api/riot/champions?q=${encodeURIComponent(searchTerm)}`);
                    if (res.ok) {
                        const data: string[] = await res.json();
                        setSearchResults(data);
                        setShowResults(true); // 검색 결과가 있으면 표시
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
        }, 300); // 300ms 디바운스

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);

    // 외부에서 value가 변경되면 searchTerm도 업데이트 (예: 초기 로딩 시)
    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    const handleSelectChampion = (championName: string) => {
        onChange(championName); // 부모 컴포넌트에 선택된 챔피언 전달
        setSearchTerm(championName); // 입력 필드에 챔피언 이름 설정
        setShowResults(false); // 결과 숨기기
    };

    return (
        <div className="relative w-1/2">
            <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    onChange(e.target.value); // 입력 시 즉시 부모의 onChange 호출
                }}
                onFocus={() => setShowResults(searchResults.length > 0 || searchTerm.trim().length > 0)} // 입력 시작 시 또는 결과가 있을 시 표시
                onBlur={() => setTimeout(() => setShowResults(false), 100)} // 클릭 이벤트가 먼저 발생하도록 지연
                placeholder={placeholder}
                className="w-full px-3 py-1 bg-gray-700 rounded"
            />
            {showResults && searchResults.length > 0 && (
                <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-md mt-1 max-h-48 overflow-y-auto">
                    {searchResults.map(champion => (
                        <li
                            key={champion}
                            onMouseDown={() => handleSelectChampion(champion)} // onMouseDown 사용하여 onBlur보다 먼저 실행
                            className="p-2 cursor-pointer hover:bg-gray-600 text-white"
                        >
                            {champion}
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
        data: player,
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
                    const match = p.match(/(.+)\((\d+)순위\)/); // "TOP (1순위)"에서 "TOP"과 "1"을 추출
                    const displayValue = match ? `${match[1].trim()}(${match[2]})` : p; // "TOP(1)", "ALL"
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
function PositionSlot({ id, positionName, player, teamId, onRemovePlayer }: {
    id: string; // droppable ID (e.g., "blueTeam-TOP")
    positionName: string; // "TOP", "JG" etc.
    player: Applicant | null;
    teamId: string; // "blueTeam" or "redTeam"
    onRemovePlayer?: (player: Applicant, position: string, teamId: string) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { positionName, teamId } // 드롭 대상 정보
    });
    const isOccupied = player !== null;

    return (
        <div ref={setNodeRef} className={`p-2 rounded-md border border-dashed ${isOver ? 'border-green-400 bg-green-900/20' : 'border-gray-600'} ${isOccupied ? 'bg-gray-700' : 'bg-gray-800/50'} flex items-center justify-between min-h-[60px]`}>
            <span className="font-semibold text-gray-400 text-sm w-1/4 flex-shrink-0">{positionName}:</span>
            {player ? (
                // PlayerCard는 자체가 draggable이므로 여기에 직접 렌더링
                <PlayerCard player={player} />
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
function TeamColumn({ id, title, teamPlayers, color = 'gray', onRemovePlayer }: {
    id: string; // "blueTeam", "redTeam", "applicants"
    title: string;
    teamPlayers: Record<string, Applicant | null>; // 팀 구성중일 때만 사용
    color?: string;
    onRemovePlayer?: (player: Applicant, position: string, teamId: string) => void; // PositionSlot에서 호출
}) {
    const { setNodeRef, isOver } = useDroppable({ id }); // 이 droppable은 전체 컬럼을 위한 것 (예: applicants 풀)
    const borderColor = color === 'blue' ? 'border-blue-500' : color === 'red' ? 'border-red-500' : 'border-gray-600';

    return (
        <div ref={setNodeRef} className={`bg-gray-800 p-4 rounded-lg w-full border-2 ${isOver ? 'border-green-500' : borderColor}`}>
            <h3 className={`text-xl font-bold mb-4 text-center text-white`}>{title} ({Object.values(teamPlayers).filter(p => p !== null).length})</h3>
            <div className="space-y-2 min-h-[300px]">
                {/* 팀 구성중일 때만 포지션 슬롯을 렌더링 */}
                {id !== 'applicants' ? (
                    POSITIONS.map(pos => (
                        <PositionSlot
                            key={`${id}-${pos}`}
                            id={`${id}-${pos}`} // 각 슬롯의 고유 ID
                            positionName={pos}
                            player={teamPlayers[pos]}
                            teamId={id}
                            onRemovePlayer={onRemovePlayer}
                        />
                    ))
                ) : (
                    // '남은 참가자' 컬럼은 PlayerCard 목록을 직접 렌더링 (드롭 가능 영역은 전체 컬럼)
                    Object.values(teamPlayers).filter(p => p !== null).map(player => (
                        <PlayerCard key={player!.email} player={player!} />
                    ))
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
    const [userMap, setUserMap] = useState<UserMap>({}); // 닉네임 맵 state 추가
    const [loading, setLoading] = useState(true);

    // --- 제목 수정을 위한 state 추가 ---
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [newScrimName, setNewScrimName] = useState('');

    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);

    // applicants는 여전히 Applicant[]
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    // 팀 구성중 상태에서만 사용될 포지션 슬롯별 플레이어 상태
    const [blueTeamSlots, setBlueTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);
    const [redTeamSlots, setRedTeamSlots] = useState<Record<string, Applicant | null>>(initialTeamState);

    const [championSelections, setChampionSelections] = useState<{ [email: string]: string }>({});
    // 모든 챔피언 이름을 저장할 상태 추가
    const [allChampionNames, setAllChampionNames] = useState<Set<string>>(new Set());


    const fetchData = useCallback(async () => {
        if (!scrimId) return;
        setLoading(true);
        try {
            const fetchPromises = [
                fetch(`/api/scrims/${scrimId}`),
                fetch('/api/users'), // 모든 유저 정보 가져오기
                fetch(`/api/riot/champions`) // 모든 챔피언 이름 불러오기
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
                const championsData: string[] = await allChampionsRes.json();
                setAllChampionNames(new Set(championsData.map(name => name.toLowerCase()))); // 소문자로 저장하여 대소문자 구분 없이 검사
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
            if (scrim.status === '팀 구성중') {
                const newBlueTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };
                const newRedTeamSlots: Record<string, Applicant | null> = { ...initialTeamState };
                const assignedPlayerEmails = new Set<string>(); // 슬롯에 할당된 플레이어 이메일 추적

                // 모든 플레이어를 임시 배열에 모으고, 중복 제거 및 유효성 검사
                const allScrimPlayers: Applicant[] = [
                    ...(scrim.applicants || []),
                    ...(scrim.blueTeam || []),
                    ...(scrim.redTeam || []),
                    ...(scrim.waitlist || []) // waitlist도 포함하여 모든 잠재적 플레이어를 고려
                ].filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');

                const uniqueAllPlayersMap = new Map<string, Applicant>();
                allScrimPlayers.forEach(player => uniqueAllPlayersMap.set(player.email, player));
                const uniqueAllPlayers = Array.from(uniqueAllPlayersMap.values());

                // 1. scrim.blueTeam에서 슬롯 채우기 (특정 포지션 우선)
                const tempBluePlayers = [...(scrim.blueTeam || [])];
                POSITIONS.forEach(pos => { // TOP, JG, MID, AD, SUP 순서로 채움
                    const playerIndex = tempBluePlayers.findIndex(player =>
                        player.positions.some(p => p.split('(')[0].trim() === pos) // 해당 포지션을 가진 플레이어 찾기
                    );
                    if (playerIndex !== -1 && newBlueTeamSlots[pos] === null) {
                        newBlueTeamSlots[pos] = tempBluePlayers[playerIndex];
                        assignedPlayerEmails.add(tempBluePlayers[playerIndex].email);
                        tempBluePlayers.splice(playerIndex, 1); // 할당된 플레이어는 임시 배열에서 제거
                    }
                });
                // 남은 블루팀 플레이어 (ALL 포지션 또는 특정 포지션이 이미 채워진 경우)를 빈 슬롯에 채움
                // ALL 포지션 유저가 여기에 해당됩니다.
                tempBluePlayers.forEach(player => {
                    const emptySlot = POSITIONS.find(pos => newBlueTeamSlots[pos] === null);
                    if (emptySlot) {
                        newBlueTeamSlots[emptySlot] = player;
                        assignedPlayerEmails.add(player.email);
                    }
                });


                // 2. scrim.redTeam에서 슬롯 채우기 (특정 포지션 우선)
                const tempRedPlayers = [...(scrim.redTeam || [])];
                POSITIONS.forEach(pos => { // TOP, JG, MID, AD, SUP 순서로 채움
                    const playerIndex = tempRedPlayers.findIndex(player =>
                        player.positions.some(p => p.split('(')[0].trim() === pos) // 해당 포지션을 가진 플레이어 찾기
                    );
                    if (playerIndex !== -1 && newRedTeamSlots[pos] === null) {
                        newRedTeamSlots[pos] = tempRedPlayers[playerIndex];
                        assignedPlayerEmails.add(tempRedPlayers[playerIndex].email);
                        tempRedPlayers.splice(playerIndex, 1); // 할당된 플레이어는 임시 배열에서 제거
                    }
                });
                // 남은 레드팀 플레이어 (ALL 포지션 또는 특정 포지션이 이미 채워진 경우)를 빈 슬롯에 채움
                // ALL 포지션 유저가 여기에 해당됩니다.
                tempRedPlayers.forEach(player => {
                    const emptySlot = POSITIONS.find(pos => newRedTeamSlots[pos] === null);
                    if (emptySlot) {
                        newRedTeamSlots[emptySlot] = player;
                        assignedPlayerEmails.add(player.email);
                    }
                });


                setBlueTeamSlots(newBlueTeamSlots);
                setRedTeamSlots(newRedTeamSlots);

                // 3. 남은 참가자 (applicants) 풀 구성:
                //    팀 슬롯에 할당되지 않은 모든 유니크 플레이어들을 applicants로 설정
                const finalApplicants = uniqueAllPlayers.filter(player => !assignedPlayerEmails.has(player.email));

                setApplicants(finalApplicants);

            } else {
                // '모집중', '경기중', '종료' 상태에서는 applicants를 서버 데이터로 설정
                setApplicants(scrim.applicants || []);
                // blueTeamSlots 및 redTeamSlots는 팀 구성중이 아니면 사용하지 않으므로 초기 상태로 유지
                setBlueTeamSlots(initialTeamState);
                setRedTeamSlots(initialTeamState);
            }
        }
    }, [scrim]); // scrim 객체가 변경될 때마다 실행

    const handleScrimAction = async (action: 'apply' | 'leave' | 'apply_waitlist' | 'leave_waitlist' | 'start_team_building' | 'start_game' | 'end_game' | 'reset_to_team_building' | 'reset_to_recruiting' | 'remove_member', payload?: any) => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');

        let body: any = { action, userEmail: user.email };

        if (['apply', 'apply_waitlist'].includes(action)) {
            if (!tier.trim()) return alert('티어를 선택해주세요.');

            if (!selectedPositions.some(p => p.name === 'ALL')) {
                if (selectedPositions.length === 0) return alert('하나 이상의 포지션을 선택해주세요.');
                if (selectedPositions.some(p => p.rank === 0 || p.rank === undefined)) {
                    return alert('선택된 모든 포지션의 순위를 지정해주세요.');
                }
            }

            const profileRes = await fetch(`/api/users/${user.email}`);
            if (!profileRes.ok) throw new Error('사용자 정보를 불러올 수 없습니다.');
            const profileData: UserProfile = await profileRes.json();

            body.applicantData = {
                email: user.email,
                nickname: profileData.nickname,
                tier: tier,
                positions: selectedPositions.map(p => `${p.name} (${p.rank}순위)`)
            };
        } else if (action === 'leave' || action === 'leave_waitlist') {
            body.applicantData = { email: user.email };
        }


        if (action === 'start_game') {
            const blueTeamArray = Object.values(blueTeamSlots).filter(p => p !== null) as Applicant[];
            const redTeamArray = Object.values(redTeamSlots).filter(p => p !== null) as Applicant[];

            if (blueTeamArray.length !== 5 || redTeamArray.length !== 5) {
                return alert('블루팀과 레드팀 각각 5명을 구성해야 합니다. 모든 포지션에 플레이어를 배치해주세요.');
            }
            body.teams = { blueTeam: blueTeamArray, redTeam: redTeamArray }; // 배열 형태로 서버에 전송
        } else if (action === 'end_game') {
            const allPlayers = [...(scrim?.blueTeam || []), ...(scrim?.redTeam || [])];

            // --- 챔피언 유효성 검사 로직 수정 ---
            const invalidChampionPlayers: string[] = [];
            allPlayers.forEach(player => {
                const selectedChampion = championSelections[player.email]?.trim();
                // 비어있지 않은 경우에만, 유효한 챔피언 이름인지 검사
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
        } else if (action === 'reset_to_team_building') {
            if (!confirm('경기를 팀 구성 상태로 되돌리시겠습니까? 경기 기록은 유지됩니다.')) {
                return;
            }
        } else if (action === 'reset_to_recruiting') {
            if (!confirm('팀 구성을 취소하고 모집중 상태로 되돌리시겠습니까?')) {
                return;
            }
        } else if (action === 'remove_member') {
            if (!confirm(`${payload.nickname}님을 내전에서 제외하시겠습니까?`)) {
                return;
            }
            body.memberEmailToRemove = payload.memberEmailToRemove;
        }

        console.log('Client sending body:', body); // 클라이언트에서 전송되는 본문 로그

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

    // --- 내전 제목 수정 함수 추가 ---
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
            fetchData(); // 데이터 새로고침
        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    // --- 내전 해체 함수 추가 ---
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
                router.push('/scrims'); // 해체 후 로비로 이동
            } catch (error: any) {
                alert(`오류: ${error.message}`);
            }
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        const draggedPlayer = active.data.current as Applicant;
        const sourceId = active.id.toString(); // 드래그 시작 지점 ID (이메일, 또는 팀-포지션)
        const destinationId = over.id.toString(); // 드롭 대상 ID (applicants, 또는 팀-포지션)

        // 드래그 시작 위치에서 플레이어 제거
        const removePlayerFromSource = (playerEmail: string) => {
            setApplicants(prev => prev.filter(p => p.email !== playerEmail));
            setBlueTeamSlots(prev => {
                const newTeam = { ...prev };
                for (const pos of POSITIONS) {
                    if (newTeam[pos]?.email === playerEmail) {
                        newTeam[pos] = null;
                        break;
                    }
                }
                return newTeam;
            });
            setRedTeamSlots(prev => {
                const newTeam = { ...prev };
                for (const pos of POSITIONS) {
                    if (newTeam[pos]?.email === playerEmail) {
                        newTeam[pos] = null;
                        break;
                    }
                }
                return newTeam;
            });
        };

        // Scenario 1: 드롭 대상이 '남은 참가자' 풀인 경우
        if (destinationId === 'applicants') {
            removePlayerFromSource(draggedPlayer.email);
            setApplicants(prev => {
                // 이미 풀에 있는 경우 중복 추가 방지
                if (prev.some(p => p.email === draggedPlayer.email)) return prev;
                return [...prev, draggedPlayer];
            });
            return;
        }

        // Scenario 2: 드롭 대상이 특정 포지션 슬롯인 경우 (예: 'blueTeam-TOP')
        if (destinationId.includes('-')) {
            const [destinationTeamId, destinationPositionName] = destinationId.split('-');

            // 플레이어를 이전 위치에서 제거
            removePlayerFromSource(draggedPlayer.email);

            // 새 위치에 플레이어 추가
            if (destinationTeamId === 'blueTeam') {
                setBlueTeamSlots(prev => {
                    const newTeam = { ...prev };
                    const existingPlayerInSlot = newTeam[destinationPositionName];
                    newTeam[destinationPositionName] = draggedPlayer;
                    if (existingPlayerInSlot) {
                        // 슬롯에 이미 플레이어가 있었다면, 그 플레이어를 applicants 풀로 보냄
                        setApplicants(oldApplicants => [...oldApplicants, existingPlayerInSlot]);
                    }
                    return newTeam;
                });
            } else if (destinationTeamId === 'redTeam') {
                setRedTeamSlots(prev => {
                    const newTeam = { ...prev };
                    const existingPlayerInSlot = newTeam[destinationPositionName];
                    newTeam[destinationPositionName] = draggedPlayer;
                    if (existingPlayerInSlot) {
                        // 슬롯에 이미 플레이어가 있었다면, 그 플레이어를 applicants 풀로 보냄
                        setApplicants(oldApplicants => [...oldApplicants, existingPlayerInSlot]);
                    }
                    return newTeam;
                });
            }
        }
    };

    const handleRemovePlayerFromSlot = (player: Applicant, position: string, teamId: string) => {
        if (teamId === 'blueTeam') {
            setBlueTeamSlots(prev => ({ ...prev, [position]: null }));
        } else if (teamId === 'redTeam') {
            setRedTeamSlots(prev => ({ ...prev, [position]: null }));
        }
        setApplicants(prev => [...prev, player]); // 풀로 다시 보냄
    };


    const handleSaveTeams = async () => {
        if (!user || !user.email) return alert('로그인이 필요합니다.');

        const blueTeamArray = Object.values(blueTeamSlots).filter(p => p !== null) as Applicant[];
        const redTeamArray = Object.values(redTeamSlots).filter(p => p !== null) as Applicant[];

        if (blueTeamArray.length !== 5 || redTeamArray.length !== 5) {
            return alert('블루팀과 레드팀 각각 5명을 구성해야 합니다. 모든 포지션에 플레이어를 배치해주세요.');
        }

        try {
            const res = await fetch(`/api/scrims/${scrimId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_teams', // 'update_teams' 액션으로 서버에 저장
                    userEmail: user.email,
                    teams: { blueTeam: blueTeamArray, redTeam: redTeamArray }
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || '팀 저장에 실패했습니다.');
            }
            alert('팀이 성공적으로 저장되었습니다.');
            fetchData(); // 데이터 다시 불러오기
        } catch (error: any) {
            alert(`오류: ${error.message}`);
        }
    };

    const handlePositionClick = (posName: string) => {
        setSelectedPositions(prev => {
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

    const handleRankChange = (posName: string, newRank: number) => {
        setSelectedPositions(prev => {
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
                {/* --- 내전 해체 버튼 추가 --- */}
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
                {/* --- 제목 수정 UI 추가 --- */}
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
                                onClick={() => setIsEditingTitle(true)}
                                className="text-xs bg-gray-600 p-2 rounded-md hover:bg-gray-500"
                                title="내전 제목 수정"
                            >
                                ✏️
                            </button>
                        )}
                    </div>
                )}
                <p className="text-lg text-gray-400 mt-2">상태: <span className="font-semibold text-green-400">{scrim.status}</span></p>
                {/* --- 주최자 닉네임 표시 추가 --- */}
                <p className="text-sm text-gray-500 mt-1">주최자: {creatorNickname}</p>
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
                            {/* 남은 참가자 컬럼은 applicants 상태를 직접 사용 */}
                            <TeamColumn id="applicants" title="남은 참가자" teamPlayers={Object.fromEntries(applicants.map(p => [p.email, p]))} />
                            {/* 블루팀과 레드팀 컬럼은 새로운 blueTeamSlots/redTeamSlots 상태 사용 */}
                            <TeamColumn id="blueTeam" title="블루팀" teamPlayers={blueTeamSlots} color="blue" onRemovePlayer={handleRemovePlayerFromSlot} />
                            <TeamColumn id="redTeam" title="레드팀" teamPlayers={redTeamSlots} color="red" onRemovePlayer={handleRemovePlayerFromSlot} />
                        </div>
                    </DndContext>
                    <div className="text-center space-x-4 mt-6">
                        {/* "팀 저장하기" 버튼 제거됨 */}
                        <button onClick={() => handleScrimAction('start_game')} className="py-2 px-8 bg-green-600 hover:bg-green-700 rounded-md font-semibold">경기 시작</button>
                        {/* 팀 구성중 -> 모집중으로 되돌리는 버튼 추가 */}
                        <button
                            onClick={() => handleScrimAction('reset_to_recruiting')}
                            className="py-2 px-8 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold"
                        >
                            모집중 상태로 되돌리기
                        </button>
                    </div>
                </>
            )}

            {scrim.status === '경기중' && (
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-blue-400">블루팀</h3>
                            {/* 경기중 상태에서는 scrim.blueTeam 배열을 직접 사용 */}
                            {scrim.blueTeam.map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">{player.nickname} ({player.tier})</span> {/* 닉네임 옆에 티어 추가 */}
                                    {/* 챔피언 검색 입력 필드 적용 */}
                                    <ChampionSearchInput
                                        playerId={player.email}
                                        value={championSelections[player.email] || ''}
                                        onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                        placeholder="챔피언 검색..."
                                    />
                                    {/* 경기중 상태에서는 제외 버튼 제거 */}
                                </div>
                            ))}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            {scrim.redTeam.map(player => (
                                <div key={player.email} className="flex items-center gap-4 mb-2">
                                    <span className="w-1/2">{player.nickname} ({player.tier})</span> {/* 닉네임 옆에 티어 추가 */}
                                    {/* 챔피언 검색 입력 필드 적용 */}
                                    <ChampionSearchInput
                                        playerId={player.email}
                                        value={championSelections[player.email] || ''}
                                        onChange={(championName) => setChampionSelections(prev => ({ ...prev, [player.email]: championName }))}
                                        placeholder="챔피언 검색..."
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    {canManage && (
                        <div className="text-center space-x-4 mt-6">
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'blue' })} className="py-2 px-8 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">블루팀 승리</button>
                            <button onClick={() => handleScrimAction('end_game', { winningTeam: 'red' })} className="py-2 px-8 bg-red-600 hover:bg-red-700 rounded-md font-semibold">레드팀 승리</button>
                            {/* 경기중 -> 팀 구성중으로 되돌리는 버튼 추가 */}
                            <button
                                onClick={() => handleScrimAction('reset_to_team_building')}
                                className="py-2 px-8 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold"
                            >
                                팀 구성 상태로 되돌리기
                            </button>
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
                                                    disabled={selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos))}
                                                    className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600'} ${selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {pos}
                                                </button>
                                            ))}
                                        </div>
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
                                            {/* 포지션 표시 로직 수정 */}
                                            {applicant.positions.map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/); // "TOP (1순위)"에서 "TOP"과 "1"을 추출
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos; // "TOP(1)", "ALL"
                                                return (
                                                    <span key={pos} className="bg-blue-500 text-xs px-2 py-1 rounded-full">
                                                        {displayValue}
                                                    </span>
                                                );
                                            })}
                                            {canManage && ( // 제외 버튼 추가
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
                            ) : (<p className="text-gray-400">아직 참가 신청자가 없습니다.</p>)}
                        </div>

                        <h2 className="text-2xl font-bold mb-4">대기자 목록 ({waitlist.length} / 10)</h2>
                        <div className="space-y-2">
                            {waitlist.length > 0 ? (
                                waitlist.map((applicant, index) => (
                                    <div key={index} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                        <span className="font-semibold">{applicant.nickname || applicant.email} ({applicant.tier})</span>
                                        <div className="flex gap-2">
                                            {/* 포지션 표시 로직 수정 */}
                                            {applicant.positions.map(pos => {
                                                const match = pos.match(/(.+)\((\d+)순위\)/);
                                                const displayValue = match ? `${match[1].trim()}(${match[2]})` : pos; // "TOP(1)", "ALL"
                                                return (
                                                    <span key={pos} className="bg-yellow-500 text-xs px-2 py-1 rounded-full">
                                                        {displayValue}
                                                    </span>
                                                );
                                            })}
                                            {/* canManage && ( // 제외 버튼 제거됨
                                                <button
                                                    onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: applicant.email, nickname: applicant.nickname })}
                                                    className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600"
                                                >
                                                    제외
                                                </button>
                                            )*/}
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
                                        <span className="font-semibold">{player.nickname} ({player.tier})</span> {/* 닉네임 옆에 티어 추가 */}
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                        {/* canManage && ( // 제외 버튼 제거됨
                                            <button
                                                onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: player.email, nickname: player.nickname })}
                                                className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600 ml-2"
                                            >
                                                제외
                                            </button>
                                        )*/}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border-2 border-red-500">
                            <h3 className="text-xl font-bold mb-4 text-center text-red-500">레드팀</h3>
                            <div className="space-y-2">
                                {scrim.redTeam.map(player => (
                                    <div key={player.email} className="flex items-center justify-between p-2 bg-gray-700/50 rounded">
                                        <span className="font-semibold">{player.nickname} ({player.tier})</span> {/* 닉네임 옆에 티어 추가 */}
                                        <span className="font-bold text-yellow-400">{player.champion}</span>
                                        {/* canManage && ( // 제외 버튼 제거됨
                                            <button
                                                onClick={() => handleScrimAction('remove_member', { memberEmailToRemove: player.email, nickname: player.nickname })}
                                                className="bg-red-500 text-xs px-2 py-1 rounded-full hover:bg-red-600 ml-2"
                                            >
                                                제외
                                            </button>
                                        )*/}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {canManage && (
                        <div className="text-center mt-6 space-x-4">
                            <button
                                onClick={() => handleScrimAction('reset_to_team_building')}
                                className="py-2 px-8 bg-orange-600 hover:bg-orange-700 rounded-md font-semibold"
                            >
                                경기 준비 상태로 되돌리기
                            </button>
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
