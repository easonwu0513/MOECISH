import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import { dimensionFromItemNo } from '../lib/dimension';
import type { Dimension } from '../lib/types';

export type ParsedChecklistItem = {
  itemNo: string;
  content: string;
  dimension: Dimension;
};

function flattenText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('\n');
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    let out = '';
    if ('#text' in obj) out += flattenText(obj['#text']);
    for (const [k, v] of Object.entries(obj)) {
      if (k === '#text' || k.startsWith('@_')) continue;
      out += flattenText(v);
    }
    return out;
  }
  return '';
}

function extractRows(node: unknown, out: unknown[][] = []): unknown[][] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) extractRows(n, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if (obj['table:table-row']) {
    const rows = Array.isArray(obj['table:table-row'])
      ? (obj['table:table-row'] as unknown[])
      : [obj['table:table-row']];
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const cells = row['table:table-cell'];
      const cellArr = Array.isArray(cells) ? cells : cells ? [cells] : [];
      out.push(cellArr);
    }
  }
  for (const v of Object.values(obj)) extractRows(v, out);
  return out;
}

const ITEM_NO = /^(\d)\.(\d{1,2})$/;

export function parseChecklistOdt(odtPath: string): ParsedChecklistItem[] {
  const zip = new AdmZip(odtPath);
  const entry = zip.getEntry('content.xml');
  if (!entry) throw new Error('ODT 裡找不到 content.xml');
  const xml = entry.getData().toString('utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: false,
    allowBooleanAttributes: true,
  });
  const doc = parser.parse(xml);
  const rows = extractRows(doc);

  const items: ParsedChecklistItem[] = [];
  let orderIndex = 0;
  const seen = new Set<string>();

  for (const cells of rows) {
    if (cells.length < 2) continue;
    const first = flattenText(cells[0]).trim();
    if (!ITEM_NO.test(first)) continue;
    const content = flattenText(cells[1]).trim().replace(/\s+\n/g, '\n');
    if (!content) continue;
    if (seen.has(first)) continue;
    seen.add(first);
    items.push({ itemNo: first, content, dimension: dimensionFromItemNo(first) });
    orderIndex++;
  }

  items.sort((a, b) => {
    const [am, an] = a.itemNo.split('.').map(Number);
    const [bm, bn] = b.itemNo.split('.').map(Number);
    return am === bm ? an - bn : am - bm;
  });

  return items;
}
