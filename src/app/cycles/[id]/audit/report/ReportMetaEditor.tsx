'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import type { ReportMeta } from './ReportBody';

/** 最高管理員:編輯彙整報告頁首(稽核日期/範圍/準則/稽核小組)。 */
export default function ReportMetaEditor({
  cycleId,
  initial,
}: {
  cycleId: string;
  initial: Required<ReportMeta>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [auditDateRaw, setAuditDateRaw] = useState(initial.auditDateRaw);
  const [scope, setScope] = useState(initial.scope);
  const [criteria, setCriteria] = useState(initial.auditCriteria.join('\n'));
  const [leadName, setLeadName] = useState(initial.lead.name);
  const [leadTitle, setLeadTitle] = useState(initial.lead.title);
  const [subName, setSubName] = useState(initial.subLead.name);
  const [subTitle, setSubTitle] = useState(initial.subLead.title);
  const [subOrg, setSubOrg] = useState(initial.subLead.org);
  const [teamS, setTeamS] = useState(initial.team.strategy.join('、'));
  const [teamM, setTeamM] = useState(initial.team.management.join('、'));
  const [teamT, setTeamT] = useState(initial.team.technical.join('、'));

  const splitNames = (s: string) =>
    s.split(/[、,，;；\s]+/).map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/cycles/${cycleId}/audit/report-meta`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        auditDateRaw,
        scope,
        auditCriteria: criteria.split('\n').map((x) => x.trim()).filter(Boolean),
        lead: { name: leadName.trim(), title: leadTitle.trim() },
        subLead: { name: subName.trim(), title: subTitle.trim(), org: subOrg.trim() },
        team: {
          strategy: splitNames(teamS),
          management: splitNames(teamM),
          technical: splitNames(teamT),
        },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('儲存失敗', j.error);
      return;
    }
    setOpen(false);
    toast.success('報告資訊已更新');
    router.refresh();
  }

  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => setOpen(true)}>
        報告設定
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => !busy && setOpen(v)}
        title="彙整報告頁首設定"
        description="稽核日期、範圍、準則與稽核小組會出現在報告封面與「壹、基本資訊」。"
        size="lg"
        footer={
          <>
            <Button variant="text" onClick={() => setOpen(false)} disabled={busy}>取消</Button>
            <Button onClick={save} loading={busy}>儲存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pt-2 max-h-[60vh] overflow-y-auto pr-1">
          <TextField
            label="稽核日期"
            type="date"
            value={auditDateRaw}
            onChange={(e) => setAuditDateRaw(e.target.value)}
          />
          <Textarea
            label="稽核範圍"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            rows={2}
          />
          <Textarea
            label="稽核準則(每行一條)"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={7}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="稽核領隊 姓名" value={leadName} onChange={(e) => setLeadName(e.target.value)} />
            <TextField label="稽核領隊 職稱" value={leadTitle} onChange={(e) => setLeadTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TextField label="副領隊 姓名" value={subName} onChange={(e) => setSubName(e.target.value)} />
            <TextField label="副領隊 職稱" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} />
            <TextField label="副領隊 單位" value={subOrg} onChange={(e) => setSubOrg(e.target.value)} />
          </div>
          <TextField
            label="稽核團隊 — 策略面(頓號分隔)"
            value={teamS}
            onChange={(e) => setTeamS(e.target.value)}
            helperText="例:王○○、李○○"
          />
          <TextField
            label="稽核團隊 — 管理面(頓號分隔)"
            value={teamM}
            onChange={(e) => setTeamM(e.target.value)}
          />
          <TextField
            label="稽核團隊 — 技術面(頓號分隔)"
            value={teamT}
            onChange={(e) => setTeamT(e.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
