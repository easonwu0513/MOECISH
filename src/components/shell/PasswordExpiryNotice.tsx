import Link from 'next/link';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { BASELINE, isPasswordExpired } from '@/lib/security-baseline';
import { AlertTriangle } from '@/components/icons';

/**
 * 密碼效期提醒(防護基準中級「身分驗證管理」:依機關密碼效期規定變更密碼)。
 * Server component:旗標未啟用或未逾期時不輸出任何內容。
 */
export default async function PasswordExpiryNotice() {
  if (!BASELINE.enabled) return null;
  const session = await auth();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordChangedAt: true, mustChangePassword: true },
  });
  if (!user) return null;

  const expired = isPasswordExpired(user.passwordChangedAt);
  if (!expired && !user.mustChangePassword) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-warning-200 bg-warning-50 px-5 py-3.5"
    >
      <AlertTriangle size={20} className="text-warning-700 shrink-0" />
      <div className="flex-1 min-w-0 text-body-sm text-warning-700">
        {user.mustChangePassword
          ? '您的密碼需要變更（初始密碼或管理員要求），請立即更新。'
          : `您的密碼已超過 ${BASELINE.pwMaxAgeDays} 天效期，依資通系統防護基準請儘速變更。`}
      </div>
      <Link
        href="/account/password"
        className="shrink-0 text-body-sm font-medium text-warning-700 underline hover:no-underline focus-ring rounded-sm"
      >
        前往變更密碼
      </Link>
    </div>
  );
}
