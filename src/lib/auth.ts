import { NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { writeAuditLog } from './audit-log';
import { BASELINE } from './security-baseline';
import type { Role } from './types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      organizationId: string | null;
      organizationName: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: Role;
    organizationId: string | null;
    organizationName: string | null;
    /** passwordChangedAt epoch(ms);改密後舊 token 失效用 */
    pwc: number;
  }
}

// 啟動期 fail-fast:正式環境的 session 簽章密鑰不可缺、過短或沿用範例值
// (跳過 build phase,避免建置時無 env 而中斷;runtime 首次載入即驗)
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  if (
    !NEXTAUTH_SECRET ||
    NEXTAUTH_SECRET.length < 32 ||
    NEXTAUTH_SECRET === 'change-me-to-a-random-string'
  ) {
    throw new Error(
      'NEXTAUTH_SECRET 未設定、長度不足 32 字元或沿用預設值；正式環境請以 `openssl rand -hex 32` 產生強隨機值',
    );
  }
}

export const authOptions: NextAuthOptions = {
  secret: NEXTAUTH_SECRET,
  // JWT 8 小時到期(縮短遺失 token 的暴露窗;搭配下方 jwt callback 的即時撤銷)
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip =
          (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
          (req?.headers?.['x-real-ip'] as string | undefined) ?? null;

        // 防護基準(中):防自動化程式登入 — 同 IP 視窗內失敗次數上限
        if (BASELINE.enabled && ip) {
          const windowStart = new Date(Date.now() - BASELINE.loginRateWindowMinutes * 60000);
          const recentFails = await prisma.auditLog.count({
            where: { action: 'auth.login-failed', ipAddress: ip, createdAt: { gte: windowStart } },
          });
          if (recentFails >= BASELINE.loginRateMaxFailuresPerIp) {
            throw new Error('TooManyAttempts');
          }
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });
        if (!user || !user.isActive) {
          if (BASELINE.enabled) {
            await writeAuditLog({
              action: 'auth.login-failed', entityType: 'User', entityId: credentials.email,
              after: { reason: 'unknown-or-inactive' }, ipAddress: ip,
            }).catch(() => {});
          }
          return null;
        }

        // 防護基準(普):帳戶鎖定 — 失敗 5 次鎖 15 分鐘
        if (BASELINE.enabled && user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('AccountLocked');
        }

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          if (BASELINE.enabled) {
            const failed = user.failedLoginCount + 1;
            const lock = failed >= BASELINE.lockThreshold;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginCount: lock ? 0 : failed,
                ...(lock ? { lockedUntil: new Date(Date.now() + BASELINE.lockMinutes * 60000) } : {}),
              },
            });
            await writeAuditLog({
              action: 'auth.login-failed', entityType: 'User', entityId: user.id,
              after: { failedCount: failed, locked: lock }, ipAddress: ip,
            }).catch(() => {});
            if (lock) throw new Error('AccountLocked');
          }
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            ...(BASELINE.enabled ? { failedLoginCount: 0, lockedUntil: null } : {}),
          },
        });
        if (BASELINE.enabled) {
          await writeAuditLog({
            action: 'auth.login', entityType: 'User', entityId: user.id,
            ipAddress: ip,
          }).catch(() => {});
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          organizationId: user.organizationId,
          organizationName: user.organization?.name ?? null,
          passwordChangedAt: user.passwordChangedAt ?? null,
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as typeof user & {
          role: Role;
          organizationId: string | null;
          organizationName: string | null;
          passwordChangedAt: Date | null;
        };
        token.id = u.id as string;
        token.role = u.role;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
        token.pwc = u.passwordChangedAt ? new Date(u.passwordChangedAt).getTime() : 0;
        return token;
      }

      // 後續每次請求:回查 DB 確認帳號仍有效、密碼未變更(停權/改密即時失效),
      // 並同步最新角色/機關(避免調整權限後 token 滯後)。DB 暫時不可用時不強制登出。
      if (token?.id) {
        try {
          const u = await prisma.user.findUnique({
            where: { id: token.id },
            select: {
              isActive: true, role: true, organizationId: true,
              passwordChangedAt: true,
              organization: { select: { name: true } },
            },
          });
          if (!u || !u.isActive) return {} as typeof token;
          const pwc = u.passwordChangedAt ? new Date(u.passwordChangedAt).getTime() : 0;
          if (pwc > (token.pwc ?? 0)) return {} as typeof token;
          token.role = u.role as Role;
          token.organizationId = u.organizationId;
          token.organizationName = u.organization?.name ?? null;
        } catch {
          // 維持既有 token,避免 DB 抖動誤踢全站
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.organizationName = token.organizationName;
      }
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
