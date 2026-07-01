/**
 * 標點半形→全形正規化真值表:src/lib/fullwidth-punct.ts 的 toFullWidthPunct。
 * 涵蓋 rule1/rule2、成對引號「」(含中文夾英數引用)、英吋 5"、URL/時間/版號/千分位/小數/省略號,
 * 並驗證「長度不變(游標安全)」與「冪等」。納入驗證鐵律:build + access/isolation/notify + punct。
 * 執行:npm run test:punct
 */
import assert from 'node:assert';
import { toFullWidthPunct as F } from '../lib/fullwidth-punct';

const cases: [string, string][] = [
  // rule1 基本 + 逗號→，
  ['依規定,委外廠商', '依規定，委外廠商'],
  ['(如上)', '（如上）'],
  ['處理(A)方案', '處理（A）方案'],
  ['辦理.', '辦理。'],
  ['第9條:惟查', '第9條：惟查'],
  ['規定;另查', '規定；另查'],
  ['確實有效?', '確實有效？'],
  // rule2 例外:前為數字/英文保留半形
  ['5.8', '5.8'],
  ['第1.項', '第1.項'],
  ['N.', 'N.'],
  ['1,234筆', '1,234筆'],
  ['5,000元,共計', '5,000元，共計'],
  ['參見 https://gov.tw 網站', '參見 https://gov.tw 網站'],
  ['時間9:30開始', '時間9:30開始'],
  ['符合ISO27001:2013', '符合ISO27001:2013'],
  // 點串保護:省略號 / 版號
  ['字...字', '字...字'],
  ['A.B.C.', 'A.B.C.'],
  ['版本1.2.3上線', '版本1.2.3上線'],
  // 成對引號「」:純中文
  ['他說"很好"', '他說「很好」'],
  ['他說"5個"', '他說「5個」'],
  // 成對引號:中文夾英文/數字引用(review 修正的核心情境)
  ['使用"ISO 27001"標準', '使用「ISO 27001」標準'],
  ['系統"AD"與"DNS"皆需修補', '系統「AD」與「DNS」皆需修補'],
  ['系統 "A" 設定', '系統 「A」 設定'],
  ['應設定"admin"帳號並"停用"預設帳號', '應設定「admin」帳號並「停用」預設帳號'],
  // 英吋 5"(開引號位置且前為數字)→ 保留半形
  ['尺寸5"標準', '尺寸5"標準'],
  ['螢幕5"很大', '螢幕5"很大'],
  // 彎引號方向
  ['他說“好”的', '他說「好」的'],
  // 既有全形不動 / 邊界
  ['句子。', '句子。'],
  ['（已全形）', '（已全形）'],
  ['規定,並依「辦法」', '規定，並依「辦法」'],
  ['', ''],
];

let pass = 0;
const fails: string[] = [];
for (const [input, expected] of cases) {
  const got = F(input);
  try {
    assert.strictEqual(got, expected);
    // 長度不變(游標安全)
    assert.strictEqual(got.length, input.length, `長度改變: ${JSON.stringify(input)}`);
    // 冪等
    assert.strictEqual(F(got), got, `非冪等: ${JSON.stringify(input)}`);
    pass++;
  } catch {
    fails.push(`  ✗ ${JSON.stringify(input)} → ${JSON.stringify(got)}  期望 ${JSON.stringify(expected)}`);
  }
}

if (fails.length) {
  console.error(`\n✗ 標點正規化真值表:${pass}/${cases.length} 通過,${fails.length} 失敗`);
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log(`\n══ 標點正規化真值表:${cases.length}/${cases.length} 通過 ══`);
console.log('半形→全形(含成對引號、rule2 例外、長度不變、冪等)全數符合規格 ✓');
