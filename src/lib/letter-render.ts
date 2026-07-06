/**
 * 信件範本產生器的渲染引擎（純函式，server/client 共用）。
 * 自「信件範本工具」移植：變數帶入、民國年/上午下午自動格式化、表格合併渲染、
 * 富文字（供複製貼到外部郵件）與高亮預覽（供承辦檢視填寫進度）兩種輸出。
 *
 * 變數語法：{{變數名}}。名稱含「表格」或「清單」者視為表格（值為二維陣列 JSON 字串），
 * 合併規則：(合併)=向右併欄、(向下合併)=向下併列。
 */

import { HOSPITAL_ADDRESSES, DEFAULT_VALUES } from './letter-config';

export type FormData = Record<string, string>;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 跳脫變數名中的正則特殊字元，避免 {{金額($)}} 之類名稱建構出無效/危險 RegExp。 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 針對變數名建構 {{名稱}} 的全域比對式（已跳脫）。 */
const varRe = (name: string) => new RegExp(`\\{\\{${escapeRegExp(name)}\\}\\}`, 'g');

/** 民國年（YYYY-MM-DD→民國年月日+週幾）與 24 小時制→上午/下午 自動格式化。 */
export function formatAutoTexts(text: string): string {
  if (!text) return '';
  let out = text.replace(/\d{4}-\d{2}-\d{2}/g, (match) => {
    const [y, m, d] = match.split('-');
    const rocY = parseInt(y, 10) - 1911;
    const dateObj = new Date(match);
    const weeks = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const weekStr = !isNaN(dateObj.getTime()) ? `(${weeks[dateObj.getDay()]})` : '';
    return `${rocY}年${parseInt(m, 10)}月${parseInt(d, 10)}日${weekStr}`;
  });
  out = out.replace(/(^|[^\d])(?:上午|下午)?\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g, (_m, prefix, h, min) => {
    const hour = parseInt(h, 10);
    const ampm = hour < 12 ? '上午' : '下午';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const padH = hour12.toString().padStart(2, '0');
    return `${prefix}${ampm}${padH}:${min}`;
  });
  return out;
}

export type CellSpan = { rowSpan: number; colSpan: number; skip: boolean };

/** 計算表格合併：向右 (合併)→colSpan、向下 (向下合併)→rowSpan、被併格 skip。
 *  先把不規則(鋸齒)列補齊到最大寬度，避免向下合併時 grid[r+rs][c] 越界 undefined 拋錯白畫面。 */
export function getTableSpans(grid: string[][]): CellSpan[][] {
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  const rect = grid.map((row) => (row.length < width ? [...row, ...Array(width - row.length).fill('')] : row));
  const spans: CellSpan[][] = rect.map((row) => row.map(() => ({ rowSpan: 1, colSpan: 1, skip: false })));
  const grid2 = rect;
  for (let r = 0; r < grid2.length; r++) {
    for (let c = 0; c < grid2[r].length; c++) {
      if (spans[r][c].skip) continue;
      let cs = 1;
      while (c + cs < grid2[r].length && grid2[r][c + cs].trim() === '(合併)') {
        spans[r][c + cs].skip = true;
        cs++;
      }
      spans[r][c].colSpan = cs;
      let rs = 1;
      while (r + rs < grid2.length && grid2[r + rs][c].trim() === '(向下合併)') {
        spans[r + rs][c].skip = true;
        rs++;
      }
      spans[r][c].rowSpan = rs;
    }
  }
  return spans;
}

const isTableVar = (name: string) => name.includes('表格') || name.includes('清單');

/** 巢狀展開非表格變數（如子變數再引用變數），最多 3 層；表格保留給渲染層。 */
export function getExpandedText(baseText: string, formData: FormData): string {
  if (!baseText) return '';
  let text = baseText;
  const getVars = (t: string) => [...new Set((t.match(/\{\{(.*?)\}\}/g) || []).map((m) => m.slice(2, -2)))];
  let currentVars = getVars(text);
  let iter = 0;
  while (iter < 3) {
    let changed = false;
    currentVars.forEach((v) => {
      if (formData[v] && formData[v].includes('{{') && !isTableVar(v)) {
        text = text.replace(varRe(v), formData[v]);
        changed = true;
      }
    });
    if (!changed) break;
    currentVars = getVars(text);
    iter++;
  }
  return text;
}

