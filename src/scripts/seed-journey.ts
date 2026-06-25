/**
 * 引導式精靈（Guided Journey）種子腳本 — 安全、冪等。
 *
 * 跑法：npm run journey:seed
 *
 * 設計原則（與被標記為上線阻斷的 `db:seed` 後門明確區隔）：
 *  - 只「新增」兩個 scope 的範本（PROGRAMME 中心年度 runbook、CYCLE 週期各階段），不刪除/覆寫任何其他資料。
 *  - 冪等：若該 scope 範本已存在且已有階段 → 跳過，保留使用者在後台的編輯（不回填、不清空）。
 *  - 內容為「骨架 + 大概步驟」，來源：使用者「115計畫工作進度」試算表（稽核前作業/年度SOP/工作進度）
 *    與系統既有 ROLE_STEP_DUTIES；上線後一律在後台 /admin/journey 維護，不再回試算表改。
 */
import { prisma } from '../lib/db';

type SeedItem = { title: string; hint?: string; role?: 'SUPER_ADMIN' | 'ORG_ADMIN' | 'AUDITOR'; autoKey?: string };
type SeedStage = { stageKey: string; title: string; summary?: string; items: SeedItem[] };
type SeedTemplate = { scope: 'CYCLE' | 'PROGRAMME'; title: string; stages: SeedStage[] };

// ── 中心年度計畫執行 runbook（跨院、一次性；對齊試算表的年度生命週期）──
const PROGRAMME: SeedTemplate = {
  scope: 'PROGRAMME',
  title: '中心年度計畫執行精靈',
  stages: [
    {
      stageKey: 'P1_PREP',
      title: '計畫籌備與採購',
      summary: '年初行政：採購議價、確定受稽時程、委員與觀察員排程。',
      items: [
        { title: '本年度 ISMS / 資安檢測採購議價' },
        { title: '敲定本年度受稽機關時程' },
        { title: '安排稽核委員、觀察員時間及場次' },
        { title: '跑完上年度結案報告（收支結算表、公文）' },
        { title: '函文給受稽機關（啟動本年度稽核）' },
      ],
    },
    {
      stageKey: 'P2_CONSENSUS',
      title: '稽核委員共識會議',
      summary: '召集委員、發聘函、共識會議與報帳。',
      items: [
        { title: '召開稽核委員共識會議' },
        { title: '寄送委員邀請函' },
        { title: '寄送委員聘函' },
        { title: '準備委員共識會簡報' },
        { title: '製作共識會議簽到表' },
        { title: '委員共識會出席費報帳' },
      ],
    },
    {
      stageKey: 'P3_BRIEFING',
      title: '受稽機關說明會',
      summary: '對受稽機關召開說明會、調查聯絡窗口。',
      items: [
        { title: '召開受稽機關說明會' },
        { title: '準備受稽機關說明會簡報' },
        { title: '寄送說明會會議連結信件' },
        { title: '製作說明會簽到表' },
        { title: '受稽機關聯絡窗口調查清單' },
        { title: '更新法規對照表' },
      ],
    },
    {
      stageKey: 'P4_DOCS',
      title: '稽核前文件準備',
      summary: '收件、委員審閱資料加密浮水印、觀察員與行前文件。',
      items: [
        { title: '備妥稽核自評文件、稽核計畫' },
        { title: '建立醫院繳交稽核附件資料夾並設定存取權限' },
        { title: '寄稽核附件給醫院' },
        { title: '收實地稽核稽核附件' },
        { title: '委員文件審查資料加密與浮水印', hint: '機關上傳資料供委員審閱前須加密並加浮水印' },
        { title: '委員審閱資料連結分享設定與資料檢查' },
        { title: '寄委員審閱文件之信件' },
        { title: '觀察員聘任暨同意保密切結書' },
        { title: '寄觀察員文件之信件' },
        { title: '行前文件三件組（團隊名單、時程摘要、行政檢核表）' },
      ],
    },
    {
      stageKey: 'P5_ONSITE',
      title: '實地稽核執行',
      summary: '各醫院場次行前通知、簡報、評分表、住宿。',
      items: [
        { title: '寄送實地稽核行前通知' },
        { title: '備妥啟始會議簡報、技檢報告簡報、稽核重點說明' },
        { title: '製作實地稽核 RUNDOWN' },
        { title: '備妥委員評分表並設定上傳/繳交連結' },
        { title: '製作實地稽核簽到表' },
        { title: '安排工作人員與委員住宿' },
        { title: '寄簡報給教育部報告人' },
      ],
    },
    {
      stageKey: 'P6_REPORT',
      title: '稽核後報帳與報告',
      summary: '差旅與評鑑費報帳、函文稽核結果、收改善報告。',
      items: [
        { title: '工作人員差旅費報帳' },
        { title: '委員差旅費、評鑑費報帳' },
        { title: '技術檢測差旅費報帳' },
        { title: '函文稽核結果給受稽醫院' },
        { title: '收稽核改善暨執行情形報告' },
      ],
    },
    {
      stageKey: 'P7_REMEDIATION',
      title: '缺失矯正追蹤與結案',
      summary: '追蹤各院矯正填報、委員審查、用印報告與結案。',
      items: [
        { title: '追蹤各機關矯正措施填報進度（寄追蹤信）' },
        { title: '委員逐項審查矯正措施' },
        { title: '收各機關用印改善報告' },
        { title: '完成本年度全部機關結案' },
      ],
    },
  ],
};

