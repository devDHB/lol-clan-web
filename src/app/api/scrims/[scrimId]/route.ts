import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 이 라우트는 항상 동적으로 처리되도록 명시합니다.
export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: { scrimId: string | string[] } } // scrimId가 배열일 수도 있음을 명시
) {
    try {
        // params를 await하여 scrimId에 안전하게 접근합니다.
        const resolvedParams = await params;
        const scrimId = Array.isArray(resolvedParams.scrimId)
            ? resolvedParams.scrimId[0]
            : resolvedParams.scrimId;

        if (!scrimId) {
            return NextResponse.json({ error: '내전 ID가 필요합니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);
        const doc = await scrimRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = doc.data();
        // createdAt과 startTime이 Firestore Timestamp 객체일 경우 toDate().toISOString()을 사용합니다.
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

// 사용자 권한 확인 헬퍼 함수
async function checkAdminPermission(email: string): Promise<boolean> {
    if (!email) return false;
    const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnapshot.empty) return false;
    const userRole = userSnapshot.docs[0].data().role;
    return userRole === '총관리자' || userRole === '관리자';
}


// PUT: 내전의 모든 상태 변경을 처리하는 통합 함수
export async function PUT(
    request: Request,
    { params }: { params: { scrimId: string } }
) {
    try {
        const { scrimId } = params;
        const { action, applicantData, userEmail, teams, winningTeam, championData } = await request.json();

        if (!scrimId || !action) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);

        if (action === 'end_game') {
            const doc = await scrimRef.get();
            if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");
            const data = doc.data();
            const isAdmin = await checkAdminPermission(userEmail);
            if (!isAdmin && data?.creatorEmail !== userEmail) throw new Error("경기를 종료할 권한이 없습니다.");

            const matchData = {
                scrimId,
                winningTeam,
                matchDate: data?.startTime,
                blueTeam: championData.blueTeam,
                redTeam: championData.redTeam,
            };
            await db.collection('matches').add(matchData);

            const allPlayers = [...championData.blueTeam, ...championData.redTeam];
            await db.runTransaction(async (transaction) => {
                for (const player of allPlayers) {
                    const userQuerySnapshot = await db.collection('users').where('email', '==', player.email).limit(1).get();
                    if (!userQuerySnapshot.empty) {
                        const userDocRef = userQuerySnapshot.docs[0].ref;
                        const userDoc = await transaction.get(userDocRef);
                        const userData = userDoc.data();

                        const isWinner = (player.team === 'blue' && winningTeam === 'blue') || (player.team === 'red' && winningTeam === 'red');
                        const result = isWinner ? 'wins' : 'losses';

                        const newChampionStats = userData?.championStats || {};
                        if (!newChampionStats[player.champion]) {
                            newChampionStats[player.champion] = { wins: 0, losses: 0 };
                        }
                        newChampionStats[player.champion][result] += 1;

                        transaction.update(userDocRef, {
                            championStats: newChampionStats,
                            totalScrimsPlayed: admin.firestore.FieldValue.increment(1),
                        });
                    }
                }
            });

            // --- 수정: scrim 문서에도 최종 결과 저장 ---
            await scrimRef.update({
                status: '종료',
                winningTeam: winningTeam,
                blueTeam: championData.blueTeam,
                redTeam: championData.redTeam,
            });

        } else {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(scrimRef);
                if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");

                const data = doc.data();
                let applicants = data?.applicants || [];
                let waitlist = data?.waitlist || [];

                switch (action) {
                    case 'apply':
                        if (applicants.length >= 10) throw new Error("참가자 정원이 가득 찼습니다.");
                        if (applicants.some((a: { email: string }) => a.email === applicantData.email)) throw new Error("이미 신청한 내전입니다.");
                        transaction.update(scrimRef, { applicants: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave':
                        let newApplicants = applicants.filter((a: { email: string }) => a.email !== applicantData.email);
                        if (newApplicants.length < 10 && waitlist.length > 0) {
                            const newMember = waitlist.shift();
                            newApplicants.push(newMember);
                        }
                        transaction.update(scrimRef, { applicants: newApplicants, waitlist: waitlist });
                        break;
                    case 'apply_waitlist':
                        if (waitlist.length >= 10) throw new Error("대기자 정원이 가득 찼습니다.");
                        if (applicants.some((a: { email: string }) => a.email === applicantData.email) || waitlist.some((w: { email: string }) => w.email === applicantData.email)) throw new Error("이미 신청 또는 대기 중인 내전입니다.");
                        transaction.update(scrimRef, { waitlist: admin.firestore.FieldValue.arrayUnion(applicantData) });
                        break;
                    case 'leave_waitlist':
                        const newWaitlist = waitlist.filter((w: { email: string }) => w.email !== applicantData.email);
                        transaction.update(scrimRef, { waitlist: newWaitlist });
                        break;
                    case 'start_team_building':
                        const isAdmin = await checkAdminPermission(userEmail);
                        if (!isAdmin && data?.creatorEmail !== userEmail) throw new Error("팀 구성을 시작할 권한이 없습니다.");
                        if (applicants.length < 10) throw new Error("팀 구성을 시작하려면 최소 10명의 참가자가 필요합니다.");
                        transaction.update(scrimRef, { status: '팀 구성중' });
                        break;
                    case 'update_teams':
                        const { blueTeam, redTeam } = teams;
                        const isAdminForUpdate = await checkAdminPermission(userEmail);
                        if (!isAdminForUpdate && data?.creatorEmail !== userEmail) throw new Error("팀을 저장할 권한이 없습니다.");
                        transaction.update(scrimRef, { blueTeam, redTeam });
                        break;
                    case 'start_game':
                        const isAdminForStart = await checkAdminPermission(userEmail);
                        if (!isAdminForStart && data?.creatorEmail !== userEmail) throw new Error("경기를 시작할 권한이 없습니다.");
                        transaction.update(scrimRef, {
                            status: '경기중',
                            startTime: admin.firestore.FieldValue.serverTimestamp(),
                            blueTeam: teams.blueTeam,
                            redTeam: teams.redTeam,
                            applicants: [],
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
