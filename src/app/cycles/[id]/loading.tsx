/** 週期頁載入骨架:橫幅 + 7 階段流程帶 + 讀數卡的輪廓,避免整頁空白。 */
export default function CycleLoading() {
  return (
    <div className="min-h-screen bg-surface" role="status" aria-live="polite">
      <span className="sr-only">載入稽核週期中…</span>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 animate-pulse">
        <div className="h-8 w-72 max-w-full rounded bg-surface-container-high mb-3" />
        <div className="h-4 w-48 rounded bg-surface-container-high mb-6" />
        <div className="h-24 rounded-lg bg-primary-100/60 mb-5" />
        <div className="h-28 rounded-lg bg-surface-container-high mb-6" />
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-surface-container-high" />
          ))}
        </div>
      </div>
    </div>
  );
}
