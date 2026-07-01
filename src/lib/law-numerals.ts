/**
 * 法規條文中的「中文數字」→「阿拉伯數字」(顯示時轉換,不動原始資料)。
 *
 * 僅轉換條次類標的,避免誤改一般文字:
 *   第〇條 / 第〇項 / 第〇款 / 第〇目 / 第〇次 / 第〇點 / 第〇章 / 第〇節 / 第〇編
 *   附表〇 / 附件〇
 * 刻意「不」轉換清單標頭(如「一、資通安全管理法施行細則」),那是組織編號非條次。
 *
 * 範例:
 *   第九條第二項第二次、第六次及第七次 → 第9條第2項第2次、第6次及第7次
 *   第二十條第二項 → 第20條第2項   附表九 → 附表9   附表十 → 附表10
 */

const DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 中文數字字串 → 整數;含未知字元回傳 null(則不轉換,保留原樣)。 */
export function cjkNumeralToInt(s: string): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let section = 0;
  let current = 0;
  for (const ch of s) {
    if (ch in DIGIT) {
      current = DIGIT[ch];
    } else if (ch in UNIT) {
      // 「十」開頭(十三)→ current 視為 1
      section += (current === 0 ? 1 : current) * UNIT[ch];
      current = 0;
    } else {
      return null;
    }
  }
  return section + current;
}

const CJK = '〇零一二兩三四五六七八九十百千';
const ARTICLE_RE = new RegExp(`第([${CJK}]+)(條|項|款|目|次|點|章|節|編)`, 'g');
const TABLE_RE = new RegExp(`(附表|附件)([${CJK}]+)`, 'g');

/** 將法規文字中的條次類中文數字轉為阿拉伯數字(純函式,可於 server/client 共用)。 */
export function arabicizeLawRefs(text: string): string {
  if (!text) return text;
  return text
    .replace(ARTICLE_RE, (m, num: string, unit: string) => {
      const n = cjkNumeralToInt(num);
      return n === null ? m : `第${n}${unit}`;
    })
    .replace(TABLE_RE, (m, head: string, num: string) => {
      const n = cjkNumeralToInt(num);
      return n === null ? m : `${head}${n}`;
    });
}
