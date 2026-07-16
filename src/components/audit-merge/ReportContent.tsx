'use client';

import { Fragment, type ReactNode } from 'react';
import { toROCDate, type Finding, type ReportData } from './lib';
import { toFullWidthPunct } from '@/lib/fullwidth-punct';

/**
 * 報表渲染(螢幕即時預覽與列印共用)。
 * 原生 ol/li 清單結構 — 匯出 Word 後仍可順暢編輯。
 */
export function ReportContent({
  data,
  sortFunc,
  activeFocusId,
  cursorPos,
  isPrint,
}: {
  data: ReportData;
  sortFunc: (list: Finding[]) => Finding[];
  activeFocusId: string | null;
  cursorPos: number | null;
  isPrint: boolean;
}) {
  const getHospitalDisplay = () => {
    const name = data.hospitalName;
    if (name && name.includes('分院')) {
      const parts = name.split(' ');
      const branchIdx = parts.findIndex((p) => p.includes('分院'));
      if (branchIdx !== -1) {
        return { main: parts.slice(0, branchIdx).join(' '), branch: parts.slice(branchIdx).join(' ') };
      }
    }
    return { main: name, branch: data.branchName };
  };

  const display = getHospitalDisplay();
  const dateROC = toROCDate(data.auditDateRaw, data.year);

  const hlClass = (id: string) => (!isPrint && activeFocusId === id ? 'highlight-active' : 'highlight-inactive');

  const renderTextWithCursor = (text: string, id: string): ReactNode => {
    const actualText = text || '';
    if (!isPrint && activeFocusId === id && cursorPos !== null) {
      const pos = Math.min(cursorPos, actualText.length);
      return (
        <Fragment>
          {actualText.slice(0, pos)}
          <span className="blinking-cursor" />
          {actualText.slice(pos)}
        </Fragment>
      );
    }
    return actualText || ' ';
  };

  const renderTeamMembers = (teamArray: string[], prefix: string) => {
    const elements = teamArray
      .map((n, idx) => {
        const isFocused = !isPrint && activeFocusId === `${prefix}-${idx}`;
        if (!n && !isFocused && !isPrint) return null;
        if (!n && isPrint) return null;
        return (
          <span key={idx}>
            <span id={!isPrint ? `preview-target-${prefix}-${idx}` : undefined} className={hlClass(`${prefix}-${idx}`)}>
              {n || ' '} 委員
            </span>
          </span>
        );
      })
      .filter(Boolean);

    return elements.map((el, i) => (
      <span key={i}>
        {el}
        {i < elements.length - 1 ? '、' : ''}
      </span>
    ));
  };

  const renderFindingBlock = (findings: Finding[]) => {
    if (!findings || findings.length === 0) return null;
    const sorted = sortFunc(findings);

    const chunks: (Finding & { originalIndex: number })[][] = [];
    let currentChunk: (Finding & { originalIndex: number })[] = [];
    sorted.forEach((f, i) => {
      if (f.pageBreakBefore && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
      currentChunk.push({ ...f, originalIndex: i });
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);

    return (
      <div style={{ marginBottom: '12pt' }}>
        {chunks.map((chunk, chunkIdx) => (
          <Fragment key={chunkIdx}>
            {(chunkIdx > 0 || (chunkIdx === 0 && chunk[0].pageBreakBefore)) && <div className="page-break" />}
            <ol start={chunk[0].originalIndex + 1} className="finding-list">
              {chunk.map((f) => (
                <li key={f.id} className="finding-item">
                  {f.code && <span style={{ fontWeight: 'bold' }}>【{f.code}】</span>}
                  <span id={!isPrint ? `preview-target-${f.id}` : undefined} className={hlClass(f.id)}>
                    {renderTextWithCursor(toFullWidthPunct(f.text), f.id)}
                  </span>
                </li>
              ))}
            </ol>
          </Fragment>
        ))}
      </div>
    );
  };

  const renderCategory = (cat: 'strategy' | 'management' | 'technical', title: string) => (
    <Fragment>
      {data.sectionSettings?.[cat]?.pageBreakBefore && <div className="page-break" />}
      <div id={`preview-${cat}`} style={{ paddingTop: '12pt' }}>
        <h2 style={{ fontSize: '14pt', fontWeight: 'bold', textAlign: 'left', margin: '18pt 0 12pt 32pt' }}>{title}</h2>
        <div style={{ marginBottom: '12pt' }}>
          {data.sectionSettings?.[cat]?.compliance?.pageBreakBefore && <div className="page-break" />}
          <h3 style={{ fontSize: '12pt', fontWeight: 'normal', margin: '12pt 0 6pt 56pt' }}>（一）法遵符合情形</h3>
          {renderFindingBlock(data.findings[cat].compliance)}

          {data.sectionSettings?.[cat]?.improvements?.pageBreakBefore && <div className="page-break" />}
          <h3 style={{ fontSize: '12pt', fontWeight: 'normal', margin: '12pt 0 6pt 56pt' }}>（二）待改善事項</h3>
          {renderFindingBlock(data.findings[cat].improvements)}

          {data.sectionSettings?.[cat]?.suggestions?.pageBreakBefore && <div className="page-break" />}
          <h3 style={{ fontSize: '12pt', fontWeight: 'normal', margin: '12pt 0 6pt 56pt' }}>（三）建議事項</h3>
          {renderFindingBlock(data.findings[cat].suggestions)}
        </div>
      </div>
    </Fragment>
  );

  const rocNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];

  return (
    <div className="report-content" style={{ fontFamily: "'Times New Roman'， '標楷體'， 'BiauKai'， 'DFKai-SB'， serif", fontSize: '12pt', lineHeight: '24pt', color: 'black' }}>
      {/* 封面 */}
      <div id="preview-basic" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'center', minHeight: '225mm', paddingTop: '36pt', paddingBottom: '36pt', boxSizing: 'border-box' }}>
        <div style={{ marginTop: '24pt' }}>
          <div style={{ fontSize: '18pt', fontWeight: 'bold', marginBottom: '18pt' }}>
            <span id={!isPrint ? 'preview-target-year' : undefined} className={hlClass('year')}>{data.year || ' '}</span>年度教育部所屬國立大學校院附設醫院及分院
          </div>
          <div style={{ fontSize: '22pt', fontWeight: 'bold', marginBottom: '24pt' }}>
            <span style={{ borderBottom: '4px double black', paddingBottom: '4px' }}>資通安全稽核作業-實地稽核報告</span>
          </div>
          <div style={{ fontSize: '18pt', fontWeight: 'bold', marginTop: '48pt' }}>
            <span id={!isPrint ? 'preview-target-hospitalName' : undefined} className={hlClass('hospitalName')}>{display.main || ' '}</span>
          </div>
          {display.branch && (
            <div style={{ fontSize: '18pt', fontWeight: 'bold', marginTop: '12pt' }}>
              <span id={!isPrint ? 'preview-target-branchName' : undefined} className={hlClass('branchName')}>{display.branch}</span>
            </div>
          )}
        </div>
        <div style={{ marginTop: 'auto', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div id="word-spacer" />
          <div style={{ fontSize: '16pt', fontWeight: 'bold', marginBottom: '12pt' }}>教育部</div>
          <div style={{ fontSize: '16pt', fontWeight: 'bold' }}>
            中華民國<span id={!isPrint ? 'preview-target-auditDateRaw' : undefined} className={hlClass('auditDateRaw')}>{dateROC}</span>
          </div>
        </div>
      </div>

      <div className="page-break" />

      {/* 壹、基本資訊 */}
      <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textAlign: 'left', margin: '24pt 0 12pt 0' }}>壹、基本資訊</h1>
      <div style={{ fontSize: '12pt' }}>
        <p style={{ margin: '0 0 6pt 32pt' }}><strong>一、稽核日期：</strong> 民國<span className={hlClass('auditDateRaw')}>{dateROC}</span></p>
        <p style={{ margin: '0 0 6pt 32pt' }}><strong>二、受稽機關：</strong> <span className={hlClass('hospitalName')}>{display.main || ' '}</span><span className={hlClass('branchName')}>{display.branch}</span></p>
        <p style={{ margin: '0 0 6pt 32pt' }}><strong>三、稽核範圍：</strong> <span id={!isPrint ? 'preview-target-scope' : undefined} className={hlClass('scope')}>{renderTextWithCursor(data.scope, 'scope')}</span></p>

        <div style={{ margin: '12pt 0 0 0' }}>
          <p style={{ margin: '0 0 6pt 32pt' }}><strong>四、稽核準則：</strong></p>
          <div>
            {(data.auditCriteria || []).map((ac, idx) => (
              <p key={ac.id} style={{ margin: '0 0 6pt 56pt' }}>
                {`（${rocNum[idx] || idx + 1}）`}
                <span id={!isPrint ? `preview-target-ac-${ac.id}` : undefined} className={hlClass(`ac-${ac.id}`)}>
                  {renderTextWithCursor(ac.text, `ac-${ac.id}`)}
                </span>
              </p>
            ))}
          </div>
        </div>

        <div id="preview-team" style={{ margin: '12pt 0 0 0', paddingTop: '12pt' }}>
          <p style={{ margin: '0 0 6pt 32pt' }}><strong>五、稽核小組：</strong></p>
          <div>
            <p style={{ margin: '0 0 6pt 56pt' }}>（一）稽核領隊： <span id={!isPrint ? 'preview-target-lead-name' : undefined} className={hlClass('lead-name')}>{data.lead.name || ' '}</span> <span id={!isPrint ? 'preview-target-lead-title' : undefined} className={hlClass('lead-title')}>{data.lead.title || ' '}</span></p>
            <p style={{ margin: '0 0 6pt 56pt' }}>（二）稽核副領隊： <span id={!isPrint ? 'preview-target-subLead-name' : undefined} className={hlClass('subLead-name')}>{data.subLead.name || ' '}</span> <span id={!isPrint ? 'preview-target-subLead-title' : undefined} className={hlClass('subLead-title')}>{data.subLead.title || ' '}</span>（<span id={!isPrint ? 'preview-target-subLead-org' : undefined} className={hlClass('subLead-org')}>{data.subLead.org || ' '}</span>）</p>
            <p style={{ margin: '0 0 6pt 56pt' }}>（三）稽核團隊：</p>
            <div>
              <p style={{ margin: '0 0 6pt 92pt' }}>策略面： {renderTeamMembers(data.team.strategy, 'team-strategy')}</p>
              <p style={{ margin: '0 0 6pt 92pt' }}>管理面： {renderTeamMembers(data.team.management, 'team-management')}</p>
              <p style={{ margin: '0 0 6pt 92pt' }}>技術面： {renderTeamMembers(data.team.technical, 'team-technical')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-break" />

      {/* 貳、稽核發現 */}
      <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textAlign: 'left', margin: '24pt 0 12pt 0' }}>貳、稽核發現</h1>
      <p style={{ fontSize: '12pt', textIndent: '32pt', margin: '0 0 12pt 0' }}>本報告分別從策略面、管理面及技術面等三個構面，提出法遵符合情形、待改善事項及建議事項三類稽核發現。</p>

      {renderCategory('strategy', '一、策略面')}
      {renderCategory('management', '二、管理面')}
      {renderCategory('technical', '三、技術面')}

      <div className="page-break" />

      {/* 參、後續辦理事項 */}
      <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textAlign: 'left', margin: '24pt 0 12pt 0' }}>參、後續辦理事項</h1>
      <p style={{ fontSize: '12pt', paddingLeft: '32pt', textAlign: 'justify', margin: '0 0 24pt 0' }}>
        教育部於稽核作業完成後一個月內，函送資安稽核報告予受稽機關，並請機關就報告中待改善事項研議因應作為及辦理時程，於收受資安稽核報告後一個月內，免備文向教育部與教育部轄下醫療領域資訊安全推動中心提交「資通安全稽核改善暨執行情形報告」；由資訊安全推動中心協助審查，嗣後追蹤結果。
      </p>

      <div style={{ marginTop: '48pt', paddingLeft: '32pt' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12pt', textAlign: 'left' }}>
          <tbody>
            <tr>
              <td style={{ width: '85pt', paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>受稽方代表：</td>
              <td style={{ paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>__________________</td>
            </tr>
            <tr>
              <td style={{ paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>稽核領隊：</td>
              <td style={{ paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>__________________</td>
            </tr>
            <tr>
              <td style={{ paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>稽核副領隊：</td>
              <td style={{ paddingBottom: '24pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>__________________</td>
            </tr>
            <tr>
              <td style={{ paddingBottom: '12pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>稽核委員：</td>
              <td style={{ paddingBottom: '12pt', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                __________________、__________________、__________________
              </td>
            </tr>
            <tr>
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }} />
              <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                __________________、__________________、__________________
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