/** 依出現順序（含展開子變數）列出所有變數名，供產生器輸入欄排序。 */
export function getOrderedVars(text: string, formData: FormData, visited = new Set<string>()): string[] {
  if (!text) return [];
  const matches = text.match(/\{\{(.*?)\}\}/g) || [];
  let ordered: string[] = [];
  for (const match of matches) {
    const varName = match.slice(2, -2);
    if (!visited.has(varName)) {
      visited.add(varName);
      ordered.push(varName);
      if (formData[varName] && formData[varName].includes('{{')) {
        ordered = ordered.concat(getOrderedVars(formData[varName], formData, visited));
      }
    }
  }
  return ordered;
}

/** 選定範本時的初始表單值：全域醫院/日期優先，其餘帶預設值（表格預設會回填醫院/日期/地址）。 */
export function populateDefaults(
  text: string,
  globals: { hospital?: string; date?: string; techDate?: string },
  data: FormData = {},
  visited = new Set<string>(),
): FormData {
  const matches = text.match(/\{\{(.*?)\}\}/g) || [];
  matches.forEach((match) => {
    const v = match.slice(2, -2);
    if (visited.has(v)) return;
    visited.add(v);
    if ((v.includes('醫院') || v.includes('機關')) && !v.includes('表格') && !v.includes('地址') && globals.hospital) {
      data[v] = globals.hospital;
    } else if (v === '受稽機關地址' && globals.hospital && HOSPITAL_ADDRESSES[globals.hospital]) {
      data[v] = HOSPITAL_ADDRESSES[globals.hospital];
    } else if ((v.includes('技術檢測') || v.includes('技術')) && v.includes('日期') && globals.techDate) {
      data[v] = globals.techDate;
    } else if ((v.includes('稽核') || v.includes('受稽')) && v.includes('日期') && globals.date) {
      data[v] = globals.date;
    } else if (DEFAULT_VALUES[v]) {
      if (v.includes('表格')) {
        try {
          const tableData: string[][] = JSON.parse(DEFAULT_VALUES[v]);
          if (tableData.length > 1) {
            const headers = tableData[0];
            const hospIdx = headers.findIndex((h) => h.includes('醫院'));
            const dateIdx = headers.findIndex((h) => h.includes('日期') || h.includes('時間'));
            const addrIdx = headers.findIndex((h) => h.includes('地址'));
            if (hospIdx !== -1 && globals.hospital) tableData[1][hospIdx] = globals.hospital;
            if (dateIdx !== -1 && globals.date) tableData[1][dateIdx] = globals.date;
            if (addrIdx !== -1 && globals.hospital && HOSPITAL_ADDRESSES[globals.hospital]) {
              tableData[1][addrIdx] = HOSPITAL_ADDRESSES[globals.hospital];
            }
          }
          data[v] = JSON.stringify(tableData);
        } catch {
          data[v] = DEFAULT_VALUES[v];
        }
      } else {
        data[v] = DEFAULT_VALUES[v];
      }
      if (data[v].includes('{{')) populateDefaults(data[v], globals, data, visited);
    }
  });
  return data;
}

function renderTableToCopyHtml(rawValue: string): string {
  const arr: string[][] = JSON.parse(rawValue);
  const spans = getTableSpans(arr);
  const allowEmpty = arr[0].some((h) => h === '技術檢測' || h === '實地稽核' || h === '勾選');
  let tbl =
    '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; border: 1px solid #666666; margin: 15px 0; font-family: sans-serif; font-size: 14px;">';
  arr.forEach((row, rIdx) => {
    tbl += '<tr>';
    row.forEach((cell, cIdx) => {
      if (spans[rIdx][cIdx].skip) return;
      const { rowSpan, colSpan } = spans[rIdx][cIdx];
      const rsAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : '';
      const csAttr = colSpan > 1 ? ` colspan="${colSpan}"` : '';
      const tag = rIdx === 0 ? 'th' : 'td';
      const bg = rIdx === 0 ? 'background-color: #eeeeee; font-weight: bold;' : '';
      let processedCell = cell || '';
      const innerVars = (processedCell.match(/\{\{(.*?)\}\}/g) || []).map((m) => m.slice(2, -2));
      // 表格內變數以外層 formData 帶入時已展開；此處剩餘者顯示佔位。
      // 用全形（）而非半形 []：部分郵件用戶端會把 [變數] 視為合併欄位而自動加藍底,改（）避免之。
      innerVars.forEach((iv) => {
        processedCell = processedCell.replace(varRe(iv), `（${iv}）`);
      });
      const formatted = formatAutoTexts(processedCell);
      let safeCell = formatted.replace(/\n/g, '<br/>');
      if (!allowEmpty && rIdx > 0 && formatted.replace(/<[^>]*>?/gm, '').trim() === '') {
        safeCell =
          '<span style="color: #dc2626; background-color: #fee2e2; padding: 2px 6px; border: 1px solid #fca5a5; border-radius: 4px; font-weight: 600;">（請填寫）</span>';
      }
      tbl += `<${tag}${rsAttr}${csAttr} style="border: 1px solid #666666; padding: 8px; text-align: left; vertical-align: top; ${bg}">${safeCell}</${tag}>`;
    });
    tbl += '</tr>';
  });
  tbl += '</table>';
  return tbl;
}

