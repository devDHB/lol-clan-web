import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// --- 헬퍼 함수 ---
async function getSheet() {
    const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID as string, serviceAccountAuth);
    await doc.loadInfo();
    return doc.sheetsByTitle['파티'];
}

// 타입 정의
interface Member {
    email: string;
    positions: string[];
}

export async function GET(_request: Request) { // 'request' -> '_request'
    try {
        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const parties = rows.map(row => row.toObject());
        return NextResponse.json(parties);
    } catch (error) {
        console.error('GET Parties API Error:', error);
        return NextResponse.json({ error: '파티 목록을 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { partyName, creatorEmail, partyType } = await request.json();
        if (!partyName || !creatorEmail || !partyType) {
            return NextResponse.json({ error: '모든 정보가 필요합니다.' }, { status: 400 });
        }

        const sheet = await getSheet();

        let maxMembers;
        switch (partyType) {
            case '자유랭크': maxMembers = 5; break;
            case '듀오랭크': maxMembers = 2; break;
            case '기타': maxMembers = 10; break;
            default: return NextResponse.json({ error: '알 수 없는 파티 타입입니다.' }, { status: 400 });
        }

        const newParty = {
            partyId: uuidv4(),
            partyType: partyType,
            partyName: partyName,
            membersData: JSON.stringify([{ email: creatorEmail, positions: ['ALL'] }]),
            waitingData: JSON.stringify([]),
            createdAt: new Date().toISOString(),
            maxMembers: maxMembers,
        };

        await sheet.addRow(newParty);
        return NextResponse.json({ message: '파티가 성공적으로 생성되었습니다.', party: newParty });
    } catch (error) {
        console.error('POST Party API Error:', error);
        return NextResponse.json({ error: '파티 생성에 실패했습니다.' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const { partyId, userData, action } = await request.json();
        const userEmail = userData.email;

        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const partyRow = rows.find(row => row.get('partyId') === partyId);

        if (!partyRow) {
            return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
        }

        const membersString = partyRow.get('membersData') as string;
        const waitingString = partyRow.get('waitingData') as string;
        let members: Member[] = membersString ? JSON.parse(membersString) : [];
        let waiting: Member[] = waitingString ? JSON.parse(waitingString) : [];

        if (action === 'join') {
            if (members.length >= 5) return NextResponse.json({ error: '파티 정원이 가득 찼습니다.' }, { status: 400 });
            if (!members.some(m => m.email === userEmail)) members.push(userData);
        } else if (action === 'leave') {
            members = members.filter(m => m.email !== userEmail);
            if (members.length < 5 && waiting.length > 0) {
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
            await partyRow.delete();
            return NextResponse.json({ message: '파티가 비어서 자동으로 삭제되었습니다.' });
        } else {
            partyRow.set('membersData', JSON.stringify(members));
            partyRow.set('waitingData', JSON.stringify(waiting));
            await partyRow.save();
            return NextResponse.json({ message: '파티 정보가 업데이트되었습니다.' });
        }
    } catch (error) {
        console.error('PUT Party API Error:', error);
        return NextResponse.json({ error: '파티 정보 업데이트에 실패했습니다.' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { partyId, userEmail, action } = body;

        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const partyRow = rows.find(row => row.get('partyId') === partyId);

        if (!partyRow) {
            return NextResponse.json({ error: '파티를 찾을 수 없습니다.' }, { status: 404 });
        }

        if (action === 'update_positions') {
            const { newPositions } = body;
            let members: Member[] = JSON.parse(partyRow.get('membersData') as string || '[]');

            const memberIndex = members.findIndex(m => m.email === userEmail);
            if (memberIndex === -1) {
                return NextResponse.json({ error: '파티 멤버가 아닙니다.' }, { status: 403 });
            }

            members[memberIndex].positions = newPositions;
            partyRow.set('membersData', JSON.stringify(members));
            await partyRow.save();
            return NextResponse.json({ message: '포지션이 성공적으로 변경되었습니다.' });

        } else {
            const { newPartyName } = body;
            const members: Member[] = JSON.parse(partyRow.get('membersData') as string || '[]'); // 'let' -> 'const'
            const leader = members[0];

            if (!leader || leader.email !== userEmail) {
                return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
            }

            partyRow.set('partyName', newPartyName);
            await partyRow.save();
            return NextResponse.json({ message: '파티 이름이 성공적으로 변경되었습니다.' });
        }

    } catch (error) {
        console.error('PATCH Party API Error:', error);
        return NextResponse.json({ error: '업데이트에 실패했습니다.' }, { status: 500 });
    }
}
