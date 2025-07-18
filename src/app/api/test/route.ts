import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        // --- 수정된 인증 방식 ---
        // 1. 서비스 계정 인증 정보 설정 (JWT 사용)
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
            ],
        });

        // 2. 시트 ID와 인증 정보를 함께 전달하여 문서 객체 생성
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID as string, serviceAccountAuth);
        // --- 수정 끝 ---

        // 시트 정보 로드
        await doc.loadInfo();

        // '경기결과' 시트 선택
        const sheet = doc.sheetsByTitle['경기결과'];

        // A1 셀의 값을 읽어옴
        await sheet.loadCells('A1');
        const a1 = sheet.getCell(0, 0);

        return NextResponse.json({
            message: "연결 성공!",
            sheetTitle: sheet.title,
            cellValue: a1.value
        });

    } catch (error) {
        console.error('Sheet API Error:', error);
        return NextResponse.json({ error: '시트 연결에 실패했습니다.' }, { status: 500 });
    }
}