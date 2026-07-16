/**
 * 週期內頁載入骨架（批53）:cycles/[id] 各 segment 導覽時避免掉檔空白。
 * 鏡射 dashboard/loading 範式（min-h-screen + role=status 供螢幕報讀器播報 + animate-pulse 佔位）。
 * 內頁各自 render AppShell（無共用 layout）故骨架自成一頁、不含側欄,與 dashboard/loading 同。
 * 形狀近似週期內頁:CycleHubBar 細列 + 標題塊 + 內容塊 + 2×2 卡格。
 */
export default function CycleSkeleton() {
  return (
    <div className="min-h-screen bg-card" role="status" aria-live="polite">
      <span className="sr-only">載入中…</span>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 animate-pulse">
        {/* CycleHubBar 形狀細列 */}
        <div className="h-10 w-full rounded-lg bg-paper-sunk mb-5" />
        {/* 頁面標題塊 */}
        <div className="h-8 w-64 rounded bg-paper-sunk mb-6" />
        {/* 內容塊 */}
        <div className="h-40 rounded-lg bg-paper-sunk mb-4" />
        <div className="h-56 rounded-lg bg-paper-sunk mb-6" />
        {/* 2×2 卡格 */}
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-paper-sunk" />
          ))}
        </div>
      </div>
    </div>
  );
}
