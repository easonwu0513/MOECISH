import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user;

  // Find cycles by role
  let cycles: Awaited<ReturnType<typeof prisma.auditCycle.findMany>> = [];
  if (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') {
    if (!user.organizationId) redirect('/login');
    cycles = await prisma.auditCycle.findMany({
      where: { organizationId: user.organizationId },
      include: { organization: true },
      orderBy: { year: 'desc' },
    });
  } else {
    cycles = await prisma.auditCycle.findMany({
      include: { organization: true },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">MOECISH 稽核管考系統</h1>
          <p className="text-slate-500 mt-1">{user.name}（{roleLabel(user.role)}）· {user.organizationName ?? '—'}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="text-sm text-slate-600 hover:text-brand-600">登出</button>
        </form>
      </header>

      <section className="bg-white rounded-xl shadow border p-6">
        <h2 className="font-semibold mb-4">我的稽核週期</h2>
        {cycles.length === 0 ? (
          <p className="text-slate-500 text-sm">目前沒有可見的稽核週期</p>
        ) : (
          <ul className="divide-y">
            {cycles.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {c.year - 1911} 年度（{c.year}）— {(c as unknown as { organization: { name: string } }).organization.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    狀態：{c.status} · 截止：{new Date(c.dueDate).toLocaleDateString('zh-TW')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className="text-sm text-brand-600 hover:underline" href={`/cycles/${c.id}`}>進入</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function roleLabel(role: string) {
  switch (role) {
    case 'ADMIN': return '平台管理員';
    case 'AUDITOR': return '稽核委員';
    case 'RESPONDENT': return '填報人';
    case 'SUPERVISOR': return '單位主管';
    default: return role;
  }
}
