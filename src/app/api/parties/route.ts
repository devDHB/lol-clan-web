import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin'; // Firebase Admin SDK 인스턴스
import admin from 'firebase-admin'; // admin 객체 직접 임포트

// 타입 정의
interface Member {
  email: string;
  positions: string[];
}

interface PartyData { // 서버에서 파티 데이터를 다룰 때 사용할 인터페이스
    partyType: string;
    partyName: string;
    maxMembers: number;
    createdAt: admin.firestore.FieldValue;
    membersData: Member[];
    waitingData: Member[];
    requiredTier?: string; // 파티에 필요한 최소 티어 (예: Gold IV 이상)
    startTime?: string | admin.firestore.FieldValue; // 파티 시작 시간 (텍스트 또는 Timestamp)
}

// 안전한 데이터 파싱을 위한 헬퍼 함수
const safeParse = (data: unknown): Member[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

// GET: 모든 파티 목록을 가져오는 함수
export async function GET() {
  try {
    const partiesCollection = db.collection('parties');
    const snapshot = await partiesCollection.orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      return NextResponse.json([]);
    }

    const parties: unknown[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      // startTime 필드 추가: Timestamp일 경우 변환, 문자열일 경우 그대로 사용
      let startTime = null;
      if (data.startTime) {
          if (data.startTime.toDate) { // Firestore Timestamp인 경우
              startTime = data.startTime.toDate().toISOString(); // ISO string으로 변환
          } else if (typeof data.startTime === 'string') { // 문자열인 경우
              startTime = data.startTime; // 문자열 그대로 사용
          }
      }

      parties.push({
        partyId: doc.id,
        ...data,
        createdAt,
        startTime, // startTime 반환
      });
    });

    return NextResponse.json(parties);

  } catch (error) {
    console.error('GET Parties API Error:', error);
    return NextResponse.json({ error: '파티 목록을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새로운 파티를 만드는 함수
export async function POST(request: NextRequest) { // Request 대신 NextRequest 사용 권장
  try {
    // requiredTier와 startTime을 request.json()에서 받도록 추가
    const { partyName, creatorEmail, partyType, requiredTier, startTime } = await request.json();

    // 유효성 검사 업데이트
    if (!partyName || !creatorEmail || !partyType) {
      return NextResponse.json({ error: '파티 이름, 생성자 이메일, 파티 타입은 필수입니다.' }, { status: 400 });
    }

    // 듀오랭크/자유랭크에만 티어 필수, 기타는 선택
    if ((partyType === '자유랭크' || partyType === '듀오랭크') && (!requiredTier || requiredTier.trim() === '')) {
        return NextResponse.json({ error: '자유랭크 또는 듀오랭크는 필수 티어가 필요합니다.' }, { status: 400 });
    }

    let maxMembers;
    switch (partyType) {
      case '자유랭크': maxMembers = 5; break;
      case '듀오랭크': maxMembers = 2; break;
      case '기타': maxMembers = 10; break;
      default: return NextResponse.json({ error: '알 수 없는 파티 타입입니다.' }, { status: 400 });
    }

    const newParty: PartyData = { // PartyData 인터페이스 사용
      partyType,
      partyName,
      maxMembers,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      membersData: [{ email: creatorEmail, positions: ['ALL'] }], // 파티장은 ALL로 시작
      waitingData: [],
      // --- 새로 추가된 필드 ---
      requiredTier: (partyType === '자유랭크' || partyType === '듀오랭크') ? (requiredTier || undefined) : undefined, // 특정 타입에만 저장
      // startTime이 제공되면 문자열 그대로 저장, 아니면 null (즉시 시작)
      startTime: (startTime && startTime.trim() !== '') ? startTime.trim() : null,
      // --- 추가 필드 끝 ---
    };

    const docRef = await db.collection('parties').add(newParty);

    return NextResponse.json({ message: '파티가 성공적으로 생성되었습니다.', partyId: docRef.id });

  } catch (error) {
    console.error('POST Party API Error:', error);
    return NextResponse.json({ error: '파티 생성에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 파티 참가/나가기/대기열을 처리하는 함수
export async function PUT(request: NextRequest) { // Request 대신 NextRequest 사용 권장
  try {
    const { partyId, userData, action } = await request.json();
    const userEmail = userData.email;

    const partyRef = db.collection('parties').doc(partyId);
    const doc = await partyRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
    }

    const partyData = doc.data();

    let members: Member[] = safeParse(partyData?.membersData);
    let waiting: Member[] = safeParse(partyData?.waitingData);

    const maxMembers = Number(partyData?.maxMembers) || 5;

    if (action === 'join') {
      if (members.length >= maxMembers) {
        return NextResponse.json({ error: '파티 정원이 가득 찼습니다.' }, { status: 400 });
      }
      if (!members.some((m: Member) => m.email === userEmail)) members.push(userData);
    } else if (action === 'leave') {
      members = members.filter((m: Member) => m.email !== userEmail);
      if (members.length < maxMembers && waiting.length > 0) {
        const newMember = waiting.shift();
        if (newMember) members.push(newMember);
      }
    } else if (action === 'join_waitlist') {
      if (waiting.length >= 5) return NextResponse.json({ error: '대기열이 가득 찼습니다.' }, { status: 400 });
      if (!waiting.some((w: Member) => w.email === userEmail) && !members.some((m: Member) => m.email === userEmail)) waiting.push(userData);
    } else if (action === 'leave_waitlist') {
      waiting = waiting.filter((w: Member) => w.email !== userEmail);
    }

    if (members.length === 0) {
      await partyRef.delete();
      return NextResponse.json({ message: '파티가 비어서 자동으로 삭제되었습니다.' });
    } else {
      await partyRef.update({
        membersData: members,
        waitingData: waiting
      });
      return NextResponse.json({ message: '파티 정보가 업데이트되었습니다.' });
    }
  } catch (error) {
    console.error('PUT Party API Error:', error);
    return NextResponse.json({ error: '파티 정보 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// PATCH: 파티 이름 또는 멤버 포지션을 수정하는 함수
export async function PATCH(request: NextRequest) { // Request 대신 NextRequest 사용 권장
  try {
    const body = await request.json();
    const { partyId, userEmail, action } = body;

    const partyRef = db.collection('parties').doc(partyId);
    const doc = await partyRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
    }

    const partyData = doc.data();
    const members: Member[] = safeParse(partyData?.membersData);

    // 사용자가 현재 파티의 멤버인지 확인 (대기 멤버 제외)
    const isCurrentMember = members.some((m: Member) => m.email === userEmail);
    // 관리자 권한 확인 (checkAdminPermission 함수가 정의되어 있다고 가정)
    // const isAdmin = await checkAdminPermission(userEmail);
    const isAdmin = false; // checkAdminPermission 함수가 없으므로 임시로 false로 설정

    if (action === 'update_positions') {
      // 포지션 수정은 해당 멤버만 가능
      if (!isCurrentMember) { // 현재 파티 멤버인지 확인
        return NextResponse.json({ error: '포지션을 수정할 권한이 없습니다.' }, { status: 403 });
      }
      const { newPositions } = body;
      const memberIndex = members.findIndex((m: Member) => m.email === userEmail);
      if (memberIndex === -1) { // isCurrentMember가 true이면 이 조건은 불필요하지만 안전을 위해 유지
        return NextResponse.json({ error: '파티 멤버가 아닙니다.' }, { status: 403 });
      }
      members[memberIndex].positions = newPositions;
      await partyRef.update({ membersData: members });
      return NextResponse.json({ message: '포지션이 성공적으로 변경되었습니다.' });

    } else if (action === 'update_name') {
      const { newPartyName } = body;
      // 파티 이름 수정은 파티 멤버 또는 관리자만 가능
      if (!isCurrentMember && !isAdmin) {
        return NextResponse.json({ error: '파티 이름을 수정할 권한이 없습니다.' }, { status: 403 });
      }
      await partyRef.update({ partyName: newPartyName });
      return NextResponse.json({ message: '파티 이름이 성공적으로 변경되었습니다.' });
    } else if (action === 'update_details') { // 새로운 액션 처리
        const { newPartyName, newRequiredTier, newStartTime } = body;

        // 파티 세부 정보 수정은 파티 멤버 또는 관리자만 가능
        if (!isCurrentMember && !isAdmin) {
            return NextResponse.json({ error: '파티 세부 정보를 수정할 권한이 없습니다.' }, { status: 403 });
        }

        const updates: { [key: string]: any } = {};
        if (newPartyName !== undefined) updates.partyName = newPartyName;
        if (newRequiredTier !== undefined) updates.requiredTier = newRequiredTier;
        if (newStartTime !== undefined) {
             // startTime이 텍스트로 입력되므로 그대로 저장
            updates.startTime = (newStartTime && newStartTime.trim() !== '') ? newStartTime.trim() : null;
        }
        
        // 랭크 파티의 티어 필수 유효성 검사 (서버 측)
        if ((partyData?.partyType === '자유랭크' || partyData?.partyType === '듀오랭크') && (!newRequiredTier || newRequiredTier.trim() === '')) {
            return NextResponse.json({ error: `${partyData?.partyType} 파티는 필수 티어가 필요합니다.` }, { status: 400 });
        }


        if (Object.keys(updates).length > 0) {
            await partyRef.update(updates);
            return NextResponse.json({ message: '파티 세부 정보가 성공적으로 변경되었습니다.' });
        } else {
            return NextResponse.json({ message: '변경할 내용이 없습니다.' });
        }

    } else {
      return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
    }

  } catch (error) {
    console.error('PATCH Party API Error:', error);
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 파티를 삭제하는 함수
export async function DELETE(request: NextRequest) { // Request 대신 NextRequest 사용 권장
  try {
    const { partyId, requesterEmail } = await request.json();

    if (!partyId || !requesterEmail) {
      return NextResponse.json({ error: '파티 ID와 요청자 정보가 필요합니다.' }, { status: 400 });
    }

    // 1. 요청자의 권한 확인
    const usersCollection = db.collection('users');
    const userSnapshot = await usersCollection.where('email', '==', requesterEmail).limit(1).get();

    if (userSnapshot.empty) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    const userRole = userSnapshot.docs[0].data().role;

    // 2. 파티 정보 확인
    const partyRef = db.collection('parties').doc(partyId);
    const partyDoc = await partyRef.get();
    if (!partyDoc.exists) {
      return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
    }
    const partyData = partyDoc.data();
    const members: Member[] = safeParse(partyData?.membersData);
    const leaderEmail = members.length > 0 ? members[0].email : null;

    // 3. 권한 검증: 총관리자, 관리자, 또는 파티장
    const hasPermission =
      userRole === '총관리자' ||
      userRole === '관리자' ||
      requesterEmail === leaderEmail;

    if (!hasPermission) {
      return NextResponse.json({ error: '파티를 해체할 권한이 없습니다.' }, { status: 403 });
    }

    // 4. 파티 삭제
    await partyRef.delete();

    return NextResponse.json({ message: '파티가 성공적으로 해체되었습니다.' });

  } catch (error) {
    console.error('DELETE Party API Error:', error);
    return NextResponse.json({ error: '파티 해체에 실패했습니다.' }, { status: 500 });
  }
}
