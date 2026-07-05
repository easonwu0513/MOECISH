import { prisma } from '@/lib/db';
import { inviteStatus } from '@/lib/invite';
import { AuthLayout } from '@/components/shell/AuthLayout';
import { Chip } from '@/components/ui/Chip';
import { AlertCircle } from '@/components/icons';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { fmtROC } from '@/lib/date';
import InviteAcceptForm from './InviteAcceptForm';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const inv = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: { organization: true },
  });

  const status = inv ? inviteStatus(inv) : 'revoked';

  return (
    <AuthLayout title="MOECISH" subtitle="資通安全稽核管考平台">
          {!inv || status === 'revoked' || status === 'used' || status === 'expired' ? (
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center mb-4">
                <AlertCircle size={26} />
              </div>
              <h2 className="text-title-lg text-on-surface">
                {status === 'used' ? '邀請已使用' : status === 'expired' ? '邀請已過期' : '邀請無效'}
              </h2>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                {status === 'used'
                  ? '此邀請已被接受。若您已啟用帳號，請直接登入。'
                  : status === 'expired'
                  ? '此邀請已超過 14 天有效期限。請聯絡平台管理員重新發送。'
                  : '此邀請連結無效或已撤回。請聯絡平台管理員。'}
              </p>
              <a href="/login" className="mt-5 inline-block text-primary-700 hover:underline text-body-sm">
                前往登入頁 →
              </a>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-title-lg text-on-surface">歡迎，{inv.name}</h2>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  {inv.organization
                    ? <>您已被邀請加入 <span className="font-medium text-on-surface">{inv.organization.name}</span></>
                    : '您已被邀請加入 MOECISH'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Chip size="sm" tone="primary">{ROLE_LABELS[inv.role as Role]}</Chip>
                  <span className="text-caption text-on-surface-variant">
                    至 {fmtROC(inv.expiresAt)} 前有效
                  </span>
                </div>
              </div>
              <InviteAcceptForm token={params.token} email={inv.email} />
            </>
          )}
    </AuthLayout>
  );
}
