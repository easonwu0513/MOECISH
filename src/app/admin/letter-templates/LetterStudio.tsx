'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Search, Plus, Pencil, Check, Mail, FileText, Download, Info } from '@/components/icons';
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

/** 平台稽核週期選項(快速帶入:選場次自動填醫院+實地/技檢日期——桌面工具沒有的平台資料串接) */
export type CycleOption = {
  id: string;
  label: string;
  hospital: string;
  /** yyyy-mm-dd(實地稽核日);未排定為 null */
  date: string | null;
  /** yyyy-mm-dd(技術檢測日);未排定為 null */
  tech: string | null;
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

// 兩種分類檢視(對齊桌面工具):依作業流程 / 依對象人員。範本 category 逗號標籤同時含兩維度
// (如「委員作業, 稽核-準備作業」),各檢視只顯示該維度的分類 chip,清爽不混雜。
const WORKFLOW_CATS = ['稽核-準備作業', '稽核-實地作業', '稽核-檢討作業', '資安研討活動'] as const;
const PERSONNEL_CATS = ['受稽機關作業', '委員作業', '觀察員作業', '資安研討活動'] as const;

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

export default function LetterStudio({
  initialTemplates,
  cycleOptions = [],
}: {
  initialTemplates: LetterTemplate[];
  cycleOptions?: CycleOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'workflow' | 'personnel'>('workflow');
  const [catFilter, setCatFilter] = useState('全部');
  const [formData, setFormData] = useState<FormData>({});
  const [globals, setGlobals] = useState<{ hospital: string; date: string; techDate: string }>({ hospital: '', date: '', techDate: '' });
  const [cycleSel, setCycleSel] = useState('');
  const [mode, setMode] = useState<'compose' | 'edit' | 'create'>('compose');
  const [draft, setDraft] = useState<EditDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState<'' | 'content' | 'subject' | 'plain'>('');
  // 未填欄位複製確認 + 手動寄出留存
  const [confirmCopy, setConfirmCopy] = useState<'' | 'content' | 'subject' | 'plain'>('');
  const [logConfirm, setLogConfirm] = useState(false);
  const [logging, setLogging] = useState(false);
  // 可調三工作區欄寬(範本清單 / 填寫 / 預覽);預覽吃剩餘寬度。lg 以下堆疊不套用。
  const [listW, bumpListW] = usePersistedWidth('letter-listW', 280, 220, 560);
  const [fillW, bumpFillW] = usePersistedWidth('letter-fillW', 560, 380, 1040);

  const active = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);

  // 當前檢視維度的分類清單(只列有範本實際使用到的類,保留固定順序)。
  const modeCats = viewMode === 'workflow' ? WORKFLOW_CATS : PERSONNEL_CATS;
  const allTags = useMemo(() => {
    const used = new Set<string>();
    templates.forEach((t) => categoryTags(t.category).forEach((c) => used.add(c)));
    return ['全部', ...modeCats.filter((c) => used.has(c))];
  }, [templates, modeCats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((t) => {
        const tags = categoryTags(t.category);
        // 全部:屬此檢視維度任一分類即顯示;指定分類:含該分類標籤。
        return catFilter === '全部' ? tags.some((c) => (modeCats as readonly string[]).includes(c)) : tags.includes(catFilter);
      })
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
      .sort((a, b) => a.workflowOrder - b.workflowOrder);
  }, [templates, search, catFilter, modeCats]);

  // 全部/指定分類檢視:先依「當前檢視維度的分類」(modeCats=作業流程階段 或 對象人員)分段(對齊桌面工具的分組),
  // 段內再依子分組(subGroup)分。取代舊的「只依 subGroup 分 + 每列顯 workflowOrder 編號」——編號(1X準備/2X實地/
  // 3X檢討,含留空跳號)對承辦無意義且與桌面工具不符,改用既有的分類/子分組結構分段,不再外顯編號。
  // 項目順序沿用 filtered(伺服器已依 [workflowOrder, createdAt] 排,filter 為穩定排序故保留該序):
  // 保留作業流程先後,研討範本 workflowOrder 皆 99 時以建立序(createdAt)穩定不亂序。
  const sections = useMemo(() => {
    const catOf = (t: LetterTemplate) => {
      const tags = categoryTags(t.category);
      return (modeCats as readonly string[]).find((c) => tags.includes(c)) ?? null;
    };
    const out: { cat: string; subs: { key: string; label: string | null; items: LetterTemplate[] }[] }[] = [];
    for (const cat of modeCats) {
      const inCat = filtered.filter((t) => catOf(t) === cat);
      if (inCat.length === 0) continue;
      const subs: { key: string; label: string | null; items: LetterTemplate[] }[] = [];
      for (const t of inCat) {
        const label = t.subGroup?.trim() || null;
        const key = label ?? '__none__';
        const last = subs[subs.length - 1];
        if (last && last.key === key) last.items.push(t);
        else subs.push({ key, label, items: [t] });
      }
      out.push({ cat, subs });
    }
    return out;
  }, [filtered, modeCats]);

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

  // 未填欄位(表格另有 [請填寫] 就地標紅,此處只計文字變數):複製前確認,佔位符寄出事故在源頭擋
  const unfilled = useMemo(
    () => variables.filter((v) => !v.includes('表格') && !v.includes('清單') && !(formData[v] ?? '').trim()),
    [variables, formData],
  );
  const runCopy = (k: 'content' | 'subject' | 'plain') => (k === 'content' ? copyRichContent() : copyText(k));
  const requestCopy = (k: 'content' | 'subject' | 'plain') => {
    if (unfilled.length > 0) setConfirmCopy(k);
    else runCopy(k);
  };

  // 手動寄出留存:主旨+內文全文寫入系統寄件紀錄(kind=letter-manual;不寄信,純留檔供稽核留存)
  async function logManualSend() {
    if (!active) return;
    setLogging(true);
    try {
      const res = await fetch('/api/admin/letters/log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateKey: active.templateKey,
          title: active.title,
          subject: processSubject(active.subject, formData),
          bodyText: buildPlainText(active.content, formData),
          hospital: (formData['受稽醫院'] ?? globals.hospital ?? '').trim(),
          audience: active.audience ?? '',
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? '留存失敗');
      toast.success('已留存至系統寄件紀錄', '可於「信件管理 → 系統寄件紀錄」查閱(標示為手動外寄)');
      setLogConfirm(false);
    } catch (e) {
      toast.error((e as Error).message || '留存失敗');
    } finally {
      setLogging(false);
    }
  }

  // ── 複製 ──
  async function copyRichContent() {
    if (!active) return;
    const html = buildEmailHtml(active.content, formData);
    // 富文字複製「優先」用選取已渲染 DOM + execCommand('copy'):等同手動框選格式化內容後 Ctrl+C,
    // 產生瀏覽器原生 rich 剪貼(Windows CF_HTML),各家郵件用戶端(含 NTU/Coremail)貼上都能保留
    // 粗體/底線/黃底 highlight。這條路徑「不」經 async navigator.clipboard.write 的 HTML 清洗與
    // 重新包裹——後者正是先前貼到 Coremail 掉格式、且每行浮現淡底色的元凶。失敗才退回 ClipboardItem。
    const nativeCopy = (): boolean => {
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);
      let ok = false;
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(container);
        sel?.removeAllRanges();
        sel?.addRange(range);
        ok = document.execCommand('copy');
        sel?.removeAllRanges();
      } catch {
        ok = false;
      } finally {
        document.body.removeChild(container);
      }
      return ok;
    };
    if (nativeCopy()) {
      setCopied('content');
      toast.success('已複製信件內容（含格式），可直接貼到郵件');
      setTimeout(() => setCopied(''), 2000);
      return;
    }
    // 後備:async ClipboardItem(瀏覽器停用 execCommand 時)
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
        toast.success('已複製信件內容（含格式）');
        setTimeout(() => setCopied(''), 2000);
        return;
      }
      throw new Error('no clipboard');
    } catch {
      toast.error('複製失敗，請手動框選預覽區複製');
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
        {/* 分類檢視切換:依作業流程 / 依對象人員(對齊桌面工具) */}
        <div className="flex rounded-md border border-rule bg-paper-sunk p-0.5 text-caption">
          {([['workflow', '依作業流程'], ['personnel', '依對象人員']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setViewMode(v); setCatFilter('全部'); }}
              className={cn(
                'flex-1 rounded px-2 py-1.5 transition-colors',
                viewMode === v ? 'bg-card text-ink-900 font-medium shadow-elev-1' : 'text-ink-500 hover:text-ink-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 該檢視維度的分類 chip */}
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
        {/* 依「分類(階段/對象)→ 子分組」兩層分段的範本清單(對齊桌面工具;不再外顯 workflowOrder 編號) */}
        <div className="flex flex-col max-h-[70vh] overflow-y-auto pr-1">
          {sections.map((sec) => (
            <div key={sec.cat} className="flex flex-col">
              {/* 分類段落標題(作業流程階段或對象人員) */}
              <p className="px-3 pt-4 pb-1.5 text-label-sm font-semibold tracking-[0.02em] text-ink-500 first:pt-1">
                {sec.cat}
              </p>
              {sec.subs.map((g) => (
                <div key={g.key} className="flex flex-col gap-1">
                  {g.label && (
                    <p className="px-3 pt-1.5 pb-0.5 text-caption font-medium text-ink-400">{g.label}</p>
                  )}
                  {g.items.map((t) => {
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
                          <span className={cn('text-body-sm truncate', isSel ? 'text-ink-900 font-medium' : 'text-ink-700')}>
                            {t.title}
                          </span>
                          {!t.enabled && <span className="text-caption text-ink-400 shrink-0">(停用)</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
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

              {/* 發信前檢核提醒(對象 + 附件):承辦寄信前先確認收件對象與應附附件,對齊桌面工具的提醒卡。 */}
              <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3">
                <p className="flex items-center gap-1.5 text-body-sm font-semibold text-warning-800">
                  <Info size={15} className="shrink-0" /> 發信前檢核提醒
                </p>
                <div className="mt-2 flex flex-col gap-1 text-body-sm text-ink-900">
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 text-ink-500">對象</span>
                    <span>{active.audience?.trim() || '（未設定）'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="w-12 shrink-0 text-ink-500">附件</span>
                    <span>{active.attachment?.trim() || '無'}</span>
                  </div>
                </div>
              </div>

              {/* 全域快填 */}
              <div className="rounded-md border border-rule bg-paper-sunk p-3 flex flex-col gap-2">
                <p className="text-caption text-ink-500 font-medium">快速帶入（會回填所有相關欄位）</p>
                {/* 平台資料串接:選稽核場次自動填醫院+實地/技檢日期(桌面工具需手選手填,平台有真值直接帶) */}
                {cycleOptions.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-400">帶入稽核場次（自動填醫院與日期）</span>
                    <select
                      className={CONTROL}
                      value={cycleSel}
                      onChange={(e) => {
                        const c = cycleOptions.find((x) => x.id === e.target.value);
                        setCycleSel(e.target.value);
                        if (c) setGlobals({ hospital: c.hospital, date: c.date ?? '', techDate: c.tech ?? '' });
                      }}
                    >
                      <option value="">— 從平台稽核週期選擇 —</option>
                      {cycleOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption text-ink-400">受稽醫院</span>
                    <select className={CONTROL} value={globals.hospital} onChange={(e) => setGlobals((g) => ({ ...g, hospital: e.target.value }))}>
                      <option value="">—</option>
                      {/* 週期帶入的院名若不在固定清單(如命名差異),補當前值選項避免顯示空白 */}
                      {globals.hospital && !HOSPITAL_LIST.includes(globals.hospital) && (
                        <option value={globals.hospital}>{globals.hospital}</option>
                      )}
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
                {/* 寄件紀錄整合:一鍵查這家醫院的全部往來(自動通知+手動留存) */}
                {globals.hospital && (
                  <a
                    href={`/admin/emails?q=${encodeURIComponent(globals.hospital)}`}
                    className="self-start text-caption text-primary-700 hover:underline focus-ring rounded-sm"
                  >
                    查看「{globals.hospital}」的寄件紀錄 →
                  </a>
                )}
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
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="filled" leadingIcon={copied === 'content' ? <Check size={16} /> : <Mail size={16} />} onClick={() => requestCopy('content')}>
                  {copied === 'content' ? '已複製' : '複製信件（含格式）'}
                </Button>
                <Button type="button" variant="outlined" size="sm" leadingIcon={copied === 'subject' ? <Check size={14} /> : <FileText size={14} />} onClick={() => requestCopy('subject')}>
                  {copied === 'subject' ? '已複製主旨' : '複製主旨'}
                </Button>
                <Button type="button" variant="outlined" size="sm" leadingIcon={copied === 'plain' ? <Check size={14} /> : <Download size={14} />} onClick={() => requestCopy('plain')}>
                  {copied === 'plain' ? '已複製' : '複製純文字'}
                </Button>
                {/* 寄出後留存:主旨+內文全文寫入系統寄件紀錄(不寄信),往來檔案一處查 */}
                <Button type="button" variant="text" size="sm" onClick={() => setLogConfirm(true)}>
                  寄出後留存紀錄
                </Button>
                {unfilled.length > 0 && (
                  <span className="text-caption text-warning-700">尚有 {unfilled.length} 欄未填</span>
                )}
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

      {/* 未填欄位複製確認:佔位符(（欄位名）)寄出事故在源頭擋一道 */}
      <ConfirmDialog
        open={confirmCopy !== ''}
        onOpenChange={(v) => { if (!v) setConfirmCopy(''); }}
        title={`尚有 ${unfilled.length} 個欄位未填`}
        description={`未填:${unfilled.slice(0, 4).join('、')}${unfilled.length > 4 ? '…' : ''}。複製後這些欄位將以（欄位名）佔位顯示,請確認是否先填寫。`}
        confirmLabel="仍要複製"
        onConfirm={() => {
          const k = confirmCopy;
          setConfirmCopy('');
          if (k) runCopy(k);
        }}
      />

      {/* 寄出後留存確認:寫入系統寄件紀錄(不寄信) */}
      <ConfirmDialog
        open={logConfirm}
        onOpenChange={setLogConfirm}
        title="留存至系統寄件紀錄"
        description={`將「${active?.title ?? ''}」的主旨與內文全文留存為一筆手動外寄紀錄(對象:${(formData['受稽醫院'] ?? globals.hospital ?? '').trim() || active?.audience || '未指定'}),供日後於「系統寄件紀錄」查閱。此動作不會寄信;請於實際寄出後再留存。`}
        confirmLabel="留存紀錄"
        loading={logging}
        onConfirm={logManualSend}
      />
    </div>
  );
}
