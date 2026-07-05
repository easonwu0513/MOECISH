import Link from 'next/link';
import { AuthLayout } from '@/components/shell/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { AlertCircle } from '@/components/icons';
import { checkPasswordResetToken } from '@/lib/password-reset';
import ResetPasswordForm from './ResetPasswordForm';

/** 密碼重設頁:server 先驗 token,有效才顯示設定新密碼表單,否則顯示錯誤與重新申請入口。 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = (searchParams.token ?? '').trim();
  const check = await checkPasswordResetToken(token);

  return (
    <AuthLayout title="設定新密碼" back={{ href: '/login', label: '返回登入' }}>
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
    </AuthLayout>
  );
}
