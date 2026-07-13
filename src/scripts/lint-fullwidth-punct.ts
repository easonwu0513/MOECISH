/**
 * 全形標點原始碼檢查 / 修正(批53):掃 src 使用者可見的中文字串,將「該全形卻仍半形」的標點抓出/改掉。
 *
 * 規則單一來源 = lib/fullwidth-punct 的 toFullWidthPunct:對「字串內文」套用該轉換,結果不同即違規。
 * 與 runtime 同一 SoT;其 rule 2「前一字元為半形數字/英文則保留半形」天然放過 URL(?a=b)、
 * 版號(1.2.3)、千分位(1,234)、時間(9:30)、英數縮寫等技術性 token,不誤報。
 *
 * 只掃 AST 的「字串字面值 / 樣板字串靜態段 / JSX 文字」——不掃註解、程式碼、regex,故三元 ? :、
 * optional chaining ?.、?? 等運算子一律不受影響。並要求字串「含中文」才檢查(import 路徑、className、
 * 純 URL 無中文 → 跳過)。
 *
 * --fix 模式:就地改檔。**只轉字串內文,保留定界符('/"/`)與樣板 ${} 標記與跳脫序列**,故不破壞程式。
 *
 * 用法:npm run lint:punct(檢查,違規 exit 1,供 pre-commit/CI) / npm run lint:punct -- --fix(修正)。
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { toFullWidthPunct } from '../lib/fullwidth-punct';

const FIX = process.argv.includes('--fix');
const CWD = process.cwd();
const SRC = join(CWD, 'src');
const SCAN_DIRS = ['app', 'components', 'lib']; // 使用者可見文字所在;scripts(CLI/種子/測試)不掃
const EXCLUDE = new Set<string>([join(SRC, 'lib', 'fullwidth-punct.ts')]); // 規則本身(GUARDED 含半形鍵)
const HAS_CJK = /[㐀-鿿]/; // U+3400–U+9FFF:含中文才是顯示文字

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.d.ts') && !EXCLUDE.has(p)) out.push(p);
  }
}

/** 各節點種類的定界符長度(前綴/後綴),用來切出「純內文」的 raw 片段。 */
function affix(node: ts.Node): { pre: number; suf: number } | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { pre: 1, suf: 1 }; // '..' "..'" `..`
  if (ts.isTemplateHead(node)) return { pre: 1, suf: 2 }; // `..${
  if (ts.isTemplateMiddle(node)) return { pre: 1, suf: 2 }; // }..${
  if (ts.isTemplateTail(node)) return { pre: 1, suf: 1 }; // }..`
  if (ts.isJsxText(node)) return { pre: 0, suf: 0 }; // 無定界符
  return null;
}

type Edit = { start: number; end: number; replacement: string; before: string; after: string };

/** 節點是否位於 new RegExp(...) / RegExp(...) 引數內——regex pattern 的括號是語法非顯示標點,一律跳過。
 *  (批53 教訓:law-numerals 的 `new RegExp(\`(附表|附件)…\`)` 被全形化 → regex 不成對 → build 掛。) */
function insideRegExpCtor(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isNewExpression(p) || ts.isCallExpression(p)) && ts.isIdentifier(p.expression) && p.expression.text === 'RegExp') {
      return true;
    }
    // 跨出本語句就不用再往上找(避免整棵樹爬到底)
    if (ts.isStatement(p)) break;
  }
  return false;
}

/** 字串內含 HTML 標記(標籤/屬性)——其中的半形引號 " 是屬性定界符,轉全形「」會破壞 style/HTML。
 *  批60 教訓:letter-render 的 `<span style="color:#dc2626">（請填寫）</span>` 因含中文被 toFullWidthPunct
 *  把 style=" → style=「、"> → 」>,渲染破圖;tsc 不抓,只 build/執行期現形。比照 insideRegExpCtor,整段跳過。
 *  比對「標籤 <x…>/</x>」「屬性 =\"」「屬性收尾 \">」三種 HTML 訊號,顯示用純中文(含「」引號)不會誤中。 */
