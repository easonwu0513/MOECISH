/**
 * 稽核發現內容標點正規化:半形 → 全形(依使用者 UAT 規則)。
 * 全站單一實作:實地稽核發現(AuditPad)、彙整工具編輯(FindingItem 的 toFullWidth 委派此)、
 * 報告渲染(ReportContent)、附件17 列印 皆共用,確保「一律」一致。
 *
 * 規則(使用者實機標註,2026-06-30):
 *  1. 以下標點一律顯示全形,即便輸入半形也轉全形:( ) 、 。 「 」(另沿用既有 : ; ! ? 轉全形)
 *     - ( → （   ) → ）   , → ，   . → 。   : → ：   ; → ；   ! → ！   ? → ？
 *     - 半形直引號 " 成對轉:首個 " → 「、次個 " → 」;彎引號 “ → 「、” → 」
 *  2. 例外:若「前一個字元」為半形數字或英文字母,保留使用者自行輸入的半形
 *     (如 1. / n. / N. / 5.8 / 1,234 / 9:30 / http:// / ISO:2013 / 5")。
 *     用意:數字/英文構成的技術性 token(小數、版號、千分位、時間、URL、縮寫、英吋)維持原樣。
 *
 * 設計要點:
 *  - 逐字元轉換、每分支 1 字元 → 1 字元,「長度不變」;可安全用於即時預覽(游標 cursorPos 免重算)。
 *  - 括號 ( ) 一律轉全形(不套例外),避免「（…)」單邊全形的錯配。
 *  - 句號 . 另加「點串」保護:前後任一字元也是 . 時保留半形,避免破壞省略號 ... 或版號 1.2.3。
 *  - 冪等:對已是全形者不動,重複套用結果相同。
 */

/** 前一字元是否為半形數字或英文字母(rule 2 的例外判斷)。 */
function isAsciiAlnum(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

/** 前字為數字/英文即保留半形的標點對照(rule 1 + 沿用既有 : ; ! ?)。 */
const GUARDED: Record<string, string> = {
  ',': '，',
  '.': '。',
  ':': '：',
  ';': '；',
  '!': '！',
  '?': '？',
};

export function toFullWidthPunct(input: string | null | undefined): string {
  const s = input ?? '';
  if (!s) return s;
  let out = '';
  let quoteOpen = true; // 半形直引號 " 成對:true=下一個轉「(開),false=轉」(閉)
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const prev = i > 0 ? s[i - 1] : '';
    const next = i < s.length - 1 ? s[i + 1] : '';
    const afterAlnum = isAsciiAlnum(prev); // rule 2 例外:前字為數字/英文 → 保留半形

    if (c === '(') {
      out += '（'; // 括號一律轉全形(維持成對,不套 rule 2)
    } else if (c === ')') {
      out += '）';
    } else if (c === '"') {
      // 僅「開引號位置(quoteOpen)且前為英數」才視為英吋 5" 保留半形;
      // 閉引號位置一律成對轉」並 toggle,否則會出現「開=「、閉=半形"」的單邊配對與跨引號方向漂移。
      if (quoteOpen && afterAlnum) {
        out += '"'; // 如 5"(英吋),維持在引號外(開)狀態
      } else {
        out += quoteOpen ? '「' : '」';
        quoteOpen = !quoteOpen;
      }
    } else if (c === '“') {
      out += '「';
      quoteOpen = false;
    } else if (c === '”') {
      out += '」';
      quoteOpen = true;
    } else if (c === '.') {
      // rule 2(前為數字/英文)或點串(小數/版號/省略號)→ 保留半形
      out += afterAlnum || prev === '.' || next === '.' ? '.' : '。';
    } else if (c in GUARDED) {
      out += afterAlnum ? c : GUARDED[c];
    } else {
      out += c;
    }
  }
  return out;
}
