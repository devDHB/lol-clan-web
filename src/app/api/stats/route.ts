import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

// 이 함수는 API 요청이 있을 때마다 실행됩니다.
export async function GET(request: Request) {
    try {
        // 인증 정보 설정
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // 시트 문서 객체 생성
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID as string, serviceAccountAuth);

        // 시트 정보 로드
        await doc.loadInfo();

        // '전적통계' 시트 선택
        const sheet = doc.sheetsByTitle['전적통계'];

        // 시트의 모든 행(row)을 가져옵니다. (헤더 제외)
        const rows = await sheet.getRows();

        // 각 행의 데이터를 깔끔한 JSON 형태로 변환
        const stats = rows.map(row => row.toObject());

        // 성공적으로 데이터를 가져왔으면, JSON 형태로 응답
        return NextResponse.json(stats);

    } catch (error) {
        console.error('Sheet API Error:', error);
        return NextResponse.json({ error: '전적통계 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}