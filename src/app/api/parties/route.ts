import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

// 타입 정의
interface Member {
  email: string;
  positions: string[];
}

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
      // Firestore 타임스탬프를 ISO 문자열로 변환
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      parties.push({
        partyId: doc.id,
        ...data,
        createdAt,
      });
    });

    return NextResponse.json(parties);

  } catch (error) {
    console.error('GET Parties API Error:', error);
    return NextResponse.json({ error: '파티 목록을 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 새로운 파티를 만드는 함수
export async function POST(request: Request) {
  try {
    const { partyName, creatorEmail, partyType } = await request.json();
    if (!partyName || !creatorEmail || !partyType) {
      return NextResponse.json({ error: '모든 정보가 필요합니다.' }, { status: 400 });
    }

    let maxMembers;
    switch (partyType) {
      case '자유랭크': maxMembers = 5; break;
      case '듀오랭크': maxMembers = 2; break;
      case '기타': maxMembers = 10; break;
      default: return NextResponse.json({ error: '알 수 없는 파티 타입입니다.' }, { status: 400 });
    }

    const newParty = {
      partyType,
      partyName,
      maxMembers,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      membersData: [{ email: creatorEmail, positions: ['ALL'] }],
      waitingData: [],
    };

    const docRef = await db.collection('parties').add(newParty);

    return NextResponse.json({ message: '파티가 성공적으로 생성되었습니다.', partyId: docRef.id });

  } catch (error) {
    console.error('POST Party API Error:', error);
    return NextResponse.json({ error: '파티 생성에 실패했습니다.' }, { status: 500 });
  }
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

// PUT: 파티 참가/나가기/대기열을 처리하는 함수
export async function PUT(request: Request) {
  try {
    const { partyId, userData, action } = await request.json();
    const userEmail = userData.email;
    
    const partyRef = db.collection('parties').doc(partyId);
    const doc = await partyRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
    }

    const partyData = doc.data();
    
    // --- 버그 수정: 안전한 파싱 함수 사용 ---
    let members: Member[] = safeParse(partyData?.membersData);
    let waiting: Member[] = safeParse(partyData?.waitingData);
    
    const maxMembers = Number(partyData?.maxMembers) || 5;
    
    if (action === 'join') {
      if (members.length >= maxMembers) {
        return NextResponse.json({ error: '파티 정원이 가득 찼습니다.' }, { status: 400 });
      }
      if (!members.some(m => m.email === userEmail)) members.push(userData);
    } else if (action === 'leave') {
      members = members.filter(m => m.email !== userEmail);
      if (members.length < maxMembers && waiting.length > 0) {
        const newMember = waiting.shift();
        if (newMember) members.push(newMember);
      }
    } else if (action === 'join_waitlist') {
      if (waiting.length >= 5) return NextResponse.json({ error: '대기열이 가득 찼습니다.' }, { status: 400 });
      if (!waiting.some(w => w.email === userEmail) && !members.some(m => m.email === userEmail)) waiting.push(userData);
    } else if (action === 'leave_waitlist') {
      waiting = waiting.filter(w => w.email !== userEmail);
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
export async function PATCH(request: Request) {
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

    if (action === 'update_positions') {
      const { newPositions } = body;
      const memberIndex = members.findIndex(m => m.email === userEmail);
      if (memberIndex === -1) {
        return NextResponse.json({ error: '파티 멤버가 아닙니다.' }, { status: 403 });
      }
      members[memberIndex].positions = newPositions;
      await partyRef.update({ membersData: members });
      return NextResponse.json({ message: '포지션이 성공적으로 변경되었습니다.' });

    } else if (action === 'update_name') {
      const { newPartyName } = body;
      const leader = members[0];
      if (!leader || leader.email !== userEmail) {
        return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
      }
      await partyRef.update({ partyName: newPartyName });
      return NextResponse.json({ message: '파티 이름이 성공적으로 변경되었습니다.' });
    } else {
      return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
    }

  } catch (error) {
    console.error('PATCH Party API Error:', error);
    return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
  }
}
