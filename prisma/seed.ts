import path from 'node:path';
import { existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';
import { parseChecklistOdt } from '../src/scripts/parse-odt';

const YEAR = 2026;
const REPO_ODT = path.join(__dirname, 'seeds', 'checklist-115.odt');
const ODT_PATH =
  process.env.CHECKLIST_ODT ?? (existsSync(REPO_ODT) ? REPO_ODT : REPO_ODT);

async function main() {
  console.log('[seed] MOECISH 2.0 測試資料建立中...');

  // ── 機關(兩家示範醫院) ──
  const org1 = await prisma.organization.upsert({
    where: { code: 'DEMO-HOSP-A' },
    create: { code: 'DEMO-HOSP-A', name: '示範大學附設醫院', shortName: '示範附醫' },
    update: {},
  });
  const org2 = await prisma.organization.upsert({
    where: { code: 'DEMO-HOSP-B' },
    create: { code: 'DEMO-HOSP-B', name: '示範醫學中心', shortName: '示範醫中' },
    update: {},
  });
  console.log(`[seed] Organization: ${org1.name} / ${org2.name}`);

  // ── 帳號(三角色) ──
  const hash = await bcrypt.hash('demo1234', 10);
  const mkUser = (email: string, name: string, role: string, organizationId: string | null) =>
    prisma.user.upsert({
      where: { email },
      create: { email, name, role, organizationId, passwordHash: hash },
      update: { role, organizationId },
    });

  const admin = await mkUser('admin@demo.tw', '平台管理員', 'SUPER_ADMIN', null);
  const auditor = await mkUser('auditor@demo.tw', '張稽核委員', 'AUDITOR', null);
  await mkUser('org@demo.tw', '林資安窗口', 'ORG_ADMIN', org1.id);
  await mkUser('org2@demo.tw', '陳資安窗口', 'ORG_ADMIN', org2.id);
  console.log('[seed] 已建立 4 個測試帳號 (密碼: demo1234)');

  // ── 檢核表題庫(選用功能,保留) ──
  let items: { itemNo: string; content: string; dimension: string }[] = [];
  try {
    items = parseChecklistOdt(ODT_PATH);
    console.log(`[seed] 從 ODT 解析到 ${items.length} 題`);
  } catch (e) {
    console.warn(`[seed] 無法讀 ODT (${(e as Error).message})，使用佔位內容`);
    const counts: Record<string, number> = {
      '1': 6, '2': 6, '3': 3, '4': 5, '5': 13, '6': 7, '7': 19, '8': 11, '9': 13,
    };
    const dimMap: Record<string, string> = {
      '1': 'CORE_BUSINESS', '2': 'POLICY_ORG', '3': 'STAFFING_BUDGET', '4': 'ASSET_RISK',
      '5': 'OUTSOURCING', '6': 'MAINTENANCE_KPI', '7': 'PROTECTION_CONTROL', '8': 'SYSTEM_DEV',
      '9': 'INCIDENT_RESPONSE',
    };
    items = [];
    for (const [major, n] of Object.entries(counts)) {
      for (let i = 1; i <= n; i++) {
        items.push({
          itemNo: `${major}.${i}`,
          content: `（第 ${major}.${i} 題內容，請從 ODT 匯入）`,
          dimension: dimMap[major],
        });
      }
    }
  }

  const version = await prisma.checklistVersion.upsert({
    where: { year: YEAR },
    create: {
      year: YEAR,
      name: `${YEAR - 1911} 年度資通安全實地稽核檢核表`,
      isActive: true,
      publishedAt: new Date(),
    },
    update: { isActive: true },
  });

  const existingItems = await prisma.checklistItem.count({ where: { versionId: version.id } });
  if (existingItems === 0) {
    let order = 0;
    for (const it of items) {
      await prisma.checklistItem.create({
        data: {
          versionId: version.id,
          itemNo: it.itemNo,
          dimension: it.dimension,
          content: it.content,
          orderIndex: order++,
        },
      });
    }
    console.log(`[seed] 題庫已匯入 (${items.length} 題)`);
  }

  // ── 稽核週期(org1 矯正執行中;org2 開立中) ──
  const startDate = new Date(`${YEAR}-01-20`);
  const dueDate = new Date(`${YEAR}-07-31`);

  const cycle1 = await prisma.auditCycle.upsert({
    where: { organizationId_year: { organizationId: org1.id, year: YEAR } },
    create: {
      year: YEAR,
      organizationId: org1.id,
      checklistVersionId: version.id,
      status: 'REMEDIATION',
      startDate,
      dueDate,
      onsiteDate: startDate,
    },
    update: { status: 'REMEDIATION' },
  });
  await prisma.auditCycle.upsert({
    where: { organizationId_year: { organizationId: org2.id, year: YEAR } },
    create: {
      year: YEAR,
      organizationId: org2.id,
      checklistVersionId: version.id,
      status: 'DRAFT',
      startDate,
      dueDate,
    },
    update: {},
  });
  console.log(`[seed] AuditCycle ×2（${org1.shortName}=REMEDIATION，${org2.shortName}=DRAFT）`);

  // ── 委員指派 ──
  await prisma.auditorAssignment.upsert({
    where: { cycleId_auditorId: { cycleId: cycle1.id, auditorId: auditor.id } },
    create: { cycleId: cycle1.id, auditorId: auditor.id, role: 'LEAD' },
    update: {},
  });

  // ── 缺失(取材自 115 年教育部實地稽核真實範本,內容已通用化) ──
  const existingDefs = await prisma.deficiency.count({ where: { cycleId: cycle1.id } });
  if (existingDefs === 0) {
    const defs: {
      aspect: string; type: string; itemNo: number; description: string; checklistRef?: string;
    }[] = [
      {
        aspect: 'STRATEGY', type: 'IMPROVE', itemNo: 1,
        description:
          '依資通安全責任等級分級辦法應辦事項規定，全部核心資通系統應導入 CNS 27001 或 ISO 27001 等資訊安全管理系統標準，完成公正第三方驗證，並持續維持其驗證有效性。查機關部分核心系統之驗證證書未包含通過我國標準法主管機關委託機構認證之認證標誌（如 TAF 等），應改善之。',
        checklistRef: '1.7',
      },
      {
        aspect: 'STRATEGY', type: 'SUGGEST', itemNo: 1,
        description:
          '依資通安全管理法施行細則第 9 條規定，資通安全維護計畫應包含資通系統之盤點，並標示核心資通系統及相關資產。查機關資通安全維護計畫與其系統清冊部分系統之 MTPD 等資料不一致，建議改善之。',
        checklistRef: '1.7',
      },
      {
        aspect: 'MANAGEMENT', type: 'IMPROVE', itemNo: 1,
        description:
          '機關辦理資通系統及資訊之盤點，盤點範圍應包含機關各單位。查機關已建立資產清冊，惟資訊系統盤點資料尚未完整涵蓋全院所屬單位，且部分網站有遭受攻擊之風險，應全面檢視並改善之。',
        checklistRef: '4.1.1',
      },
      {
        aspect: 'MANAGEMENT', type: 'IMPROVE', itemNo: 2,
        description:
          '依資通安全責任等級分級辦法第 11 條規定，自行或委外開發之資通系統應依資通系統防護需求分級原則完成分級。查機關委外廠商之 RFP 或契約書中，尚有未註明資通系統防護需求等級及要求廠商完成相關控制措施之情形，應全面檢視並改善之。',
        checklistRef: '5.2',
      },
      {
        aspect: 'TECHNICAL', type: 'IMPROVE', itemNo: 1,
        description:
          '依資通安全責任等級分級辦法資通系統防護基準規定，應保留日誌至少 6 個月。查機關 DNS 系統日誌保存不足 6 個月，應改善之。',
        checklistRef: '9.10',
      },
      {
        aspect: 'TECHNICAL', type: 'IMPROVE', itemNo: 2,
        description:
          '依資通安全責任等級分級辦法資通系統防護基準規定，於部署環境中應針對相關資通安全威脅進行更新與修補，另識別並關閉不必要的服務及埠口。查機關部分網站未採用加密連線、對外開放 3306、3389 等埠口，且使用已 EOS 元件，應改善之。',
        checklistRef: '8.8、8.11',
      },
      {
        aspect: 'TECHNICAL', type: 'SUGGEST', itemNo: 1,
        description:
          '依資通安全責任等級分級辦法應辦事項規定，機關應依主管機關公告之項目完成政府組態基準（GCB）導入作業並持續維運。查機關 GCB 符合度約為 60%，建議全面檢視並改善之。',
        checklistRef: '7.3',
      },
    ];

    for (const d of defs) {
      const def = await prisma.deficiency.create({
        data: { ...d, cycleId: cycle1.id, createdById: admin.id },
      });
      await prisma.correctiveAction.create({ data: { deficiencyId: def.id } });
    }
    console.log(`[seed] 已建立 ${defs.length} 筆示範缺失（取材自 115 年實地稽核範本）`);

    // 「DNS 日誌」填為已送審範例(對齊真實案例填法,委員可立即測試審查)
    const dnsDef = await prisma.deficiency.findFirst({
      where: { cycleId: cycle1.id, checklistRef: '9.10' },
      include: { action: true },
    });
    if (dnsDef?.action) {
      await prisma.correctiveAction.update({
        where: { id: dnsDef.action.id },
        data: {
          status: 'SUBMITTED',
          rootCause: 'DNS 伺服器作業系統預設系統日誌存放版本為 7 份，未達 6 個月保存要求。',
          measureTechnical:
            '於作業系統 syslog config 將系統登入日誌檔 auth.log 存放份數從預設值調整為 180 份。',
          plannedDate: new Date(`${YEAR}-01-20`),
          trackingMethod: `將於 ${YEAR - 1911}.07.31 確認日誌檔保存月份數量。`,
          execStatus: 'ON_TIME_DONE',
          actualDate: new Date(`${YEAR}-01-20`),
          submittedAt: new Date(),
        },
      });
      console.log('[seed] DNS 日誌缺失已填為「已送審」示範');
    }
  }

  // ── 前台示範公告 ──
  const demoPosts = [
    {
      slug: 'platform-launch',
      category: 'ANNOUNCEMENT',
      title: 'MOECISH 平台正式啟用:115 年度醫療領域資安稽核管考作業上線',
      important: false, pinned: true,
      contentMd:
        '## 平台啟用\n\n本平台自即日起提供醫療領域受稽機關進行**稽核前資料準備**、**缺失矯正填報**與**委員審查**作業。\n\n- 機關管理員帳號由平台統一邀請開通\n- 操作問題請聯絡資安推動中心\n\n> 請各機關於收到邀請信後 14 日內完成帳號啟用。',
    },
    {
      slug: 'vuln-alert-edge-devices',
      category: 'VULN_ALERT',
      title: '【漏洞警訊】網路邊界設備重大漏洞,請儘速確認版本並修補',
      important: true, pinned: false,
      contentMd:
        '## 摘要\n\n近期多款 VPN / 防火牆設備揭露遠端程式碼執行漏洞,已有在野攻擊紀錄。\n\n## 建議作為\n\n1. 立即盤點機關邊界設備廠牌與版本\n2. 依原廠公告升級至已修補版本\n3. 檢視近 90 日登入紀錄是否異常\n\n如有入侵疑慮,請依資通安全事件通報程序於 **1 小時內** 完成通報。',
    },
    {
      slug: 'intel-healthcare-ransomware',
      category: 'INTEL',
      title: '醫療機構勒索軟體攻擊趨勢分析與防護建議',
      important: false, pinned: false,
      contentMd:
        '## 趨勢觀察\n\n醫療機構因業務不可中斷特性,持續為勒索軟體高價值目標。常見入侵途徑:\n\n- 釣魚郵件夾帶惡意巨集\n- 曝險之遠端桌面服務(RDP)\n- 未修補之邊界設備漏洞\n\n## 防護建議\n\n- 落實 **3-2-1 備份**(離線備份至關重要)\n- 關鍵系統網段隔離\n- 強化特權帳號管理與 MFA',
    },
    {
      slug: 'event-training-2026',
      category: 'EVENT',
      title: '115 年度受稽機關填報說明會(線上),開放報名',
      important: false, pinned: false,
      contentMd:
        '## 活動資訊\n\n針對本年度受稽之醫療機構,說明平台填報流程與常見問題。\n\n- 時間:正式日期另行通知\n- 形式:線上會議\n- 對象:各機關資安窗口(機關管理員)\n\n報名連結將以郵件通知各機關管理員。',
    },
  ];
  for (const p of demoPosts) {
    await prisma.post.upsert({
      where: { slug: p.slug },
      create: { ...p, status: 'PUBLISHED', publishedAt: new Date(), authorId: admin.id },
      update: {},
    });
  }
  console.log(`[seed] 前台示範公告 ×${demoPosts.length}`);

  console.log('\n[seed] ✓ 完成');
  console.log('\n測試帳號 (密碼皆為 demo1234):');
  console.log('  admin@demo.tw     最高管理員');
  console.log('  auditor@demo.tw   稽核委員（已指派至示範附醫週期）');
  console.log('  org@demo.tw       機關管理員（示範附醫，7 筆缺失）');
  console.log('  org2@demo.tw      機關管理員（示範醫中）');
  console.log(`\nCycle ID: ${cycle1.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
