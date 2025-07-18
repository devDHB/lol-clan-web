import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

// 타입 정의
interface StatRow {
  [key: string]: string | number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID as string, serviceAccountAuth);
    await doc.loadInfo(); 
    const sheet = doc.sheetsByTitle['전적통계']; 
    const rows = await sheet.getRows();
    const stats = rows.map(row => row.toObject());

    // 랭킹 계산 로직
    const getTop3 = (data: StatRow[], key: string, gameKey?: string, minGames = 0) => {
      return [...data]
        .filter(p => gameKey ? Number(p[gameKey]) >= minGames : true)
        .sort((a, b) => Number(b[key]) - Number(a[key]))
        .slice(0, 3)
        .map(p => ({ 닉네임: String(p['닉네임']), value: Number(p[key]) }));
    };
    
    const rankings = {
      꾸준왕: getTop3(stats, '총 경기'),
      다승: getTop3(stats, '총 승'),
      승률: getTop3(stats, '승률', '총 경기', 5),
      TOP: getTop3(stats, 'TOP 승'),
      JG: getTop3(stats, 'JG 승'),
      MID: getTop3(stats, 'MID 승'),
      AD: getTop3(stats, 'AD 승'),
      SUP: getTop3(stats, 'SUP 승'),
    };

    return NextResponse.json(rankings);

  } catch (error) {
    console.error('Rankings API Error:', error);
    return NextResponse.json({ error: '랭킹 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
  }
}
