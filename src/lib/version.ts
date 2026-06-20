// 部署版號:build 時由 .env.production 注入 git 短雜湊與建置時間(見部署腳本)。
// 開發時為 'dev'。用於頁尾顯示與 /api/version,讓使用者與維運確認「看到的是最新板」。
export const APP_VERSION = '2.0';
export const BUILD_REV = process.env.NEXT_PUBLIC_BUILD_REV ?? 'dev';
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? '';
