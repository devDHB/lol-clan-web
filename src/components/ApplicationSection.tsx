// src/components/ApplicationSection.tsx

'use client';

import { useState } from 'react';

// 부모로부터 받아올 타입들을 정의합니다. (실제 프로젝트에서는 별도 파일로 관리하는 것이 좋습니다)
interface Applicant { 
    email: string; 
    nickname: string; 
    tier: string; 
    positions: string[]; 
}

interface ScrimData { 
    scrimType: string; 
    applicants: Applicant[]; 
    waitlist: Applicant[]; 
}

interface RankedPosition { 
    name: string; 
    rank: number; 
}

interface User {
    email: string;
}

interface ActionPayload {
    tier?: string;
    positions?: string[];
    memberEmailToRemove?: string;
    nickname?: string;
}

interface ApplicationSectionProps {
    scrim: ScrimData;
    user: User | null;
    canManage: boolean;
    isApplicant: boolean;
    isInWaitlist: boolean;
    isFull: boolean;
    isWaitlistFull: boolean;
    handleScrimAction: (action: string, payload?: ActionPayload) => void;
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

export default function ApplicationSection({
    scrim, user, canManage, isApplicant, isInWaitlist, isFull, isWaitlistFull, handleScrimAction
}: ApplicationSectionProps) {

    // 신청 폼 관련 상태를 이 컴포넌트가 직접 관리합니다.
    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);

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
                // 이미 선택된 포지션을 클릭하면 제거
                newPositions = prev.filter(p => p.name !== posName);
            } else {
                // 3개 미만일 때만 새로 추가
                if (prev.length < 3) {
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

    const handleRankChange = (posName: string, newRank: number) => {
        setSelectedPositions(prev => {
            const targetPos = prev.find(p => p.name === posName);
            if (!targetPos) return prev;
            const existingRankedPos = prev.find(p => p.rank === newRank);
            const updatedPositions = prev.map(p => {
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

    const handleApply = (action: 'apply' | 'apply_waitlist') => {
        if (scrim.scrimType !== '칼바람') {
            if (!tier) return alert('티어를 선택해주세요.');
            if (selectedPositions.length === 0) return alert('포지션을 선택해주세요.');
        }
        const applicantData: ActionPayload = {
            tier: scrim.scrimType === '칼바람' ? 'U' : tier,
            positions: scrim.scrimType === '칼바람' ? [] : selectedPositions.map(p => `${p.name} (${p.rank}순위)`)
        };
        handleScrimAction(action, applicantData);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <section className="lg:col-span-1 bg-gray-800 p-6 rounded-lg h-fit">
                <h2 className="text-2xl font-bold mb-4">참가 신청</h2>
                {user ? (
                    (isApplicant || isInWaitlist) ? (
                        <div>
                            <p className="text-green-400 mb-4">{isApplicant ? '이미 참가 신청했습니다.' : '현재 대기열에 있습니다.'}</p>
                            <button onClick={() => handleScrimAction(isApplicant ? 'leave' : 'leave_waitlist')} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold">
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
                                </>
                            )}
                            {isFull ? (
                                <button onClick={() => handleApply('apply_waitlist')} disabled={isWaitlistFull} className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">
                                    {isWaitlistFull ? '대기열이 가득 찼습니다' : '대기열 참가'}
                                </button>
                            ) : (
                                <button onClick={() => handleApply('apply')} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded-md font-semibold">
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
                <h2 className="text-2xl font-bold mb-4">참가자 목록 ({scrim.applicants.length} / 10)</h2>
                <div className="space-y-2 mb-6">
                    {scrim.applicants.length > 0 ? (
                        scrim.applicants.map(applicant => (
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
                                            <span key={pos} className="bg-blue-500 text-xs px-2 py-1 rounded-full">
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
                    ) : (<p className="text-gray-400">아직 참가 신청자가 없습니다.</p>)}
                </div>
                <h2 className="text-2xl font-bold mb-4">대기자 목록 ({scrim.waitlist.length} / 10)</h2>
                <div className="space-y-2">
                    {scrim.waitlist.length > 0 ? (
                        scrim.waitlist.map(applicant => (
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
                    ) : (<p className="text-gray-400">아직 대기자가 없습니다.</p>)}
                </div>
            </section>
        </div>
    );
}