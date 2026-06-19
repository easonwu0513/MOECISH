/** 公告列表載入骨架(force-dynamic 頁面,慢查詢時不再整頁空白)。 */
export default function NewsLoading() {
  return (
    <div className="min-h-screen bg-surface">
      {/* 頂欄佔位 */}
      <div className="h-16 border-b border-outline-variant/60 bg-surface/90" />
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-9 w-40 rounded-md bg-surface-container-high animate-pulse" />
        <div className="mt-3 h-4 w-72 rounded bg-surface-container-high animate-pulse" />
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-surface-container-high animate-pulse" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[60px] rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4">
              <div className="flex items-center gap-3">
                <div className="h-6 w-16 rounded-full bg-surface-container-high animate-pulse" />
                <div className="h-4 flex-1 max-w-md rounded bg-surface-container-high animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
