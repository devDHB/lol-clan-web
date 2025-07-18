'use client';

import { useEffect, useState, Dispatch, SetStateAction } from 'react';
import { useAuth } from '@/components/AuthProvider';

// 타입 정의
interface Member {
  email: string;
  positions: string[];
}

interface Party {
  partyId: string;
  partyType: string;
  partyName: string;
  membersData: string;
  waitingData: string;
  createdAt: string;
  maxMembers: string;
}

const POSITIONS = ['ALL', 'TOP', 'JG', 'MID', 'AD', 'SUP'];
const PARTY_TYPES = ['전체', '자유랭크', '듀오랭크', '기타'];

// 포지션 선택 로직을 별도의 함수로 분리
const handlePositionChange = (
  position: string,
  setCurrentPositions: Dispatch<SetStateAction<string[]>>
) => {
  setCurrentPositions(prevPositions => {
    if (position === 'ALL') {
      return prevPositions.includes('ALL') ? [] : ['ALL'];
    }
    let newPositions = prevPositions.filter(p => p !== 'ALL');
    if (newPositions.includes(position)) {
      return newPositions.filter(p => p !== position);
    } else {
      return [...newPositions, position];
    }
  });
};

// 파티 타입별 색상을 정의하는 객체
const partyTypeColors: { [key: string]: string } = {
  '자유랭크': 'bg-blue-600',
  '듀오랭크': 'bg-purple-600',
  '기타': 'bg-teal-600',
};

