import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * 「信件管理」雙頁籤(UAT:信件範本與 Email 不要兩個模組):
 *   ・信件範本   —— 手動信件產生器,複製貼到外部郵件用戶端寄送(不經平台寄信管線)
 *   ・系統寄件紀錄 —— 平台自動通知(Graph 寄送)的紀錄、追蹤信與死信重寄
 * 側欄僅留「信件管理」單一入口(nav-map),兩頁以此頁籤互通,單一模組心智。
 */
export function MailTabs({ active }: { active: 'letters' | 'log' }) {
  const TABS = [
    { key: 'letters', label: '信件範本', href: '/admin/letter-templates' },
    { key: 'log', label: '系統寄件紀錄', href: '/admin/emails' },
  ] as const;
  return (
    <nav aria-label="信件管理頁面切換" className="mb-6 flex gap-1 border-b border-rule">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? 'page' : undefined}
          className={cn(
            '-mb-px rounded-t-md border-b-2 px-4 py-2.5 text-body-sm transition-colors focus-ring',
            active === t.key
              ? 'border-primary-600 font-medium text-primary-700'
              : 'border-transparent text-ink-500 hover:bg-paper-sunk hover:text-ink-900',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
