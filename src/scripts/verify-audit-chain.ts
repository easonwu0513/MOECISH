/**
 * 稽核軌跡雜湊鏈驗證(防護基準中級「日誌資訊之保護」):
 *   npm run audit:verify-chain
 * 逐筆重算 sha256 鏈,任何竄改/刪除即報告斷鏈位置;非零退出碼可掛排程告警。
 */
import { createHash } from 'node:crypto';
import { prisma } from '../lib/db';

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { chainHash: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, actorId: true, action: true, entityType: true, entityId: true,
      beforeJson: true, afterJson: true, ipAddress: true, chainHash: true, createdAt: true,
    },
  });
  if (logs.length === 0) {
    console.log('[chain] 尚無鏈式日誌(SECURITY_BASELINE 未啟用過)');
    return;
  }

  let prev = 'GENESIS';
  let broken = 0;
  for (const l of logs) {
    const payload = JSON.stringify([
      prev, l.actorId, l.action, l.entityType, l.entityId,
      l.beforeJson, l.afterJson, l.ipAddress,
    ]);
    const expect = createHash('sha256').update(payload, 'utf8').digest('hex');
    if (expect !== l.chainHash) {
      broken++;
      console.log(`[chain] ✗ 斷鏈於 ${l.id}(${l.createdAt.toISOString()} ${l.action})`);
    }
    prev = l.chainHash!;
  }

  console.log(`[chain] 共 ${logs.length} 筆鏈式日誌,${broken === 0 ? '完整性驗證通過 ✓' : `發現 ${broken} 筆異常 ✗`}`);
  if (broken > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error('[chain] 驗證失敗:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
