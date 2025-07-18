import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: (process.env.GOOGLE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
            ],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID as string, serviceAccountAuth);

        await doc.loadInfo();

        const sheet = doc.sheetsByTitle['경기결과'];

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
