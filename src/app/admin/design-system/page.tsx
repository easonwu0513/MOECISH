import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AppShell } from '@/components/shell/AppShell';
import DesignGallery from './DesignGallery';

export const dynamic = 'force-dynamic';

/**
 * 設計系統展示頁(living gallery;SUPER_ADMIN)——UIUX 稽核 #2 配套:
 * 用「真的元件」呈現統一後的 Tone 單一來源(lib/tone)與角色色,兼作設計系統的活文件,
 * 改任何 tone/元件先來這裡對照。與 docs/DESIGN-SYSTEM.md 互補(文件講規則、此頁看實物)。
 */
export default async function DesignSystemPage() {
  const session = await auth();
  if (!session) redirect('/login?callbackUrl=/admin/design-system');
  const user = session.user;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }}
      crumbs={[{ label: '總覽', href: '/dashboard' }, { label: '設計系統' }]}
    >
      <header className="mb-8">
        <h1 className="text-headline text-ink-900">設計系統展示</h1>
        <p className="mt-1 text-body-sm text-ink-500 leading-relaxed max-w-3xl">
          統一的色調(Tone)單一來源與元件模板實物對照。所有元件的 tone→class 一律取自 <span className="font-mono">lib/tone</span> 的
          <span className="font-mono"> TONE</span> map(六面向 soft／solid／fill／outlined／text／dot),角色色一律由 <span className="font-mono">ROLE_TONE</span> 派生。
          改任何色調或元件前先來此對照;規則細節見 <span className="font-mono">docs/DESIGN-SYSTEM.md</span>。
        </p>
      </header>
      <DesignGallery />
    </AppShell>
  );
}
