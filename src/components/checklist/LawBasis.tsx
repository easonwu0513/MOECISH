import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { arabicizeLawRefs } from '@/lib/law-numerals';
import { SURFACE_INFO } from '@/lib/tone';

/** 法規對照面板共同標題(稽核依據・稽核重點・應備文件)。 */
const LAW_REF_TITLE = '法規對照（稽核依據・稽核重點・應備文件）';

type LawRefFields = {
  auditBasis: string | null;
  auditFocus: string | null;
  expectedEvidence: string | null;
};

/** 該題是否有任一法規對照資料(供呼叫端決定是否渲染右欄/摺疊面板)。 */
export function hasLawRef(item: LawRefFields): boolean {
  return !!(item.auditBasis || item.auditFocus || item.expectedEvidence);
}

/**
 * 法規對照渲染:稽核依據(逐字法條)/ 稽核重點 / 佐證資料。
 * 純文字結構化顯示:
 * - 「一、法規名稱」行 → 法規標題(粗體 + 上邊距)
 * - 「1. 條文…」行 → 條文段(縮排,引用樣式)
 * - 其他行原樣
 */
export function LawBasisText({ text, className }: { text: string; className?: string }) {
  const lines = arabicizeLawRefs(text).split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return (
    <div className={cn('space-y-1', className)}>
      {lines.map((line, i) => {
        if (/^[一二三四五六七八九十]+、/.test(line)) {
          return (
            <p key={i} className="text-body-sm font-semibold text-ink-900 pt-2 first:pt-0">
              {line}
            </p>
          );
        }
        if (/^\d+\.\s*/.test(line)) {
          return (
            <p key={i} className="text-body-sm text-ink-500 leading-relaxed pl-4 border-l-2 border-primary-200">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="text-body-sm text-ink-500 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/** 編號清單(稽核重點/佐證資料):「1. …」逐行顯示。 */
export function NumberedList({ text, className }: { text: string; className?: string }) {
  const lines = arabicizeLawRefs(text).split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return (
    <ul className={cn('space-y-1.5', className)}>
      {lines.map((line, i) => (
        <li key={i} className="text-body-sm text-ink-500 leading-relaxed">
          {line}
        </li>
      ))}
    </ul>
  );
}

/**
 * 稽核依據獨立面板(委員審閱題卡:與「委員意見」編輯框並排於題卡底部)。
 * 逐字法條篇幅長 → 面板自身可捲(max-h),不把題卡撐得過長;無資料回 null 由呼叫端排版收斂。
 */
export function AuditBasisPanel({ auditBasis, className }: { auditBasis: string | null; className?: string }) {
  if (!auditBasis) return null;
  return (
    <div className={cn(`rounded-md ${SURFACE_INFO} p-3`, className)}>
      <p className="text-caption font-medium text-primary-800 mb-1.5">稽核依據（相關法規條文）</p>
      <div className="max-h-72 overflow-y-auto pr-1">
        <LawBasisText text={auditBasis} />
      </div>
    </div>
  );
}

/** UAT 圖59:法規對照三段各自可收合——收起重點/文件即可讓稽核依據貼近題目,免來回捲動。 */
function LawSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer select-none items-center gap-1 text-label text-primary-800 mb-1.5 focus-ring rounded list-none [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
        {title}
      </summary>
      {children}
    </details>
  );
}

/** 法規對照完整面板(委員審閱/填報頁共用)。 */
export function LawPanel({
  auditBasis,
  auditFocus,
  expectedEvidence,
}: {
  auditBasis: string | null;
  auditFocus: string | null;
  expectedEvidence: string | null;
}) {
  if (!auditBasis && !auditFocus && !expectedEvidence) {
    return <p className="text-body-sm text-ink-500 py-2">本題尚未建立法規對照資料。</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {auditFocus && (
        <LawSection title="稽核重點">
          <NumberedList text={auditFocus} />
        </LawSection>
      )}
      {expectedEvidence && (
        <LawSection title="應備文件">
          <NumberedList text={expectedEvidence} />
        </LawSection>
      )}
      {/* P2(圖59 延伸):逐字法條最長,預設收合讓「稽核重點/應備文件」貼近題目;需要時再展開 */}
      {auditBasis && (
        <LawSection title="稽核依據（法規條文逐字引錄）" defaultOpen={false}>
          <div className="rounded-md bg-paper-sunk border border-rule/50 p-3.5 max-h-96 overflow-y-auto">
            <LawBasisText text={auditBasis} />
          </div>
        </LawSection>
      )}
    </div>
  );
}

/**
 * 窄螢幕(<lg)沿用的可摺疊法規對照面板,置於題卡下方。
 * 雙欄版面下由呼叫端加 `lg:hidden`——lg 以上改由右欄 LawReferenceSticky 常駐展開。
 * 無資料時由呼叫端(hasLawRef)判斷不渲染。
 */
export function LawReferenceCollapsible({
  auditBasis,
  auditFocus,
  expectedEvidence,
  className,
}: LawRefFields & { className?: string }) {
  return (
    <details className={cn(`rounded-md ${SURFACE_INFO} overflow-hidden`, className)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-body-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors">
        {LAW_REF_TITLE}
      </summary>
      <div className="px-3 pb-3 pt-1 bg-card">
        <LawPanel auditBasis={auditBasis} auditFocus={auditFocus} expectedEvidence={expectedEvidence} />
      </div>
    </details>
  );
}

/**
 * 寬螢幕(lg+)右欄常駐展開的法規對照:填報/審閱長表單捲動時 sticky 跟隨,過長則自身捲動(max-h 70vh)。
 * 預設隱藏於 <lg(該尺寸改由 LawReferenceCollapsible 於題卡下方呈現)。
 * topClass 控制 sticky 頂距,用以避開各頁固定工具列(如檢核表填報頁的 sticky 篩選列)。
 */
export function LawReferenceSticky({
  auditBasis,
  auditFocus,
  expectedEvidence,
  topClass = 'lg:top-20',
}: LawRefFields & { topClass?: string }) {
  return (
    <aside className="hidden lg:block">
      <div className={cn('lg:sticky max-h-[70vh] overflow-y-auto rounded-md', SURFACE_INFO, topClass)}>
        <p className="sticky top-0 z-10 px-3 py-2 text-body-sm font-medium text-primary-800 bg-primary-50 border-b border-primary-100">
          {LAW_REF_TITLE}
        </p>
        <div className="px-3 pb-3 pt-2">
          <LawPanel auditBasis={auditBasis} auditFocus={auditFocus} expectedEvidence={expectedEvidence} />
        </div>
      </div>
    </aside>
  );
}
