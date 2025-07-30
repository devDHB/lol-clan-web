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
    assignedPosition?: string;
    championImageUrl?: string;
}

// ScrimData 타입에 matchChampionHistory 필드 추가
interface ScrimData {
    scrimId: string;
    scrimName: string;
    creatorEmail: string;
    status: string;
    createdAt: admin.firestore.Timestamp;
    startTime: admin.firestore.Timestamp | null;
    applicants: Applicant[];
    waitlist: Applicant[];
    blueTeam: Applicant[];
    redTeam: Applicant[];
    winningTeam?: 'blue' | 'red';
    scrimType: string;

    // (일반/피어리스) 영구 전적 기록용 필드
    matchChampionHistory?: {
        matchId: string;
        matchDate: admin.firestore.Timestamp | Date;
        blueTeamChampions: { playerEmail: string; champion: string; position: string; }[];
        redTeamChampions: { playerEmail: string; champion: string; position: string; }[];
    }[];

    // 피어리스 내전에서 사용된 챔피언 목록 (금지 목록)
    fearlessUsedChampions?: string[];

    // 칼바람 내전 전용 전적 기록 필드
    aramMatchHistory?: {
        matchId: string;
        matchDate: admin.firestore.Timestamp | Date;
        blueTeamEmails: string[]; // 챔피언 정보 없이 이메일 배열로 변경
        redTeamEmails: string[];  // 챔피언 정보 없이 이메일 배열로 변경
    }[];
}

// --- 타입 정의 ---
interface ChampionInfo {
    id: string;
    name: string;
    imageUrl: string;
}

// 직렬화 가능한 값들의 타입 정의
type SerializableValue = string | number | boolean | null | undefined | Date | SerializableValue[] | SerializableObject;

interface SerializableObject {
    [key: string]: SerializableValue;
}

interface FirestoreTimestamp {
    toDate(): Date;
}

// --- 공통 함수: Riot API 챔피언 목록 가져오기 (캐싱 포함) ---
let championList: ChampionInfo[] = [];
let lastFetched: number = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1시간 캐시

async function getChampionList() {
    if (Date.now() - lastFetched > CACHE_DURATION || championList.length === 0) {
        try {
            const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
            const versions = await versionRes.json();
            const latestVersion = versions[0];

            const res = await fetch(`http://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ko_KR/champion.json`);
            const fullData = await res.json();
            const champions = fullData.data;

            championList = Object.keys(champions).map(key => ({
                id: champions[key].id,
                name: champions[key].name,
                imageUrl: `http://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champions[key].id}.png`
            }));
            lastFetched = Date.now();
        } catch (error) {
            console.error("Failed to fetch champion list from Riot:", error);
        }
    }
    return championList;
}


// 권한 확인 함수
async function checkAdminPermission(email: string): Promise<boolean> {
    try {
        const userDoc = await db.collection('users').where('email', '==', email).limit(1).get();
        if (userDoc.empty) return false;
        const userData = userDoc.docs[0].data();
        // 총관리자, 관리자, 내전관리자 중 하나이면 true를 반환
        return userData?.role === '총관리자' || userData?.role === '관리자' || userData?.role === '내전관리자';
    } catch (error) {
        console.error('관리 권한 확인 중 에러 발생:', error);
        return false;
    }
}


