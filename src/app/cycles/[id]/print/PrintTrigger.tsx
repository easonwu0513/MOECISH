'use client';

export default function PrintTrigger() {
  return (
    <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-md shadow"
      >
        🖨️ 列印 / 另存 PDF
      </button>
    </div>
  );
}
