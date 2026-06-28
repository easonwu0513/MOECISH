import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

/** 標記通知已讀:body {id} 標記單筆;無 id 則全部標為已讀。where 一律帶 userId 防越權。 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));
    const id = (body as { id?: string }).id;
    const where = id ? { id, userId, readAt: null } : { userId, readAt: null };
    await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
    return NextResponse.json({ ok: true, unreadCount });
  } catch (e) {
    return errorResponse(e);
  }
}
