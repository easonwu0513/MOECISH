/** 稽核前資料準備標準清單(P2 簡化版範本;PrepTemplate 完整管理留待後續)。
 *  prep 路由「套用標準清單」與批次開立精靈共用。 */
export const STANDARD_PREP_ITEMS: { title: string; description: string }[] = [
  { title: '資通安全實地稽核檢核表', description: '依當年度教育部公告版本填妥之檢核表(Excel/ODT)' },
  { title: '資通安全維護計畫', description: '最新核定版本' },
  { title: '資通安全維護計畫實施情形', description: '上年度實施情形報告' },
  { title: 'ISMS 驗證證書', description: 'CNS 27001 / ISO 27001 證書影本(含 TAF 認證標誌)' },
  { title: '資訊資產清冊', description: '含核心資通系統標示與防護需求分級' },
  { title: '上年度稽核改善報告', description: '若為首次受稽免附' },
];
