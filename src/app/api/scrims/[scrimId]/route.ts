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
    // 클라이언트에서 전송하는 assignedPosition 필드를 서버에서도 인식하도록 추가
    assignedPosition?: string;
    championImageUrl?: string; // 👈 [추가]
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

     // (일반/피어리스) 영구 전적 기록용 필드
     matchChampionHistory?: {
        matchId: string;
        matchDate: admin.firestore.Timestamp | Date;
        blueTeamChampions: { playerEmail: string; champion: string; position: string; }[];
        redTeamChampions: { playerEmail: string; champion: string; position: string; }[];
    }[];

    // [추가] 피어리스 내전에서 사용된 챔피언 목록 (금지 목록)
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
        return userData?.role === '총관리자' || userData?.role === '관리자';
    } catch (error) {
        console.error('관리자 권한 확인 중 에러 발생:', error);
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

        // 2. ✅ [핵심] blueTeam과 redTeam 데이터에 이미지 URL을 추가합니다.
        if (data) {
            const addImageUrl = (teamData: any[]) => (teamData || []).map(player => ({
                ...player,
                championImageUrl: championImageMap.get(player.champion) || null
            }));

            data.blueTeam = addImageUrl(data.blueTeam);
            data.redTeam = addImageUrl(data.redTeam);
        }
        
        // 3. 모든 Timestamp를 문자열로 변환합니다.
        const serializeData = (obj: any): any => {
            if (!obj) return obj;
            if (obj.toDate && typeof obj.toDate === 'function') return obj.toDate().toISOString();
            if (Array.isArray(obj)) return obj.map(serializeData);
            if (typeof obj === 'object') {
                const newObj: { [key: string]: any } = {};
                for (const key in obj) {
                    newObj[key] = serializeData(obj[key]);
                }
                return newObj;
            }
            return obj;
        };
        
        const finalData = serializeData({
            scrimId: doc.id,
            ...data,
        });

        return NextResponse.json(finalData);

    } catch (error) {
        console.error('GET Scrim Detail API Error:', error);
        return NextResponse.json({ error: '내전 정보를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}

// --- API 핸들러: PATCH (매치 정보 수정) ---
export async function PATCH(
    request: NextRequest,
    { params }: { params: { matchId: string } }
) {
    try {
        const { matchId } = await params;
        const { team, playerEmail, newChampion, requesterEmail } = await request.json();

        if (!matchId || !team || !playerEmail || !newChampion || !requesterEmail) {
            return NextResponse.json({ error: '필요한 정보가 누락되었습니다.' }, { status: 400 });
        }

        const hasPermission = await checkAdminPermission(requesterEmail);
        if (!hasPermission) {
            return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
        }

        const matchRef = db.collection('matches').doc(matchId);
        const doc = await matchRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: '매치를 찾을 수 없습니다.' }, { status: 404 });
        }

        const matchData = doc.data();
        const teamKey = team === 'blue' ? 'blueTeam' : 'redTeam';
        const teamData = matchData?.[teamKey] || [];

        const playerIndex = teamData.findIndex((p: { email: string }) => p.email === playerEmail);
        if (playerIndex === -1) {
            return NextResponse.json({ error: '해당 플레이어를 찾을 수 없습니다.' }, { status: 404 });
        }

        teamData[playerIndex].champion = newChampion;

        await matchRef.update({ [teamKey]: teamData });

        return NextResponse.json({ message: '챔피언 정보가 성공적으로 수정되었습니다.' });

    } catch (error) {
        console.error('PATCH Match API Error:', error);
        return NextResponse.json({ error: '챔피언 정보 수정에 실패했습니다.' }, { status: 500 });
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

            // 참가, 팀 구성 등 나머지 로직은 하나의 트랜잭션으로 처리
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(scrimRef);
                if (!doc.exists) throw new Error("내전을 찾을 수 없습니다.");

                const data = doc.data() as ScrimData; // ScrimData 타입으로 명시적으로 캐스팅
                // body에서 필요한 변수들을 이 안에서 구조분해 할당합니다.
                const { applicantData, teams, winningTeam, championData, memberEmailToRemove, scrimType } = body;

                // Firestore에서 받아온 데이터를 타입 가드와 기본값으로 안전하게 초기화
                let applicants: Applicant[] = (data?.applicants || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let waitlist: Applicant[] = (data?.waitlist || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let blueTeam: Applicant[] = (data?.blueTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');
                let redTeam: Applicant[] = (data?.redTeam || []).filter((item: any): item is Applicant => item && typeof item === 'object' && typeof item.email === 'string');

                let hasPermission = true;
                // 'reset_peerless' 액션도 권한 확인 대상에 포함
                if (['start_team_building', 'update_teams', 'start_game', 'reset_to_team_building', 'reset_to_recruiting', 'remove_member','end_game', 'reset_peerless'].includes(action)) {
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
                        if (applicants.length < 10) {
                            throw new Error("팀 구성을 시작하려면 최소 10명의 참가자가 필요합니다.");
                        }
                        // ⭐️ [핵심 로직] 칼바람 모드일 경우 자동 랜덤 분배 ⭐️
                        if (data.scrimType === '칼바람') {
                            // 참가자 배열 복사 후 랜덤으로 섞기 (Fisher-Yates Shuffle)
                            const shuffledApplicants = [...applicants];
                            for (let i = shuffledApplicants.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [shuffledApplicants[i], shuffledApplicants[j]] = [shuffledApplicants[j], shuffledApplicants[i]];
                            }

                            const newBlueTeam = shuffledApplicants.slice(0, 5);
                            const newRedTeam = shuffledApplicants.slice(5, 10);

                            transaction.update(scrimRef, {
                                status: '팀 구성중', // 제안대로 '팀 구성중' 상태로 변경
                                blueTeam: newBlueTeam,
                                redTeam: newRedTeam,
                                applicants: [], // 참가자 목록은 비우는 것이 맞습니다.
                            });
                        } else {
                            // ✅ [수정] status 변경과 함께 applicants를 blueTeam, redTeam으로 옮기고 비웁니다.
                            const newBlueTeam = data.applicants.slice(0, 5);
                            const newRedTeam = data.applicants.slice(5, 10);

                            transaction.update(scrimRef, { 
                                status: '팀 구성중',
                                blueTeam: newBlueTeam,
                                redTeam: newRedTeam,
                                applicants: [] // 👈 핵심: 참가자 목록을 비워줍니다.
                            });
                        }
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
                        transaction.update(scrimRef, {
                            status: '팀 구성중',
                            winningTeam: admin.firestore.FieldValue.delete(),
                            startTime: admin.firestore.FieldValue.delete(),
                        });
                        break;
                    }
                    // ✅ [추가] 팀을 초기화하고 모든 선수를 참가자로 보내는 로직
                    case 'reset_teams_and_move_to_applicants': {
                        const allPlayersInTeams = [...(data.blueTeam || []), ...(data.redTeam || [])];
                        const currentApplicants = data.applicants || [];
                        
                        const mergedApplicantsMap = new Map();
                        [...currentApplicants, ...allPlayersInTeams].forEach(p => mergedApplicantsMap.set(p.email, p));
                        const newApplicants = Array.from(mergedApplicantsMap.values());

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
                            // waitlist: [],
                            winningTeam: admin.firestore.FieldValue.delete(),
                            startTime: admin.firestore.FieldValue.delete(),
                            // matchChampionHistory는 reset_peerless에서만 변경되도록 유지
                        });
                        break;
                        case 'end_game': {
                            const { winningTeam, championData, scrimType } = body;

                            // ✅ [추가] 새로운 match 문서를 생성하고 데이터를 저장합니다.
                            const newMatchDocRef = db.collection('matches').doc();
                            const matchData = {
                                scrimId: scrimId,
                                winningTeam: winningTeam,
                                matchDate: admin.firestore.FieldValue.serverTimestamp(),
                                blueTeam: championData.blueTeam,
                                redTeam: championData.redTeam,
                            };
                            // 트랜잭션 외부에서 먼저 생성하거나, 트랜잭션 내에서 set으로 처리할 수 있습니다.
                            // 여기서는 트랜잭션 밖에서 생성하여 ID를 미리 확보합니다.
                            await newMatchDocRef.set(matchData);

                            // 🔽 이제 data.scrimType 대신 body에서 받은 scrimType을 사용합니다.
                            if (scrimType === '피어리스') {
                                const newMatchRecord = {
                                    // matchId: db.collection('matches').doc().id,
                                    matchId: newMatchDocRef.id, // 👈 생성된 match 문서의 ID를 사용
                                    matchDate: new Date(),
                                    blueTeamChampions: championData.blueTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '', position: p.assignedPosition || '' })),
                                    redTeamChampions: championData.redTeam.map((p: Applicant) => ({ playerEmail: p.email, champion: p.champion || '', position: p.assignedPosition || '' })),
                                };
                                const championsInThisMatch = [...championData.blueTeam.map((p: Applicant) => p.champion), ...championData.redTeam.map((p: Applicant) => p.champion)].filter(Boolean);
                                
                                transaction.update(scrimRef, {
                                    status: '종료',
                                    winningTeam: winningTeam,
                                    
                                    // 🔽 [추가] 이 두 줄을 추가하여 팀 정보에 챔피언을 기록합니다.
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
                                // matchId: db.collection('matches').doc().id,
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
                                // matchId: db.collection('matches').doc().id,
                                matchId: newMatchDocRef.id, // 👈 생성된 match 문서의 ID를 사용
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
        // }

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

        // 생성자 또는 관리자만 해체 가능
        if (data?.creatorEmail !== userEmail && !isAdmin) {
            return NextResponse.json({ error: '내전을 해체할 권한이 없습니다.' }, { status: 403 });
        }

        // Firestore 문서 삭제
        await scrimRef.delete();

        // 성공적으로 JSON 응답을 반환
        return NextResponse.json({ message: '내전이 성공적으로 해체되었습니다.' });

    } catch (error: unknown) {
        console.error('DELETE Scrim API Error:', error);
        const errorMessage = error instanceof Error ? error.message : '내전 해체에 실패했습니다.';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}