// ── 週期各階段（每家醫院一個週期；7 狀態階段、分角色）──
const CYCLE: SeedTemplate = {
  scope: 'CYCLE',
  title: '週期各階段精靈',
  stages: [
    {
      stageKey: 'DRAFT',
      title: '開立中',
      summary: '中心建立週期、設定截止日與指派委員。',
      items: [
        { title: '建立稽核週期', role: 'SUPER_ADMIN', autoKey: 'always' },
        { title: '設定文件繳交期限與稽核日期', role: 'SUPER_ADMIN', autoKey: 'dates_set' },
        { title: '掛上資料準備需求清單', role: 'SUPER_ADMIN', autoKey: 'prep_list_set' },
        { title: '指派稽核委員', role: 'SUPER_ADMIN', autoKey: 'auditors_assigned' },
      ],
    },
    {
      stageKey: 'PREPARATION',
      title: '資料準備中',
      summary: '機關上傳資料與填報自評（技術檢測與實地稽核）；中心可匯入補充資料；中心逐項確認齊備或退回補正。',
      items: [
        { title: '上傳稽核前資料與佐證（或敘明無相關文件理由）', role: 'ORG_ADMIN', autoKey: 'prep_uploaded' },
        { title: '填報資安自評檢核表', role: 'ORG_ADMIN', autoKey: 'checklist_filled' },
        { title: '確認資料齊全後按「確定繳交」分別送交各類資料（技術檢測與實地稽核可分次繳交）', role: 'ORG_ADMIN', autoKey: 'prep_submitted' },
        { title: '逐項確認機關繳交資料齊備或退回補正', role: 'SUPER_ADMIN', autoKey: 'prep_confirmed' },
      ],
    },
    {
      stageKey: 'READY',
      title: '資料齊備',
      summary: '中心安排實地稽核；委員熟悉受稽機關。',
      items: [
        // 「安排實地稽核日期」已併入開立中「設定文件繳交期限與稽核日期」,此階段不再重複
        { title: '檢視已確認齊備之資料、熟悉受稽機關背景', role: 'AUDITOR' },
      ],
    },
    {
      stageKey: 'ONSITE',
      title: '實地稽核',
      summary: '委員到場查核、評分與記錄稽核發現。',
      items: [
        { title: '依排定日期到場實地查核', role: 'AUDITOR' },
        { title: '逐題檢視機關自評檢核表並留審閱註記', role: 'AUDITOR' },
        { title: '填寫委員評分與稽核發現', role: 'AUDITOR' },
        { title: '留存查核紀錄、稽核結束後彙整缺失', role: 'SUPER_ADMIN', autoKey: 'deficiencies_published' },
      ],
    },
    {
      stageKey: 'REPORT_ISSUED',
      title: '缺失發布中',
      summary: '中心發布缺失並通知機關開始矯正。',
      items: [
        { title: '以表單或 Excel 發布稽核缺失', role: 'SUPER_ADMIN', autoKey: 'deficiencies_published' },
        { title: '通知機關開始矯正', role: 'SUPER_ADMIN' },
        { title: '檢視已發布之缺失內容', role: 'ORG_ADMIN' },
      ],
    },
    {
      stageKey: 'REMEDIATION',
      title: '矯正執行中',
      summary: '機關逐項填報改善措施；委員審查；中心追蹤。',
      items: [
        { title: '逐項填報根因分析與改善措施並上傳佐證後送審', role: 'ORG_ADMIN', autoKey: 'remediation_submitted' },
        { title: '退回項目補正後重新送審', role: 'ORG_ADMIN' },
        { title: '逐項審查矯正措施（通過 / 退回附理由）', role: 'AUDITOR', autoKey: 'remediation_reviewed' },
        { title: '追蹤各機關填報進度、寄送追蹤信', role: 'SUPER_ADMIN' },
      ],
    },
    {
      stageKey: 'CLOSED',
      title: '結案',
      summary: '機關用印改善報告上傳；中心確認結案。',
      items: [
        { title: '列印改善報告、完成用印後上傳回傳中心', role: 'ORG_ADMIN', autoKey: 'signed_uploaded' },
        { title: '確認機關用印報告並正式結案', role: 'SUPER_ADMIN', autoKey: 'signed_confirmed' },
      ],
    },
  ],
};