/**
 * 產生「可複製貼到郵件」的富文字 HTML（inline style，含表格合併/民國年格式）。
 * 表格內變數已在 formData 展開；未填變數以 [變數名] 佔位。
 */
export function buildEmailHtml(text: string, formData: FormData): string {
  if (!text) return '';
  // 先把表格變數的巢狀內容用 formData 展開一輪（讓表格 cell 內的 {{年度}} 等被填入）
  const expandedForm: FormData = { ...formData };
  for (const [k, val] of Object.entries(expandedForm)) {
    if (isTableVar(k) && val) {
      try {
        const arr: string[][] = JSON.parse(val);
        const filled = arr.map((row) =>
          row.map((cell) => {
            let c = cell;
            const ivs = (c.match(/\{\{(.*?)\}\}/g) || []).map((m) => m.slice(2, -2));
            ivs.forEach((iv) => {
              if (formData[iv]) c = c.replace(varRe(iv), formData[iv]);
            });
            return c;
          }),
        );
        expandedForm[k] = JSON.stringify(filled);
      } catch {
        /* keep as-is */
      }
    }
  }
  const expandedText = getExpandedText(text, expandedForm);
  const parts = expandedText.split(/(\{\{.*?\}\})/g);
  const htmlParts = parts.map((part) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const variableName = part.slice(2, -2);
      const rawValue = expandedForm[variableName];
      if (isTableVar(variableName)) {
        if (!rawValue) return `<span style="color:#dc2626">（尚未填寫表格：${variableName}）</span>`;
        try {
          return renderTableToCopyHtml(rawValue);
        } catch {
          return `<span style="color:#dc2626">（表格解析錯誤）</span>`;
        }
      }
      // 未填變數用全形（變數名）佔位而非 [變數名]:部分郵件用戶端把 [..] 當合併欄位自動加藍底。
      const displayValue = rawValue ? formatAutoTexts(rawValue) : `（${variableName}）`;
      return displayValue;
    }
    return part.replace(/\n/g, '<br/>');
  });
  return `<div style="font-family: Arial, 'Microsoft JhengHei', sans-serif; font-size: 15px; line-height: 1.8; color: #000000; background-color: transparent;">${htmlParts.join('')}</div>`;
}

const FILLED = 'background-color:#e0edff;color:#1b4fa8;border-radius:3px;padding:0 0.15rem;';
const UNFILLED = 'background-color:#fde8e8;color:#c02626;border:1px solid #f5b5b5;border-radius:3px;padding:0 0.15rem;';

/**
 * 產生高亮預覽 HTML 字串（已填=藍、未填=紅），供承辦檢視填寫進度。
 * 用 inline style 而非 Tailwind class，避免預覽注入的 class 被 purge。
 */
