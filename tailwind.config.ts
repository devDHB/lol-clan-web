import type { Config } from 'tailwindcss'

const config: Config = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                // ✅ [수정] 각 폰트 목록에 Pretendard를 우선순위로 추가합니다.
                beaufort: ['"Beaufort for LOL"', 'Pretendard', '"Noto Sans KR"', 'serif'],
                spiegel: ['"Spiegel"', 'Pretendard', '"Noto Sans KR"', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
export default config
