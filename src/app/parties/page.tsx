'use client';

import { useEffect, useState, Dispatch, SetStateAction, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

// 타입 정의
interface Member {
  email: string;
  positions: string[];
}

interface Party {
  partyId: string;
  partyType: string;
  partyName: string;
  membersData: string | Member[];
  waitingData: string | Member[];
  createdAt: string;
  maxMembers: string;
  requiredTier?: string; // 파티에 필요한 최소 티어
  startTime?: string | null; // 파티 시작 시간 (ISO string)
}

interface UserProfile {
  role: string;
}

interface UserMap {
  [email: string]: string;
}

const POSITIONS = ['ALL', 'TOP', 'JG', 'MID', 'AD', 'SUP'];
const PARTY_TYPES = ['전체', '자유랭크', '듀오랭크', '기타'];
// TIERS 배열은 더 이상 드롭다운에 사용되지 않으므로 제거합니다.
// const TIERS = ['UNRANKED', 'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER']; // 티어 목록

// 헬퍼 함수들
const handlePositionChange = (
  position: string,
  setCurrentPositions: Dispatch<SetStateAction<string[]>>
) => {
  setCurrentPositions(prevPositions => {
    if (position === 'ALL') return prevPositions.includes('ALL') ? [] : ['ALL'];
    const newPositions = prevPositions.filter(p => p !== 'ALL');
    return newPositions.includes(position) ? newPositions.filter(p => p !== position) : [...newPositions, position];
  });
};

const partyTypeColors: { [key: string]: string } = {
  '자유랭크': 'bg-blue-600', '듀오랭크': 'bg-purple-600', '기타': 'bg-teal-600',
};

const safeParseClient = (data: unknown): Member[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }
  return [];
};

