/** 公告詳情載入骨架。 */
export default function NewsDetailLoading() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="h-16 border-b border-outline-variant/60 bg-surface/90" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-4 w-28 rounded bg-surface-container-high animate-pulse" />
        <div className="mt-8 h-6 w-20 rounded-full bg-surface-container-high animate-pulse" />
        <div className="mt-4 h-9 w-4/5 rounded-md bg-surface-container-high animate-pulse" />
        <div className="mt-3 h-4 w-40 rounded bg-surface-container-high animate-pulse" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-surface-container-high animate-pulse" style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
      </main>
    </div>
  );
}
