/** 總覽載入骨架:force-dynamic + 多表查詢冷啟動時避免整頁空白;role=status 供螢幕報讀器播報。 */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-surface" role="status" aria-live="polite">
      <span className="sr-only">載入總覽工作台中…</span>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 animate-pulse">
        <div className="h-4 w-32 rounded bg-surface-container-high mb-4" />
        <div className="h-[4.5rem] rounded-lg bg-surface-container-high mb-4" />
        <div className="h-28 rounded-lg bg-primary-100/60 mb-6" />
        <div className="h-56 rounded-lg bg-surface-container-high mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-surface-container-high" />
          ))}
        </div>
      </div>
    </div>
  );
}
