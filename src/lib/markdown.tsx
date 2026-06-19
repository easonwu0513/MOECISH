import type { ReactNode } from 'react';

/**
 * 極簡 Markdown 渲染器 — 公告內文專用。
 * 直接輸出 React elements(無 dangerouslySetInnerHTML),原始 HTML 一律當純文字 → 先天免疫 XSS。
 * 支援:# ## ### 標題、**粗體**、*斜體*、`行內碼`、[連結](url)、- 清單、1. 編號清單、> 引言、段落。
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // tokens: **bold** | *italic* | `code` | [text](url)
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith('**')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={key} className="font-mono text-[0.92em] bg-surface-container px-1.5 py-0.5 rounded-sm">{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('*')) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith('[')) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (mm) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline underline-offset-2 hover:text-primary-800">
            {mm[1]}
          </a>,
        );
      } else {
        out.push(tok);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const text = para.join('\n');
    blocks.push(
      <p key={`p-${k++}`} className="text-body text-on-surface leading-relaxed whitespace-pre-wrap my-3">
        {renderInline(text, `p-${k}`)}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const L = list;
    blocks.push(
      L.ordered ? (
        <ol key={`l-${k++}`} className="list-decimal pl-6 my-3 space-y-1.5 text-body text-on-surface">
          {L.items.map((it, idx) => <li key={idx}>{renderInline(it, `li-${k}-${idx}`)}</li>)}
        </ol>
      ) : (
        <ul key={`l-${k++}`} className="list-disc pl-6 my-3 space-y-1.5 text-body text-on-surface">
          {L.items.map((it, idx) => <li key={idx}>{renderInline(it, `li-${k}-${idx}`)}</li>)}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const bq = line.match(/^>\s?(.*)$/);

    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      const txt = renderInline(h[2], `h-${k}`);
      if (level === 1) blocks.push(<h2 key={`h-${k++}`} className="text-headline text-on-surface mt-7 mb-3">{txt}</h2>);
      else if (level === 2) blocks.push(<h3 key={`h-${k++}`} className="text-title-lg text-on-surface mt-6 mb-2.5">{txt}</h3>);
      else blocks.push(<h4 key={`h-${k++}`} className="text-title text-on-surface mt-5 mb-2">{txt}</h4>);
    } else if (ul) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(ul[1]);
    } else if (ol) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(ol[1]);
    } else if (bq) {
      flushPara(); flushList();
      blocks.push(
        <blockquote key={`q-${k++}`} className="border-l-[3px] border-primary-300 pl-4 my-3 text-body text-on-surface-variant">
          {renderInline(bq[1], `q-${k}`)}
        </blockquote>,
      );
    } else if (line.trim() === '') {
      flushPara(); flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();

  return <div>{blocks}</div>;
}
