/**
 * 資通系統防護基準(附表十,中級)— 集中設定與共用檢核。
 *
 * 總開關:環境變數 SECURITY_BASELINE=1 才啟用(預設關,行為與未實作前相同)。
 * 各參數可用環境變數覆寫;對應條文見 docs/SECURITY-BASELINE.md。
 */

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const BASELINE = {
  /**
   * 總開關(未啟用時以下控制全部不生效)。
   * 資安:正式環境「預設開」——漏設不再靜默 fail-open,須顯式 SECURITY_BASELINE=0 才關;
   * 開發/測試維持預設關(顯式 =1 才開),避免本機被帳戶鎖定/IP 限速干擾。
   */
  get enabled() {
    if (process.env.NODE_ENV === 'production') return process.env.SECURITY_BASELINE !== '0';
    return process.env.SECURITY_BASELINE === '1';
  },

  // ── 身分驗證管理(普三):帳戶鎖定 ──
  lockThreshold: num(process.env.SB_LOCK_THRESHOLD, 5),   // 失敗達 N 次
  lockMinutes: num(process.env.SB_LOCK_MINUTES, 15),      // 鎖定 M 分鐘

  // ── 身分驗證管理(普四/五):密碼複雜度/效期/歷史 ──
  pwMinLength: num(process.env.SB_PW_MIN_LENGTH, 12),
  pwMaxAgeDays: num(process.env.SB_PW_MAX_AGE_DAYS, 90),  // 機關密碼效期
  pwHistoryCount: 3,                                       // 不可與前三次相同(條文定值)

  // ── 帳號管理(中二):閒置自動登出 ──
  idleLogoutMinutes: num(process.env.SB_IDLE_MINUTES, 30),

  // ── 身分驗證管理(中一):防自動化程式登入(IP 視窗限制) ──
  loginRateWindowMinutes: 15,
  loginRateMaxFailuresPerIp: num(process.env.SB_LOGIN_RATE_MAX, 20),
};

// 啟動期告警(比照 auth.ts 的 NEXTAUTH_SECRET fail-fast;跳過 build phase):
// 正式環境若「顯式停用」防護基準,大聲記錄——避免無感在無鎖定/無限速/接受弱密碼/無稽核防竄改鏈下營運。
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  process.env.SECURITY_BASELINE === '0'
) {
  console.error(
    '[security-baseline] 正式環境已「顯式停用」資通系統防護基準（SECURITY_BASELINE=0）：登入無帳戶鎖定與 IP 限速、接受弱密碼、稽核無防竄改鏈。除非有明確理由，請移除此設定以恢復預設保護。',
  );
}

/** 密碼複雜度:至少 pwMinLength 字,含大寫、小寫、數字、特殊符號其中三類以上。 */
export function validatePasswordComplexity(pw: string): string | null {
  if (pw.length < BASELINE.pwMinLength) {
    return `密碼長度至少 ${BASELINE.pwMinLength} 字元`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) {
    return '密碼須包含大寫字母、小寫字母、數字、特殊符號其中至少三類';
  }
  return null;
}

/** 密碼是否已逾效期(passwordChangedAt 為空視為未逾期,避免溯及既有帳號)。 */
export function isPasswordExpired(passwordChangedAt: Date | null): boolean {
  if (!BASELINE.enabled || !passwordChangedAt) return false;
  const ageMs = Date.now() - new Date(passwordChangedAt).getTime();
  return ageMs > BASELINE.pwMaxAgeDays * 86400000;
}

/** 解析密碼歷史 JSON(最近 N 個 bcrypt 雜湊,新→舊)。 */
export function parsePasswordHistory(raw: string | null): string[] {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 加入新雜湊並截斷至歷史上限。 */
export function pushPasswordHistory(raw: string | null, newHash: string): string {
  const next = [newHash, ...parsePasswordHistory(raw)].slice(0, BASELINE.pwHistoryCount);
  return JSON.stringify(next);
}
