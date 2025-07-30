// src/components/ApplicationSection.tsx

'use client';

import { useState } from 'react';

// 부모로부터 받아올 타입들을 정의합니다. (실제 프로젝트에서는 별도 파일로 관리하는 것이 좋습니다)
interface Applicant { email: string; nickname: string; tier: string; positions: string[]; }
interface ScrimData { scrimType: string; applicants: Applicant[]; waitlist: Applicant[]; }
interface RankedPosition { name: string; rank: number; }

interface ApplicationSectionProps {
    scrim: ScrimData;
    user: any;
    canManage: boolean;
    isApplicant: boolean;
    isInWaitlist: boolean;
    isFull: boolean;
    isWaitlistFull: boolean;
    handleScrimAction: (action: string, payload?: any) => void;
}

const POSITIONS = ['TOP', 'JG', 'MID', 'AD', 'SUP'];
const TIERS = ['C', 'M', 'D', 'E', 'P', 'G', 'S', 'I', 'U'];

export default function ApplicationSection({
    scrim, user, canManage, isApplicant, isInWaitlist, isFull, isWaitlistFull, handleScrimAction
}: ApplicationSectionProps) {

    // 신청 폼 관련 상태를 이 컴포넌트가 직접 관리합니다.
    const [tier, setTier] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<RankedPosition[]>([]);

    const handlePositionClick = (posName: string) => { /* 이전과 동일한 로직 */ };
    const handleRankChange = (posName: string, newRank: number) => { /* 이전과 동일한 로직 */ };

    const handleApply = (action: 'apply' | 'apply_waitlist') => {
        if (scrim.scrimType !== '칼바람') {
            if (!tier) return alert('티어를 선택해주세요.');
            if (selectedPositions.length === 0) return alert('포지션을 선택해주세요.');
        }
        const applicantData = {
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
                                        {/* 포지션 선택 UI */}
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
                                {/* 참가자 정보 표시 */}
                            </div>
                        ))
                    ) : (<p className="text-gray-400">아직 참가 신청자가 없습니다.</p>)}
                </div>
                <h2 className="text-2xl font-bold mb-4">대기자 목록 ({scrim.waitlist.length} / 10)</h2>
                <div className="space-y-2">
                    {scrim.waitlist.length > 0 ? (
                        scrim.waitlist.map(applicant => (
                            <div key={applicant.email} className="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                                {/* 대기자 정보 표시 */}
                            </div>
                        ))
                    ) : (<p className="text-gray-400">아직 대기자가 없습니다.</p>)}
                </div>
            </section>
        </div>
    );
}