import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { errorResponse } from '@/lib/api';

/**
 * 側欄「事前場次調查」樹的年度清單(僅中心;供「歷年資料」子節點)。
 * 年度 = SurveySession ∪ SurveyParticipant 出現過的年度 ∪ 當年度,降冪。
 */
export async function GET() {
  try {
    await requireRole('SUPER_ADMIN');
    const [sess, part] = await Promise.all([
      prisma.surveySession.findMany({ distinct: ['year'], select: { year: true } }),
      prisma.surveyParticipant.findMany({ distinct: ['year'], select: { year: true } }),
    ]);
    const set = new Set<number>([...sess.map((r) => r.year), ...part.map((r) => r.year), new Date().getFullYear()]);
    const years = [...set].sort((a, b) => b - a);
    return NextResponse.json({ years });
  } catch (e) {
    return errorResponse(e);
  }
}
