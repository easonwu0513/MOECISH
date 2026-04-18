import type { Dimension } from './types';

export const DIMENSION_LABELS: Record<Dimension, string> = {
  CORE_BUSINESS: '一、核心業務及其重要性',
  POLICY_ORG: '二、資通安全政策及推動組織',
  STAFFING_BUDGET: '三、專責人力及經費配置',
  ASSET_RISK: '四、資訊及資通系統盤點及風險評估',
  OUTSOURCING: '五、資通系統或服務委外辦理之管理措施',
  MAINTENANCE_KPI: '六、資通安全維護計畫與績效管理機制',
  PROTECTION_CONTROL: '七、資通安全防護及控制措施',
  SYSTEM_DEV: '八、資通系統發展及維護安全',
  INCIDENT_RESPONSE: '九、資通安全事件通報應變及情資評估因應',
};

export const DIMENSION_ORDER: Dimension[] = [
  'CORE_BUSINESS',
  'POLICY_ORG',
  'STAFFING_BUDGET',
  'ASSET_RISK',
  'OUTSOURCING',
  'MAINTENANCE_KPI',
  'PROTECTION_CONTROL',
  'SYSTEM_DEV',
  'INCIDENT_RESPONSE',
];

export function dimensionFromItemNo(itemNo: string): Dimension {
  const major = itemNo.split('.')[0];
  switch (major) {
    case '1': return 'CORE_BUSINESS';
    case '2': return 'POLICY_ORG';
    case '3': return 'STAFFING_BUDGET';
    case '4': return 'ASSET_RISK';
    case '5': return 'OUTSOURCING';
    case '6': return 'MAINTENANCE_KPI';
    case '7': return 'PROTECTION_CONTROL';
    case '8': return 'SYSTEM_DEV';
    case '9': return 'INCIDENT_RESPONSE';
    default: throw new Error(`未知的項目編號 major: ${itemNo}`);
  }
}
