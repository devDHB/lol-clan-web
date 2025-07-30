'use client';

import { useEffect, useState, Dispatch, SetStateAction, useCallback, Fragment } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';
import { Transition, Dialog } from '@headlessui/react';
import ProtectedRoute from '@/components/ProtectedRoute';

// --- 타입 정의 ---
interface Member {
  email: string;
  positions: string[];
}

interface Party {
  partyId: string;
  partyType: '자유랭크' | '솔로/듀오랭크' | '기타';
  partyName: string;
  membersData: Member[];
  waitingData: Member[];
  createdAt: string;
  maxMembers: number;
  requiredTier?: string;
  startTime?: string | null;
  playStyle?: '즐겜' | '빡겜';
}

interface UserProfile {
  role: string;
}

interface UserMap {
  [email: string]: string;
}

interface AuthUser {
  email: string | null;
}

interface UpdatePartyData {
  newPartyName?: string;
  newRequiredTier?: string;
  newStartTime?: string;
  newPlayStyle?: '즐겜' | '빡겜';
  newPositions?: string[];
}

const POSITIONS = ['ALL', 'TOP', 'JG', 'MID', 'AD', 'SUP'];
const PARTY_TYPES = ['전체', '자유랭크', '솔로/듀오랭크', '기타'];

// --- 헬퍼 함수 및 스타일 ---
const partyTypeStyles: { [key: string]: { bg: string; text: string; border: string; } } = {
  '자유랭크': { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30' },
  '솔로/듀오랭크': { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
  '기타': { bg: 'bg-teal-500/20', text: 'text-teal-300', border: 'border-teal-500/30' },
};

const playStyleStyles: { [key: string]: { bg: string; text: string; border: string; } } = {
  '즐겜': { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
  '빡겜': { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
};

const requiredTierStyles = {
  bg: 'bg-orange-500/20',
  text: 'text-orange-300',
  border: 'border-orange-500/30',
};

const activeFilterStyles: { [key: string]: string } = {
  '전체': 'bg-white text-gray-900',
  '자유랭크': 'bg-blue-500 text-white',
  '솔로/듀오랭크': 'bg-purple-500 text-white',
  '기타': 'bg-teal-500 text-white',
};

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

// --- 서브 컴포넌트들 ---

// 파티 생성 모달
function CreatePartyModal({ isOpen, setIsOpen, handleCreateParty, initialPartyType }: {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  handleCreateParty: (partyType: '자유랭크' | '솔로/듀오랭크' | '기타', name: string, tier: string, style: '즐겜' | '빡겜', time: string) => void;
  initialPartyType: '자유랭크' | '솔로/듀오랭크' | '기타';
}) {
  const [partyName, setPartyName] = useState('');
  const [requiredTier, setRequiredTier] = useState('');
  const [playStyle, setPlayStyle] = useState<'즐겜' | '빡겜'>('즐겜');
  const [startTime, setStartTime] = useState('');

  const handleSubmit = () => {
    handleCreateParty(initialPartyType, partyName, requiredTier, playStyle, startTime);
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
      setPartyName('');
      setRequiredTier('');
      setPlayStyle('즐겜');
      setStartTime('');
    }
  }, [isOpen]);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => setIsOpen(false)}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all border border-gray-700">
                <Dialog.Title as="h3" className="text-2xl font-bold leading-6 text-yellow-400 mb-4">
                  {initialPartyType} 파티 만들기
                </Dialog.Title>
                <div className="mt-4 space-y-4">
                  <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="파티 이름" className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  {initialPartyType !== '기타' && (
                    <>
                      <input type="text" value={requiredTier} onChange={(e) => setRequiredTier(e.target.value)} placeholder="필요 티어 (예: 플래 이상)" className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                      <div>
                        <label className="text-sm font-medium text-gray-300">유형</label>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => setPlayStyle('즐겜')} className={`w-1/2 py-2 rounded transition-colors ${playStyle === '즐겜' ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}>즐겜</button>
                          <button onClick={() => setPlayStyle('빡겜')} className={`w-1/2 py-2 rounded transition-colors ${playStyle === '빡겜' ? 'bg-red-600' : 'bg-gray-600 hover:bg-gray-500'}`}>빡겜</button>
                        </div>
                      </div>
                    </>
                  )}
                  <input type="text" value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="시작 시간 (예: 20시, 지금)" className="w-full px-3 py-2 bg-gray-700 text-gray-200 placeholder-gray-400 rounded-md border border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                </div>
                <div className="mt-6 flex justify-end gap-4">
                  <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md hover:bg-gray-500">취소</button>
                  <button type="button" onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">생성하기</button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// 파티 카드
function PartyCard({ party, user, userMap, profile, handlePartyAction, handleUpdateParty, handleDisbandParty }: {
  party: Party;
  user: AuthUser | null;
  userMap: UserMap;
  profile: UserProfile | null;
  handlePartyAction: (partyId: string, action: 'join' | 'leave' | 'join_waitlist' | 'leave_waitlist', positions?: string[]) => void;
  handleUpdateParty: (partyId: string, action: 'update_details' | 'update_positions', data: UpdatePartyData) => void;
  handleDisbandParty: (partyId: string) => void;
}) {
  const [selectedPositions, setSelectedPositions] = useState<string[]>(['ALL']);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editingPartyName, setEditingPartyName] = useState('');
  const [editingRequiredTier, setEditingRequiredTier] = useState('');
  const [editingStartTime, setEditingStartTime] = useState('');
  const [editingPlayStyle, setEditingPlayStyle] = useState<'즐겜' | '빡겜'>('즐겜');
  const [editingMemberEmail, setEditingMemberEmail] = useState<string | null>(null);
  const [editingPositions, setEditingPositions] = useState<string[]>([]);

  const members = party.membersData as Member[];
  const waiting = party.waitingData as Member[];
  const leader = members[0];
  const isMember = user?.email ? members.some(m => m.email === user.email) : false;
  const isInWaitlist = user?.email ? waiting.some(w => w.email === user.email) : false;
  const isFull = members.length >= party.maxMembers;
  const isAdmin = profile?.role === '총관리자' || profile?.role === '관리자';
  const canModifyDetails = isAdmin || isMember;
  const canDisband = isAdmin || (user?.email && user.email === leader.email);
  const typeStyle = partyTypeStyles[party.partyType] || {};

  return (
    <div className={`bg-gray-800 border ${typeStyle.border || 'border-gray-700'} rounded-lg shadow-lg flex flex-col h-full p-4`}>
      <div className="flex-grow">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>{party.partyType}</span>
            {party.requiredTier && <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${requiredTierStyles.bg} ${requiredTierStyles.text} ${requiredTierStyles.border}`}>{party.requiredTier}</span>}
            {party.playStyle && <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${playStyleStyles[party.playStyle].bg} ${playStyleStyles[party.playStyle].text} ${playStyleStyles[party.playStyle].border}`}>{party.playStyle}</span>}
          </div>
          <span className="text-sm text-gray-400 flex-shrink-0">⏰ {party.startTime || '즉시 시작'}</span>
        </div>

        {editingPartyId === party.partyId ? (
          <div className="space-y-2 mb-2 p-3 bg-gray-700 rounded-md">
            <input type="text" value={editingPartyName} onChange={(e) => setEditingPartyName(e.target.value)} className="w-full px-2 py-1 bg-gray-600 rounded-md" placeholder="파티 이름" />
            {(party.partyType === '자유랭크' || party.partyType === '솔로/듀오랭크') && (
              <>
                <input type="text" value={editingRequiredTier} onChange={(e) => setEditingRequiredTier(e.target.value)} className="w-full px-2 py-1 bg-gray-600 rounded-md mt-2" placeholder="필요 티어" />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditingPlayStyle('즐겜')} className={`w-1/2 py-1 rounded ${editingPlayStyle === '즐겜' ? 'bg-green-600' : 'bg-gray-500'}`}>즐겜</button>
                  <button onClick={() => setEditingPlayStyle('빡겜')} className={`w-1/2 py-1 rounded ${editingPlayStyle === '빡겜' ? 'bg-red-600' : 'bg-gray-500'}`}>빡겜</button>
                </div>
              </>
            )}
            <input type="text" value={editingStartTime} onChange={(e) => setEditingStartTime(e.target.value)} className="w-full px-2 py-1 bg-gray-600 rounded-md mt-2" placeholder="시작 시간" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { handleUpdateParty(party.partyId, 'update_details', { newPartyName: editingPartyName, newRequiredTier: editingRequiredTier, newStartTime: editingStartTime, newPlayStyle: editingPlayStyle }); setEditingPartyId(null); }} className="bg-green-600 px-3 py-1 rounded-md text-sm">저장</button>
              <button onClick={() => setEditingPartyId(null)} className="bg-gray-600 px-3 py-1 rounded-md text-sm">취소</button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl font-bold text-yellow-400 truncate pr-2">{party.partyName}</h2>
            {canModifyDetails && (<button onClick={() => { setEditingPartyId(party.partyId); setEditingPartyName(party.partyName); setEditingRequiredTier(party.requiredTier || ''); setEditingStartTime(party.startTime || ''); setEditingPlayStyle(party.playStyle || '즐겜'); }} className="text-xs bg-gray-600 px-2 py-1 rounded-md flex-shrink-0">수정</button>)}
          </div>
        )}

        <p className="text-sm text-gray-400 mb-4">파티장: {userMap[leader.email] || leader.email.split('@')[0]}</p>

        <h3 className="font-semibold mb-2 text-gray-300">참가 멤버 ({members.length} / {party.maxMembers})</h3>
        <div className="space-y-2 mb-4">
          {members.map((member) => (
            <li key={member.email} className="text-sm p-2 bg-gray-700/50 rounded-md list-none">
              {editingMemberEmail === member.email ? (
                <div>
                  <div className="flex justify-between items-center mb-2"><span className="font-bold">{userMap[member.email] || member.email}</span><div><button onClick={() => { handleUpdateParty(party.partyId, 'update_positions', { newPositions: editingPositions }); setEditingMemberEmail(null); }} className="bg-green-600 text-xs px-2 py-1 rounded">저장</button><button onClick={() => setEditingMemberEmail(null)} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">취소</button></div></div>
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-600">{POSITIONS.map(pos => { const isSelected = editingPositions.includes(pos); const isDisabled = editingPositions.includes('ALL') && pos !== 'ALL'; return (<button key={pos} onClick={() => handlePositionChange(pos, setEditingPositions)} disabled={isDisabled} className={`px-2 py-0.5 text-xs rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>); })}</div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span>{userMap[member.email] || member.email}</span>
                  {party.partyType !== '기타' && (
                    <div className="flex items-center gap-1">
                      {member.positions.map(pos => (<span key={pos} className="bg-blue-500 px-2 py-0.5 text-xs rounded-full">{pos}</span>))}
                      {user?.email === member.email && (<button onClick={() => { setEditingMemberEmail(member.email); setEditingPositions(member.positions); }} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">수정</button>)}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-gray-700/50">
        {!isMember && !isInWaitlist && party.partyType !== '기타' && (
          <div className="mb-2">
            <p className="text-sm text-center mb-2">참가 포지션 선택</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {POSITIONS.map(pos => {
                const isSelected = selectedPositions.includes(pos);
                const isDisabled = selectedPositions.includes('ALL') && pos !== 'ALL';
                return (<button key={pos} onClick={() => handlePositionChange(pos, setSelectedPositions)} disabled={isDisabled} className={`px-3 py-1 text-sm rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>);
              })}
            </div>
          </div>
        )}
        {user?.email && (
          <div className="space-y-2">
            {isMember && <button onClick={() => handlePartyAction(party.partyId, 'leave')} className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 font-semibold rounded-md">파티 나가기</button>}
            {isInWaitlist && <button onClick={() => handlePartyAction(party.partyId, 'leave_waitlist')} className="w-full py-2 px-4 bg-yellow-700 hover:bg-yellow-800 font-semibold rounded-md">대기열 나가기</button>}
            {!isMember && !isInWaitlist && (
              isFull ? (
                <button onClick={() => handlePartyAction(party.partyId, 'join_waitlist', selectedPositions)} className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-md disabled:bg-gray-500" disabled={waiting.length >= 5}>{waiting.length >= 5 ? '대기열 꽉 참' : '대기열 참가'}</button>
              ) : (
                <button onClick={() => handlePartyAction(party.partyId, 'join', selectedPositions)} className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 font-semibold rounded-md">참가하기</button>
              )
            )}
            {canDisband && <button onClick={() => handleDisbandParty(party.partyId)} className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 font-semibold rounded-md text-sm mt-2">파티 해체</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// --- 메인 페이지 컴포넌트 ---
export default function PartiesPage() {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('전체');
  const [createMode, setCreateMode] = useState<'자유랭크' | '솔로/듀오랭크' | '기타' | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [partiesRes, usersRes] = await Promise.all([
        fetch('/api/parties', { cache: 'no-store' }),
        fetch('/api/users', { cache: 'no-store' })
      ]);

      if (!partiesRes.ok) throw new Error('파티 정보를 불러오지 못했습니다.');
      if (!usersRes.ok) throw new Error('유저 정보를 불러오지 못했습니다.');

      const partiesData = await partiesRes.json();
      const usersData: { email: string; nickname: string }[] = await usersRes.json();

      const map: UserMap = {};
      usersData.forEach(u => { map[u.email] = u.nickname; });

      setParties(partiesData);
      setUserMap(map);

      if (user) {
        const profileRes = await fetch(`/api/users/${user.email}`, { cache: 'no-store' });
        if (profileRes.ok) {
          setProfile(await profileRes.json());
        }
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

  const handleCreateParty = async (partyType: '자유랭크' | '솔로/듀오랭크' | '기타', name: string, tier: string, style: '즐겜' | '빡겜', time: string) => {
    if (!name.trim() || !user?.email) {
      alert('파티 이름과 로그인 정보가 필요합니다.');
      return;
    }
    if ((partyType === '자유랭크' || partyType === '솔로/듀오랭크') && !tier.trim()) {
      alert(`${partyType} 파티는 필수 티어를 입력해야 합니다.`);
      return;
    }
    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: name,
          creatorEmail: user.email,
          partyType,
          requiredTier: tier.trim(),
          startTime: time.trim() || null,
          playStyle: style,
        }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.error || '파티 생성 실패');
      }
    } catch (error) {
      alert(`파티 생성에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  const handlePartyAction = async (partyId: string, action: 'join' | 'leave' | 'join_waitlist' | 'leave_waitlist', positions: string[] = ['ALL']) => {
    if (!user?.email) return;

    const party = parties.find(p => p.partyId === partyId);
    if ((action === 'join' || action === 'join_waitlist') && party?.partyType !== '기타' && positions.length === 0) {
      alert('하나 이상의 포지션을 선택해주세요.');
      return;
    }

    try {
      const userData = { email: user.email, positions };
      const res = await fetch('/api/parties', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId, userData, action }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.error || '작업에 실패했습니다.');
      }
    } catch (error) {
      if (error instanceof Error) alert(error.message);
    }
  };

  const handleUpdateParty = async (partyId: string, action: 'update_details' | 'update_positions', data: UpdatePartyData) => {
    if (!user?.email) return;

    const body = { partyId, userEmail: user.email, action, ...data };

    try {
      const res = await fetch('/api/parties', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resData = await res.json();
        throw new Error(resData.error || '업데이트 실패');
      }
      fetchData();
    } catch (error) {
      if (error instanceof Error) alert(error.message);
    }
  };

  const handleDisbandParty = async (partyId: string) => {
    if (!user?.email) return;
    if (confirm('정말로 이 파티를 해체하시겠습니까?')) {
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
      } catch (error) {
        if (error instanceof Error) {
          alert(error.message);
        } else {
          alert('알 수 없는 오류가 발생했습니다.');
        }
      }
    }
  };

  const filteredParties = filter === '전체' ? parties : parties.filter(p => p.partyType === filter);

  if (loading) return <main className="flex justify-center items-center min-h-screen bg-gray-900 text-white">파티 목록을 불러오는 중...</main>;

  return (
    <ProtectedRoute>
      <main className="container mx-auto p-4 md:p-8 bg-gray-900 text-white min-h-screen">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold text-blue-400">파티 찾기</h1>
          {user?.email && (
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setCreateMode('자유랭크')} className="py-2 px-5 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">+ 자유랭크</button>
              <button onClick={() => setCreateMode('솔로/듀오랭크')} className="py-2 px-5 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold">+ 솔로/듀오랭크</button>
              <button onClick={() => setCreateMode('기타')} className="py-2 px-5 bg-teal-600 hover:bg-teal-700 rounded-md font-semibold">+ 기타</button>
            </div>
          )}
        </div>

        {createMode && (
          <CreatePartyModal
            isOpen={createMode !== null}
            setIsOpen={() => setCreateMode(null)}
            handleCreateParty={handleCreateParty}
            initialPartyType={createMode}
          />
        )}

        <div className="mb-6 flex justify-center gap-2">
          {PARTY_TYPES.map(type => (
            <button key={type} onClick={() => setFilter(type)} className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${filter === type ? activeFilterStyles[type] : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {type}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredParties.length > 0 ? (
            filteredParties.map((party) => (
              <PartyCard
                key={party.partyId}
                party={party}
                user={user}
                userMap={userMap}
                profile={profile}
                handlePartyAction={handlePartyAction}
                handleUpdateParty={handleUpdateParty}
                handleDisbandParty={handleDisbandParty}
              />
            ))
          ) : (
            <div className="col-span-full p-10 text-center text-gray-400 bg-gray-800 rounded-lg">
              <p>현재 모집 중인 파티가 없습니다.</p>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}