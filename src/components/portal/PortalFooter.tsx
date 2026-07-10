import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { APP_VERSION, BUILD_REV } from '@/lib/version';

/** 前台共用頁尾(三欄完整版,首頁/公告列表/公告詳情一致)。 */
export function PortalFooter() {
  const rocYear = new Date().getFullYear() - 1911;
  return (
    <footer className="mt-auto border-t border-rule/60 bg-paper-sunk">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div className="leading-tight">
              <p className="text-title text-ink-900 font-semibold">MOECISH</p>
              <p className="text-caption text-ink-500">資通安全稽核管考平台</p>
            </div>
          </div>
          <p className="mt-4 text-body-sm text-ink-500 max-w-sm leading-relaxed">
            服務教育部轄下醫療機構之資通安全稽核管考作業，
            由教育部轄下醫療領域資訊安全推動中心（C.I.S.H）維運。
          </p>
        </div>
        <div>
          <p className="text-label text-ink-900 mb-4">快速連結</p>
          <ul className="space-y-2.5 text-body-sm">
            <li><Link href="/news" className="text-ink-500 hover:text-primary-700 transition-colors">資安資訊</Link></li>
            <li><Link href="/news?category=VULN_ALERT" className="text-ink-500 hover:text-primary-700 transition-colors">漏洞警訊</Link></li>
            <li><Link href="/login" className="text-ink-500 hover:text-primary-700 transition-colors">系統登入</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-label text-ink-900 mb-4">聯絡資訊</p>
          <ul className="space-y-2.5 text-body-sm text-ink-500">
            <li>主辦單位：教育部</li>
            <li>維運：教育部轄下醫療領域資訊安全推動中心</li>
            <li>
              <a className="font-mono hover:text-primary-700 transition-colors" href="mailto:moecish@m365.ntu.edu.tw">
                moecish@m365.ntu.edu.tw
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-rule/50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-x-6 gap-y-2 flex-wrap text-caption text-ink-500">
          <span>© 中華民國 {rocYear} 年　教育部轄下醫療領域資訊安全推動中心（C.I.S.H）</span>
          <nav aria-label="法律與政策" className="flex items-center gap-x-4 gap-y-1 flex-wrap">
            <Link href="/privacy" className="hover:text-primary-700 transition-colors">隱私權政策</Link>
            <Link href="/terms" className="hover:text-primary-700 transition-colors">服務條款</Link>
            <Link href="/copyright" className="hover:text-primary-700 transition-colors">著作權聲明</Link>
          </nav>
          <span className="tabular-nums">MOECISH v{APP_VERSION} · {BUILD_REV}</span>
        </div>
      </div>
    </footer>
  );
}
