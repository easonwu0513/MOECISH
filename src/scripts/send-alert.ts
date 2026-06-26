/**
 * 健康監控警報信(獨立於 app 行程與 DB,只依賴 Graph token 檔):
 *   npx tsx src/scripts/send-alert.ts "主旨" "內文"
 * 收件人:ALERT_TO 環境變數,預設 moecish@m365.ntu.edu.tw(自寄自收)。
 */
import { isGraphConfigured, sendGraphMail } from '../lib/graph-mail';

async function main() {
  const [subject, body] = process.argv.slice(2);
  if (!subject) {
    console.error('用法: tsx src/scripts/send-alert.ts "主旨" "內文"');
    process.exit(2);
  }
  if (!(await isGraphConfigured())) {
    console.error('[alert] Graph 未初始化,無法寄警報(請先 npm run graph:init)');
    process.exit(3);
  }
  await sendGraphMail({
    to: process.env.ALERT_TO ?? 'moecish@m365.ntu.edu.tw',
    toName: 'MOECISH 維運',
    subject,
    // 此路徑刻意不經 lib/email(獨立於 app/DB);footer 於此就地附加,與 sendEmail 一致
    bodyText: `${body ?? '(無內容)'}\n\n──────────\n此封信為系統自動寄發,請勿直接回信。`,
  });
  console.log('[alert] sent');
}

main().catch((e) => {
  console.error('[alert] failed:', (e as Error).message);
  process.exit(1);
});
