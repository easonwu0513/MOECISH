'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Search, Plus, Pencil, Check, Mail, FileText, Download } from '@/components/icons';
import { cn } from '@/lib/cn';
import {
  HOSPITAL_LIST,
  HOSPITAL_ADDRESSES,
  SCENARIOS,
} from '@/lib/letter-config';
import {
  getOrderedVars,
  populateDefaults,
  buildEmailHtml,
  buildPlainText,
  renderPreviewHtml,
  processSubject,
  getTableSpans,
  type FormData,
} from '@/lib/letter-render';

export type LetterTemplate = {
  id: string;
  templateKey: string;
  category: string;
  workflowOrder: number;
  subGroup: string | null;
  title: string;
  attachment: string;
  audience: string;
  subject: string;
  content: string;
  enabled: boolean;
};

const CONTROL =
  'h-9 w-full rounded-md border border-neutral-400 bg-card px-2.5 text-body-sm text-ink-900 ' +
  'transition-colors hover:border-neutral-500 focus-ring';
const AREA =
  'w-full rounded-md border border-neutral-400 bg-card px-2.5 py-2 text-body-sm text-ink-900 ' +
  'transition-colors hover:border-neutral-500 focus-ring leading-relaxed';

function categoryTags(category: string): string[] {
  return category.split(',').map((s) => s.trim()).filter(Boolean);
}

// ─────────────────────────── 可調欄寬 ───────────────────────────

/** 記憶欄寬(px)於 localStorage;初值先用預設(避免 SSR hydration 不一致),掛載後才讀取。 */
function usePersistedWidth(key: string, def: number, min: number, max: number) {
  const [w, setW] = useState(def);
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(key);
      const n = s ? Number(s) : NaN;
      if (Number.isFinite(n)) setW(Math.min(max, Math.max(min, n)));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bump = (dx: number) =>
    setW((prev) => {
      const next = Math.min(max, Math.max(min, prev + dx));
      try { window.localStorage.setItem(key, String(next)); } catch { /* ignore */ }
      return next;
    });
  return [w, bump] as const;
}

/** 直向分隔線拖曳把手:拖動回傳位移 dx(px)給呼叫端調整相鄰欄寬。堆疊斷點以下隱藏。 */
function ResizeHandle({
  onResize,
  label,
  showAt = 'lg',
}: {
  onResize: (dx: number) => void;
  label: string;
  showAt?: 'lg' | 'xl';
}) {
  const startX = useRef(0);
  const dragging = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        startX.current = e.clientX;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const dx = e.clientX - startX.current;
        startX.current = e.clientX;
        onResize(dx);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }}
      className={cn(
        'shrink-0 w-3 self-stretch cursor-col-resize items-center justify-center group touch-none',
        showAt === 'xl' ? 'hidden xl:flex' : 'hidden lg:flex',
      )}
    >
      <span className="h-10 w-1 rounded-full bg-rule group-hover:bg-primary-400 group-active:bg-primary-500 transition-colors" />
    </div>
  );
}

// ─────────────────────────── 表格編輯器 ───────────────────────────

function TableEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const grid: string[][] = useMemo(() => {
    if (!value) return [['', ''], ['', '']];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [['', ''], ['', '']];
    } catch {
      return [['', ''], ['', '']];
    }
  }, [value]);

  const spans = useMemo(() => getTableSpans(grid), [grid]);

  const updateCell = (r: number, c: number, val: string) => {
    const newGrid = grid.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? val : cell)) : row));
    const headerText = newGrid[0][c] || '';
    if (r > 0 && (headerText.includes('受稽醫院') || headerText.includes('醫院'))) {
      const addrIdx = newGrid[0].findIndex((h) => h.includes('地址'));
      if (addrIdx !== -1 && HOSPITAL_ADDRESSES[val]) {
        newGrid[r] = [...newGrid[r]];
        newGrid[r][addrIdx] = HOSPITAL_ADDRESSES[val];
      }
    }
    onChange(JSON.stringify(newGrid));
  };
  const addRow = () => onChange(JSON.stringify([...grid, Array(grid[0].length).fill('')]));
  const removeRow = (r: number) => grid.length > 1 && onChange(JSON.stringify(grid.filter((_, i) => i !== r)));
  const addCol = () => onChange(JSON.stringify(grid.map((row) => [...row, ''])));
  const removeCol = (c: number) =>
    grid[0].length > 1 && onChange(JSON.stringify(grid.map((row) => row.filter((_, j) => j !== c))));

  const handlePaste = (rIdx: number, cIdx: number, e: React.ClipboardEvent) => {
    const pasteData = e.clipboardData.getData('text');
    if (pasteData.includes('\t') || pasteData.includes('\n')) {
      e.preventDefault();
      const rows = pasteData.split(/\r?\n/).filter((r) => r).map((r) => r.split('\t'));
      let newGrid = grid.map((row) => [...row]);
      while (newGrid.length < rIdx + rows.length) newGrid.push(Array(newGrid[0].length).fill(''));
      const maxCols = cIdx + Math.max(...rows.map((r) => r.length));
      if (newGrid[0].length < maxCols) {
        newGrid = newGrid.map((row) => {
          const nr = [...row];
          while (nr.length < maxCols) nr.push('');
          return nr;
        });
      }
      rows.forEach((row, i) => row.forEach((cell, j) => (newGrid[rIdx + i][cIdx + j] = cell.trim())));
      onChange(JSON.stringify(newGrid));
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="overflow-x-auto rounded-md border border-rule">
        <table className="w-full text-body-sm border-collapse bg-card">
          <tbody>
            {grid.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => {
                  const headerText = grid[0][cIdx] || '';
                  const trimmed = cell.trim();
                  const isMerge = trimmed === '(合併)' || trimmed === '(向下合併)';
                  const isNormal = !isMerge;
                  const isDate = rIdx > 0 && headerText.includes('日期') && isNormal;
                  const isTime = rIdx > 0 && headerText.includes('時間') && isNormal;
                  const isHospital = rIdx > 0 && (headerText.includes('受稽醫院') || headerText.includes('醫院')) && isNormal;
                  const smart = isDate || isTime || isHospital;
                  return (
                    <td key={cIdx} className="border border-rule p-0 align-top min-w-[120px]">
                      {rIdx === 0 || !smart ? (
                        <textarea
                          value={cell}
                          onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                          onPaste={(e) => handlePaste(rIdx, cIdx, e)}
                          rows={Math.max(1, (cell.match(/\n/g)?.length ?? 0) + 1)}
                          className={cn(
                            'w-full resize-y bg-transparent p-1.5 text-body-sm outline-none',
                            rIdx === 0 && 'font-medium text-ink-700 bg-paper-sunk',
                            isMerge && 'text-ink-400 italic',
                          )}
                        />
                      ) : isHospital ? (
                        <select
                          value={cell}
                          onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                          className="w-full bg-transparent p-1.5 text-body-sm outline-none"
                        >
                          <option value="">— 選擇 —</option>
                          {HOSPITAL_LIST.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={isDate ? 'date' : 'time'}
                          value={cell}
                          onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                          className="w-full bg-transparent p-1.5 text-body-sm outline-none"
                        />
                      )}
                    </td>
                  );
                })}
                <td className="p-1 align-middle border-l border-rule">
                  <button
                    type="button"
                    onClick={() => removeRow(rIdx)}
                    disabled={grid.length <= 1}
                    className="text-caption text-ink-400 hover:text-danger-600 disabled:opacity-30 px-1"
                    title="刪除此列"
                  >
                    ✕列
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              {grid[0].map((_, cIdx) => (
                <td key={cIdx} className="p-1 text-center border-t border-rule">
                  <button
                    type="button"
                    onClick={() => removeCol(cIdx)}
                    disabled={grid[0].length <= 1}
                    className="text-caption text-ink-400 hover:text-danger-600 disabled:opacity-30"
                    title="刪除此欄"
                  >
                    ✕欄
                  </button>
                </td>
              ))}
              <td className="border-t border-l border-rule" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="xs" variant="outlined" leadingIcon={<Plus size={13} />} onClick={addRow}>
          加一列
        </Button>
        <Button type="button" size="xs" variant="outlined" leadingIcon={<Plus size={13} />} onClick={addCol}>
          加一欄
        </Button>
        <span className="text-caption text-ink-400 self-center">
          合併：填「(合併)」向右併、「(向下合併)」向下併；可直接貼上 Excel 表格
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── 單一變數輸入 ───────────────────────────

function VarInput({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const isTable = name.includes('表格') || name.includes('清單');
  const isHospital = (name.includes('醫院') || name.includes('機關名稱')) && !name.includes('地址');
  const isScenario = name === '集合情境選擇';
  const isTime = name.includes('時間') && !isTable;
  const isDate = (name.includes('日期') || name.includes('期限') || name.includes('區間')) && !isTable;
  const isLong = name.includes('選項') || name.includes('連結') || name.includes('說明') || (value?.length ?? 0) > 40 || (value?.includes('\n') ?? false);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-caption text-ink-500 font-medium">{name}</label>
      {isTable ? (
        <TableEditor value={value} onChange={onChange} />
      ) : isScenario ? (
        <select className={CONTROL} value={SCENARIOS.find((s) => s.value === value)?.key ?? ''} onChange={(e) => {
          const s = SCENARIOS.find((sc) => sc.key === e.target.value);
          onChange(s ? s.value : '');
        }}>
          <option value="">— 選擇集合情境 —</option>
          {SCENARIOS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      ) : isHospital ? (
        <select className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— 選擇醫院 —</option>
          {HOSPITAL_LIST.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      ) : isDate ? (
        <input type="date" className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : isTime ? (
        <input type="time" className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : isLong ? (
        <textarea
          className={AREA}
          rows={Math.min(6, Math.max(2, (value?.match(/\n/g)?.length ?? 0) + 1))}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ─────────────────────────── 底稿編輯表單 ───────────────────────────

type EditDraft = {
  title: string;
  category: string;
  subGroup: string;
  workflowOrder: string;
  attachment: string;
  audience: string;
  subject: string;
  content: string;
  enabled: boolean;
};

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: EditDraft;
  setDraft: (d: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const set = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => setDraft({ ...draft, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-caption text-ink-500 font-medium">範本標題</label>
          <input className={CONTROL} value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-ink-500 font-medium">分類標籤（逗號分隔）</label>
          <input className={CONTROL} value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="委員作業, 稽核-準備作業" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-ink-500 font-medium">子分組（選填）</label>
          <input className={CONTROL} value={draft.subGroup} onChange={(e) => set('subGroup', e.target.value)} placeholder="稽核委員共識會議" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-ink-500 font-medium">流程排序</label>
          <input type="number" className={CONTROL} value={draft.workflowOrder} onChange={(e) => set('workflowOrder', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-ink-500 font-medium">收件對象（選填）</label>
          <input className={CONTROL} value={draft.audience} onChange={(e) => set('audience', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-caption text-ink-500 font-medium">附件說明（選填）</label>
          <input className={CONTROL} value={draft.attachment} onChange={(e) => set('attachment', e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-caption text-ink-500 font-medium">主旨（可用 {'{{變數}}'}）</label>
        <input className={CONTROL} value={draft.subject} onChange={(e) => set('subject', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-caption text-ink-500 font-medium">
          內文（可用 {'{{變數}}'}、{'{{表格_XXX}}'}；支援 &lt;b&gt; &lt;u&gt; &lt;span style&gt; 等內嵌標籤）
        </label>
        <textarea
          className={cn(AREA, 'font-mono')}
          rows={18}
          value={draft.content}
          onChange={(e) => set('content', e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-body-sm text-ink-700 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
          className="w-4 h-4 rounded focus-ring accent-primary-600"
        />
        啟用此範本（停用後仍保留於清單，僅標示「停用」）
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="filled" leadingIcon={<Check size={16} />} loading={saving} onClick={onSave}>
          {isNew ? '建立範本' : '儲存底稿'}
        </Button>
        <Button type="button" variant="text" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────── 主元件 ───────────────────────────

const EMPTY_DRAFT: EditDraft = {
  title: '', category: '委員作業, 稽核-準備作業', subGroup: '', workflowOrder: '99',
  attachment: '無', audience: '', subject: '', content: '', enabled: true,
};

export default function LetterStudio({ initialTemplates }: { initialTemplates: LetterTemplate[] }) {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('全部');
  const [formData, setFormData] = useState<FormData>({});
  const [globals, setGlobals] = useState<{ hospital: string; date: string; techDate: string }>({ hospital: '', date: '', techDate: '' });
  const [mode, setMode] = useState<'compose' | 'edit' | 'create'>('compose');
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<'' | 'content' | 'subject' | 'plain'>('');
  // 可調三工作區欄寬(範本清單 / 填寫 / 預覽);預覽吃剩餘寬度。lg 以下堆疊不套用。
  const [listW, bumpListW] = usePersistedWidth('letter-listW', 280, 220, 560);
  const [fillW, bumpFillW] = usePersistedWidth('letter-fillW', 560, 380, 1040);

  const active = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => categoryTags(t.category).forEach((c) => set.add(c)));
    return ['全部', ...[...set].sort()];
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((t) => catFilter === '全部' || categoryTags(t.category).includes(catFilter))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
      .sort((a, b) => a.workflowOrder - b.workflowOrder);
  }, [templates, search, catFilter]);

  // 選定範本 / 全域醫院·日期變動 → 重新帶入預設表單值（比照工具語意：全域為「一鍵帶入」）。
  // 刻意不把 mode 放進相依：進出「編輯底稿」不應清掉已填的變數值(全域選單僅 compose 態渲染,
  // 編輯態不會觸發 globals 變動),故只在切換範本或改全域時重新帶入。
  useEffect(() => {
    if (mode !== 'compose' || !active) return;
    const base = (active.subject || '') + '\n' + (active.content || '');
    setFormData(populateDefaults(base, globals));
    setCopied('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, globals]);

  const variables = useMemo(() => {
    if (!active) return [];
    return getOrderedVars((active.subject || '') + '\n' + (active.content || ''), formData);
  }, [active, formData]);

  const setVar = (name: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if ((name === '受稽醫院' || name === '機關名稱') && HOSPITAL_ADDRESSES[value]) {
        next['受稽機關地址'] = HOSPITAL_ADDRESSES[value];
      }
      return next;
    });
    setCopied('');
  };

  // ── 複製 ──
  async function copyRichContent() {
    if (!active) return;
    const html = buildEmailHtml(active.content, formData);
    try {
      if (navigator.clipboard && typeof window !== 'undefined' && 'ClipboardItem' in window) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const plain = tmp.innerText;
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
        setCopied('content');
        toast.success('已複製信件內容（含格式），可直接貼到郵件');
        setTimeout(() => setCopied(''), 2000);
        return;
      }
      throw new Error('no ClipboardItem');
    } catch {
      // 後備：選取暫存節點 execCommand
      try {
        const container = document.createElement('div');
        container.innerHTML = html;
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        document.body.appendChild(container);
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(container);
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.execCommand('copy');
        sel?.removeAllRanges();
        document.body.removeChild(container);
        setCopied('content');
        toast.success('已複製信件內容（含格式）');
        setTimeout(() => setCopied(''), 2000);
      } catch {
        toast.error('複製失敗，請手動框選預覽區複製');
      }
    }
  }

  async function copyText(kind: 'subject' | 'plain') {
    if (!active) return;
    const text = kind === 'subject' ? processSubject(active.subject, formData) : buildPlainText(active.content, formData);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === 'subject' ? '已複製主旨' : '已複製純文字內文');
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast.error('複製失敗');
    }
  }

  // ── CRUD ──
  function startEdit() {
    if (!active) return;
    setDraft({
      title: active.title,
      category: active.category,
      subGroup: active.subGroup ?? '',
      workflowOrder: String(active.workflowOrder),
      attachment: active.attachment,
      audience: active.audience,
      subject: active.subject,
      content: active.content,
      enabled: active.enabled,
    });
    setMode('edit');
  }
  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setMode('create');
  }

  async function saveDraft() {
    if (!draft.title.trim() || !draft.subject.trim() || !draft.content.trim()) {
      toast.error('標題、主旨、內文為必填');
      return;
    }
    setSaving(true);
    const woNum = draft.workflowOrder.trim() === '' ? 99 : Number(draft.workflowOrder);
    const payload = {
      title: draft.title.trim(),
      category: draft.category.trim() || '未分類',
      subGroup: draft.subGroup.trim() || null,
      workflowOrder: Number.isFinite(woNum) ? woNum : 99, // 允許 0（不再被 falsy 吃掉）
      attachment: draft.attachment.trim() || '無',
      audience: draft.audience.trim(),
      subject: draft.subject,
      content: draft.content,
      enabled: draft.enabled,
    };
    try {
      if (mode === 'create') {
        const res = await fetch('/api/admin/letter-templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? '建立失敗');
        const { template } = await res.json();
        setTemplates((prev) => [...prev, template]);
        setSelectedId(template.id);
        toast.success('已新增範本');
      } else if (active) {
        const res = await fetch(`/api/admin/letter-templates/${active.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? '儲存失敗');
        const { template } = await res.json();
        setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)));
        toast.success('底稿已儲存');
      }
      setMode('compose');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/letter-templates/${active.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      const remaining = templates.filter((t) => t.id !== active.id);
      setTemplates(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setMode('compose');
      toast.success('已刪除範本');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || '刪除失敗');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="flex flex-col lg:flex-row gap-4 lg:gap-0 items-start"
      style={{ ['--lw' as string]: `${listW}px` } as React.CSSProperties}
    >
      {/* ── 範本清單 ── */}
      <aside className="flex flex-col gap-3 w-full lg:w-[var(--lw)] lg:shrink-0 lg:sticky lg:top-4 lg:self-start lg:pr-1">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className={cn(CONTROL, 'pl-8')}
            placeholder="搜尋範本…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setCatFilter(tag)}
              className={cn(
                'px-2 py-0.5 rounded-full text-caption border transition-colors',
                catFilter === tag
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-card text-ink-500 border-rule hover:border-neutral-500',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.map((t) => {
            const isSel = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setSelectedId(t.id); setMode('compose'); }}
                className={cn(
                  'text-left rounded-md px-3 py-2 border-l-2 transition-colors',
                  isSel ? 'bg-focus-wash border-l-primary-600' : 'border-l-transparent hover:bg-paper-sunk',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption tabular-nums text-ink-400 shrink-0">{t.workflowOrder}</span>
                  <span className={cn('text-body-sm truncate', isSel ? 'text-ink-900 font-medium' : 'text-ink-700')}>
                    {t.title}
                  </span>
                  {!t.enabled && <span className="text-caption text-ink-400">(停用)</span>}
                </div>
                {t.subGroup && <div className="text-caption text-ink-400 mt-0.5 pl-6 truncate">{t.subGroup}</div>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-body-sm text-ink-400 px-3 py-6 text-center">找不到符合的範本</p>
          )}
        </div>
        <Button type="button" variant="outlined" size="sm" leadingIcon={<Plus size={15} />} onClick={startCreate} fullWidth>
          新增範本
        </Button>
      </aside>

      <ResizeHandle onResize={bumpListW} label="拖曳調整範本清單欄寬" showAt="lg" />

      {/* ── 主工作區 ── */}
      <section className="min-w-0 flex-1 w-full">
        {!active && mode === 'compose' ? (
          <div className="rounded-lg border border-rule bg-card p-10 text-center text-ink-500">
            尚無範本，請點左下「新增範本」建立第一封底稿。
          </div>
        ) : mode !== 'compose' ? (
          <div className="rounded-lg border border-rule bg-card p-5">
            <h2 className="text-title-md text-ink-900 mb-4">{mode === 'create' ? '新增範本底稿' : '編輯範本底稿'}</h2>
            <EditForm
              draft={draft}
              setDraft={setDraft}
              onSave={saveDraft}
              onCancel={() => setMode('compose')}
              saving={saving}
              isNew={mode === 'create'}
            />
          </div>
        ) : active ? (
          <div
            className="flex flex-col xl:flex-row gap-6 xl:gap-0 items-start"
            style={{ ['--fw' as string]: `${fillW}px` } as React.CSSProperties}
          >
            {/* 填寫欄 */}
            <div className="flex flex-col gap-4 w-full xl:w-[var(--fw)] xl:shrink-0 xl:pr-1">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-title-md text-ink-900">{active.title}</h2>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {categoryTags(active.category).map((c) => (
                      <Chip key={c} size="sm" tone="neutral">{c}</Chip>
                    ))}
                  </div>
                  {active.audience && <p className="text-caption text-ink-400 mt-1">對象：{active.audience}</p>}
                  {active.attachment && active.attachment !== '無' && (
                    <p className="text-caption text-ink-400 mt-0.5">附件：{active.attachment}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button type="button" size="sm" variant="outlined" leadingIcon={<Pencil size={14} />} onClick={startEdit}>
                    編輯底稿
                  </Button>
                  <Button type="button" size="sm" variant="text" onClick={() => setConfirmDelete(true)}>
                    刪除
                  </Button>
                </div>
              </div>

              {/* 全域快填 */}
              <div className="rounded-md border border-rule bg-paper-sunk p-3 flex flex-col gap-2">
                <p className="text-caption text-ink-500 font-medium">快速帶入（會回填所有相關欄位）</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-400">受稽醫院</span>
                    <select className={CONTROL} value={globals.hospital} onChange={(e) => setGlobals((g) => ({ ...g, hospital: e.target.value }))}>
                      <option value="">—</option>
                      {HOSPITAL_LIST.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-400">稽核日期</span>
                    <input type="date" className={CONTROL} value={globals.date} onChange={(e) => setGlobals((g) => ({ ...g, date: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-400">技術檢測日期</span>
                    <input type="date" className={CONTROL} value={globals.techDate} onChange={(e) => setGlobals((g) => ({ ...g, techDate: e.target.value }))} />
                  </label>
                </div>
              </div>

              {/* 變數欄 */}
              {variables.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {variables.map((v) => (
                    <VarInput key={v} name={v} value={formData[v] ?? ''} onChange={(val) => setVar(v, val)} />
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-ink-400">此範本沒有需填寫的變數，可直接複製。</p>
              )}
            </div>

            <ResizeHandle onResize={bumpFillW} label="拖曳調整填寫/預覽欄寬" showAt="xl" />

            {/* 預覽 + 複製 */}
            <div className="flex flex-col gap-3 flex-1 min-w-0 xl:sticky xl:top-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="filled" leadingIcon={copied === 'content' ? <Check size={16} /> : <Mail size={16} />} onClick={copyRichContent}>
                  {copied === 'content' ? '已複製' : '複製信件（含格式）'}
                </Button>
                <Button type="button" variant="outlined" size="sm" leadingIcon={copied === 'subject' ? <Check size={14} /> : <FileText size={14} />} onClick={() => copyText('subject')}>
                  {copied === 'subject' ? '已複製主旨' : '複製主旨'}
                </Button>
                <Button type="button" variant="outlined" size="sm" leadingIcon={copied === 'plain' ? <Check size={14} /> : <Download size={14} />} onClick={() => copyText('plain')}>
                  {copied === 'plain' ? '已複製' : '複製純文字'}
                </Button>
              </div>
              <div className="rounded-lg border border-rule bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-rule bg-paper-sunk">
                  <span className="text-caption text-ink-400">主旨</span>
                  <div
                    className="text-body-sm text-ink-900 font-medium mt-0.5 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderPreviewHtml(active.subject, formData) || '<span style="color:#9aa4b2">（無主旨）</span>' }}
                  />
                </div>
                <div
                  className="p-4 text-body-sm text-ink-900 leading-loose overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: renderPreviewHtml(active.content, formData) }}
                />
              </div>
              <p className="text-caption text-ink-400 leading-relaxed">
                <span className="inline-block px-1 rounded" style={{ background: '#e0edff', color: '#1b4fa8' }}>藍底</span> = 已填入；
                <span className="inline-block px-1 rounded ml-1" style={{ background: '#fde8e8', color: '#c02626' }}>紅底</span> = 尚未填寫。
                複製後貼到 Outlook / Gmail 等郵件用戶端即可寄送。
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="刪除範本"
        description={`確定刪除「${active?.title ?? ''}」？此動作無法復原。`}
        confirmLabel="刪除"
        tone="danger"
        loading={saving}
        onConfirm={doDelete}
      />
    </div>
  );
}