export default function PartiesPage() {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState('');
  const [filter, setFilter] = useState('전체');
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editingMemberEmail, setEditingMemberEmail] = useState<string | null>(null);
  const [editingPositions, setEditingPositions] = useState<string[]>([]);

  const fetchParties = async () => {
    try {
      const res = await fetch('/api/parties', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setParties(data);
    } catch (error) {
      console.error("Failed to fetch parties:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, []);

  const handleCreateParty = async (partyType: string) => {
    if (!newPartyName.trim() || !user || !user.email) {
      alert('파티 이름을 입력하고 로그인해야 합니다.');
      return;
    }
    try {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyName: newPartyName, creatorEmail: user.email, partyType }),
      });
      if (res.ok) {
        setNewPartyName('');
        setCreateMode(null);
        fetchParties();
      } else { throw new Error('파티 생성 실패'); }
    } catch (error) {
      alert('파티 생성에 실패했습니다.');
    }
  };

  const handlePartyAction = async (partyId: string, action: 'join' | 'leave' | 'join_waitlist' | 'leave_waitlist') => {
    if (!user || !user.email) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    const party = parties.find(p => p.partyId === partyId);
    if ((action === 'join' || action === 'join_waitlist') && party?.partyType !== '기타' && selectedPositions.length === 0) {
      alert('하나 이상의 포지션을 선택해주세요.');
      return;
    }
    if (action === 'leave') {
      const members: Member[] = party?.membersData ? JSON.parse(party.membersData) : [];
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
        fetchParties();
      } else {
        const data = await res.json();
        throw new Error(data.error || '작업에 실패했습니다.');
      }
    } catch (error: any) {
      alert(error.message);
    }
  };
  
  const handleUpdateParty = async (partyId: string, action: 'update_name' | 'update_positions') => {
      if (!user?.email) return;
      let body: any = { partyId, userEmail: user.email, action };
      if (action === 'update_name') {
          if (!newPartyName.trim()) return;
          body.newPartyName = newPartyName;
      } else if (action === 'update_positions') {
          if (editingPositions.length === 0) return;
          body.newPositions = editingPositions;
      }
      try {
          const res = await fetch('/api/parties', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
          });
          if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || '업데이트 실패');
          }
          setEditingPartyId(null);
          setEditingMemberEmail(null);
          fetchParties();
      } catch (error: any) {
          alert(error.message);
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
              <input type="text" value={newPartyName} onChange={(e) => setNewPartyName(e.target.value)} placeholder="예: 함께할 분 구해요!" className="w-full max-w-md px-3 py-2 bg-gray-700 rounded-md"/>
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
          filteredParties.length > 0 ? (
            filteredParties.map((party: Party) => {
              let members: Member[] = []; try { members = party.membersData ? JSON.parse(party.membersData) : []; } catch (e) {}
              let waiting: Member[] = []; try { waiting = party.waitingData ? JSON.parse(party.waitingData) : []; } catch (e) {}
              
              const leader = members.length > 0 ? members[0].email : '알 수 없음';
              const isLeader = user?.email === leader;
              const isMember = user?.email ? members.some(m => m.email === user.email) : false;
              const isInWaitlist = user?.email ? waiting.some(w => w.email === user.email) : false;
              const isFull = members.length >= Number(party.maxMembers);
              const showPositions = party.partyType !== '기타';
              
              return (
                <div key={party.partyId} className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col justify-between">
                  <div>
                    <div className="mb-3">
                      <span className={`px-3 py-1 text-xs font-semibold text-white rounded-full ${partyTypeColors[party.partyType] || 'bg-gray-600'}`}>
                        {party.partyType}
                      </span>
                    </div>

                    {editingPartyId === party.partyId ? (
                      <div className="flex gap-2 mb-2"><input type="text" value={newPartyName} onChange={(e) => setNewPartyName(e.target.value)} className="flex-grow px-2 py-1 bg-gray-700 rounded-md" /><button onClick={() => handleUpdateParty(party.partyId, 'update_name')} className="bg-green-600 px-3 rounded-md">저장</button><button onClick={() => setEditingPartyId(null)} className="bg-gray-600 px-3 rounded-md">취소</button></div>
                    ) : (
                      <div className="flex justify-between items-center mb-2"><h2 className="text-2xl font-bold text-yellow-400 truncate">{party.partyName}</h2>{isLeader && (<button onClick={() => { setEditingPartyId(party.partyId); setNewPartyName(party.partyName);}} className="text-xs bg-gray-600 px-2 py-1 rounded-md">수정</button>)}</div>
                    )}
                    <p className="text-sm text-gray-400 mb-4">파티장: {leader}</p>
                    
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">참가 멤버 ({members.length} / {party.maxMembers})</h3>
                      <ul className="space-y-2 min-h-[140px]">
                        {members.length > 0 ? members.map((member) => (
                          <li key={member.email} className="text-sm p-2 bg-gray-700/50 rounded-md">
                            {editingMemberEmail === member.email && showPositions ? (
                              <div>
                                <div className="flex justify-between items-center mb-2"><span className="font-bold">{member.email}</span><div><button onClick={() => handleUpdateParty(party.partyId, 'update_positions')} className="bg-green-600 text-xs px-2 py-1 rounded">저장</button><button onClick={() => setEditingMemberEmail(null)} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">취소</button></div></div>
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-600">{POSITIONS.map(pos => { const isSelected = editingPositions.includes(pos); const isDisabled = editingPositions.includes('ALL') && pos !== 'ALL'; return (<button key={pos} onClick={() => handlePositionChange(pos, setEditingPositions)} disabled={isDisabled} className={`px-2 py-0.5 text-xs rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>);})}</div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <span>{member.email}</span>
                                {showPositions && (
                                  <div className="flex items-center gap-1">
                                    {member.positions.map(pos => (<span key={pos} className="bg-blue-500 px-2 py-0.5 text-xs rounded-full">{pos}</span>))}{user?.email === member.email && (<button onClick={() => { setEditingMemberEmail(member.email); setEditingPositions(member.positions); }} className="bg-gray-600 text-xs px-2 py-1 rounded ml-1">수정</button>)}
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        )) : <p className="text-sm text-gray-500 p-2">참가 멤버가 없습니다.</p>}
                      </ul>
                    </div>
        
                    {/* --- 대기 멤버 UI 수정 --- */}
                    <div className="mb-4">
                      <h3 className="font-semibold mb-2">대기 멤버 ({waiting.length} / 5)</h3>
                      <ul className="space-y-2 min-h-[100px]">
                         {waiting.length > 0 ? waiting.map((member, index) => (
                          <li key={index} className="flex justify-between items-center text-sm p-2 bg-gray-700/50 rounded-md">
                            <span>{member.email}</span>
                            {showPositions && (
                              <div className="flex items-center gap-1">
                                {member.positions.map(pos => (
                                  <span key={pos} className="bg-yellow-500 px-2 py-0.5 text-xs rounded-full">{pos}</span>
                                ))}
                              </div>
                            )}
                          </li>
                        )) : <p className="text-sm text-gray-500 p-2">대기 멤버가 없습니다.</p>}
                      </ul>
                    </div>
                    {/* --- 수정 끝 --- */}
                  </div>
                  
                  <div className="mt-6 space-y-2">
                    {!isMember && !isInWaitlist &&
                      <div>
                          {showPositions && <p className="text-sm text-center mb-2">참가/대기하려면 포지션을 선택하세요</p>}
                          {showPositions &&
                            <div className="flex flex-wrap gap-2 justify-center mb-2">
                                {POSITIONS.map(pos => { const isSelected = selectedPositions.includes(pos); const isDisabled = selectedPositions.includes('ALL') && pos !== 'ALL'; return (<button key={pos} onClick={() => handlePositionChange(pos, setSelectedPositions)} disabled={isDisabled} className={`px-3 py-1 text-sm rounded-full ${isSelected ? 'bg-green-500' : 'bg-gray-600'} ${isDisabled ? 'opacity-50' : ''}`}>{pos}</button>);})}
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
                      </>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="col-span-full text-center">현재 생성된 파티가 없습니다.</p>
          )}
      </div>
    </main>
  );
}
