import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** 目前登入者的站內通知(最新 30 筆)+ 未讀數。 */
export async function GET() {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
    const userId = session.user.id;
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return NextResponse.json({ items, unreadCount });
  } catch (e) {
    return errorResponse(e);
  }
}