export default function PartiesPage() {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState(''); // 새 파티 생성 시 사용
  const [filter, setFilter] = useState('전체');
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editingMemberEmail, setEditingMemberEmail] = useState<string | null>(null);
  const [editingPositions, setEditingPositions] = useState<string[]>([]);

  // --- 새로운 파티 생성 시 사용될 상태 ---
  const [newPartyRequiredTier, setNewPartyRequiredTier] = useState('');
  const [newPartyStartTime, setNewPartyStartTime] = useState('');

  // --- 파티 정보 수정 시 사용될 상태 ---
  const [editingPartyName, setEditingPartyName] = useState('');
  const [editingRequiredTier, setEditingRequiredTier] = useState('');
  const [editingStartTime, setEditingStartTime] = useState('');


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [partiesRes, usersRes, profileRes] = await Promise.all([
        fetch('/api/parties', { cache: 'no-store' }),
        fetch('/api/users', { cache: 'no-store' }),
        user ? fetch(`/api/users/${user.email}`, { cache: 'no-store' }) : Promise.resolve(null),
      ]);

      if (!partiesRes.ok) throw new Error('파티 정보를 불러오지 못했습니다.');
      if (!usersRes.ok) throw new Error('유저 정보를 불러오지 못했습니다.');

      const partiesData = await partiesRes.json();
      const usersData: { email: string; nickname: string }[] = await usersRes.json();

      const map: UserMap = {};
      usersData.forEach(u => { map[u.email] = u.nickname; });

      setParties(partiesData);
      setUserMap(map);

      if (profileRes && profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      } else {
        setProfile(null);
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


  const handleCreateParty = async (partyType: string) => {
    if (!newPartyName.trim() || !user || !user.email) {
      alert('파티 이름과 로그인 정보가 필요합니다.');
      return;
    }
    if ((partyType === '자유랭크' || partyType === '듀오랭크') && (!newPartyRequiredTier || newPartyRequiredTier.trim() === '')) {
        alert(`${partyType} 파티는 필수 티어를 입력해야 합니다.`);
        return;
    }

    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: newPartyName,
          creatorEmail: user.email,
          partyType,
          requiredTier: newPartyRequiredTier.trim(),
          startTime: newPartyStartTime.trim() || null,
        }),
      });
      if (res.ok) {
        setNewPartyName('');
        setCreateMode(null);
        setNewPartyRequiredTier('');
        setNewPartyStartTime('');
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.error || '파티 생성 실패');
      }
    } catch (error) {
      alert(`파티 생성에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  const handlePartyAction = async (partyId: string, action: 'join' | 'leave' | 'join_waitlist' | 'leave_waitlist') => {
    if (!user || !user.email) return;
    const party = parties.find(p => p.partyId === partyId);
    if ((action === 'join' || action === 'join_waitlist') && party?.partyType !== '기타' && selectedPositions.length === 0) {
      alert('하나 이상의 포지션을 선택해주세요.');
      return;
    }
    if (action === 'leave') {
      const members = party?.membersData ? safeParseClient(party.membersData) : [];
      if (members.length > 0 && members[0].email === user.email) {
        if (!confirm('파티장입니다. 정말로 파티를 나가시겠습니까? 다음 멤버에게 파티장이 위임됩니다.')) return;
      }
    }
    try {
      const positionsToSend = party?.partyType !== '기타' ? selectedPositions : [];
      const userData = { email: user.email, positions: positionsToSend };
      const res = await fetch('/api/parties', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId, userData, action }),
      });
      if (res.ok) {
        setSelectedPositions([]);
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.error || '작업에 실패했습니다.');
      }
    } catch (error: unknown) {
      if (error instanceof Error) alert(error.message);
    }
  };

  // 파티 이름, 티어, 시간 수정 또는 포지션 수정
  const handleUpdateParty = async (partyId: string, action: 'update_details' | 'update_positions') => {
    if (!user?.email) return;
    const body: { [key: string]: unknown } = { partyId, userEmail: user.email, action };

    if (action === 'update_positions') {
      if (editingPositions.length === 0) {
        alert('하나 이상의 포지션을 선택해주세요.');
        return;
      }
      body.newPositions = editingPositions;
    } else if (action === 'update_details') {
        if (!editingPartyName.trim()) {
            alert('파티 이름은 비워둘 수 없습니다.');
            return;
        }
        // 티어 유효성 검사 (랭크 파티 타입에만 해당)
        const partyToEdit = parties.find(p => p.partyId === partyId);
        if ((partyToEdit?.partyType === '자유랭크' || partyToEdit?.partyType === '듀오랭크') && !editingRequiredTier.trim()) {
            alert(`${partyToEdit?.partyType} 파티는 필수 티어를 입력해야 합니다.`);
            return;
        }

        body.newPartyName = editingPartyName.trim();
        body.newRequiredTier = editingRequiredTier.trim();
        body.newStartTime = editingStartTime.trim();
    }

    try {
      const res = await fetch('/api/parties', {
        method: 'PATCH', // PATCH method는 부분 업데이트에 적합
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '업데이트 실패');
      }
      // 수정 상태 초기화
      setEditingPartyId(null);
      setEditingMemberEmail(null);
      setEditingPartyName('');
      setEditingRequiredTier('');
      setEditingStartTime('');
      fetchData(); // 데이터 다시 불러오기
    } catch (error: unknown) {
      if (error instanceof Error) alert(error.message);
    }
  };

  const handleDisbandParty = async (partyId: string) => {
    if (!user || !user.email) return;
    if (confirm('정말로 이 파티를 해체하시겠습니까? 모든 멤버가 파티에서 제외됩니다.')) {
      try {
        const res = await fetch('/api/parties', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partyId, requesterEmail: user.email }),
        });
        if (res.ok) {
          alert('파티가 해체되었습니다.');
          fetchData();
        } else {
          const data = await res.json();
          throw new Error(data.error || '파티 해체 실패');
        }
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const filteredParties = filter === '전체' ? parties : parties.filter(p => p.partyType === filter);

  return (
    <main className="container mx-auto p-4 bg-gray-900 text-white min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-blue-400">파티 찾기</h1>
      </div>

      {user && (
        <div className="mb-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-bold mb-4 text-center">새로운 파티 만들기</h2>
          {createMode ? (
            <div className="flex flex-col items-center gap-4">
              <p className="font-semibold">{createMode} 파티 이름을 입력하세요:</p>
              <input type="text" value={newPartyName} onChange={(e) => setNewPartyName(e.target.value)} placeholder="함께 게임하실 분!" className="w-full max-w-md px-3 py-2 bg-gray-700 rounded-md" />

              {/* 자유랭크/듀오랭크일 경우 티어 입력 필드 */}
              {(createMode === '자유랭크' || createMode === '듀오랭크') && (
                <div className="w-full max-w-md">
                  <label htmlFor="requiredTier" className="block text-sm font-medium text-gray-300 mb-1">티어</label>
                  <input
                    id="requiredTier"
                    type="text" // 텍스트 입력으로 변경
                    value={newPartyRequiredTier}
                    onChange={(e) => setNewPartyRequiredTier(e.target.value)}
                    placeholder="예: 솔랭 플래 이상, 플에, 자랭 에메 이상" // 플레이스홀더 변경
                    className="w-full px-3 py-2 bg-gray-700 rounded-md"
                  />
                </div>
              )}

              {/* 파티 시작 시간 입력 필드 */}
              <div className="w-full max-w-md">
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-300 mb-1">시작 시간</label>
                <input
                  id="startTime"
                  type="text" // 텍스트 입력으로 변경
                  value={newPartyStartTime}
                  onChange={(e) => setNewPartyStartTime(e.target.value)}
                  placeholder="예: 20시, 지금, 모바시, 다음판" // 플레이스홀더 변경
                  className="w-full px-3 py-2 bg-gray-700 rounded-md"
                />
              </div>

              <div className="flex gap-4">
                <button onClick={() => handleCreateParty(createMode)} className="py-2 px-6 bg-green-600 hover:bg-green-700 rounded-md">생성</button>
                <button onClick={() => setCreateMode(null)} className="py-2 px-6 bg-gray-600 hover:bg-gray-500 rounded-md">취소</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center gap-4">
              <button onClick={() => setCreateMode('자유랭크')} className="py-2 px-6 bg-blue-600 hover:bg-blue-700 rounded-md">자유랭크</button>
              <button onClick={() => setCreateMode('듀오랭크')} className="py-2 px-6 bg-purple-600 hover:bg-purple-700 rounded-md">듀오랭크</button>
              <button onClick={() => setCreateMode('기타')} className="py-2 px-6 bg-teal-600 hover:bg-teal-700 rounded-md">기타 게임</button>
            </div>
          )}
        </div>
      )}

      <div className="mb-6 flex justify-center gap-2">
        {PARTY_TYPES.map(type => (
          <button key={type} onClick={() => setFilter(type)} className={`px-4 py-2 text-sm font-semibold rounded-full ${filter === type ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
            {type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? <p className="col-span-full text-center">로딩 중...</p> :
          filteredParties.map((party) => {
            const members = safeParseClient(party.membersData);
            const waiting = safeParseClient(party.waitingData);
            const leaderEmail = members.length > 0 ? members[0].email : '';
            const leaderNickname = userMap[leaderEmail] || leaderEmail.split('@')[0];
            const isLeader = user?.email === leaderEmail;
            const isMember = user?.email ? members.some(m => m.email === user.email) : false; // 파티 멤버인지 확인
            const isInWaitlist = user?.email ? waiting.some(w => w.email === user.email) : false;
            const isFull = members.length >= Number(party.maxMembers);
            const showPositions = party.partyType !== '기타';
            const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자';
            const canDisband = isAdmin || isLeader;

            // 시간 표시 형식 변환 (옵션)
            // startTime이 텍스트로 저장되므로, Date 객체로 변환 시도하지 않고 그대로 표시
            const displayTime = party.startTime && party.startTime.trim() !== '' ? party.startTime : '즉시 시작';


            return (
              <div key={party.partyId} className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-2"> {/* flex 추가 */}
                    <span className={`px-3 py-1 text-xs font-semibold text-white rounded-full ${partyTypeColors[party.partyType] || 'bg-gray-600'}`}>
                      {party.partyType}
                    </span>
                    {/* 티어 표시 (자유랭크/듀오랭크에만) */}
                    {(party.partyType === '자유랭크' || party.partyType === '듀오랭크') && party.requiredTier && party.requiredTier.trim() !== '' && (
                        <span className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded-full">
                            티어: {party.requiredTier}
                        </span>
                    )}
                    {/* 시간 표시 */}
                    <span className="ml-auto text-sm text-gray-400">
                        시간: {displayTime}
                    </span>
                  </div>

                  {/* 파티 이름, 티어, 시간 수정 UI */}
                  {editingPartyId === party.partyId ? (
                    <div className="space-y-2 mb-2 p-3 bg-gray-700 rounded-md">
                        <label htmlFor={`edit-name-${party.partyId}`} className="block text-sm font-medium text-gray-300">파티 이름:</label>
                        <input
                            id={`edit-name-${party.partyId}`}
                            type="text"
                            value={editingPartyName}
                            onChange={(e) => setEditingPartyName(e.target.value)}
                            className="w-full px-2 py-1 bg-gray-600 rounded-md"
                        />

                        {(party.partyType === '자유랭크' || party.partyType === '듀오랭크') && (
                            <>
                                <label htmlFor={`edit-tier-${party.partyId}`} className="block text-sm font-medium text-gray-300 mt-2">필요 티어:</label>
                                <input
                                    id={`edit-tier-${party.partyId}`}
                                    type="text" // 텍스트 입력으로 변경
                                    value={editingRequiredTier}
                                    onChange={(e) => setEditingRequiredTier(e.target.value)}
                                    placeholder="예: 다이아몬드 4, 골드 이상"
                                    className="w-full px-2 py-1 bg-gray-600 rounded-md"
                                />
                            </>
                        )}

                        <label htmlFor={`edit-time-${party.partyId}`} className="block text-sm font-medium text-gray-300 mt-2">시작 시간:</label>
                        <input
                            id={`edit-time-${party.partyId}`}
                            type="text" // 텍스트 입력으로 변경
                            value={editingStartTime}
                            onChange={(e) => setEditingStartTime(e.target.value)}
                            placeholder="예: 15시, 지금 바로"
                            className="w-full px-2 py-1 bg-gray-600 rounded-md"
                        />

                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => handleUpdateParty(party.partyId, 'update_details')}
                                className="bg-green-600 px-3 py-1 rounded-md text-sm"
                            >
                                저장
                            </button>
                            <button
                                onClick={() => {
                                    setEditingPartyId(null);
                                    setEditingPartyName('');
                                    setEditingRequiredTier('');
                                    setEditingStartTime('');
                                }}
                                className="bg-gray-600 px-3 py-1 rounded-md text-sm"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-2xl font-bold text-yellow-400 truncate">{party.partyName}</h2>
                        {/* 수정 버튼 권한 변경: isLeader -> isMember */}
                        {isMember && (
                            <button
                                onClick={() => {
                                    setEditingPartyId(party.partyId);
                                    setEditingPartyName(party.partyName);
                                    setEditingRequiredTier(party.requiredTier || '');
                                    setEditingStartTime(party.startTime || '');
                                }}
                                className="text-xs bg-gray-600 px-2 py-1 rounded-md"
                            >
                                수정
                            </button>
                        )}
                    </div>
                  )}
                  <p className="text-sm text-gray-400 mb-4">파티장: {leaderNickname}</p>

                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">참가 멤버 ({members.length} / {party.maxMembers})</h3>
                    <ul className="space-y-2 min-h-[140px]">
                      {members.map((member) => (
                        <li key={member.email} className="text-sm p-2 bg-gray-700/50 rounded-md">
                          {editingMemberEmail === member.email && showPositions ? (
                            <div>
                              <div className="flex justify-between items-center mb-2"><span className="font-bold">{userMap[member.email] || member.email}</span><div><button onClick={() => handleUpdateParty(party.partyId, 'update_positions')} className="bg-green-600 text-xs px-2 py-1 rounded">저장</button><button onClick={() => setEditingMemberEmail(null)} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">취소</button></div></div>
                              <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-600">{POSITIONS.map(pos => { const isSelected = editingPositions.includes(pos); const isDisabled = editingPositions.includes('ALL') && pos !== 'ALL'; return (<button key={pos} onClick={() => handlePositionChange(pos, setEditingPositions)} disabled={isDisabled} className={`px-2 py0.5 text-xs rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>); })}</div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <span>{userMap[member.email] || member.email}</span>
                              {showPositions && (
                                <div className="flex items-center gap-1">
                                  {member.positions.map(pos => (<span key={pos} className="bg-blue-500 px-2 py-0.5 text-xs rounded-full">{pos}</span>))}{user?.email === member.email && (<button onClick={() => { setEditingMemberEmail(member.email); setEditingPositions(member.positions); }} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">수정</button>)}
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">대기 멤버 ({waiting.length} / 5)</h3>
                    <ul className="space-y-2 min-h-[100px]">
                      {waiting.map((member, index) => (
                        <li key={index} className="flex justify-between items-center text-sm p-2 bg-gray-700/50 rounded-md">
                          <span>{userMap[member.email] || member.email}</span>
                          {showPositions && (
                            <div className="flex items-center gap-1">
                              {member.positions.map(pos => (
                                <span key={pos} className="bg-yellow-500 px-2 py-0.5 text-xs rounded-full">{pos}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  {!isMember && !isInWaitlist &&
                    <div>
                      {showPositions && <p className="text-sm text-center mb-2">참가/대기하려면 포지션을 선택하세요</p>}
                      {showPositions &&
                        <div className="flex flex-wrap gap-2 justify-center mb-2">
                          {POSITIONS.map(pos => { const isSelected = selectedPositions.includes(pos); const isDisabled = selectedPositions.includes('ALL') && pos !== 'ALL'; return (<button key={pos} onClick={() => handlePositionChange(pos, setSelectedPositions)} disabled={isDisabled} className={`px-3 py-1 text-sm rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>); })}
                        </div>
                      }
                    </div>
                  }
                  {user && (
                    <>
                      {isMember && <button onClick={() => handlePartyAction(party.partyId, 'leave')} className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 font-semibold rounded-md">파티 나가기</button>}
                      {isInWaitlist && <button onClick={() => handlePartyAction(party.partyId, 'leave_waitlist')} className="w-full py-2 px-4 bg-yellow-700 hover:bg-yellow-800 font-semibold rounded-md">대기열 나가기</button>}
                      {!isMember && !isInWaitlist && (
                        isFull ? (
                          <button onClick={() => handlePartyAction(party.partyId, 'join_waitlist')} className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-md disabled:bg-gray-500" disabled={waiting.length >= 5}>{waiting.length >= 5 ? '대기열이 가득 찼습니다' : '대기열 참가'}</button>
                        ) : (
                          <button onClick={() => handlePartyAction(party.partyId, 'join')} className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 font-semibold rounded-md">참가하기</button>
                        )
                      )}
                      {canDisband && (
                        <button
                          onClick={() => handleDisbandParty(party.partyId)}
                          className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 font-semibold rounded-md text-sm mt-2"
                        >
                          파티 해체
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>
    </main>
  );
}
