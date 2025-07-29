import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin'; // Firebase Admin SDK 인스턴스
import admin from 'firebase-admin'; // admin 객체 직접 임포트

// 타입 정의
interface Member {
  email: string;
  positions: string[];
}

interface PartyData {
  partyType: string;
  partyName: string;
  maxMembers: number;
  createdAt: admin.firestore.FieldValue;
  membersData: Member[];
  waitingData: Member[];
  requiredTier?: string;
  startTime?: string | null;
  playStyle?: '즐겜' | '빡겜';
}

const safeParse = (data: unknown): Member[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
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
        startTime,
      });
    });

    return NextResponse.json(parties);

  } catch (error) {
    console.error('GET Parties API Error:', error);
    return NextResponse.json({ error: '파티 목록을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새로운 파티를 만드는 함수
export async function POST(request: NextRequest) {
  try {
    const { partyName, creatorEmail, partyType, requiredTier, startTime, playStyle } = await request.json();

    if (!partyName || !creatorEmail || !partyType) {
      return NextResponse.json({ error: '파티 이름, 생성자 이메일, 파티 타입은 필수입니다.' }, { status: 400 });
    }
    if ((partyType === '자유랭크' || partyType === '솔로/듀오랭크') && (!requiredTier || requiredTier.trim() === '')) {
      return NextResponse.json({ error: '랭크 파티는 필수 티어가 필요합니다.' }, { status: 400 });
    }

    let maxMembers;
    // ✅ [수정] '듀오랭크'를 '솔로/듀오랭크'로 변경
    switch (partyType) {
      case '자유랭크': maxMembers = 5; break;
      case '솔로/듀오랭크': maxMembers = 2; break;
      case '기타': maxMembers = 10; break;
      default: return NextResponse.json({ error: '알 수 없는 파티 타입입니다.' }, { status: 400 });
    }

    const newParty: any = {
      partyType,
      partyName,
      maxMembers,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      membersData: [{ email: creatorEmail, positions: ['ALL'] }],
      waitingData: [],
      startTime: (startTime && startTime.trim() !== '') ? startTime.trim() : null,
    };

    if (partyType === '자유랭크' || partyType === '솔로/듀오랭크') {
      newParty.requiredTier = requiredTier || '';
      newParty.playStyle = playStyle || '즐겜';
    }

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

// PATCH: 파티 정보(이름, 포지션 등)를 수정하는 함수
export async function PATCH(request: NextRequest) {
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

    const userSnapshot = await db.collection('users').where('email', '==', userEmail).limit(1).get();
    if (userSnapshot.empty) {
      return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 403 });
    }
    const userRole = userSnapshot.docs[0].data().role;
    const isMember = members.some((m: Member) => m.email === userEmail);
    const isLeader = members.length > 0 && members[0].email === userEmail;

    const hasEditPermission = userRole === '총관리자' || isLeader || isMember;

    if (action === 'update_positions') {
      if (!isMember) {
        return NextResponse.json({ error: '자신의 포지션만 수정할 수 있습니다.' }, { status: 403 });
      }
      const { newPositions } = body;
      const memberIndex = members.findIndex((m: Member) => m.email === userEmail);
      if (memberIndex > -1) {
        members[memberIndex].positions = newPositions;
        await partyRef.update({ membersData: members });
        return NextResponse.json({ message: '포지션이 성공적으로 변경되었습니다.' });
      }
    } else if (action === 'update_details') {
      if (!hasEditPermission) {
        return NextResponse.json({ error: '파티 정보를 수정할 권한이 없습니다.' }, { status: 403 });
      }
      // ✅ [수정] newPlayStyle 추가
      const { newPartyName, newRequiredTier, newStartTime, newPlayStyle } = body;
      const updates: { [key: string]: any } = {};
      if (newPartyName !== undefined) updates.partyName = newPartyName;
      if (newRequiredTier !== undefined) updates.requiredTier = newRequiredTier;
      if (newStartTime !== undefined) updates.startTime = (newStartTime && newStartTime.trim() !== '') ? newStartTime.trim() : null;
      if (newPlayStyle !== undefined) updates.playStyle = newPlayStyle; // ✅ playStyle 업데이트

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
