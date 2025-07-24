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

// ScrimData 타입에 matchChampionHistory 필드 추가
interface ScrimData {
    scrimId: string;
    scrimName: string;
    creatorEmail: string;
    status: string;
    // Firestore Timestamp는 실제 DB에 저장되는 타입이며, 클라이언트에는 직렬화되어 전달됩니다.
    createdAt: admin.firestore.Timestamp; 
    startTime: admin.firestore.Timestamp | null; 
    applicants: Applicant[];
    waitlist: Applicant[];
    blueTeam: Applicant[];
    redTeam: Applicant[];
    winningTeam?: 'blue' | 'red';
    scrimType: string;
    
    // 각 경기의 챔피언 사용 기록을 담을 배열
    matchChampionHistory?: {
        matchId: string; // 각 경기 기록의 고유 ID (matches 컬렉션의 문서 ID와 연결)
        matchDate: admin.firestore.Timestamp | Date; // DB에 Timestamp 또는 Date 객체로 저장
        blueTeamChampions: { playerEmail: string; champion: string; position: string; }[];
        redTeamChampions: { playerEmail: string; champion: string; position: string; }[];
    }[];
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
        // Timestamp 타입을 ISO 문자열로 변환하여 클라이언트에 전달
        const createdAt = data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
        const startTime = data?.startTime?.toDate ? data.startTime.toDate().toISOString() : null;

        // matchChampionHistory의 각 matchDate도 ISO 문자열로 변환
        const matchChampionHistory = (data?.matchChampionHistory as ScrimData['matchChampionHistory'])?.map(record => ({
            ...record,
            // matchDate가 Timestamp 객체라면 toDate().toISOString()으로, 아니라면 그대로 사용 (string으로 이미 변환된 경우)
            matchDate: (record.matchDate as admin.firestore.Timestamp)?.toDate ? (record.matchDate as admin.firestore.Timestamp).toDate().toISOString() : record.matchDate
        })) || [];


