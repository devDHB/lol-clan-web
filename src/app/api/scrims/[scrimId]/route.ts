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

// ScrimData 타입에 usedChampions 필드 추가
interface ScrimData {
    scrimId: string;
    scrimName: string;
    creatorEmail: string;
    status: string;
    createdAt: admin.firestore.Timestamp; // Firestore Timestamp 타입
    startTime: admin.firestore.Timestamp | null; // Firestore Timestamp 타입
    applicants: Applicant[];
    waitlist: Applicant[];
    blueTeam: Applicant[];
    redTeam: Applicant[];
    winningTeam?: 'blue' | 'red';
    scrimType: string;
    usedChampions?: string[]; // 피어리스 내전에서 사용된 챔피언 목록
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
        // Timestamp 타입을 ISO 문자열로 변환
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
            // ScrimData 타입으로 명시적으로 캐스팅
            const data = doc.data() as ScrimData; 

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

            // 2. 각 유저 전적 업데이트 및 내전 상태 '종료'로 변경 (하나의 트랜잭션으로 통합)
            await db.runTransaction(async (transaction) => {
                // 트랜잭션 내에서 모든 필요한 문서 읽기
                const scrimDoc = await transaction.get(scrimRef); // 내전 문서 읽기
                const currentScrimData = scrimDoc.data() as ScrimData; // 현재 내전 데이터
            
                const allPlayers = [...championData.blueTeam, ...championData.redTeam];
            
                // userDocsInfoPromises가 반환하는 객체의 타입을 명확히 정의합니다.
                interface UserDocInfo {
                    userDocRef: admin.firestore.DocumentReference;
                    userData: any; // Firestore 문서 데이터는 any로 처리하거나 더 구체적인 타입 정의 필요
                    player: Applicant & { team: string };
                }
            
                const userDocsInfoPromises = allPlayers.map(async (player) => {
                    const userQuery = db.collection('users').where('email', '==', player.email).limit(1);
                    const userQuerySnapshot = await transaction.get(userQuery); 
                    
                    if (!userQuerySnapshot.empty) {
                        const userDocRef = userQuerySnapshot.docs[0].ref;
                        const userDoc = await transaction.get(userDocRef);
                        // userDoc.data()가 undefined일 가능성을 대비하여 기본 객체 {} 제공
                        return { userDocRef, userData: userDoc.data() || {}, player } as UserDocInfo; // <-- 여기서 타입을 명시적으로 캐스팅
                    }
                    return null; // 사용자를 찾지 못한 경우
                });
            
                // 필터링 후에도 타입이 UserDocInfo[]로 확실히 추론되도록 보강
                const userDocsToUpdate: UserDocInfo[] = (await Promise.all(userDocsInfoPromises)).filter((info): info is UserDocInfo => info !== null); // <-- 필터링 방식 수정
            
            
                // --- 피어리스 로직 (변경 없음) ---
                let updatedUsedChampions: string[] = currentScrimData.usedChampions || [];
                if (currentScrimData.scrimType === '피어리스') {
                    const newlyUsedChampions = championData.blueTeam.map((p: any) => p.champion).filter((c: string) => c && c.trim() !== '')
                        .concat(championData.redTeam.map((p: any) => p.champion).filter((c: string) => c && c.trim() !== ''));
                    
                    updatedUsedChampions = Array.from(new Set([...updatedUsedChampions, ...newlyUsedChampions]));
                }
                // --- 피어리스 로직 끝 ---
            
            
                // 모든 읽기 작업이 완료된 후, 이제 쓰기 작업 실행
                
                // 챔피언 통계 및 전적 업데이트
                for (const userDocInfo of userDocsToUpdate) {
                    // 구조 분해 할당 시 userDocInfo가 null이 아님을 TypeScript에 알림
                    // (위 filter(Boolean) 대신 filter((info): info is UserDocInfo => info !== null)을 사용하면 더 안전)
                    const { userDocRef, userData, player } = userDocInfo; // <-- 이 라인에서 에러가 나면, 이제 타입이 더 확실해집니다.
                    
                    const championName = player.champion && player.champion.trim() !== '' ? player.champion : '미입력';
                
                    const isWinner = (player.team === 'blue' && winningTeam === 'blue') || (player.team === 'red' && winningTeam === 'red');
                    const resultKey = isWinner ? 'wins' : 'losses';
                
                    const newChampionStats = userData?.championStats || {}; // userData가 {}일 수 있으므로 안전한 접근
                    
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
                    usedChampions: updatedUsedChampions, // 사용된 챔피언 목록 저장
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
                            redTeam: teams.redTeam,  // 현재 구성된 레드팀 저장
                            applicants: [], // 경기 시작 시 참가자 목록을 비움
                            waitlist: [],   // 경기 시작 시 대기열 목록을 비움
                        });
                        break;
                    case 'reset_to_team_building':
                        // '경기중' 또는 '종료'에서 '팀 구성중'으로 되돌릴 때
                        // 기존에 구성된 블루팀과 레드팀은 그대로 유지합니다.
                        // applicants와 waitlist는 비웁니다.
                        transaction.update(scrimRef, {
                            status: '팀 구성중',
                            // blueTeam과 redTeam은 변경 없이 그대로 둡니다. (플레이어 유지)
                            applicants: [], // 모집중 풀은 비웁니다.
                            waitlist: [],   // 대기열도 비웁니다.
                            winningTeam: admin.firestore.FieldValue.delete(), // 경기 결과 삭제
                            startTime: admin.firestore.FieldValue.delete(),   // 시작 시간 삭제
                            // usedChampions는 피어리스 초기화 액션에서만 변경됩니다.
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
                            // usedChampions는 피어리스 초기화 액션에서만 변경됩니다.
                        });
                        break;
                    case 'reset_peerless': // 새로운 액션 추가: 피어리스 챔피언 목록 초기화
                        if (data?.scrimType !== '피어리스') {
                            throw new Error("이 내전은 피어리스 내전이 아닙니다.");
                        }
                        // 권한 확인 (관리자 또는 내전 생성자만 가능)
                        const isAdminOrCreator = await checkAdminPermission(userEmail) || data?.creatorEmail === userEmail;
                        if (!isAdminOrCreator) {
                            throw new Error("피어리스 챔피언 목록을 초기화할 권한이 없습니다.");
                        }
                        // usedChampions 필드를 비웁니다.
                        transaction.update(scrimRef, {
                            usedChampions: [],
                            // 피어리스 초기화 시 내전 상태는 그대로 유지합니다. (필요하다면 추가 변경 가능)
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