export async function GET(
    _request: NextRequest,
    { params }: { params: { scrimId: string } }
) {
    try {
        const { scrimId } = await params;
        if (!scrimId) {
            return NextResponse.json({ error: '내전 ID가 필요합니다.' }, { status: 400 });
        }

        // 1. 전체 챔피언 목록 (이미지 URL 포함)을 미리 가져옵니다.
        const allChampions = await getChampionList();
        const championImageMap = new Map(allChampions.map((c: ChampionInfo) => [c.name, c.imageUrl]));

        const scrimRef = db.collection('scrims').doc(scrimId);
        const doc = await scrimRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = doc.data();

        // 2. blueTeam과 redTeam 데이터에 이미지 URL을 추가합니다.
        if (data) {
            const addImageUrl = (teamData: Applicant[]) => (teamData || []).map(player => ({
                ...player,
                championImageUrl: championImageMap.get(player.champion || '') || null
            }));

            data.blueTeam = addImageUrl(data.blueTeam);
            data.redTeam = addImageUrl(data.redTeam);
        }

        function isFirestoreTimestamp(obj: any): obj is FirestoreTimestamp {
            return (
                typeof obj === 'object' &&
                obj !== null &&
                'toDate' in obj &&
                typeof (obj as FirestoreTimestamp).toDate === 'function'
            );
        }

        // 3. 모든 Timestamp를 문자열로 변환합니다.
        const serializeData = (obj: SerializableValue): SerializableValue => {
            if (!obj) return obj;
            // 변경된 부분: 타입 가드 함수를 사용합니다.
            if (isFirestoreTimestamp(obj)) {
                return obj.toDate().toISOString();
            }
            if (Array.isArray(obj)) {
                return obj.map(serializeData);
            }
            if (typeof obj === 'object' && obj !== null) {
                const newObj: SerializableObject = {};
                for (const key in obj as SerializableObject) {
                    newObj[key] = serializeData((obj as SerializableObject)[key]);
                }
                return newObj;
            }
            return obj;
        };

        const finalData = serializeData({
            scrimId: doc.id,
            ...data,
        } as SerializableObject);

        return NextResponse.json(finalData);

    } catch (error) {
        console.error('GET Scrim Detail API Error:', error);
        return NextResponse.json({ error: '내전 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}


// PATCH: 내전 제목과 경기 챔피언 수정을 모두 처리하는 통합 함수
export async function PATCH(
    request: NextRequest,
    { params }: { params: { scrimId: string } }
) {
    try {
        const { scrimId } = await params;
        const body = await request.json();
        const { userEmail, newScrimName, team, playerEmail, newChampion, matchId } = body;

        if (!scrimId || !userEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const hasPermission = await checkAdminPermission(userEmail);
        if (!hasPermission) {
            return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
        }

        let updateMessage = '';

        // 1. 내전 제목 수정 로직
        if (newScrimName) {
            const scrimRef = db.collection('scrims').doc(scrimId);
            const doc = await scrimRef.get();
            if (!doc.exists) {
                return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
            }
            const data = doc.data();
            if (data?.creatorEmail !== userEmail && !hasPermission) {
                return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
            }

            await scrimRef.update({ scrimName: newScrimName });

            const matchesSnapshot = await db.collection('matches').where('scrimId', '==', scrimId).get();
            if (!matchesSnapshot.empty) {
                const batch = db.batch();
                matchesSnapshot.forEach(matchDoc => {
                    batch.update(matchDoc.ref, { scrimName: newScrimName });
                });
                await batch.commit();
            }
            updateMessage = '내전 제목이 수정되었습니다.';
        }

        // 2. 챔피언 정보 수정 로직 (matchId가 함께 제공되어야 함)
        if (team && playerEmail && newChampion && matchId) {
            const matchRef = db.collection('matches').doc(matchId);
            const doc = await matchRef.get();
            if (!doc.exists) {
                return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
            }

            const matchData = doc.data();
            if (matchData?.scrimId !== scrimId) {
                return NextResponse.json({ error: '해당 내전에 속한 경기가 아닙니다.' }, { status: 400 });
            }

            const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
            const teamData = matchData?.[teamKey] || [];

            const playerIndex = teamData.findIndex((p: { email: string }) => p.email === playerEmail);
            if (playerIndex === -1) {
                return NextResponse.json({ error: '해당 플레이어를 찾을 수 없습니다.' }, { status: 404 });
            }

            teamData[playerIndex].champion = newChampion;
            await matchRef.update({ [teamKey]: teamData });
            updateMessage = '챔피언 정보가 수정되었습니다.';
        }

        if (!newScrimName && !(team && playerEmail && newChampion && matchId)) {
            return NextResponse.json({ error: '수정할 정보가 없습니다.' }, { status: 400 });
        }

        return NextResponse.json({ message: updateMessage || '정보가 성공적으로 수정되었습니다.' });

    } catch (error: unknown) {
        console.error('PATCH Scrim API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '정보 수정에 실패했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
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
        const { action, applicantData, userEmail } = body;

        if (!scrimId || !action) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);

        // 참가, 팀 구성 등 나머지 로직은 하나의 트랜잭션으로 처리
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(scrimRef);
            if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");

            const data = doc.data() as ScrimData; // ScrimData 타입으로 명시적으로 캐스팅
            // body에서 필요한 변수들을 이 안에서 구조분해 할당합니다.
            const { teams, winningTeam, championData, memberEmailToRemove, scrimType } = body;

            // Firestore에서 받아온 데이터를 타입 가드와 기본값으로 안전하게 초기화
            const applicants: Applicant[] = (data?.applicants || []).filter((item: unknown): item is Applicant => 
                item !== null && typeof item === 'object' && 'email' in item && typeof (item as Applicant).email === 'string'
            );
            const waitlist: Applicant[] = (data?.waitlist || []).filter((item: unknown): item is Applicant => 
                item !== null && typeof item === 'object' && 'email' in item && typeof (item as Applicant).email === 'string'
            );
            const blueTeam: Applicant[] = (data?.blueTeam || []).filter((item: unknown): item is Applicant => 
                item !== null && typeof item === 'object' && 'email' in item && typeof (item as Applicant).email === 'string'
            );
            const redTeam: Applicant[] = (data?.redTeam || []).filter((item: unknown): item is Applicant => 
                item !== null && typeof item === 'object' && 'email' in item && typeof (item as Applicant).email === 'string'
            );

            let hasPermission = true;
            // 'reset_peerless' 액션도 권한 확인 대상에 포함
            if (['start_team_building', 'update_teams', 'start_game', 'reset_to_team_building', 'reset_to_recruiting', 'remove_member', 'end_game', 'reset_peerless'].includes(action)) {
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
                    const newApplicantsAfterLeave = applicants.filter((a) => a.email !== applicantData.email);
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
                    if (applicants.length < 10) {
                        throw new Error("팀 구성을 시작하려면 최소 10명의 참가자가 필요합니다.");
                    }
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
                    });

                    break;
                case 'reset_to_team_building': {
                    // 1. 현재 팀에 소속된 모든 플레이어를 가져옵니다.
                    const allPlayersInTeams = [...(data.blueTeam || []), ...(data.redTeam || [])];

                    // 2. 이 플레이어들을 다시 '참가자' 목록으로 합칩니다.
                    const currentApplicants = data.applicants || [];
                    const mergedApplicantsMap = new Map();
                    [...currentApplicants, ...allPlayersInTeams].forEach(p => mergedApplicantsMap.set(p.email, p));
                    const newApplicants = Array.from(mergedApplicantsMap.values());

                    // 3. status 변경과 함께 팀/참가자 목록을 업데이트합니다.
                    transaction.update(scrimRef, {
                        status: '팀 구성중',
                        applicants: newApplicants,   // 👈 선수들을 참가자 목록으로 이동
                        blueTeam: [],                // 👈 블루팀 초기화
                        redTeam: [],                 // 👈 레드팀 초기화
                        winningTeam: admin.firestore.FieldValue.delete(),
                        startTime: admin.firestore.FieldValue.delete(),
                    });
                    break;
                }
                // 팀을 초기화하고 모든 선수를 참가자로 보내는 로직
                case 'reset_teams_and_move_to_applicants': {
                    const allPlayersInTeams = [...(data.blueTeam || []), ...(data.redTeam || [])];
                    const currentApplicants = data.applicants || [];

                    // 모든 플레이어 목록(기존 참가자 + 팀원)을 합친 후, 한 번에 정리합니다.
                    const allPlayersToClean = [...currentApplicants, ...allPlayersInTeams];

                    const cleanedPlayerMap = new Map();
                    allPlayersToClean.forEach(player => {
                        // 중복된 이메일이 있을 경우 최신 정보로 덮어쓰면서, 필수 필드만 남깁니다.
                        cleanedPlayerMap.set(player.email, {
                            email: player.email,
                            nickname: player.nickname,
                            positions: player.positions,
                            tier: player.tier,
                        });
                    });

                    const newApplicants = Array.from(cleanedPlayerMap.values());

                    transaction.update(scrimRef, {
                        status: '팀 구성중',
                        applicants: newApplicants,
                        blueTeam: [],
                        redTeam: [],
                        winningTeam: admin.firestore.FieldValue.delete(),
                        startTime: admin.firestore.FieldValue.delete(),
                    });
                    break;
                }

                case 'reset_to_recruiting':
                    const allCurrentPlayersForRecruiting = [...applicants, ...blueTeam, ...redTeam];
                    const uniquePlayersForRecruitingMap = new Map<string, Applicant>();
                    allCurrentPlayersForRecruiting.forEach(player => uniquePlayersForRecruitingMap.set(player.email, player));
                    const uniqueApplicantsForRecruiting = Array.from(uniquePlayersForRecruitingMap.values());

                    transaction.update(scrimRef, {
                        status: '모집중',
                        applicants: uniqueApplicantsForRecruiting,
                        blueTeam: [],
                        redTeam: [],
                        winningTeam: admin.firestore.FieldValue.delete(),
                        startTime: admin.firestore.FieldValue.delete(),
                    });
                    break;
                case 'end_game': {
                    // 새로운 match 문서를 생성하고 데이터를 저장합니다.
                    const newMatchDocRef = db.collection('matches').doc();
                    const matchData = {
                        scrimId: scrimId,
                        winningTeam: winningTeam,
                        matchDate: admin.firestore.FieldValue.serverTimestamp(),
                        blueTeam: championData.blueTeam,
                        redTeam: championData.redTeam,
                        scrimName: data.scrimName,
                        scrimType: data.scrimType,
                        creatorEmail: data.creatorEmail, // 주최자 정보도 함께 저장
                    };
                    // 트랜잭션 외부에서 먼저 생성하거나, 트랜잭션 내에서 set으로 처리할 수 있습니다.
                    // 여기서는 트랜잭션 밖에서 생성하여 ID를 미리 확보합니다.
                    await newMatchDocRef.set(matchData);

                    if (scrimType === '피어리스') {
                        const newMatchRecord = {
                            matchId: newMatchDocRef.id, // 👈 생성된 match 문서의 ID를 사용
                            matchDate: new Date(),
                            blueTeamChampions: championData.blueTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '', position: p.assignedPosition || '' })),
                            redTeamChampions: championData.redTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '', position: p.assignedPosition || '' })),
                        };
                        const championsInThisMatch = [...championData.blueTeam.map((p: Applicant) => p.champion), ...championData.redTeam.map((p: Applicant) => p.champion)].filter(Boolean);

                        transaction.update(scrimRef, {
                            status: '종료',
                            winningTeam: winningTeam,

                            // 팀 정보에 챔피언을 기록
                            blueTeam: championData.blueTeam,
                            redTeam: championData.redTeam,

                            // 기존 로직은 유지
                            matchChampionHistory: admin.firestore.FieldValue.arrayUnion(newMatchRecord),
                            fearlessUsedChampions: admin.firestore.FieldValue.arrayUnion(...championsInThisMatch)
                        });
                    }
                    // --- 칼바람 모드 처리 ---
                    else if (data.scrimType === '칼바람') {
                        const newAramMatchRecord = {
                            matchId: newMatchDocRef.id, // 👈 생성된 match 문서의 ID를 사용

                            matchDate: new Date(),
                            blueTeamEmails: championData.blueTeam.map((p: Applicant) => p.email),
                            redTeamEmails: championData.redTeam.map((p: Applicant) => p.email),
                        };
                        transaction.update(scrimRef, {
                            status: '종료',
                            winningTeam: winningTeam,
                            aramMatchHistory: admin.firestore.FieldValue.arrayUnion(newAramMatchRecord)
                        });
                    }
                    // --- 일반 모드 처리 ---
                    else {
                        const newMatchRecord = {
                            matchId: newMatchDocRef.id,
                            matchDate: new Date(),
                            blueTeamChampions: championData.blueTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '미입력', position: p.assignedPosition || '' })),
                            redTeamChampions: championData.redTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '미입력', position: p.assignedPosition || '' })),
                        };
                        transaction.update(scrimRef, {
                            status: '종료',
                            winningTeam: winningTeam,
                            blueTeam: championData.blueTeam,
                            redTeam: championData.redTeam,
                            matchChampionHistory: admin.firestore.FieldValue.arrayUnion(newMatchRecord)
                        });
                    }
                    break;
                }

                case 'reset_peerless': {
                    if (data.scrimType !== '피어리스') throw new Error("피어리스 내전이 아닙니다.");

                    // [임시 금지 목록]만 초기화합니다.
                    transaction.update(scrimRef, {
                        fearlessUsedChampions: [],
                    });
                    break;
                }
                // 'remove_member' 케이스 수정
                case 'remove_member': {
                    let updatedApplicants: Applicant[] = data.applicants || [];
                    let updatedWaitlist: Applicant[] = data.waitlist || [];
                    let updatedBlueTeam: Applicant[] = data.blueTeam || [];
                    let updatedRedTeam: Applicant[] = data.redTeam || [];

                    // 어떤 리스트에서 제거되었는지 확인하기 위한 플래그
                    let wasRemovedFromMainList = false;

                    const initialApplicantsCount = updatedApplicants.length;
                    updatedApplicants = updatedApplicants.filter(p => p.email !== memberEmailToRemove);
                    if (initialApplicantsCount > updatedApplicants.length) {
                        wasRemovedFromMainList = true;
                    }

                    // '모집중'이 아닐 때 팀 목록에서도 제거 확인
                    if (data.status !== '모집중') {
                        const initialBlueTeamCount = updatedBlueTeam.length;
                        updatedBlueTeam = updatedBlueTeam.filter(p => p.email !== memberEmailToRemove);
                        if (initialBlueTeamCount > updatedBlueTeam.length) {
                            wasRemovedFromMainList = true;
                        }

                        const initialRedTeamCount = updatedRedTeam.length;
                        updatedRedTeam = updatedRedTeam.filter(p => p.email !== memberEmailToRemove);
                        if (initialRedTeamCount > updatedRedTeam.length) {
                            wasRemovedFromMainList = true;
                        }
                    }

                    updatedWaitlist = updatedWaitlist.filter(p => p.email !== memberEmailToRemove);

                    // '모집중' 상태일 때, 참가자 목록에서 인원이 줄었고 대기자가 있다면 한 명을 올립니다.
                    if (data.status === '모집중' && wasRemovedFromMainList && updatedWaitlist.length > 0) {
                        const newMember = updatedWaitlist.shift(); // 대기열 첫번째 유저를 꺼냄
                        if (newMember) {
                            updatedApplicants.push(newMember); // 참가자 목록에 추가
                        }
                    }

                    transaction.update(scrimRef, {
                        applicants: updatedApplicants,
                        waitlist: updatedWaitlist,
                        blueTeam: updatedBlueTeam,
                        redTeam: updatedRedTeam
                    });
                    break;
                }
                default:
                    throw new Error("알 수 없는 요청입니다.");
            }
        });

        return NextResponse.json({ message: '작업이 성공적으로 완료되었습니다.' });

    } catch (error: unknown) {
        console.error('PUT Scrim API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '내전 관련 작업에 실패했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

// DELETE: 내전을 해체하는 함수
export async function DELETE(
    request: NextRequest,
    { params }: { params: { scrimId: string | string[] } }
) {
    try {
        const scrimId = Array.isArray(params.scrimId) ? params.scrimId[0] : params.scrimId;
        const { userEmail } = await request.json();

        if (!scrimId || !userEmail) {
            return NextResponse.json({ error: '내전 ID와 사용자 이메일이 필요합니다.' }, { status: 400 });
        }

        const scrimRef = db.collection('scrims').doc(scrimId);
        const doc = await scrimRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: '내전을 찾을 수 없습니다.' }, { status: 404 });
        }

        const data = doc.data();
        const isAdmin = await checkAdminPermission(userEmail);

        // 생성자 또는 내전관리자 이상 해체 가능
        if (data?.creatorEmail !== userEmail && !isAdmin) {
            return NextResponse.json({ error: '내전을 해체할 권한이 없습니다.' }, { status: 403 });
        }

        // Firestore 문서 삭제
        await scrimRef.delete();

        return NextResponse.json({ message: '내전이 성공적으로 해체되었습니다.' });

    } catch (error: unknown) {
        console.error('DELETE Scrim API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '내전 해체에 실패했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}