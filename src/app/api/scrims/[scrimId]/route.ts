import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 타입 정의
interface Applicant {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
    champion?: string;
}

// 권한 확인 함수
async function checkAdminPermission(email: string): Promise<boolean> {
    try {
        const userDoc = await db.collection('users').where('email', '==', email).limit(1).get();
        if (userDoc.empty) return false;
        const userData = userDoc.docs[0].data();
        return userData?.role === '총관리자' || userData?.role === '관리자';
    } catch (error) {
        console.error('관리자 권한 확인 중 에러 발생:', error);
        return false;
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId) ? resolvedParams.scrimId[0] : resolvedParams.scrimId;

        if (!scrimId) {
            return NextResponse.json({ error: '내전 ID가 필요합니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);
        const doc = await scrimRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = doc.data();
        const createdAt = data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
        const startTime = data?.startTime?.toDate ? data.startTime.toDate().toISOString() : null;

        return NextResponse.json({
            scrimId: doc.id,
            ...data,
            createdAt,
            startTime,
        });

    } catch (error) {
        console.error('GET Scrim Detail API Error:', error);
        return NextResponse.json({ error: '내전 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}


// PUT: 내전의 모든 상태 변경을 처리하는 통합 함수 (수정된 부분)
export async function PUT(
    request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId) ? resolvedParams.scrimId[0] : resolvedParams.scrimId;

        const body = await request.json();
        const { action, applicantData, userEmail, teams, winningTeam, championData, memberEmailToRemove } = body;

        if (!scrimId || !action) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);

        if (action === 'end_game') {
            const doc = await scrimRef.get();
            if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");
            const data = doc.data();

            const isAdmin = await checkAdminPermission(userEmail);
            if (!isAdmin && data?.creatorEmail !== userEmail) {
                throw new Error("경기를 종료할 권한이 없습니다.");
            }

            // 1. match 기록 생성
            const matchData = {
                scrimId,
                winningTeam,
                matchDate: data?.startTime,
                blueTeam: championData.blueTeam,
                redTeam: championData.redTeam,
            };
            await db.collection('matches').add(matchData);

            // 2. 각 유저 전적 업데이트 (트랜잭션)
            const allPlayers = [...championData.blueTeam, ...championData.redTeam];
            await db.runTransaction(async (transaction) => {
                for (const player of allPlayers) {
                    const userQuery = db.collection('users').where('email', '==', player.email).limit(1);
                    const userQuerySnapshot = await transaction.get(userQuery);
                    if (!userQuerySnapshot.empty) {
                        const userDocRef = userQuerySnapshot.docs[0].ref;
                        const userDoc = await transaction.get(userDocRef);
                        const userData = userDoc.data();
                        
                        const isWinner = (player.team === 'blue' && winningTeam === 'blue') || (player.team === 'red' && winningTeam === 'red');
                        const resultKey = isWinner ? 'wins' : 'losses';

                        const newChampionStats = userData?.championStats || {};
                        if (!newChampionStats[player.champion]) {
                            newChampionStats[player.champion] = { wins: 0, losses: 0 };
                        }
                        newChampionStats[player.champion][resultKey] += 1;
                        
                        transaction.update(userDocRef, {
                            championStats: newChampionStats,
                            totalScrimsPlayed: admin.firestore.FieldValue.increment(1),
                        });
                    }
                }
            });

            // 3. 내전 상태 '종료'로 변경
            await scrimRef.update({
                status: '종료',
                winningTeam: winningTeam,
                // blueTeam과 redTeam 데이터는 경기 종료 시 최종적으로 저장됩니다.
                blueTeam: championData.blueTeam,
                redTeam: championData.redTeam,
            });
        } else {
            // 참가, 팀 구성 등 나머지 로직은 하나의 트랜잭션으로 처리
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(scrimRef);
                if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");
                
                const data = doc.data();
                // Firestore에서 받아온 데이터를 타입 가드와 기본값으로 안전하게 초기화
                let applicants: Applicant[] = (data?.applicants || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let waitlist: Applicant[] = (data?.waitlist || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let blueTeam: Applicant[] = (data?.blueTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let redTeam: Applicant[] = (data?.redTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');

                let hasPermission = true;
                if (['start_team_building', 'update_teams', 'start_game', 'reset_to_team_building', 'reset_to_recruiting', 'remove_member'].includes(action)) {
                    const isAdmin = await checkAdminPermission(userEmail);
                    if (!isAdmin && data?.creatorEmail !== userEmail) {
                        hasPermission = false;
                    }
                }
                if (!hasPermission) throw new Error("권한이 없습니다.");

                switch (action) {
                    case 'apply':
                        if (applicants.length >= 10) throw new Error("참가자 정원이 가득 찼습니다.");
                        if (applicants.some((a) => a.email === applicantData.email)) throw new Error("이미 신청한 내전입니다.");
                        transaction.update(scrimRef, { applicants: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave':
                        let newApplicantsAfterLeave = applicants.filter((a) => a.email !== applicantData.email);
                        if (newApplicantsAfterLeave.length < 10 && waitlist.length > 0) {
                            const newMember = waitlist.shift(); // 대기열에서 한 명을 끌어올림
                            if (newMember) newApplicantsAfterLeave.push(newMember);
                        }
                        transaction.update(scrimRef, { applicants: newApplicantsAfterLeave, waitlist: waitlist });
                        break;
                    case 'apply_waitlist':
                        if (waitlist.length >= 10) throw new Error("대기자 정원이 가득 찼습니다.");
                        if (applicants.some((a) => a.email === applicantData.email) || waitlist.some((w) => w.email === applicantData.email)) throw new Error("이미 신청 또는 대기 중인 내전입니다.");
                        transaction.update(scrimRef, { waitlist: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave_waitlist':
                        const newWaitlistAfterLeave = waitlist.filter((w) => w.email !== applicantData.email);
                        transaction.update(scrimRef, { waitlist: newWaitlistAfterLeave });
                        break;
                    case 'start_team_building':
                        if (applicants.length < 10) throw new Error("팀 구성을 시작하려면 최소 10명의 참가자가 필요합니다.");
                        transaction.update(scrimRef, { status: '팀 구성중' });
                        break;
                    case 'update_teams':
                        // 이 액션은 프론트엔드에서 팀 변경 사항이 발생할 때 호출될 수 있습니다.
                        // 하지만 현재 드래그앤드롭 로직은 클라이언트 상태에서 관리되므로
                        // 이 액션이 사용되지 않을 수도 있습니다.
                        // 만약 팀 변경을 DB에 즉시 반영하고 싶다면 이 로직을 활용하세요.
                        transaction.update(scrimRef, { blueTeam: teams.blueTeam, redTeam: teams.redTeam });
                        break;
                    case 'start_game':
                        // '경기중'으로 상태를 변경하고, 최종 팀 구성을 DB에 저장합니다.
                        // applicants와 waitlist는 경기 시작과 함께 비웁니다.
                        transaction.update(scrimRef, {
                            status: '경기중',
                            startTime: admin.firestore.FieldValue.serverTimestamp(),
                            blueTeam: teams.blueTeam, // 현재 구성된 블루팀 저장
                            redTeam: teams.redTeam,   // 현재 구성된 레드팀 저장
                            applicants: [], // 경기 시작 시 참가자 목록을 비움
                            waitlist: [],   // 경기 시작 시 대기열 목록을 비움
                        });
                        break;
                    case 'reset_to_team_building':
                        // '경기중' 또는 '종료'에서 '팀 구성중'으로 되돌릴 때
                        // 기존에 구성된 블루팀과 레드팀의 선수들을 다시 'applicants'로 합칩니다.
                        // 이렇게 해야 프론트에서 다시 드래그앤드롭으로 팀을 구성할 수 있습니다.
                        const playersFromTeams = [...blueTeam, ...redTeam];
                        const allApplicantsCombined = Array.from(new Map(
                            [...applicants, ...playersFromTeams].map(player => [player.email, player])
                        ).values());

                        transaction.update(scrimRef, {
                            status: '팀 구성중',
                            applicants: allApplicantsCombined, // 기존 팀 선수들을 applicants로 복원
                            blueTeam: [], // 팀 슬롯은 비움
                            redTeam: [],  // 팀 슬롯은 비움
                            winningTeam: admin.firestore.FieldValue.delete(), // 경기 결과 삭제
                            startTime: admin.firestore.FieldValue.delete(),   // 시작 시간 삭제
                            // waitlist는 그대로 두거나 필요에 따라 처리합니다.
                            // 여기서는 그대로 두어 대기열 선수들이 유지되도록 했습니다.
                        });
                        break;
                    case 'reset_to_recruiting':
                        // '팀 구성중' 또는 '경기중'에서 '모집중'으로 되돌릴 때
                        // 모든 현재 참가자 (applicants, blueTeam, redTeam)를 모아서 applicants로 통합합니다.
                        const allCurrentPlayersForRecruiting = [...applicants, ...blueTeam, ...redTeam];
                        const uniquePlayersForRecruitingMap = new Map<string, Applicant>();
                        allCurrentPlayersForRecruiting.forEach(player => uniquePlayersForRecruitingMap.set(player.email, player));
                        const uniqueApplicantsForRecruiting = Array.from(uniquePlayersForRecruitingMap.values());
                        
                        transaction.update(scrimRef, {
                            status: '모집중',
                            applicants: uniqueApplicantsForRecruiting, // 모든 참가자를 applicants로 통합
                            blueTeam: [], // 팀 슬롯 비움
                            redTeam: [],  // 팀 슬롯 비움
                            waitlist: [], // 대기열도 비울 수 있습니다 (선택 사항)
                            winningTeam: admin.firestore.FieldValue.delete(), // 혹시 남아있을 경기 결과 삭제
                            startTime: admin.firestore.FieldValue.delete(),   // 혹시 남아있을 시작 시간 삭제
                        });
                        break;
                    case 'remove_member':
                        // 특정 멤버를 모든 목록에서 제거합니다.
                        const filteredApplicants = applicants.filter((a) => a.email !== memberEmailToRemove);
                        const filteredBlueTeam = blueTeam.filter((p) => p.email !== memberEmailToRemove);
                        const filteredRedTeam = redTeam.filter((p) => p.email !== memberEmailToRemove);
                        const filteredWaitlist = waitlist.filter((w) => w.email !== memberEmailToRemove);
                        transaction.update(scrimRef, {
                            applicants: filteredApplicants,
                            blueTeam: filteredBlueTeam,
                            redTeam: filteredRedTeam,
                            waitlist: filteredWaitlist
                        });
                        break;
                    default:
                        throw new Error("알 수 없는 요청입니다.");
                }
            });
        }

        return NextResponse.json({ message: '작업이 성공적으로 완료되었습니다.' });

    } catch (error: unknown) {
        console.error('PUT Scrim API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '내전 관련 작업에 실패했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}