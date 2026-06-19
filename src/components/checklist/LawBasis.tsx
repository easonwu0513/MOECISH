import { cn } from '@/lib/cn';

/**
 * 法規對照渲染:稽核依據(逐字法條)/ 稽核重點 / 佐證資料。
 * 純文字結構化顯示:
 * - 「一、法規名稱」行 → 法規標題(粗體 + 上邊距)
 * - 「1. 條文…」行 → 條文段(縮排,引用樣式)
 * - 其他行原樣
 */
export function LawBasisText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return (
    <div className={cn('space-y-1', className)}>
      {lines.map((line, i) => {
        if (/^[一二三四五六七八九十]+、/.test(line)) {
          return (
            <p key={i} className="text-body-sm font-semibold text-on-surface pt-2 first:pt-0">
              {line}
            </p>
          );
        }
        if (/^\d+\.\s*/.test(line)) {
          return (
            <p key={i} className="text-body-sm text-on-surface-variant leading-relaxed pl-4 border-l-2 border-primary-200">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="text-body-sm text-on-surface-variant leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/** 編號清單(稽核重點/佐證資料):「1. …」逐行顯示。 */
export function NumberedList({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return (
    <ul className={cn('space-y-1.5', className)}>
      {lines.map((line, i) => (
        <li key={i} className="text-body-sm text-on-surface-variant leading-relaxed">
          {line}
        </li>
      ))}
    </ul>
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
    return <p className="text-body-sm text-on-surface-variant py-2">本題尚未建立法規對照資料。</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {auditFocus && (
        <div>
          <p className="text-label text-primary-800 mb-1.5">稽核重點</p>
          <NumberedList text={auditFocus} />
        </div>
      )}
      {expectedEvidence && (
        <div>
          <p className="text-label text-primary-800 mb-1.5">佐證資料(機關應備文件)</p>
          <NumberedList text={expectedEvidence} />
        </div>
      )}
      {auditBasis && (
        <div>
          <p className="text-label text-primary-800 mb-1.5">稽核依據(法規條文逐字引錄)</p>
          <div className="rounded-md bg-surface-container-low border border-outline-variant/50 p-3.5 max-h-96 overflow-y-auto">
            <LawBasisText text={auditBasis} />
          </div>
        </div>
      )}
    </div>
  );
}
