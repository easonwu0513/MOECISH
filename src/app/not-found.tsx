import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Search } from '@/components/icons';

/** 全域 404。取代 Next 預設英文白頁(政府/醫療場域觀感硬傷)。 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-paper-sunk">
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} />
          <h1 className="mt-4 text-headline-sm text-ink-900">MOECISH</h1>
          <p className="mt-1.5 text-body-sm text-ink-500">資通安全稽核管考平台</p>
        </div>
        <div className="bg-card rounded-md shadow-elev-1 p-7 sm:p-8 border border-rule text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-paper-sunk text-ink-500 flex items-center justify-center mb-4">
            <Search size={26} />
          </div>
          <h2 className="text-title-lg text-ink-900">找不到頁面</h2>
          <p className="mt-2 text-body-sm text-ink-500">
            您要找的頁面不存在，可能已被移除或網址有誤。
          </p>
          <Button href="/dashboard" variant="tonal" size="sm" className="mt-5">回總覽</Button>
        </div>
      </div>
    </div>
  );
}
