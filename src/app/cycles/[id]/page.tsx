import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { CYCLE_STATUS_LABELS, nextStatuses } from '@/lib/state-machine';
import type { CycleStatus, Role, SignatureRole } from '@/lib/types';
import TransitionButton from './TransitionButton';
import SignedDocumentUpload from './SignedDocumentUpload';

export default async function CyclePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) redirect(`/login?callbackUrl=/cycles/${params.id}`);
  const user = session.user;

  const cycle = await prisma.auditCycle.findUnique({
    where: { id: params.id },
    include: {
      organization: true,
      checklistVersion: { include: { items: true } },
      responses: true,
      findings: { include: { remediation: true } },
      signatures: true,
    },
  });
  if (!cycle) notFound();
  if (
    (user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') &&
    cycle.organizationId !== user.organizationId
  ) {
    redirect('/');
  }

  const total = cycle.checklistVersion.items.length;
  const filled = cycle.responses.filter((r) => r.compliance).length;
  const findingsCount = cycle.findings.length;
  const remSubmitted = cycle.findings.filter(
    (f) => f.remediation?.status === 'SUBMITTED' || f.remediation?.status === 'APPROVED',
  ).length;

  const transitions = nextStatuses(cycle.status as CycleStatus, user.role as Role);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-brand-600">← 返回</Link>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">
          {cycle.year - 1911} 年度資通安全稽核 — {cycle.organization.name}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          目前狀態：<span className="font-semibold text-brand-600">{CYCLE_STATUS_LABELS[cycle.status as CycleStatus]}</span>
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="檢核項目填答" value={`${filled} / ${total}`} />
        <Stat label="稽核發現數" value={`${findingsCount}`} />
        <Stat label="改善送審數" value={`${remSubmitted} / ${findingsCount}`} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Tile
          title="模組一　檢核表填報"
          desc="逐項填寫 83 題符合情形、說明與佐證，由主管核可送出，委員給意見、受稽機關補正。"
          href={`/cycles/${cycle.id}/checklist`}
        />
        <Tile
          title="模組二　稽核發現與改善"
          desc="實地稽核後，委員開立稽核發現；受稽機關填改善措施與執行情形；委員審核通過或持續改正。"
          href={`/cycles/${cycle.id}/findings`}
        />
        <Tile
          title="委員審閱（僅稽核委員）"
          desc="檢視機關填報、對各題給意見。"
          href={`/cycles/${cycle.id}/review`}
        />
      </section>

      <section className="bg-white border rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-3">匯出</h2>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/cycles/${cycle.id}/export/checklist`}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md"
          >
            📊 Excel 檢核表
          </a>
          <a
            href={`/api/cycles/${cycle.id}/export/remediation`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md"
          >
            📝 Word 改善報告
          </a>
          <a
            href={`/cycles/${cycle.id}/print`}
            target="_blank"
            rel="noopener"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm rounded-md"
          >
            🖨️ PDF 綜合報告（瀏覽器另存）
          </a>
        </div>
      </section>

      {(user.role === 'RESPONDENT' || user.role === 'SUPERVISOR') && (() => {
        const myRole: SignatureRole = user.role === 'SUPERVISOR' ? 'SUPERVISOR' : 'RESPONDENT';
        const existing = cycle.signatures
          .filter((s) => s.signerRole === myRole)
          .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0];
        return (
          <section className="mb-6">
            <SignedDocumentUpload
              cycleId={cycle.id}
              signerRole={myRole}
              templateUrl={`/api/cycles/${cycle.id}/export/signature-template`}
              existing={
                existing
                  ? { id: existing.id, signerName: existing.signerName, signedAt: existing.signedAt }
                  : undefined
              }
            />
          </section>
        );
      })()}

      {transitions.length > 0 && (
        <section className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold mb-3">可執行之狀態轉換</h2>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <TransitionButton key={t} cycleId={cycle.id} target={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-brand-700 mt-1">{value}</div>
    </div>
  );
}

function Tile({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block bg-white border rounded-xl p-5 hover:border-brand-500 transition">
      <div className="font-semibold text-brand-700">{title}</div>
      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{desc}</p>
    </Link>
  );
}