export function renderPreviewHtml(text: string, formData: FormData): string {
  if (!text) return '';
  const expandedText = getExpandedText(text, formData);
  const parts = expandedText.split(/(\{\{.*?\}\})/g);
  let finalHtml = '';
  parts.forEach((part) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const variableName = part.slice(2, -2);
      const rawValue = formData[variableName];
      if (isTableVar(variableName)) {
        if (!rawValue) {
          finalHtml += `<div style="margin:0.75rem 0;padding:0.75rem;${UNFILLED}font-weight:500;">（請在左側填寫表格資訊：${variableName}）</div>`;
          return;
        }
        try {
          const arr: string[][] = JSON.parse(rawValue);
          const spans = getTableSpans(arr);
          const allowEmpty = arr[0].some((h) => h === '技術檢測' || h === '實地稽核' || h === '勾選');
          let tableHtml =
            '<div style="margin:1rem 0;overflow-x:auto;"><table style="width:100%;font-size:0.875rem;text-align:left;border-collapse:collapse;border:1px solid #cbd5e1;"><tbody>';
          arr.forEach((row, rIdx) => {
            tableHtml += `<tr style="background-color:${rIdx === 0 ? '#f1f5f9' : '#ffffff'};">`;
            row.forEach((cell, cIdx) => {
              if (spans[rIdx][cIdx].skip) return;
              const { rowSpan, colSpan } = spans[rIdx][cIdx];
              const Tag = rIdx === 0 ? 'th' : 'td';
              // 不跳脫:讓表格格內的 <b>/<u>/<span> 等內嵌標籤渲染成粗體/底線(與複製輸出一致),
              // 否則預覽會顯示字面 <b>...</b>(承辦誤以為多了標籤)。表格資料為承辦自編,非外部輸入。
              let processedCell = cell || '';
              const innerVars = (processedCell.match(/\{\{(.*?)\}\}/g) || []).map((m) => m.slice(2, -2));
              innerVars.forEach((iv) => {
                if (formData[iv]) {
                  // 帶入原值(不在此處格式化);民國年/上午下午由下方單一 formatAutoTexts 一次處理,
                  // 避免二次套用把 下午02:30 誤翻成 上午02:30(格式化非冪等)。
                  processedCell = processedCell.replace(varRe(iv), `<span style="${FILLED}">${formData[iv]}</span>`);
                } else {
                  processedCell = processedCell.replace(varRe(iv), `<span style="${UNFILLED}">（${iv}）</span>`);
                }
              });
              let formatted = formatAutoTexts(processedCell);
              formatted = formatted.replace(
                /(○年○月○日(?:\s*\d+：\d+)?(?:前回覆)?)/g,
                `<span style="${UNFILLED}font-weight:500;">$1</span>`,
              );
              if (!allowEmpty && rIdx > 0 && formatted.replace(/<[^>]*>?/gm, '').trim() === '') {
                formatted = `<span style="${UNFILLED}font-weight:500;">（請填寫）</span>`;
              }
              formatted = formatted.replace(/\n/g, '<br/>');
              const rsAttr = rowSpan > 1 ? ` rowspan="${rowSpan}"` : '';
              const csAttr = colSpan > 1 ? ` colspan="${colSpan}"` : '';
              const weight = rIdx === 0 ? 'font-weight:700;color:#334155;' : '';
              tableHtml += `<${Tag}${rsAttr}${csAttr} style="padding:0.75rem;border:1px solid #cbd5e1;vertical-align:top;${weight}">${formatted}</${Tag}>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table></div>';
          finalHtml += tableHtml;
        } catch {
          finalHtml += `<span style="color:#dc2626">（表格格式錯誤）</span>`;
        }
      } else {
        const displayValue = rawValue ? formatAutoTexts(rawValue) : `（${variableName}）`;
        const style = rawValue ? FILLED : UNFILLED;
        finalHtml += `<span style="${style}">${displayValue.replace(/\n/g, '<br/>')}</span>`;
      }
    } else {
      let processedPart = part;
      if (processedPart.includes('○年○月○日')) {
        processedPart = processedPart.replace(
          /(○年○月○日(?:\s*\d+：\d+)?(?:前回覆)?)/g,
          `<span style="${UNFILLED}font-weight:500;">$1</span>`,
        );
      }
      finalHtml += processedPart.replace(/\n/g, '<br/>');
    }
  });
  return finalHtml;
}

/** 主旨帶入變數→純文字（供複製主旨）。 */
export function processSubject(text: string, formData: FormData): string {
  if (!text) return '';
  let finalSubject = getExpandedText(text, formData);
  const allVars = (finalSubject.match(/\{\{(.*?)\}\}/g) || []).map((m) => m.slice(2, -2));
  allVars.forEach((variable) => {
    const rawValue = formData[variable];
    // 帶入原值;民國年/上午下午由最後單一 formatAutoTexts 一次處理(避免二次套用翻轉 AM/PM)。
    // 未填變數用全形（變數名）而非 [變數名]:部分郵件用戶端把 [..] 當合併欄位自動加藍底(與內文一致)。
    const value = rawValue ? rawValue : `（${variable}）`;
    finalSubject = finalSubject.replace(varRe(variable), value);
  });
  return formatAutoTexts(finalSubject);
}

/** 純文字內文（供「複製純文字」與退回顯示）：把 HTML 標籤剝除、表格轉制表符。 */
export function buildPlainText(text: string, formData: FormData): string {
  const html = buildEmailHtml(text, formData);
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|div|table|p)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
