'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  CATEGORIES,
  HOSPITALS,
  PREDEFINED_SNIPPETS,
  SECTIONS,
  STORAGE_KEY,
  buildStatsCopyText,
  computeStats,
  loadStoredReportData,
  makeDefaultReportData,
  sanitizeImported,
  sortFindings,
  type Category,
  type Finding,
  type ReportData,
  type SectionKey,
} from './lib';
import { FindingItem, type FindingUpdateValue } from './FindingItem';
import { ReportContent } from './ReportContent';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';

type TabId = 'dashboard' | 'basic' | 'team' | Category;
type ActiveField = 'text' | 'code';
type DraggedItem = { cat: Category; sec: SectionKey; index: number } | null;

const NAV_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: '📊 數據總覽', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'basic', label: '1. 封面與基本', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'team', label: '2. 稽核小組', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'strategy', label: '3. 策略面', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'management', label: '4. 管理面', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  { id: 'technical', label: '5. 技術面', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
];

/**
 * 稽核報告彙整工具 — 原生模組版(自單檔工具 1:1 移植)。
 * 週期模式(cycleId+initial):由「實地稽核彙整報告→報告設定」啟動,
 * 委員發現自動帶入(每次開啟取系統即時資料);頁首編輯可存回系統。
 */
export function AuditMergeTool({
  cycleId,
  initial,
}: {
  cycleId?: string;
  initial?: ReportData;
} = {}) {
  const storageKey = cycleId ? `${STORAGE_KEY}:${cycleId}` : STORAGE_KEY;
  const [reportData, setReportData] = useState<ReportData>(makeDefaultReportData);
  const [syncBusy, setSyncBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [previewZoom, setPreviewZoom] = useState(85);
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<ActiveField>('text');
  const [cursorPos, setCursorPos] = useState<number | null>(null);
  const [snippetHeight, setSnippetHeight] = useState(220);
  const [lastSavedTime, setLastSavedTime] = useState('');

  const pastRef = useRef<ReportData[]>([]);
  const futureRef = useRef<ReportData[]>([]);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const batchStartStateRef = useRef<ReportData | null>(null);
  const isBatchingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [draggedItem, setDraggedItem] = useState<DraggedItem>(null);
  const isDraggingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 系統化彈窗(取代原生 alert/confirm)
  const toast = useToast();
  const [resetOpen, setResetOpen] = useState(false);

  // 週期模式:把封面/基本資訊 + 版面換頁設定存回系統(彙整報告頁與列印版同步)
  async function saveMetaToSystem() {
    if (!cycleId) return;
    setSyncBusy(true);
    const d = reportData;
    // 逐則發現「此前換頁」以 AuditFinding.id 為鍵記錄(僅記 true 者);工具新增的臨時發現(非 DB id)
    // 不持久化發現本體,其換頁亦不記錄——與「發現永遠取系統即時資料」的設計一致。
    const findingBreaks: Record<string, boolean> = {};
    for (const cat of ['strategy', 'management', 'technical'] as const) {
      for (const sec of ['compliance', 'improvements', 'suggestions'] as const) {
        for (const f of d.findings[cat][sec]) {
          if (f.pageBreakBefore) findingBreaks[f.id] = true;
        }
      }
    }
    const res = await fetch(`/api/cycles/${cycleId}/audit/report-meta`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        auditDateRaw: d.auditDateRaw,
        scope: d.scope,
        auditCriteria: d.auditCriteria.map((c) => c.text).filter((t) => t.trim()),
        lead: d.lead,
        subLead: d.subLead,
        team: d.team,
        sectionSettings: d.sectionSettings,
        findingBreaks,
      }),
    });
    setSyncBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: '儲存失敗' }));
      toast.error('存回系統失敗', j.error);
      return;
    }
    toast.success('已存回系統', '封面/基本資訊與版面換頁已同步到彙整報告頁與正式列印。');
  }
  const [forceState, setForceState] = useState<{ warnings: string[]; action: 'print' | 'word' } | null>(null);

  // 掛載時:載入暫存 + 啟用列印樣式 scope
  // 週期模式:發現(findings)永遠取系統即時資料;頁首沿用上次在工具的編輯(本機暫存)
  useEffect(() => {
    if (cycleId && initial) {
      const stored = loadStoredReportData(storageKey);
      setReportData(stored ? { ...stored, findings: initial.findings } : initial);
    } else {
      const stored = loadStoredReportData(storageKey);
      if (stored) setReportData(stored);
    }
    setHydrated(true);
    document.body.classList.add('amt-active');
    return () => document.body.classList.remove('amt-active');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  // 自動暫存
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(storageKey, JSON.stringify(reportData));
    const now = new Date();
    setLastSavedTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
  }, [reportData, hydrated]);

  const updateReportData = useCallback((updater: ReportData | ((prev: ReportData) => ReportData)) => {
    setReportData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!isBatchingRef.current) {
        batchStartStateRef.current = prev;
        isBatchingRef.current = true;
      }
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
        if (batchStartStateRef.current) {
          pastRef.current = [...pastRef.current, batchStartStateRef.current].slice(-50);
        }
        futureRef.current = [];
        isBatchingRef.current = false;
        setCanUndo(pastRef.current.length > 0);
        setCanRedo(false);
      }, 400);
      return next;
    });
    setCanUndo(true);
  }, []);

  const handleUndo = useCallback(() => {
    if (isBatchingRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      isBatchingRef.current = false;
      setReportData((current) => {
        futureRef.current.unshift(current);
        setCanUndo(pastRef.current.length > 0);
        setCanRedo(true);
        return batchStartStateRef.current ?? current;
      });
      return;
    }
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current.pop()!;
    setReportData((current) => {
      futureRef.current.unshift(current);
      setCanUndo(pastRef.current.length > 0);
      setCanRedo(true);
      return previous;
    });
  }, []);

  const handleRedo = useCallback(() => {
    if (isBatchingRef.current) return;
    if (futureRef.current.length === 0) return;
    const next = futureRef.current.shift()!;
    setReportData((current) => {
      pastRef.current.push(current);
      setCanUndo(true);
      setCanRedo(futureRef.current.length > 0);
      return next;
    });
  }, []);

  // 全域快捷鍵 Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement).tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleSetFocus = useCallback((id: string | null, field: ActiveField = 'text', pos: number | null = null) => {
    setActiveFocusId(id);
    setActiveField(field);
    setCursorPos(pos);
  }, []);

  // 編輯聚焦時,預覽自動捲到對應位置
  useEffect(() => {
    if (activeFocusId && activeTab !== 'dashboard') {
      const targetId = activeField === 'code' ? `code-${activeFocusId}` : `textarea-${activeFocusId}`;
      const targetEl = document.getElementById(targetId) || document.getElementById(`preview-target-${activeFocusId}`);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeFocusId, activeField, activeTab]);

  useEffect(() => {
    if (!activeFocusId && activeTab !== 'dashboard') {
      const el = document.getElementById(`preview-${activeTab}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reportData));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `稽核草稿_${reportData.hospitalName || '未命名'}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result));
        const sanitized = parsed?.year ? sanitizeImported(parsed) : null;
        if (sanitized) {
          pastRef.current = [];
          futureRef.current = [];
          setCanUndo(false);
          setCanRedo(false);
          setReportData(sanitized);
          toast.success('草稿匯入成功', `受稽機關:${sanitized.hospitalName}`);
        } else {
          toast.error('匯入失敗', '檔案格式不符合稽核草稿格式');
        }
      } catch {
        toast.error('匯入失敗', '無法解析 JSON 檔案');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const doReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setReportData(makeDefaultReportData());
    setResetOpen(false);
    toast.success('已重置', '所有暫存資料已恢復為預設值');
  };

  /** 匯出/列印前防呆:回傳警告清單(空 = 可直接執行)。 */
  const collectWarnings = (): string[] => {
    const warnings: string[] = [];
    if (!reportData.auditDateRaw) warnings.push('基本資訊:尚未填寫【稽核日期】');
    if (!reportData.hospitalName) warnings.push('基本資訊:尚未填寫【受稽醫院名稱】');
    let hasEmptyFinding = false;
    for (const cat of CATEGORIES) {
      for (const sec of SECTIONS) {
        for (const f of reportData.findings[cat][sec]) {
          if (!f.text.trim()) hasEmptyFinding = true;
        }
      }
    }
    if (hasEmptyFinding) warnings.push('稽核發現:存在【內容留白】的稽核項目');
    return warnings;
  };

  const doPrint = () => {
    const originalTitle = document.title;
    document.title = `實地稽核報告_${reportData.hospitalName}`;
    window.print();
    document.title = originalTitle;
  };

  const handlePrint = () => {
    const warnings = collectWarnings();
    if (warnings.length > 0) {
      setForceState({ warnings, action: 'print' });
      return;
    }
    doPrint();
  };

  const doExportWord = () => {
    let content = document.getElementById('print-content')?.innerHTML ?? '';
    content = content.replace(/<div class="page-break"[^>]*><\/div>/g, '<br clear="all" style="page-break-before:always" />');
    content = content.replace(/<div id="word-spacer"><\/div>/g, '<br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/><br/>');

    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>資安稽核報告</title>
        <style>
          @font-face { font-family: "標楷體"; panose-1: 2 11 6 4 3 5 4 4 2 4; }
          @page { size: 21cm 29.7cm; margin: 2.54cm 2.54cm 2.54cm 2.54cm; mso-page-orientation: portrait; }
          body, p, td, div, span, li, ul, ol, h1, h2, h3 { font-family: 'Times New Roman', serif; mso-fareast-font-family: '標楷體'; line-height: 24pt; color: black; margin: 0; }
          h1 { font-size: 16pt; font-weight: bold; text-align: left; margin: 24pt 0 12pt 0; mso-style-name: "Heading 1"; }
          h2 { font-size: 14pt; font-weight: bold; text-align: left; margin: 18pt 0 12pt 32pt; mso-style-name: "Heading 2"; }
          h3 { font-size: 12pt; font-weight: normal; text-align: left; margin: 12pt 0 6pt 56pt; mso-style-name: "Heading 3"; }
          table { width: 100%; border-collapse: collapse; }
          td { vertical-align: top; text-align: justify; padding-bottom: 6pt; }
          .finding-list { margin-left: 0 !important; padding-left: 0 !important; list-style-type: decimal; }
          /* Word 匯出「稽核發現」段落設定:目標 = 左縮排 3.4cm、凸排 0.63cm(首行落 2.77cm)、左右對齊、最小行高 24pt。
             批66 修:批26 曾假設 Word 匯入 HTML 編號清單會自動加 +1.27cm 偏移,故設 li 2.13cm 期望顯示 3.4cm;
             但使用者實機 Word 未套用該偏移,匯出後段落只落在 ~1.5cm(=2.13-0.63 首行)→ 與瀏覽器列印(audit-merge.css
             直接 3.4cm)不一致。改為與列印路徑相同的 3.4cm 字面值,不再依賴版本相依的清單偏移補償。 */
          .finding-item { margin-left: 3.4cm !important; text-indent: -0.63cm !important; text-align: justify; padding-left: 0 !important; }
        </style>
      </head>
      <body>
    `;
    const sourceHTML = header + content + '</body></html>';
    const blob = new Blob(['﻿', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `實地稽核報告_${reportData.hospitalName}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToWord = () => {
    const warnings = collectWarnings();
    if (warnings.length > 0) {
      setForceState({ warnings, action: 'word' });
      return;
    }
    doExportWord();
  };

  const handleSortSection = useCallback((cat: Category, sec: SectionKey) => {
    updateReportData((prev) => ({
      ...prev,
      findings: { ...prev.findings, [cat]: { ...prev.findings[cat], [sec]: sortFindings([...prev.findings[cat][sec]]) } },
    }));
  }, [updateReportData]);

  const handleUpdateFinding = useCallback((cat: Category, sec: SectionKey, id: string, field: keyof Finding, value: FindingUpdateValue) => {
    updateReportData((prev) => ({
      ...prev,
      findings: {
        ...prev.findings,
        [cat]: { ...prev.findings[cat], [sec]: prev.findings[cat][sec].map((f) => (f.id === id ? { ...f, [field]: value } : f)) },
      },
    }));
  }, [updateReportData]);

  const addFinding = (cat: Category, sec: SectionKey) => {
    const id = Date.now().toString();
    updateReportData((prev) => ({
      ...prev,
      findings: {
        ...prev.findings,
        [cat]: { ...prev.findings[cat], [sec]: [...prev.findings[cat][sec], { id, code: '', text: '', pageBreakBefore: false, duplicateAcknowledged: false }] },
      },
    }));
    handleSetFocus(id, 'text', 0);
  };

  const removeFinding = useCallback((cat: Category, sec: SectionKey, id: string) => {
    updateReportData((prev) => ({
      ...prev,
      findings: {
        ...prev.findings,
        [cat]: { ...prev.findings[cat], [sec]: prev.findings[cat][sec].filter((f) => f.id !== id) },
      },
    }));
    setActiveFocusId((cur) => (cur === id ? null : cur));
  }, [updateReportData]);

  const moveFinding = (cat: Category, sec: SectionKey, fromIndex: number, toIndex: number) => {
    updateReportData((prev) => {
      const items = [...prev.findings[cat][sec]];
      if (toIndex >= 0 && toIndex < items.length) {
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return { ...prev, findings: { ...prev.findings, [cat]: { ...prev.findings[cat], [sec]: items } } };
      }
      return prev;
    });
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, cat: Category, sec: SectionKey, index: number) => {
    setDraggedItem({ cat, sec, index });
    e.dataTransfer.effectAllowed = 'move';
    const target = e.target as HTMLElement;
    setTimeout(() => target.classList.add('is-dragging'), 0);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, cat: Category, sec: SectionKey, index: number) => {
    e.currentTarget.classList.remove('is-dragging');
    if (draggedItem && draggedItem.cat === cat && draggedItem.sec === sec && draggedItem.index !== index) {
      moveFinding(cat, sec, draggedItem.index, index);
    }
    setDraggedItem(null);
  };

  const toggleSectionPageBreak = (cat: Category, sec: SectionKey) => {
    updateReportData((prev) => ({
      ...prev,
      sectionSettings: {
        ...prev.sectionSettings,
        [cat]: { ...prev.sectionSettings[cat], [sec]: { pageBreakBefore: !prev.sectionSettings[cat][sec].pageBreakBefore } },
      },
    }));
  };

  const toggleCategoryPageBreak = (cat: Category) => {
    updateReportData((prev) => ({
      ...prev,
      sectionSettings: {
        ...prev.sectionSettings,
        [cat]: { ...prev.sectionSettings[cat], pageBreakBefore: !prev.sectionSettings[cat].pageBreakBefore },
      },
    }));
  };

  const handleInsertSnippet = (snippet: string) => {
    if (!activeFocusId) {
      toast.info('請先點選輸入框', '將游標放在欲插入的「稽核發現」或「編號」內容框中,再點詞彙');
      return;
    }
    // 在目前狀態中定位該筆發現
    let located: { cat: Category; sec: SectionKey; finding: Finding } | null = null;
    for (const cat of CATEGORIES) {
      for (const sec of SECTIONS) {
        const f = reportData.findings[cat][sec].find((x) => x.id === activeFocusId);
        if (f) { located = { cat, sec, finding: f }; break; }
      }
      if (located) break;
    }
    if (!located) {
      toast.info('此欄位不支援快速插入', '剪貼簿僅支援「稽核發現」與「編號」內容框');
      return;
    }
    const currentText = located.finding[activeField] || '';
    const pos = cursorPos !== null ? cursorPos : currentText.length;
    const newText = currentText.slice(0, pos) + snippet + currentText.slice(pos);
    handleUpdateFinding(located.cat, located.sec, activeFocusId, activeField, newText);

    const isBracket = snippet === '「」' || snippet === '（）';
    const cursorOffset = isBracket ? 1 : snippet.length;
    setCursorPos(pos + cursorOffset);
    setTimeout(() => {
      const targetId = activeField === 'code' ? `code-${activeFocusId}` : `textarea-${activeFocusId}`;
      const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(pos + cursorOffset, pos + cursorOffset);
        if (activeField === 'code') {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      }
    }, 0);
  };

  // 剪貼簿面板高度拖曳
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 50 && newHeight < window.innerHeight * 0.8) setSnippetHeight(newHeight);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  };

  const stats = useMemo(() => computeStats(reportData), [reportData]);

  const handleCopyStats = (type: 'itemCounts' | 'association') => {
    const textToCopy = buildStatsCopyText(type, stats);
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      toast.success('表格已複製到剪貼簿', '可直接貼上至 Excel 或 Word 編輯');
    } catch {
      toast.error('複製失敗', '請手動選取表格內容複製');
    }
    document.body.removeChild(textArea);
  };

  const isCategoryTab = (CATEGORIES as string[]).includes(activeTab);
  const catTab = activeTab as Category;

  return (
    <div className="amt-app">
      <div className="flex flex-col h-screen overflow-hidden no-print relative text-sm">
        {/* 頂部導航列 */}
        <header className="glass-header text-on-surface p-3 flex flex-wrap justify-between items-center gap-3 shrink-0 z-20 relative">
          <div className="flex items-center gap-3 ml-2">
            <Logo size={32} />
            <div>
              {/* MOECISH 品牌條/麵包屑:全螢幕工具不套 AppShell,於此補回導覽脈絡(#14 邊界縫合) */}
              <nav className="flex items-center gap-1.5 text-caption text-on-surface-variant" aria-label="麵包屑">
                <Link href="/dashboard" className="hover:text-on-surface transition-colors">管理</Link>
                <span aria-hidden>/</span>
                <span className="text-on-surface font-medium">報告彙整工具</span>
              </nav>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500" />
                </span>
                <span className="text-[10px] text-on-surface-variant font-medium">已暫存於 {lastSavedTime || '—'}</span>
              </div>
            </div>
            <Link
              href={cycleId ? `/cycles/${cycleId}/audit/report` : '/dashboard'}
              className="ml-2 text-xs font-medium text-on-surface-variant hover:text-primary-700 bg-surface-container hover:bg-primary-50 border border-outline-variant px-3 py-1.5 rounded-full transition-colors"
            >
              {cycleId ? '← 回彙整報告' : '← 回管考平台'}
            </Link>
            {cycleId && (
              <span className="text-[10px] font-medium text-success-700 bg-success-50 border border-success-200 px-2.5 py-1 rounded-full">
                週期模式:委員發現已自動帶入
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pr-2">
            <div className="flex bg-surface-container p-1 rounded-full border border-outline-variant mr-1">
              <button onClick={handleUndo} disabled={!canUndo} className="text-on-surface-variant hover:text-primary-700 hover:bg-surface px-3 py-1.5 rounded-full font-medium transition-all text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed" title="復原 (Ctrl+Z)">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                復原
              </button>
              <button onClick={handleRedo} disabled={!canRedo} className="text-on-surface-variant hover:text-primary-700 hover:bg-surface px-3 py-1.5 rounded-full font-medium transition-all text-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed" title="重做 (Ctrl+Y)">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
                重做
              </button>
            </div>

            <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportJson} className="hidden" />
            <div className="flex bg-surface-container p-1 rounded-full border border-outline-variant">
              <button onClick={() => fileInputRef.current?.click()} className="text-on-surface-variant hover:text-primary-700 hover:bg-surface px-3 py-1.5 rounded-full font-medium transition-all text-xs flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                匯入
              </button>
              <button onClick={handleExportJson} className="text-on-surface-variant hover:text-primary-700 hover:bg-surface px-3 py-1.5 rounded-full font-medium transition-all text-xs flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                備份
              </button>
            </div>

            <div className="w-px h-6 bg-outline-variant mx-1 hidden sm:block" />

            <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-full border border-outline-variant shadow-sm">
              <span className="text-[10px] text-on-surface-variant font-medium">預覽比</span>
              <input type="range" min={40} max={200} step={5} value={previewZoom} onChange={(e) => setPreviewZoom(parseInt(e.target.value, 10))} className="w-16 cursor-pointer accent-primary-600" />
              <span className="text-[10px] text-on-surface-variant w-7 text-right font-mono font-medium">{previewZoom}%</span>
            </div>

            {cycleId && (
              <button
                onClick={saveMetaToSystem}
                disabled={syncBusy}
                className="text-success-700 bg-success-50 hover:bg-success-100 border border-success-200 px-3 py-1.5 rounded-full font-medium transition-all text-xs ml-1 disabled:opacity-50"
                title="把封面/基本資訊(日期、範圍、準則、稽核小組)存回系統,彙整報告頁同步"
              >
                {syncBusy ? '儲存中…' : '存回系統'}
              </button>
            )}
            <button onClick={() => setResetOpen(true)} className="text-danger-600 bg-danger-50 hover:bg-danger-100 border border-danger-100 px-3 py-1.5 rounded-full font-medium transition-all text-xs ml-1">
              重置
            </button>
            <button onClick={exportToWord} className="btn-secondary px-4 py-1.5 text-xs ml-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" /></svg>
              Word
            </button>
            <button onClick={handlePrint} className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              列印 PDF
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
          {/* 左半邊與中間編輯區 */}
          <div className="flex flex-col h-full bg-white resizable-editor w-[55%] shrink-0 z-10 relative shadow-xl">
            <div className="flex flex-1 overflow-hidden">
              {/* 側邊導覽列 */}
              <nav className="w-48 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto p-3">
                <div className="space-y-1">
                  {/* 「一鍵清空所有發現」已移除:發現永遠取系統即時資料(重開即回填),清空只影響本機暫存、
                      無持久效果卻外觀近似不可逆刪除,為避免誤觸與誤解而下架。 */}
                  {NAV_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); handleSetFocus(null); }}
                      className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold ${activeTab === tab.id ? 'active' : ''}`}
                    >
                      <svg className={`w-4 h-4 ${activeTab === tab.id ? 'opacity-100' : 'opacity-60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                      </svg>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </nav>

              <main className="flex-1 bg-white p-4 md:p-6 overflow-y-auto relative" onClick={() => handleSetFocus(null)}>
                <div className="max-w-3xl mx-auto pb-10" onClick={(e) => e.stopPropagation()}>
                  {/* 數據總覽 */}
                  {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                        <div className="bg-primary-100 p-2 rounded-lg text-primary-600">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800">報告統計與摘要</h2>
                      </div>

                      <div className="content-card bg-gradient-to-br from-slate-50 to-slate-100 p-6 flex flex-wrap gap-4 items-center justify-between border-0 shadow-md">
                        <div className="text-left w-full sm:w-auto flex-1 min-w-[200px]">
                          <div className="text-sm font-bold text-slate-500 tracking-wider uppercase mb-1">受稽機關</div>
                          <div className="text-2xl font-black text-slate-800">{reportData.hospitalName} {reportData.branchName}</div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-center justify-start sm:justify-end w-full sm:w-auto">
                          <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-green-100 flex-1 min-w-[100px]">
                            <div className="text-xs font-bold text-green-600 mb-1">符合總計</div>
                            <div className="text-3xl font-black text-green-500">{stats.totalC}</div>
                          </div>
                          <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-red-100 flex-1 min-w-[100px]">
                            <div className="text-xs font-bold text-red-600 mb-1">待改善總計</div>
                            <div className="text-3xl font-black text-red-500">{stats.totalI}</div>
                          </div>
                          <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-amber-100 flex-1 min-w-[100px]">
                            <div className="text-xs font-bold text-amber-600 mb-1">建議總計</div>
                            <div className="text-3xl font-black text-amber-500">{stats.totalS}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-5 mt-2">
                        {([{ id: 'strategy', title: '策略面', icon: '🛡️' }, { id: 'management', title: '管理面', icon: '⚙️' }, { id: 'technical', title: '技術面', icon: '💻' }] as { id: Category; title: string; icon: string }[]).map((d) => (
                          <div key={d.id} className="flex-1 min-w-[200px] content-card p-5 flex flex-col bg-white border-t-4 border-t-slate-400">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                              <span className="text-xl">{d.icon}</span>
                              <h3 className="font-black text-slate-700 text-lg tracking-wide">{d.title}</h3>
                            </div>
                            <div className="space-y-4 mt-auto">
                              <div>
                                <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 border-b border-green-100 pb-1">優點 / 肯定</h4>
                                <div className="flex justify-between items-center bg-green-50/50 p-2 rounded">
                                  <span className="text-slate-600 font-medium">法遵符合情形</span>
                                  <span className="font-bold bg-white text-green-700 px-2.5 py-0.5 rounded shadow-sm border border-green-100">{stats[d.id].c}</span>
                                </div>
                              </div>
                              <div>
                                <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2 border-b border-red-100 pb-1">缺點 / 建議</h4>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center bg-red-50/50 p-2 rounded">
                                    <span className="text-slate-600 font-medium">待改善事項</span>
                                    <span className="font-bold bg-white text-red-600 px-2.5 py-0.5 rounded shadow-sm border border-red-100">{stats[d.id].i}</span>
                                  </div>
                                  <div className="flex justify-between items-center bg-amber-50/50 p-2 rounded">
                                    <span className="text-slate-600 font-medium">建議事項</span>
                                    <span className="font-bold bg-white text-amber-600 px-2.5 py-0.5 rounded shadow-sm border border-amber-100">{stats[d.id].s}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 各項次開立次數統計 */}
                      <div className="content-card p-6 mt-2 relative">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xl">📈</span>
                            <h3 className="font-black text-slate-700 text-lg tracking-wide">各項次開立次數統計</h3>
                            <span className="text-xs text-slate-500 font-normal">(*僅統計待改善與建議事項)</span>
                          </div>
                          <button onClick={() => handleCopyStats('itemCounts')} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                            📋 複製表格
                          </button>
                        </div>
                        {stats.sortedCodes.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 font-medium">目前尚無項次資料</div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-sm text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-4 py-3 font-bold text-slate-600 border-r border-slate-200 w-32">項次</th>
                                  <th className="px-4 py-3 font-bold text-red-500 text-center border-r border-slate-200">待改善事項</th>
                                  <th className="px-4 py-3 font-bold text-amber-500 text-center border-r border-slate-200">建議事項</th>
                                  <th className="px-4 py-3 font-black text-slate-700 text-center bg-slate-100">總計</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stats.sortedCodes.map((code) => {
                                  const stat = stats.codeMap[code];
                                  return (
                                    <tr key={code} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                      <td className="px-4 py-2 font-mono font-bold text-slate-800 border-r border-slate-200 bg-white">{code}</td>
                                      <td className="px-4 py-2 text-center font-bold text-red-500 border-r border-slate-200 bg-red-50/30">{stat.i || '-'}</td>
                                      <td className="px-4 py-2 text-center font-bold text-amber-500 border-r border-slate-200 bg-amber-50/30">{stat.s || '-'}</td>
                                      <td className="px-4 py-2 text-center font-black text-slate-700 bg-slate-100/50">{stat.i + stat.s}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* 複合項次與關聯規則分析 */}
                      <div className="content-card p-6 mt-2 relative">
                        <div className="flex flex-col gap-2 mb-4 pb-3 border-b border-slate-100">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🔗</span>
                              <h3 className="font-black text-slate-700 text-lg tracking-wide">複合項次與關聯規則分析</h3>
                            </div>
                            <button onClick={() => handleCopyStats('association')} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1 shrink-0">
                              📋 複製分析表
                            </button>
                          </div>
                          <span className="text-xs text-slate-500 font-normal md:ml-8">採用子集(Subset)運算與關聯法則(Association Rules)，發掘最常被合併開立的缺失。</span>
                        </div>

                        {stats.nonRedundantSubsets.length === 0 && stats.associationRules.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 font-medium">目前尚無出現 2 次以上的合併項次可供分析</div>
                        ) : (
                          <div className="space-y-6">
                            {stats.nonRedundantSubsets.length > 0 && (
                              <div>
                                <h4 className="font-bold text-slate-700 mb-2 border-l-4 border-primary-400 pl-2">📦 完整複合組合 (自動濾除重疊子集)</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 font-bold text-slate-600 border-r border-slate-200">項次組合 (出現 2 次以上)</th>
                                        <th className="px-4 py-3 font-black text-primary-600 text-center bg-primary-50/30 w-48">共同出現次數</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {stats.nonRedundantSubsets.map((subset, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                          <td className="px-4 py-2 font-mono font-bold text-slate-800 border-r border-slate-200 bg-white">
                                            {subset.items.map((c, i, arr) => (
                                              <span key={i}>
                                                <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 inline-block my-0.5">{c}</span>
                                                {i < arr.length - 1 && <span className="mx-1 text-slate-400">、</span>}
                                              </span>
                                            ))}
                                          </td>
                                          <td className="px-4 py-2 text-center font-black text-primary-600 bg-primary-50/10 text-base">{subset.count} 次</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {stats.associationRules.length > 0 && (
                              <div>
                                <h4 className="font-bold text-slate-700 mb-2 border-l-4 border-primary-400 pl-2">🎯 雙項次關聯強度 (伴隨機率 ≥ 50%)</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                      <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 font-bold text-slate-600 border-r border-slate-200 w-1/3">前提項次 (若發生...)</th>
                                        <th className="px-4 py-3 font-bold text-slate-600 border-r border-slate-200 w-1/3">伴隨項次 (...則常伴隨發生)</th>
                                        <th className="px-4 py-3 font-black text-primary-600 text-center border-r border-slate-200">共同次數</th>
                                        <th className="px-4 py-3 font-black text-primary-600 text-center bg-primary-50/30">伴隨機率</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {stats.associationRules.map((rule, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                          <td className="px-4 py-2 border-r border-slate-200 bg-white">
                                            <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-slate-700 font-mono font-bold">{rule.premise}</span>
                                          </td>
                                          <td className="px-4 py-2 border-r border-slate-200 bg-white">
                                            <span className="bg-primary-50 border border-primary-200 px-2 py-1 rounded text-primary-700 font-mono font-bold">{rule.consequence}</span>
                                          </td>
                                          <td className="px-4 py-2 text-center font-bold text-slate-700 border-r border-slate-200">{rule.coCount} 次</td>
                                          <td className="px-4 py-2 text-center bg-primary-50/10 min-w-[120px]">
                                            <div className="flex items-center justify-center gap-2">
                                              <div className="w-16 bg-slate-200 rounded-full h-2 hidden sm:block">
                                                <div className={`h-2 rounded-full ${rule.confidence >= 80 ? 'bg-red-500' : rule.confidence >= 60 ? 'bg-amber-500' : 'bg-primary-500'}`} style={{ width: `${rule.confidence}%` }} />
                                              </div>
                                              <span className="font-black text-slate-700">{rule.confidence.toFixed(0)}%</span>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 封面與基本 */}
                  {activeTab === 'basic' && (
                    <div className="content-card p-8 space-y-6">
                      <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-3 mb-5 text-xl flex items-center gap-2">
                        <span>📄</span> 基本資訊與封面設定
                      </h3>
                      <div className="space-y-5">
                        <div className="flex flex-wrap gap-5">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">報告年度</label>
                            <input className="input-elegant w-full font-bold text-lg" value={reportData.year} onChange={(e) => updateReportData((p) => ({ ...p, year: e.target.value }))} onFocus={() => handleSetFocus('year')} />
                          </div>
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">稽核日期</label>
                            <input type="date" className="input-elegant w-full" value={reportData.auditDateRaw} onChange={(e) => updateReportData((p) => ({ ...p, auditDateRaw: e.target.value }))} onFocus={() => handleSetFocus('auditDateRaw')} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-5">
                          <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">受稽醫院名稱</label>
                            <select className="input-elegant w-full" value={reportData.hospitalName} onChange={(e) => updateReportData((p) => ({ ...p, hospitalName: e.target.value }))} onFocus={() => handleSetFocus('hospitalName')}>
                              {HOSPITALS.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                          {!reportData.hospitalName.includes('分院') && (
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">分院名稱 (選填)</label>
                              <input className="input-elegant w-full" placeholder="如：台北分院" value={reportData.branchName} onChange={(e) => updateReportData((p) => ({ ...p, branchName: e.target.value }))} onFocus={() => handleSetFocus('branchName')} />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">稽核範圍</label>
                          <input className="input-elegant w-full" value={reportData.scope} onChange={(e) => updateReportData((p) => ({ ...p, scope: e.target.value }))} onFocus={() => handleSetFocus('scope')} />
                        </div>

                        <div className="pt-4 border-t border-slate-200">
                          <div className="flex justify-between items-center mb-3">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">稽核準則</label>
                            <button
                              onClick={() => {
                                const newId = `ac_${Date.now()}`;
                                updateReportData((p) => ({ ...p, auditCriteria: [...(p.auditCriteria || []), { id: newId, text: '' }] }));
                              }}
                              className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded font-bold transition-colors"
                            >
                              + 新增準則
                            </button>
                          </div>
                          <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            {(reportData.auditCriteria || []).map((ac, idx) => (
                              <div key={ac.id} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                                <span className="text-slate-400 font-mono text-xs w-6 text-right shrink-0">{idx + 1}.</span>
                                <input
                                  className="input-elegant flex-1 min-w-[200px] py-1.5 text-sm"
                                  value={ac.text}
                                  onChange={(e) => {
                                    const newText = e.target.value;
                                    updateReportData((p) => ({ ...p, auditCriteria: p.auditCriteria.map((a) => (a.id === ac.id ? { ...a, text: newText } : a)) }));
                                  }}
                                  onFocus={() => handleSetFocus(`ac-${ac.id}`)}
                                />
                                <button onClick={() => updateReportData((p) => ({ ...p, auditCriteria: p.auditCriteria.filter((a) => a.id !== ac.id) }))} className="text-red-300 hover:text-red-600 p-1 shrink-0">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 稽核小組 */}
                  {activeTab === 'team' && (
                    <div className="space-y-6">
                      <div className="content-card p-6">
                        <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-3 mb-5 text-xl flex items-center gap-2">
                          <span>👥</span> 領隊與副領隊資訊
                        </h3>
                        <div className="flex flex-col gap-5">
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">稽核領隊</label>
                            <div className="flex flex-wrap gap-2">
                              <input className="input-elegant flex-1 min-w-[120px]" placeholder="領隊姓名" value={reportData.lead.name} onChange={(e) => updateReportData((p) => ({ ...p, lead: { ...p.lead, name: e.target.value } }))} onFocus={() => handleSetFocus('lead-name')} />
                              <input className="input-elegant flex-1 min-w-[120px]" placeholder="領隊職稱" value={reportData.lead.title} onChange={(e) => updateReportData((p) => ({ ...p, lead: { ...p.lead, title: e.target.value } }))} onFocus={() => handleSetFocus('lead-title')} />
                            </div>
                          </div>
                          <div className="border-t border-slate-100 my-1" />
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1.5">稽核副領隊</label>
                            <div className="flex flex-wrap gap-2">
                              <input className="input-elegant flex-1 min-w-[120px]" placeholder="副領隊姓名" value={reportData.subLead.name} onChange={(e) => updateReportData((p) => ({ ...p, subLead: { ...p.subLead, name: e.target.value } }))} onFocus={() => handleSetFocus('subLead-name')} />
                              <input className="input-elegant flex-1 min-w-[120px]" placeholder="副領隊職稱" value={reportData.subLead.title} onChange={(e) => updateReportData((p) => ({ ...p, subLead: { ...p.subLead, title: e.target.value } }))} onFocus={() => handleSetFocus('subLead-title')} />
                              <input className="input-elegant w-full mt-2" placeholder="副領隊所屬單位" value={reportData.subLead.org} onChange={(e) => updateReportData((p) => ({ ...p, subLead: { ...p.subLead, org: e.target.value } }))} onFocus={() => handleSetFocus('subLead-org')} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {CATEGORIES.map((cat) => (
                        <div key={cat} className="content-card p-5">
                          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                              {cat === 'strategy' ? '🛡️ 策略面委員' : cat === 'management' ? '⚙️ 管理面委員' : '💻 技術面委員'}
                            </h3>
                            <button onClick={() => updateReportData((p) => ({ ...p, team: { ...p.team, [cat]: [...p.team[cat], ''] } }))} className="text-xs bg-primary-50 text-primary-600 hover:bg-primary-100 px-3 py-1.5 rounded-full font-bold transition-colors">+ 新增委員</button>
                          </div>
                          <div className="flex flex-wrap gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            {reportData.team[cat].map((name, idx) => (
                              <div key={idx} className="flex-1 min-w-[180px] flex gap-2 items-center bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm hover:border-primary-300 transition-colors">
                                <input
                                  className="flex-1 p-1.5 border-none outline-none text-sm font-medium min-w-0"
                                  placeholder="請輸入姓名"
                                  value={name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateReportData((p) => {
                                      const newTeam = [...p.team[cat]];
                                      newTeam[idx] = val;
                                      return { ...p, team: { ...p.team, [cat]: newTeam } };
                                    });
                                  }}
                                  onFocus={() => handleSetFocus(`team-${cat}-${idx}`)}
                                />
                                <span className="font-bold text-slate-400 text-xs shrink-0 pr-1">委員</span>
                                <button onClick={() => updateReportData((p) => ({ ...p, team: { ...p.team, [cat]: p.team[cat].filter((_, i) => i !== idx) } }))} className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded shrink-0">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            ))}
                            {reportData.team[cat].length === 0 && <div className="w-full text-center text-slate-400 text-sm py-2">目前尚無委員名單</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 三構面:稽核發現編輯 */}
                  {isCategoryTab && (
                    <div className="space-y-8">
                      <div className={`relative ${reportData.sectionSettings?.[catTab]?.pageBreakBefore ? 'mt-10 pt-6' : 'mb-8'}`}>
                        {reportData.sectionSettings?.[catTab]?.pageBreakBefore && (
                          <div className="custom-page-break-indicator custom-page-break-indicator-lg" style={{ top: '-16px' }}>
                            <span className="custom-page-break-label custom-page-break-label-lg">✂ --- 此大構面前將強制換頁 ---</span>
                          </div>
                        )}
                        <div className="flex flex-wrap justify-between items-center bg-gradient-to-r from-slate-800 to-slate-700 p-5 rounded-xl shadow-md gap-4">
                          <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-3">
                            <span className="bg-white/20 p-2 rounded-lg">
                              {catTab === 'strategy' ? '🛡️' : catTab === 'management' ? '⚙️' : '💻'}
                            </span>
                            {catTab === 'strategy' ? '一、策略面' : catTab === 'management' ? '二、管理面' : '三、技術面'}
                          </h2>
                          <button
                            onClick={() => toggleCategoryPageBreak(catTab)}
                            className={`px-4 py-2 rounded-full transition-all flex items-center gap-2 text-xs font-bold shrink-0 ${reportData.sectionSettings?.[catTab]?.pageBreakBefore ? 'bg-primary-500 text-white shadow-inner' : 'text-slate-200 bg-white/10 hover:bg-white/20 border border-white/10'}`}
                            title={reportData.sectionSettings?.[catTab]?.pageBreakBefore ? '取消構面換頁' : '在此構面前插入換頁線'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            {reportData.sectionSettings?.[catTab]?.pageBreakBefore ? '已開啟換頁' : '設定構面換頁'}
                          </button>
                        </div>
                      </div>

                      {([
                        { sec: 'compliance' as SectionKey, title: '法遵符合情形', color: 'border-green-400', bg: 'bg-green-50' },
                        { sec: 'improvements' as SectionKey, title: '待改善事項', color: 'border-red-400', bg: 'bg-red-50' },
                        { sec: 'suggestions' as SectionKey, title: '建議事項', color: 'border-amber-400', bg: 'bg-amber-50' },
                      ]).map((s) => {
                        const sectionHasPageBreak = reportData.sectionSettings?.[catTab]?.[s.sec]?.pageBreakBefore;
                        const sectionItems = reportData.findings[catTab][s.sec];
                        // 解析該區塊所有項目的編號,用於判斷交集與重疊
                        const itemParsedCodes = sectionItems.map((item) => {
                          if (!item.code) return [] as string[];
                          return item.code.split(/[、,，\s]+/).filter((c) => c.trim() !== '');
                        });

                        return (
                          <div key={s.sec} className={`relative ${sectionHasPageBreak ? 'mt-12 pt-6' : ''}`}>
                            {sectionHasPageBreak && (
                              <div className="custom-page-break-indicator" style={{ top: '-16px' }}>
                                <span className="custom-page-break-label">✂ --- 此標題前將強制換頁 ---</span>
                              </div>
                            )}
                            <div className={`flex flex-col xl:flex-row justify-between items-start xl:items-center mb-4 p-3 rounded-lg border-l-4 ${s.color} ${s.bg} gap-3`}>
                              <div className="flex items-center gap-3">
                                <h3 className="font-bold text-slate-800 text-lg tracking-wide whitespace-nowrap">{s.title}</h3>
                                <button
                                  onClick={() => toggleSectionPageBreak(catTab, s.sec)}
                                  className={`p-1.5 rounded-full transition-colors shrink-0 ${sectionHasPageBreak ? 'bg-primary-600 text-white shadow-md' : 'text-slate-400 hover:bg-white hover:text-primary-500 hover:shadow-sm'}`}
                                  title={sectionHasPageBreak ? '取消標題換頁' : '在此標題前插入換頁線'}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <div className="flex bg-white rounded-md border border-slate-200 shadow-sm grow sm:grow-0 justify-center">
                                  {['、', '。', '，', '「」', '（）'].map((p) => (
                                    <button
                                      key={p}
                                      onMouseDown={(e) => { e.preventDefault(); handleInsertSnippet(p); }}
                                      title={p === '，' ? '逗號' : ''}
                                      className="px-2.5 py-1 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-primary-600 border-r border-slate-200 last:border-0 transition-colors flex-1 text-center"
                                    >
                                      {p === '，' ? <span className="font-serif text-[16px] leading-none" style={{ position: 'relative', top: '2px' }}>{p}</span> : p}
                                    </button>
                                  ))}
                                </div>

                                <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                                  <button onClick={() => handleSortSection(catTab, s.sec)} className="btn-secondary px-3 py-1.5 text-xs flex items-center justify-center gap-1 text-slate-600 bg-white hover:bg-slate-100 transition-colors flex-1 sm:flex-none shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                                    整理排序
                                  </button>
                                  <button onClick={() => addFinding(catTab, s.sec)} className="btn-secondary px-3 py-1.5 text-xs flex items-center justify-center gap-1 border-primary-200 text-primary-700 bg-primary-50 hover:bg-primary-100 flex-1 sm:flex-none shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    新增項目
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3 pl-0 sm:pl-2">
                              {sectionItems.map((item, idx) => {
                                const currentParsed = itemParsedCodes[idx];
                                let isDuplicate = false;
                                if (currentParsed.length > 0) {
                                  for (let j = 0; j < itemParsedCodes.length; j++) {
                                    if (idx !== j && currentParsed.some((num) => itemParsedCodes[j].includes(num))) {
                                      isDuplicate = true;
                                      break;
                                    }
                                  }
                                }
                                return (
                                  <FindingItem
                                    key={item.id}
                                    item={item}
                                    cat={catTab}
                                    sec={s.sec}
                                    index={idx}
                                    isDuplicate={isDuplicate}
                                    onUpdate={handleUpdateFinding}
                                    onRemove={removeFinding}
                                    onFocus={handleSetFocus}
                                    onDragStart={onDragStart}
                                    onDragOver={onDragOver}
                                    onDrop={onDrop}
                                  />
                                );
                              })}
                              {sectionItems.length === 0 && (
                                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium mx-2">
                                  目前尚無資料，點擊上方按鈕新增
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </main>
            </div>

            {/* 高度調整拉桿 */}
            <div className="resizer-y" onMouseDown={handleResizerMouseDown} />

            {/* 下半部:固定剪貼簿面板 */}
            <div className="bg-white border-t border-slate-200 shrink-0 flex flex-col no-print z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]" style={{ height: `${snippetHeight}px` }}>
              <div className="px-4 py-2 bg-slate-50 font-bold text-xs text-slate-600 border-b border-slate-100 flex items-center justify-between shrink-0">
                <span className="flex items-center gap-2 tracking-wide uppercase">
                  <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  常用詞彙剪貼簿
                </span>
                <span className="text-[10px] text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full font-medium hidden sm:block">
                  💡 點擊上方輸入框後，再點選下方詞彙即可快速插入
                </span>
              </div>
              <div className="p-4 overflow-y-auto flex-1 flex flex-wrap gap-2.5 content-start bg-slate-50/50">
                {PREDEFINED_SNIPPETS.map((snippet, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleInsertSnippet(snippet); }}
                    className="text-left text-[14px] font-bold bg-white border border-slate-300 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 hover:shadow p-2.5 rounded-lg transition-all active:scale-95 text-slate-800 tracking-wide"
                  >
                    {snippet}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 右側即時預覽 */}
          <aside id="preview-scroll-container" className="flex-1 bg-[#eef2f6] p-6 overflow-y-auto shadow-inner relative min-w-0 text-center">
            <div
              className="bg-white shadow-[0_10px_40px_rgba(0,0,0,0.1)] inline-block text-left w-[210mm] min-h-[297mm] p-[20mm] mb-[400px] transition-transform duration-200"
              style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center' }}
            >
              <ReportContent data={reportData} sortFunc={sortFindings} activeFocusId={activeFocusId} cursorPos={cursorPos} isPrint={false} />
            </div>
          </aside>
        </div>
      </div>

      {/* 系統化確認對話框 */}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="重置所有資料"
        description="將清除暫存並恢復為預設值,目前輸入的所有內容都會消失,無法復原。確定重置?"
        confirmLabel="重置"
        tone="danger"
        onConfirm={doReset}
      />
      <ConfirmDialog
        open={forceState !== null}
        onOpenChange={(o) => !o && setForceState(null)}
        title="資料尚未填妥"
        description={
          <span className="block text-left">
            {forceState?.warnings.map((w) => (
              <span key={w} className="block">• {w}</span>
            ))}
            <span className="block mt-2">確定要強制{forceState?.action === 'print' ? '列印' : '匯出 Word'}嗎?</span>
          </span>
        }
        confirmLabel={forceState?.action === 'print' ? '強制列印' : '強制匯出'}
        tone="warning"
        onConfirm={() => {
          const act = forceState?.action;
          setForceState(null);
          if (act === 'print') setTimeout(doPrint, 150);
          else if (act === 'word') doExportWord();
        }}
      />

      {/* 列印專用區域 */}
      <div id="print-content" className="print-only hidden">
        <ReportContent data={reportData} sortFunc={sortFindings} activeFocusId={null} cursorPos={null} isPrint={true} />
      </div>
    </div>
  );
}