async function seedTemplate(t: SeedTemplate) {
  const existing = await prisma.journeyTemplate.findUnique({
    where: { scope: t.scope },
    include: { stages: true },
  });
  if (existing && existing.stages.length > 0) {
    console.log(`[skip] ${t.scope} 範本已存在（${existing.stages.length} 階段），保留現況`);
    return;
  }
  const tmpl =
    existing ?? (await prisma.journeyTemplate.create({ data: { scope: t.scope, title: t.title } }));

  let itemCount = 0;
  for (let si = 0; si < t.stages.length; si++) {
    const s = t.stages[si];
    const stage = await prisma.journeyStage.create({
      data: {
        templateId: tmpl.id,
        stageKey: s.stageKey,
        title: s.title,
        summary: s.summary ?? null,
        orderIndex: si,
      },
    });
    for (let ii = 0; ii < s.items.length; ii++) {
      const it = s.items[ii];
      await prisma.journeyItem.create({
        data: {
          stageId: stage.id,
          title: it.title,
          hint: it.hint ?? null,
          role: it.role ?? null,
          autoKey: it.autoKey ?? null,
          orderIndex: ii,
        },
      });
      itemCount++;
    }
  }
  console.log(`[seed] ${t.scope}：${t.stages.length} 階段、${itemCount} 項`);
}

/**
 * 對「已存在」的 CYCLE 範本做**嚴格附加式**校正(seedTemplate 對已存在範本會略過建立,
 * 故既有 prod 資料需在此依 stageKey + title 比對):
 *  1. autoKey 與程式碼不符 → 更新(冪等)。
 *  2. 程式碼有、DB 缺的項目 → **新增**(附加於該階段末尾)——這正是讓既有 prod
 *     補上後來才加入的委員(AUDITOR)項目(資料齊備「檢視已確認齊備之資料」、
 *     實地稽核三項)的途徑。
 * 絕不刪除、不改既有 title/role/順序 → 不會覆寫後台 /admin/journey 的編輯。
 */
async function reconcileCycle() {
  const t = await prisma.journeyTemplate.findUnique({
    where: { scope: 'CYCLE' },
    include: { stages: { include: { items: true } } },
  });
  if (!t) return;
  let updated = 0;
  let added = 0;
  for (const s of CYCLE.stages) {
    const stage = t.stages.find((x) => x.stageKey === s.stageKey);
    if (!stage) continue;
    let maxOrder = stage.items.reduce((m, x) => Math.max(m, x.orderIndex), -1);
    for (const it of s.items) {
      const want = it.autoKey ?? null;
      const dbItem = stage.items.find((x) => x.title === it.title);
      if (dbItem) {
        if (dbItem.autoKey !== want) {
          await prisma.journeyItem.update({ where: { id: dbItem.id }, data: { autoKey: want } });
          updated++;
        }
      } else {
        // 程式碼有、DB 缺 → 附加(不動既有順序)
        await prisma.journeyItem.create({
          data: {
            stageId: stage.id,
            title: it.title,
            hint: it.hint ?? null,
            role: it.role ?? null,
            autoKey: want,
            orderIndex: ++maxOrder,
          },
        });
        added++;
      }
    }
  }
  if (updated || added) console.log(`[reconcile] CYCLE 更新 autoKey ${updated} 項、補上缺漏 ${added} 項`);
  else console.log('[reconcile] CYCLE 無需校正');
}

/**
 * 一次性資料遷移(冪等):把既有 prod 的 CYCLE 範本對齊新結構。
 *  - 開立中「設定資料準備與矯正填報截止日」(autoKey always,一建立就被打勾)
 *    → 改名「設定文件繳交期限與稽核日期」+ autoKey 'dates_set'(真有設文件截止+稽核日才完成)
 *  - 資料齊備「安排實地稽核日期」→ 刪除(已併入開立中該項,避免重複)
 * 僅在偵測到舊資料時動作;不影響後台其他編輯。
 */
async function migrateCycleJourneyV2() {
  const t = await prisma.journeyTemplate.findUnique({
    where: { scope: 'CYCLE' },
    include: { stages: { include: { items: true } } },
  });
  if (!t) return;
  let renamed = 0;
  let removed = 0;
  for (const st of t.stages) {
    if (st.stageKey === 'DRAFT') {
      const old = st.items.find((i) => i.title === '設定資料準備與矯正填報截止日');
      if (old) {
        await prisma.journeyItem.update({
          where: { id: old.id },
          data: { title: '設定文件繳交期限與稽核日期', autoKey: 'dates_set' },
        });
        renamed++;
      }
    }
    if (st.stageKey === 'READY') {
      const moved = st.items.find((i) => i.title === '安排實地稽核日期');
      if (moved) {
        await prisma.journeyItem.delete({ where: { id: moved.id } });
        removed++;
      }
    }
  }
  if (renamed || removed) {
    console.log(`[migrate v2] 開立中日期項改名 ${renamed}、資料齊備移除安排實地稽核日期 ${removed}`);
  }
}

async function main() {
  await seedTemplate(PROGRAMME);
  await seedTemplate(CYCLE);
  await migrateCycleJourneyV2();
  await reconcileCycle();
  console.log('引導式精靈 seed 完成。');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
