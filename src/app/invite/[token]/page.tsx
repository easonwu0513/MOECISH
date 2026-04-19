import { prisma } from '@/lib/db';
import { inviteStatus } from '@/lib/invite';
import { Logo } from '@/components/brand/Logo';
import { Chip } from '@/components/ui/Chip';
import { AlertCircle } from '@/components/icons';
import type { Role } from '@/lib/types';
import InviteAcceptForm from './InviteAcceptForm';

const roleLabel: Record<Role, string> = {
  ADMIN: '平台管理員',
  AUDITOR: '稽核委員',
  RESPONDENT: '填報人',
  SUPERVISOR: '單位主管',
};

export default async function InvitePage({ params }: { params: { token: string } }) {
  const inv = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: { organization: true },
  });

  const status = inv ? inviteStatus(inv) : 'revoked';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-surface">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 15% 20%, rgba(40,82,160,0.10), transparent 70%),' +
            'radial-gradient(ellipse 60% 50% at 85% 85%, rgba(40,82,160,0.05), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <Logo size={56} />
          <h1 className="mt-4 text-headline-sm text-on-surface">MOECISH</h1>
          <p className="mt-1.5 text-body-sm text-on-surface-variant">資通安全稽核管考平台</p>
        </div>

        <div className="bg-surface-container-lowest rounded-md shadow-elev-1 p-7 sm:p-8 border border-outline-variant/60">
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
                  <Chip size="sm" tone="primary">{roleLabel[inv.role as Role]}</Chip>
                  <span className="text-caption text-on-surface-variant">
                    至 {new Date(inv.expiresAt).toLocaleDateString('zh-TW')} 前有效
                  </span>
                </div>
              </div>
              <InviteAcceptForm token={params.token} email={inv.email} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
