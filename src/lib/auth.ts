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
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
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
        };
        token.id = u.id as string;
        token.role = u.role;
        token.organizationId = u.organizationId;
        token.organizationName = u.organizationName;
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
