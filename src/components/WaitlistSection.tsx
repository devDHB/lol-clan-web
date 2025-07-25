// src/components/WaitlistSection.tsx

'use client';

import { useState } from 'react';

// 부모 컴포넌트로부터 받아올 데이터(props)의 타입을 정의합니다.
interface Applicant {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
}

interface ScrimData {
    scrimType: string;
    waitlist: Applicant[];
}

interface RankedPosition {
    name: string;
    rank: number;
}

type ScrimAction = "apply" | "leave" | "apply_waitlist" | "leave_waitlist" | "start_team_building" | "start_game" | "end_game" | "reset_to_team_building" | "reset_to_recruiting" | "remove_member" | "reset_peerless";


interface WaitlistSectionProps {
    scrim: ScrimData;
    user: any; // 실제 User 타입으로 교체하는 것이 좋습니다 (예: User | null)
    canManage: boolean;
    isApplicant: boolean;
    isInWaitlist: boolean;
    isWaitlistFull: boolean;
    handleScrimAction: (action: ScrimAction, payload?: any) => void;
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

export default function WaitlistSection({
    scrim,
    user,
    canManage,
    isApplicant,
    isInWaitlist,
    isWaitlistFull,
    handleScrimAction
}: WaitlistSectionProps) {

    // 대기열 신청 폼 관련 상태들을 이 컴포넌트가 직접 관리합니다.
    const [showWaitlistForm, setShowWaitlistForm] = useState(false);
    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);

    // 포지션 선택/랭크 변경 핸들러 (ScrimDetailPage에서 가져옴)
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

    // 부모의 handleScrimAction을 호출하기 전, 데이터를 정리하는 함수
    const handleApplyToWaitlist = () => {
        if (scrim.scrimType !== '칼바람') {
            if (!tier) return alert('티어를 선택해주세요.');
            if (selectedPositions.length === 0) return alert('포지션을 선택해주세요.');
        }

        const applicantData = {
            tier: scrim.scrimType === '칼바람' ? 'U' : tier,
            positions: scrim.scrimType === '칼바람' ? [] : selectedPositions.map(p => `${p.name} (${p.rank}순위)`)
        };

        // 부모로부터 받은 함수를 호출
        handleScrimAction('apply_waitlist', applicantData);

        // 폼 닫기 및 상태 초기화
        setShowWaitlistForm(false);
        setTier('');
        setSelectedPositions([]);
    };


    return (
        <div className="mt-8 pt-6 border-t border-gray-700">
            <h3 className="text-2xl font-bold mb-4 text-center text-yellow-400">
                대기자 목록 ({scrim.waitlist.length} / 10)
            </h3>

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

                            {/* 티어 선택 */}
                            <div>
                                <label htmlFor="tier-waitlist" className="block text-sm font-medium text-gray-300 mb-1">현재 티어</label>
                                <select id="tier-waitlist" value={tier} onChange={(e) => setTier(e.target.value)} className="w-full px-3 py-2 bg-gray-800 rounded-md">
                                    <option value="" disabled>티어를 선택하세요</option>
                                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            {/* 포지션 선택 */}
                            <div>
                                <p className="text-sm font-medium text-gray-300 mb-2">희망 포지션 (ALL 또는 최대 3개, 순위 지정)</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <button onClick={() => handlePositionClick('ALL')} className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === 'ALL') ? 'bg-green-500' : 'bg-gray-600'}`}>
                                        ALL
                                    </button>
                                    <div className="w-full border-t border-gray-600 my-2"></div>
                                    {POSITIONS.map(pos => (
                                        <button key={pos} onClick={() => handlePositionClick(pos)} disabled={selectedPositions.some(p => p.name === 'ALL') || (selectedPositions.length >= 3 && !selectedPositions.some(p => p.name === pos))} className={`px-3 py-1 text-sm rounded-full ${selectedPositions.some(p => p.name === pos) ? 'bg-blue-500' : 'bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                                {selectedPositions.length > 0 && !selectedPositions.some(p => p.name === 'ALL') && (
                                    <div className="space-y-2 mt-4">
                                        <p className="text-sm font-medium text-gray-300">선택된 포지션 순위 지정:</p>
                                        {selectedPositions.map((p) => (
                                            <div key={p.name} className="flex items-center gap-2 bg-gray-800 p-2 rounded-md">
                                                <span className="font-semibold text-white">{p.name}</span>
                                                <select value={p.rank} onChange={(e) => handleRankChange(p.name, parseInt(e.target.value))} className="ml-auto px-2 py-1 bg-gray-600 rounded-md text-white">
                                                    {[...Array(selectedPositions.length)].map((_, i) => (
                                                        <option key={i + 1} value={i + 1}>{i + 1} 순위</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button onClick={handleApplyToWaitlist} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
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
                                    setTier('');
                                    setSelectedPositions([]);
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

            <div className="space-y-2 max-w-2xl mx-auto">
                {scrim.waitlist.length > 0 ? (
                    scrim.waitlist.map((applicant) => (
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
    );
}