        return NextResponse.json({
            scrimId: doc.id,
            ...data,
            createdAt,
            startTime,
            matchChampionHistory, // 변환된 matchChampionHistory 포함
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

        const body = await request.json();
        const { action, applicantData, userEmail, teams, winningTeam, championData, memberEmailToRemove } = body;

        if (!scrimId || !action) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);

        if (action === 'end_game') {
            const doc = await scrimRef.get();
            if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");
            // ScrimData 타입으로 명시적으로 캐스팅
            const data = doc.data() as ScrimData; 

            const isAdmin = await checkAdminPermission(userEmail);
            if (!isAdmin && data?.creatorEmail !== userEmail) {
                throw new Error("경기를 종료할 권한이 없습니다.");
            }

            // 1. match 기록 생성 (매치 ID를 얻기 위해 먼저 추가)
            const newMatchDocRef = db.collection('matches').doc(); // 문서 ID 미리 생성
            const matchData = {
                scrimId,
                winningTeam,
                matchDate: admin.firestore.FieldValue.serverTimestamp(), // 경기 종료 시점의 서버 타임스탬프
                blueTeam: championData.blueTeam,
                redTeam: championData.redTeam,
            };
            await newMatchDocRef.set(matchData); // 문서 추가

            // 2. 각 유저 전적 업데이트 및 내전 상태 '종료'로 변경 (하나의 트랜잭션으로 통합)
            await db.runTransaction(async (transaction) => {
                // 트랜잭션 내에서 모든 필요한 문서 읽기
                const scrimDoc = await transaction.get(scrimRef); // 내전 문서 읽기
                const currentScrimData = scrimDoc.data() as ScrimData; // 현재 내전 데이터

                const allPlayers = [...championData.blueTeam, ...championData.redTeam];

                // userDocsInfoPromises가 반환하는 객체의 타입을 명확히 정의
                interface UserDocInfo {
                    userDocRef: admin.firestore.DocumentReference;
                    userData: any; 
                    player: Applicant & { team: string };
                }

                const userDocsInfoPromises = allPlayers.map(async (player) => {
                    const userQuery = db.collection('users').where('email', '==', player.email).limit(1);
                    const userQuerySnapshot = await transaction.get(userQuery); 
                    
                    if (!userQuerySnapshot.empty) {
                        const userDocRef = userQuerySnapshot.docs[0].ref;
                        const userDoc = await transaction.get(userDocRef);
                        return { userDocRef, userData: userDoc.data() || {}, player } as UserDocInfo;
                    }
                    return null; // 사용자를 찾지 못한 경우
                });

                // Promise.all로 모든 사용자 문서 읽기 완료 후 null 값 제거
                const userDocsToUpdate: UserDocInfo[] = (await Promise.all(userDocsInfoPromises)).filter((info): info is UserDocInfo => info !== null); 

                // --- 피어리스 로직 추가 시작 ---
                let updatedMatchChampionHistory: ScrimData['matchChampionHistory'] = currentScrimData.matchChampionHistory || [];

                if (currentScrimData.scrimType === '피어리스') {
                    const blueTeamChampsForHistory = championData.blueTeam.map((p: any) => ({
                        playerEmail: p.email,
                        champion: p.champion && p.champion.trim() !== '' ? p.champion : '미입력',
                        position: p.positions[0]?.split('(')[0].trim() || '', // 포지션 정보도 저장
                    }));
                    const redTeamChampsForHistory = championData.redTeam.map((p: any) => ({
                        playerEmail: p.email,
                        champion: p.champion && p.champion.trim() !== '' ? p.champion : '미입력',
                        position: p.positions[0]?.split('(')[0].trim() || '',
                    }));
                    
                    // 새로운 경기 챔피언 기록 객체 (matchId로 고유성을 보장)
                    const newMatchChampionsRecord = {
                        matchId: newMatchDocRef.id, // 새로 생성된 match 문서의 ID를 사용
                        matchDate: new Date(), // <-- 'FieldValue.serverTimestamp()' 대신 'new Date()' 사용
                        blueTeamChampions: blueTeamChampsForHistory,
                        redTeamChampions: redTeamChampsForHistory,
                    };
                    
                    // 기록을 배열 맨 앞에 추가하여 최신 경기가 먼저 보이도록 합니다.
                    updatedMatchChampionHistory = [newMatchChampionsRecord, ...updatedMatchChampionHistory];
                }
                // --- 피어리스 로직 추가 끝 ---


                // 모든 읽기 작업이 완료된 후, 이제 쓰기 작업 실행
                
                // 챔피언 통계 및 전적 업데이트
                for (const userDocInfo of userDocsToUpdate) {
                    const { userDocRef, userData, player } = userDocInfo;
                    
                    const championName = player.champion && player.champion.trim() !== '' ? player.champion : '미입력';
                
                    const isWinner = (player.team === 'blue' && winningTeam === 'blue') || (player.team === 'red' && winningTeam === 'red');
                    const resultKey = isWinner ? 'wins' : 'losses';
                
                    const newChampionStats = userData?.championStats || {};
                    
                    if (!newChampionStats[championName]) {
                        newChampionStats[championName] = { wins: 0, losses: 0 };
                    }
                    
                    newChampionStats[championName][resultKey] += 1;
                    
                    transaction.update(userDocRef, {
                        championStats: newChampionStats,
                        totalScrimsPlayed: admin.firestore.FieldValue.increment(1),
                    });
                }
                
                // 내전 상태 '종료'로 변경 및 사용된 챔피언 목록 업데이트 (트랜잭션 내에서 처리)
                transaction.update(scrimRef, {
                    status: '종료',
                    winningTeam: winningTeam,
                    blueTeam: championData.blueTeam,
                    redTeam: championData.redTeam,
                    matchChampionHistory: updatedMatchChampionHistory, // 새 필드 업데이트
                });
            });
        } else {
            // 참가, 팀 구성 등 나머지 로직은 하나의 트랜잭션으로 처리
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(scrimRef);
                if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");
                
                const data = doc.data() as ScrimData; // ScrimData 타입으로 명시적으로 캐스팅
                // Firestore에서 받아온 데이터를 타입 가드와 기본값으로 안전하게 초기화
                let applicants: Applicant[] = (data?.applicants || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let waitlist: Applicant[] = (data?.waitlist || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let blueTeam: Applicant[] = (data?.blueTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let redTeam: Applicant[] = (data?.redTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');

                let hasPermission = true;
                // 'reset_peerless' 액션도 권한 확인 대상에 포함
                if (['start_team_building', 'update_teams', 'start_game', 'reset_to_team_building', 'reset_to_recruiting', 'remove_member', 'reset_peerless'].includes(action)) {
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
                        transaction.update(scrimRef, { blueTeam: teams.blueTeam, redTeam: teams.redTeam });
                        break;
                    case 'start_game':
                        transaction.update(scrimRef, {
                            status: '경기중',
                            startTime: admin.firestore.FieldValue.serverTimestamp(),
                            blueTeam: teams.blueTeam, 
                            redTeam: teams.redTeam,  
                            applicants: [], 
                            waitlist: [],   
                        });
                        break;
                    case 'reset_to_team_building':
                        // '경기중' 또는 '종료'에서 '팀 구성중'으로 되돌릴 때
                        // 기존에 구성된 블루팀과 레드팀은 그대로 유지합니다.
                        // applicants와 waitlist는 비웁니다.
                        transaction.update(scrimRef, {
                            status: '팀 구성중',
                            applicants: [], 
                            waitlist: [],   
                            winningTeam: admin.firestore.FieldValue.delete(), 
                            startTime: admin.firestore.FieldValue.delete(),   
                            // matchChampionHistory는 reset_peerless에서만 변경되도록 유지됩니다.
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
                            applicants: uniqueApplicantsForRecruiting, 
                            blueTeam: [], 
                            redTeam: [],  
                            waitlist: [], 
                            winningTeam: admin.firestore.FieldValue.delete(), 
                            startTime: admin.firestore.FieldValue.delete(),   
                            // matchChampionHistory는 reset_peerless에서만 변경되도록 유지됩니다.
                        });
                        break;
                    case 'reset_peerless': 
                        if (data?.scrimType !== '피어리스') {
                            throw new Error("이 내전은 피어리스 내전이 아닙니다.");
                        }
                        const isAdminOrCreator = await checkAdminPermission(userEmail) || data?.creatorEmail === userEmail;
                        if (!isAdminOrCreator) {
                            throw new Error("피어리스 챔피언 목록을 초기화할 권한이 없습니다.");
                        }
                        transaction.update(scrimRef, {
                            matchChampionHistory: [], // 사용된 챔피언 기록 전체 초기화
                        });
                        break;
                    case 'remove_member':
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