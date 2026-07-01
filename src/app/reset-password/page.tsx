import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle, ChevronLeft } from '@/components/icons';
import { checkPasswordResetToken } from '@/lib/password-reset';
import ResetPasswordForm from './ResetPasswordForm';

/** 密碼重設頁:server 先驗 token,有效才顯示設定新密碼表單,否則顯示錯誤與重新申請入口。 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = (searchParams.token ?? '').trim();
  const check = await checkPasswordResetToken(token);

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 bg-surface-container-low">
      <Link
        href="/login"
        className="absolute top-5 left-5 sm:top-7 sm:left-7 inline-flex items-center gap-1 h-10 pl-2.5 pr-4 rounded-full text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus-ring"
      >
        <ChevronLeft size={16} />
        返回登入
      </Link>

      <div className="relative w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} />
          <h1 className="mt-4 text-headline text-on-surface">設定新密碼</h1>
        </div>

        <div className="relative bg-surface-container-lowest border border-outline-variant/60 rounded-lg shadow-elev-2 p-7 sm:p-8">
          {check.ok ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="flex flex-col gap-4">
              <Alert tone="danger" icon={<AlertCircle size={18} />}>
                {check.reason === 'expired'
                  ? '此重設連結已過期(逾有效期限)。'
                  : check.reason === 'used'
                    ? '此重設連結已被使用。'
                    : '此重設連結無效。'}
                請重新申請忘記密碼以取得新的連結。
              </Alert>
              <Link href="/forgot-password">
                <Button variant="tonal" fullWidth>重新申請忘記密碼</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