function looksLikeHtml(inner: string): boolean {
  return /<\/?[a-zA-Z][^>]*>|=["']|["']\s*>/.test(inner);
}

function editsForFile(file: string): { src: string; edits: Edit[] } {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file, src, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits: Edit[] = [];
  const visit = (node: ts.Node): void => {
    const a = affix(node);
    if (a) {
      const start = node.getStart(sf);
      const end = node.getEnd();
      const raw = src.slice(start, end);
      const inner = raw.slice(a.pre, raw.length - a.suf);
      // 只查含中文的內文;非中文(import 路徑/className/URL)一律跳過,免誤報。
      // RegExp 建構式引數(pattern 字串)一律跳過——其括號/標點是 regex 語法。
      if (HAS_CJK.test(inner) && !insideRegExpCtor(node) && !looksLikeHtml(inner)) {
        const fixedInner = toFullWidthPunct(inner);
        if (fixedInner !== inner) {
          const replacement = raw.slice(0, a.pre) + fixedInner + raw.slice(raw.length - a.suf);
          edits.push({
            start, end, replacement,
            before: inner.trim().replace(/\s+/g, ' ').slice(0, 64),
            after: fixedInner.trim().replace(/\s+/g, ' ').slice(0, 64),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { src, edits };
}

// 無檔案參數 → 全庫掃(CI/npm run lint:punct);有 → 只掃指定檔(pre-commit 傳入的已暫存 src 檔,快)。
const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let files: string[] = [];
if (fileArgs.length) {
  for (const f of fileArgs) {
    const abs = /^([A-Za-z]:|\/)/.test(f) ? f : join(CWD, f);
    // 與全庫模式一致:只掃 SCAN_DIRS(app/components/lib);src/scripts(CLI/種子/測試)非使用者可見 UI,不掃
    const inScope = SCAN_DIRS.some((d) => abs.startsWith(join(SRC, d) + sep));
    if ((abs.endsWith('.ts') || abs.endsWith('.tsx')) && !abs.endsWith('.d.ts') && !EXCLUDE.has(abs) && inScope && existsSync(abs)) {
      files.push(abs);
    }
  }
} else {
  for (const d of SCAN_DIRS) walk(join(SRC, d), files);
}

let total = 0;
let fixedFiles = 0;
const report: string[] = [];

for (const file of files) {
  const { src, edits } = editsForFile(file);
  if (edits.length === 0) continue;
  total += edits.length;
  if (FIX) {
    // 由後往前套用替換,避免位移影響前面偏移
    let out = src;
    for (const e of [...edits].sort((x, y) => y.start - x.start)) {
      out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    }
    writeFileSync(file, out, 'utf8');
    fixedFiles++;
  } else {
    for (const e of edits) {
      report.push(`  ${relative(CWD, file).split(sep).join('/')}:${sf_line(file, src, e.start)}\n    現:${e.before}\n    應:${e.after}`);
    }
  }
}

// 行號(重新以 TS 定位;report 用)
function sf_line(file: string, src: string, pos: number): number {
  return src.slice(0, pos).split('\n').length;
}

if (FIX) {
  console.log(`[lint:punct --fix] 已修正 ${total} 處(${fixedFiles} 檔)。請跑 tsc/build/test:punct 驗證。`);
  process.exit(0);
}

if (total === 0) {
  console.log(`[lint:punct] ✓ 掃 ${files.length} 檔,使用者可見字串無半形標點違規`);
  process.exit(0);
}

console.error(`[lint:punct] ✗ 發現 ${total} 處使用者可見字串含「應全形卻仍半形」的標點:\n`);
console.error(report.slice(0, 60).join('\n'));
if (report.length > 60) console.error(`\n  …另有 ${report.length - 60} 處(略)`);
console.error(
  '\n修正:npm run lint:punct -- --fix(自動全形化),或手動改;技術性 token(URL/版號/英數縮寫)在半形標點前保留英數字元即自動放過。',
);
process.exit(1);
