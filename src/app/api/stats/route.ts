import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { NextResponse } from 'next/server';

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

        return NextResponse.json(stats);

    } catch (error) {
        console.error('Sheet API Error:', error);
        return NextResponse.json({ error: '전적통계 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}
