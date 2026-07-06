import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * 手動信件留存(信件管理 → 信件範本):承辦以範本產生信件、複製到外部郵件用戶端寄出後,
 * 可一鍵把「主旨+內文全文+對象」留存為 EmailLog(kind=letter-manual, status=manual),
 * 讓「系統寄件紀錄」成為自動通知+手動公文的單一往來檔案(政府稽核留存需求)。
 * 不寄信、不進 Graph 管線;只寫紀錄。SUPER_ADMIN 專用(信件管理模組同權限)。
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 });
  }
  const b = (raw ?? {}) as Record<string, unknown>;
  // 長度上限:防灌爆(內文 5 萬字已遠超任何公文);非字串一律視為空
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
  const subject = s(b.subject, 500);
  const bodyText = s(b.bodyText, 50000);
  const title = s(b.title, 200);
  const templateKey = s(b.templateKey, 100) || null;
  const hospital = s(b.hospital, 200);
  const audience = s(b.audience, 300);
  if (!subject || !bodyText) {
    return NextResponse.json({ error: '主旨與內文為必填' }, { status: 400 });
  }
  const log = await prisma.emailLog.create({
    data: {
      toEmail: '(外部寄送)',
      toName: hospital || audience || null,
      subject,
      body: bodyText,
      kind: 'letter-manual',
      status: 'manual', // 非投遞狀態:此信由承辦於外部寄出,平台僅留存(死信補寄 timer 不掃 manual)
      templateKey,
      context: JSON.stringify({
        manualLetter: true,
        title,
        hospital,
        audience,
        loggedById: session.user.id,
        loggedByName: session.user.name,
      }),
    },
  });
  return NextResponse.json({ ok: true, id: log.id });
}
