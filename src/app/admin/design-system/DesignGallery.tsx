'use client';

import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Alert } from '@/components/ui/Alert';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StackedBar } from '@/components/ui/StackedBar';
import { Timeline } from '@/components/ui/Timeline';
import { Segmented } from '@/components/ui/Segmented';
import { TONE, TONES, ROLE_SURFACE, roleTone, type Tone } from '@/lib/tone';
import { ROLE_LABELS, ROLE_TONE, type Role } from '@/lib/types';
import { cn } from '@/lib/cn';

const FACETS: { key: keyof (typeof TONE)['primary']; label: string; desc: string }[] = [
  { key: 'soft', label: 'soft', desc: '淺底徽章／膠囊(Chip soft、狀態徽章)' },
  { key: 'solid', label: 'solid', desc: '實心填色徽章 600+白字(Chip filled、Segmented 選中)' },
  { key: 'fill', label: 'fill', desc: '純填色(無文字)600(進度／堆疊／時間軸節點)' },
  { key: 'outlined', label: 'outlined', desc: '描邊 700+border-300' },
  { key: 'text', label: 'text', desc: '純語意文字色 700' },
  { key: 'dot', label: 'dot', desc: '小圓點／細強調條 500' },
];

const ROLES: Role[] = ['SUPER_ADMIN', 'AUDITOR', 'ORG_ADMIN'];
const CHROMATIC: Tone[] = ['primary', 'sage', 'success', 'warning', 'danger'];

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4">
        <h2 className="text-title-lg text-on-surface">{title}</h2>
        {sub && <p className="mt-1 text-body-sm text-on-surface-variant leading-relaxed">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignGallery() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a');

  return (
    <div className="flex flex-col gap-10 max-w-5xl">
      {/* ── Tone 單一來源:六面向 × 六色 ── */}
      <Section
        id="tone"
        title="Tone 單一來源 · lib/tone"
        sub="所有元件的 tone→class 一律取自此。六面向(soft／solid／fill／outlined／text／dot),六色調(neutral／primary／sage／success／warning／danger)。實心一律 600、文字 700、點 500——批72 統一深淺基準。"
      >
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="text-label-sm text-on-surface-variant bg-surface-container-low">
                  <th className="text-left font-medium px-4 py-2.5 border-b border-outline-variant/60">tone</th>
                  {FACETS.map((f) => (
                    <th key={f.key} className="text-left font-medium px-3 py-2.5 border-b border-outline-variant/60">
                      <div className="font-mono text-on-surface">.{f.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TONES.map((t) => (
                  <tr key={t} className="border-b border-outline-variant/40 last:border-b-0">
                    <td className="px-4 py-3 font-mono text-caption text-on-surface">{t}</td>
                    {FACETS.map((f) => (
                      <td key={f.key} className="px-3 py-3">
                        {f.key === 'text' ? (
                          <span className={cn('font-semibold', TONE[t].text)}>示例 Aa</span>
                        ) : f.key === 'dot' ? (
                          <span className={cn('inline-block w-3.5 h-3.5 rounded-full', TONE[t].dot)} />
                        ) : f.key === 'fill' ? (
                          <span className={cn('inline-block w-14 h-5 rounded-md', TONE[t].fill)} />
                        ) : (
                          <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-label font-medium', TONE[t][f.key])}>徽章</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-outline-variant/50 flex flex-wrap gap-x-5 gap-y-1 text-caption text-on-surface-variant">
            {FACETS.map((f) => (
              <span key={f.key}><span className="font-mono text-on-surface">.{f.label}</span> {f.desc}</span>
            ))}
          </div>
        </Card>
      </Section>

      {/* ── 角色色:單一來源 ROLE_TONE 衍生 ── */}
      <Section
        id="role"
        title="角色色 · 由 ROLE_TONE 單一來源衍生"
        sub="北極星②:角色是一級資訊架構。TopStrip 頂帶、頭像底、身分 Chip 全部由 ROLE_TONE 派生,三處必一致——批72 修 TopStrip 硬編 primary 與 UserMenu 第二份配色。"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r} padded={false} className="overflow-hidden">
              {/* 頂帶=角色色(與 TopStrip roleBorderTop 同一 ROLE_TONE 來源) */}
              <div className={cn('h-1', TONE[roleTone(r)].fill)} />
              <div className="p-4 flex items-center gap-3">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-full text-title font-semibold', ROLE_SURFACE[r])}>
                  {ROLE_LABELS[r].slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-on-surface">{ROLE_LABELS[r]}</p>
                  <div className="mt-1"><Chip tone={roleTone(r)} size="sm" dot>{ROLE_TONE[r]}</Chip></div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Chip:三變體 × 六色 ── */}
      <Section id="chip" title="Chip · 取自 TONE.soft／.outlined／.solid／.dot" sub="批72:Chip 移除本地四份手抄對照表,全部改讀 lib/tone。">
        <div className="flex flex-col gap-4">
          {(['soft', 'outlined', 'filled'] as const).map((v) => (
            <div key={v}>
              <p className="text-label text-on-surface-variant mb-2">variant=<span className="font-mono text-on-surface">{v}</span></p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <Chip key={t} tone={t} variant={v} dot={v === 'soft'}>{t}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Alert ── */}
      <Section id="alert" title="Alert · 語意提示橫幅" sub="Tone 型別取自 lib/tone 單一來源;收斂全站手刻 callout。">
        <div className="flex flex-col gap-2.5">
          {(['primary', 'success', 'warning', 'danger'] as Tone[]).map((t) => (
            <Alert key={t} tone={t} title={`${t} 提示`}>此為 {t} 語意橫幅範例——同一 tone 全站唯一配方。</Alert>
          ))}
        </div>
      </Section>

      {/* ── 資料視覺化:ProgressBar / Ring / StackedBar ── */}
      <Section id="dataviz" title="資料視覺化 · fill 面向統一 600" sub="ProgressBar／ProgressRing／StackedBar 的填色一律取 lib/tone 的 fill／stroke(批72:success／warning／danger 由 500 統一為 600)。ProgressBar 補選填 label→aria-label。">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <CardTitle>ProgressBar</CardTitle>
            {CHROMATIC.map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="w-16 text-caption text-on-surface-variant font-mono">{t}</span>
                <div className="flex-1"><ProgressBar value={t === 'danger' ? 25 : t === 'warning' ? 55 : 80} tone={t as Exclude<Tone, 'neutral'>} label={`${t} 進度`} /></div>
              </div>
            ))}
          </Card>
          <Card className="flex items-center justify-around gap-3">
            <ProgressRing value={78} label="78%" sublabel="資料齊備" tone="primary" />
            <ProgressRing value={100} label="12/12" sublabel="全通過" tone="success" />
            <ProgressRing value={40} label="2/5" sublabel="待補" tone="warning" />
          </Card>
          <Card className="md:col-span-2 flex flex-col gap-3">
            <CardTitle>StackedBar(組成一眼讀出)</CardTitle>
            <StackedBar
              segments={[
                { value: 14, tone: 'success', label: '符合' },
                { value: 3, tone: 'warning', label: '部分符合' },
                { value: 2, tone: 'danger', label: '不符合' },
                { value: 1, tone: 'neutral', label: '不適用' },
              ]}
              legend
            />
          </Card>
        </div>
      </Section>

      {/* ── Segmented(互動)+ Timeline ── */}
      <Section id="interactive" title="Segmented(互動)· Timeline" sub="Segmented 選中態語意色取 TONE.solid;方向鍵 roving tabindex。Timeline 節點 fill 600 + 光暈環。">
        <div className="grid gap-4 md:grid-cols-2 items-start">
          <Card className="flex flex-col gap-3">
            <CardTitle>Segmented</CardTitle>
            <Segmented
              value={seg}
              onChange={setSeg}
              ariaLabel="範例狀態"
              options={[
                { value: 'a', label: '全部' },
                { value: 'b', label: '已通過', tone: 'success' },
                { value: 'c', label: '待補正', tone: 'warning' },
              ]}
            />
            <p className="text-caption text-on-surface-variant">選中:<span className="font-mono text-on-surface">{seg}</span></p>
          </Card>
          <Card>
            <CardTitle>Timeline</CardTitle>
            <div className="mt-2">
              <Timeline
                nodes={[
                  { id: '1', tone: 'success', title: '資料齊備', meta: '115年7月1日', body: '中心確認全數應備資料。' },
                  { id: '2', tone: 'primary', pulse: true, title: '實地稽核進行中', meta: '115年7月5日' },
                  { id: '3', tone: 'neutral', title: '缺失發布', meta: '待進行' },
                ]}
              />
            </div>
          </Card>
        </div>
      </Section>
    </div>
  );
}
