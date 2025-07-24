import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 타입 정의 (클라이언트와 일치하도록 유지)
interface Applicant {
    email: string;
    nickname: string;
    tier: string;
    positions: string[];
    champion?: string;
}

// 관리자 권한 확인 함수 (예시)
async function checkAdminPermission(email: string): Promise<boolean> {
    try {
        const userDoc = db.collection('users').where('email', '==', email).limit(1);
        const userQuerySnapshot = await userDoc.get(); // 쿼리 실행
        if (userQuerySnapshot.empty) {
            return false;
        }
        const userData = userQuerySnapshot.docs[0].data();
        return userData?.role === '총관리자' || userData?.role === '관리자';
    } catch (error) {
        console.error('관리자 권한 확인 중 에러 발생:', error);
        return false;
    }
}

export async function GET(
    _request: NextRequest, // NextRequest 사용
    { params }: { params: { scrimId: string | string[] } } // params 타입 수정
) {
    try {
        // params를 await하여 scrimId에 안전하게 접근합니다.
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


// PUT: 내전의 모든 상태 변경을 처리하는 통합 함수
export async function PUT(
    request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId) ? resolvedParams.scrimId[0] : resolvedParams.scrimId;

        const body = await request.json(); // 원시 JSON 본문을 먼저 파싱
        console.log('Server received raw body:', body); // 서버에서 수신한 전체 본문 로그

        const { action, applicantData, userEmail, teams, winningTeam, championData, memberEmailToRemove } = body; // 구조 분해 할당

        if (!scrimId || !action) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);

        if (action === 'end_game') {
            await db.runTransaction(async (transaction) => {
                const scrimDoc = await transaction.get(scrimRef);

                if (!scrimDoc.exists) {
                    throw new Error("내전을 찾을 수 없습니다.");
                }
                const currentScrimData = scrimDoc.data();

                const isAdmin = await checkAdminPermission(userEmail);
                if (!isAdmin && currentScrimData?.creatorEmail !== userEmail) {
                    throw new Error("경기를 종료할 권한이 없습니다.");
                }

                const allPlayersEmails = new Set([...championData.blueTeam.map((p: Applicant) => p.email), ...championData.redTeam.map((p: Applicant) => p.email)]);
                const userDocRefsMap = new Map<string, admin.firestore.DocumentReference>();

                const userRefsPromises = Array.from(allPlayersEmails).map(async (email) => {
                    const userQuerySnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
                    if (!userQuerySnapshot.empty) {
                        return { email, ref: userQuerySnapshot.docs[0].ref };
                    }
                    return null;
                });

                const fetchedUserRefs = (await Promise.all(userRefsPromises)).filter(Boolean);
                fetchedUserRefs.forEach(item => {
                    if (item) userDocRefsMap.set(item.email, item.ref);
                });

                const userDocsInTransaction = new Map<string, admin.firestore.DocumentSnapshot>();
                for (const playerEmail of allPlayersEmails) {
                    const userRef = userDocRefsMap.get(playerEmail);
                    if (userRef) {
                        const userDoc = await transaction.get(userRef);
                        if (userDoc.exists) {
                            userDocsInTransaction.set(playerEmail, userDoc);
                        }
                    }
                }

                for (const player of [...championData.blueTeam, ...championData.redTeam]) {
                    const userDoc = userDocsInTransaction.get(player.email);
                    if (userDoc && userDoc.exists) {
                        const userData = userDoc.data();

                        const isWinner = (player.team === 'blue' && winningTeam === 'blue') || (player.team === 'red' && winningTeam === 'red');
                        const resultKey = isWinner ? 'wins' : 'losses';

                        const newChampionStats = { ...(userData?.championStats || {}) };
                        if (!newChampionStats[player.champion]) {
                            newChampionStats[player.champion] = { wins: 0, losses: 0 };
                        }
                        newChampionStats[player.champion][resultKey] += 1;

                        transaction.update(userDoc.ref, {
                            championStats: newChampionStats,
                            totalScrimsPlayed: admin.firestore.FieldValue.increment(1),
                        });
                    }
                }

                transaction.update(scrimRef, {
                    status: '종료',
                    winningTeam: winningTeam,
                    blueTeam: championData.blueTeam,
                    redTeam: championData.redTeam,
                });
            });

            const doc = await scrimRef.get();
            const data = doc.data();

            if (data?.startTime) {
                const matchData = {
                    scrimId,
                    winningTeam,
                    matchDate: data.startTime,
                    blueTeam: championData.blueTeam,
                    redTeam: championData.redTeam,
                };
                await db.collection('matches').add(matchData);
            }


        } else {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(scrimRef);
                if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");

                const data = doc.data();
                // 모든 배열을 불러올 때 유효하지 않은 요소들을 필터링합니다.
                // item이 객체이고 email 속성을 string으로 가지고 있는지 명시적으로 확인
                let applicants: Applicant[] = (data?.applicants || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let waitlist: Applicant[] = (data?.waitlist || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let blueTeam: Applicant[] = (data?.blueTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let redTeam: Applicant[] = (data?.redTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');

                // 권한 확인 (액션별로 필요 시)
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
                        if (applicants.some((a: Applicant) => a.email === applicantData.email)) throw new Error("이미 신청한 내전입니다.");
                        transaction.update(scrimRef, { applicants: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave':
                        // applicantData의 유효성 검사를 더 강화
                        if (!applicantData || typeof applicantData !== 'object' || !applicantData.email || typeof applicantData.email !== 'string') {
                            console.error('Invalid or missing applicantData.email for leave action:', applicantData); // 디버그 로그 추가
                            throw new Error("유효하지 않은 신청자 이메일입니다.");
                        }
                        // `a`는 이미 상단에서 필터링되었으므로 `a && typeof a.email === 'string'` 검사는 불필요
                        let newApplicantsAfterLeave = applicants.filter((a: Applicant) => a.email !== applicantData.email);

                        if (newApplicantsAfterLeave.length < 10 && waitlist.length > 0) {
                            const newMember = waitlist.shift();
                            if (newMember) {
                                newApplicantsAfterLeave.push(newMember);
                            }
                        }
                        transaction.update(scrimRef, { applicants: newApplicantsAfterLeave, waitlist: waitlist });
                        break;
                    case 'apply_waitlist':
                        if (waitlist.length >= 10) throw new Error("대기자 정원이 가득 찼습니다.");
                        if (applicants.some((a: Applicant) => a.email === applicantData.email) || waitlist.some((w: Applicant) => w.email === applicantData.email)) throw new Error("이미 신청 또는 대기 중인 내전입니다.");
                        transaction.update(scrimRef, { waitlist: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave_waitlist':
                        const newWaitlistAfterLeave = waitlist.filter((w: Applicant) => w.email !== applicantData.email);
                        transaction.update(scrimRef, { waitlist: newWaitlistAfterLeave });
                        break;
                    case 'start_team_building':
                        if (applicants.length < 10) throw new Error("팀 구성을 시작하려면 최소 10명의 참가자가 필요합니다.");
                        transaction.update(scrimRef, { status: '팀 구성중' });
                        break;
                    case 'update_teams':
                        const { blueTeam: updatedBlueTeamData, redTeam: updatedRedTeamData } = teams;
                        transaction.update(scrimRef, { blueTeam: updatedBlueTeamData, redTeam: updatedRedTeamData });
                        break;
                    case 'start_game':
                        transaction.update(scrimRef, {
                            status: '경기중',
                            startTime: admin.firestore.FieldValue.serverTimestamp(),
                            blueTeam: teams.blueTeam,
                            redTeam: teams.redTeam,
                            applicants: [],
                        });
                        break;
                    case 'reset_to_team_building': // '종료' 또는 '경기중' -> '팀 구성중'으로 되돌리기
                        // 현재 블루팀과 레드팀 멤버를 가져와 챔피언 정보만 초기화
                        const currentBlueTeamPlayers = blueTeam.map(player => {
                            const { champion, ...rest } = player;
                            return rest as Applicant; // champion 필드 제거
                        });
                        const currentRedTeamPlayers = redTeam.map(player => {
                            const { champion, ...rest } = player;
                            return rest as Applicant; // champion 필드 제거
                        });

                        // applicants 배열은 비워줍니다. (모든 플레이어는 이제 blueTeam 또는 redTeam에 있다고 가정)
                        transaction.update(scrimRef, {
                            status: '팀 구성중',
                            applicants: [], // applicants를 빈 배열로 설정
                            blueTeam: currentBlueTeamPlayers, // 챔피언 초기화된 블루팀 유지
                            redTeam: currentRedTeamPlayers,   // 챔피언 초기화된 레드팀 유지
                            winningTeam: admin.firestore.FieldValue.delete(), // 승리팀 필드 삭제
                            startTime: admin.firestore.FieldValue.delete(), // 시작 시간 필드 삭제
                        });
                        break;
                    case 'reset_to_recruiting': // '팀 구성중' -> '모집중'으로 되돌리기
                        const allCurrentPlayers = [
                            ...applicants,
                            ...blueTeam,
                            ...redTeam
                        ];
                        const uniquePlayersMap = new Map<string, Applicant>();
                        allCurrentPlayers.forEach(player => uniquePlayersMap.set(player.email, player));
                        const uniqueApplicants = Array.from(uniquePlayersMap.values());

                        transaction.update(scrimRef, {
                            status: '모집중',
                            applicants: uniqueApplicants,
                            blueTeam: [],
                            redTeam: [],
                        });
                        break;
                    case 'remove_member': // 멤버 제외 액션
                        if (!memberEmailToRemove || typeof memberEmailToRemove !== 'string') {
                            throw new Error("제거할 멤버 이메일이 유효하지 않습니다.");
                        }

                        // 모든 관련 배열에서 멤버 제거
                        const filteredApplicants = applicants.filter((a: Applicant) => a.email !== memberEmailToRemove);
                        const filteredBlueTeam = blueTeam.filter((p: Applicant) => p.email !== memberEmailToRemove);
                        const filteredRedTeam = redTeam.filter((p: Applicant) => p.email !== memberEmailToRemove);
                        const filteredWaitlist = waitlist.filter((w: Applicant) => w.email !== memberEmailToRemove);

                        // 멤버 제거 후 대기열에서 승격 로직
                        let promotedMember: Applicant | undefined;
                        let updatedApplicants = [...filteredApplicants];
                        let updatedBlueTeam = [...filteredBlueTeam];
                        let updatedRedTeam = [...filteredRedTeam];
                        let updatedWaitlist = [...filteredWaitlist];

                        // '모집중' 상태일 때 applicants에 빈자리가 생기면 대기열에서 승격
                        if (data?.status === '모집중' && updatedApplicants.length < 10 && updatedWaitlist.length > 0) {
                            promotedMember = updatedWaitlist.shift();
                            if (promotedMember) {
                                updatedApplicants.push(promotedMember);
                            }
                        }
                        // '팀 구성중' 상태일 때 팀에 빈자리가 생기면 (applicants로) 대기열에서 승격
                        else if (data?.status === '팀 구성중' && (updatedBlueTeam.length < 5 || updatedRedTeam.length < 5) && updatedWaitlist.length > 0) {
                            promotedMember = updatedWaitlist.shift();
                            if (promotedMember) {
                                updatedApplicants.push(promotedMember); // 팀 구성중에서는 일단 applicants로 이동
                            }
                        }

                        transaction.update(scrimRef, {
                            applicants: updatedApplicants,
                            blueTeam: updatedBlueTeam,
                            redTeam: updatedRedTeam,
                            waitlist: updatedWaitlist // 변경된 waitlist 반영
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


// PATCH: 내전 이름을 수정하는 함수 (신규 추가)
export async function PATCH(
    request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId) ? resolvedParams.scrimId[0] : resolvedParams.scrimId;
        const { newScrimName, userEmail } = await request.json();

        if (!scrimId || !newScrimName || !userEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);
        const scrimDoc = await scrimRef.get();

        if (!scrimDoc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const scrimData = scrimDoc.data();
        const creatorEmail = scrimData?.creatorEmail;

        const userSnapshot = await db.collection('users').where('email', '==', userEmail).limit(1).get();
        if (userSnapshot.empty) {
            return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 403 });
        }
        const userRole = userSnapshot.docs[0].data().role;

        const hasPermission =
            userRole === '총관리자' ||
            userRole === '관리자' ||
            userEmail === creatorEmail;

        if (!hasPermission) {
            return NextResponse.json({ error: '내전 제목을 수정할 권한이 없습니다.' }, { status: 403 });
        }

        await scrimRef.update({ scrimName: newScrimName });

        return NextResponse.json({ message: '내전 제목이 성공적으로 변경되었습니다.' });

    } catch (error) {
        console.error('PATCH Scrim API Error:', error);
        return NextResponse.json({ error: '내전 제목 수정에 실패했습니다.' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId) ? resolvedParams.scrimId[0] : resolvedParams.scrimId;
        const { userEmail } = await request.json();

        if (!scrimId || !userEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);
        const scrimDoc = await scrimRef.get();

        if (!scrimDoc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const scrimData = scrimDoc.data();
        const creatorEmail = scrimData?.creatorEmail;

        const userSnapshot = await db.collection('users').where('email', '==', userEmail).limit(1).get();
        if (userSnapshot.empty) {
            return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 403 });
        }
        const userRole = userSnapshot.docs[0].data().role;

        const hasPermission =
            userRole === '총관리자' ||
            userRole === '관리자' ||
            userEmail === creatorEmail;

        if (!hasPermission) {
            return NextResponse.json({ error: '내전을 해체할 권한이 없습니다.' }, { status: 403 });
        }

        await scrimRef.delete();

        return NextResponse.json({ message: '내전이 성공적으로 해체되었습니다.' });

    } catch (error) {
        console.error('DELETE Scrim API Error:', error);
        return NextResponse.json({ error: '내전 해체에 실패했습니다.' }, { status: 500 });
    }
}