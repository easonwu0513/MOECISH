// ---- Cycle detail + Checklist + Findings ----
window.CycleDetailScreen = function CycleDetailScreen() {
  return (
    <AppShell role="RESPONDENT" user={{name:'王小明',roleLabel:'填報人'}} active="cycles"
      crumbs={['總覽','稽核週期','115 · 示範大學附設醫院']}>
      <div className="page-hero">
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--text-muted)'}}>
            <span className="mono">CK-115-NHIS-008</span>
            <span>·</span>
            <Chip tone="sage">委員審閱中</Chip>
          </div>
          <h1 style={{marginTop:6}}>115 年度資通安全稽核</h1>
          <div className="lede">示範大學附設醫院 · 起 2026-03-01 · 截止 2026-06-30</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary"><Icon name="download" size={15}/>Excel 檢核表</button>
          <button className="btn btn-secondary"><Icon name="file" size={15}/>改善報告</button>
          <button className="btn btn-primary"><Icon name="stamp" size={15}/>送出審核</button>
        </div>
      </div>

      <div className="grid-3" style={{marginBottom:24}}>
        <div className="card card-pad">
          <div className="row gap-4">
            <div style={{position:'relative',width:80,height:80,flexShrink:0}}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{transform:'rotate(-90deg)'}}>
                <circle cx="40" cy="40" r="34" stroke="var(--neutral-100)" strokeWidth="8" fill="none"/>
                <circle cx="40" cy="40" r="34" stroke="var(--primary-600)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="213.6" strokeDashoffset="29.9"/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div className="mono" style={{fontSize:17,fontWeight:600}}>86%</div>
                <div className="mono" style={{fontSize:11,color:'var(--text-muted)'}}>72/83</div>
              </div>
            </div>
            <div>
              <div className="card-title">填答進度</div>
              <div className="card-lede">共 83 題 · 剩 11 題</div>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="row gap-4">
            <div style={{width:80,height:80,borderRadius:999,background:'var(--warning-50)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--warning-600)'}}><Icon name="triangle" size={32}/></div>
            <div>
              <div className="card-title">稽核發現</div>
              <div className="card-lede">共 7 項 · 待改善 4</div>
              <div style={{display:'flex',gap:6,marginTop:8}}>
                <Chip tone="warning">待改善 4</Chip>
                <Chip tone="neutral">建議 3</Chip>
              </div>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="row gap-4">
            <div style={{position:'relative',width:80,height:80,flexShrink:0}}>
              <svg width="80" height="80" viewBox="0 0 80 80" style={{transform:'rotate(-90deg)'}}>
                <circle cx="40" cy="40" r="34" stroke="var(--neutral-100)" strokeWidth="8" fill="none"/>
                <circle cx="40" cy="40" r="34" stroke="var(--success-500)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray="213.6" strokeDashoffset="160"/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div className="mono" style={{fontSize:17,fontWeight:600}}>1</div>
                <div className="mono" style={{fontSize:11,color:'var(--text-muted)'}}>/ 4</div>
              </div>
            </div>
            <div>
              <div className="card-title">改善已通過</div>
              <div className="card-lede">剩餘 3 項待審</div>
            </div>
          </div>
        </div>
      </div>

      {/* module tiles */}
      <div className="grid-3" style={{marginBottom:24}}>
        {[
          {icon:'clipboard',tone:'primary',title:'模組一　檢核表填報',desc:'逐項填寫 83 題符合情形、說明與佐證，由主管核可送出，委員給意見、受稽機關補正。'},
          {icon:'triangle', tone:'sage',   title:'模組二　稽核發現與改善',desc:'實地稽核後，委員開立稽核發現；受稽機關填改善措施與執行情形；委員審核通過或持續改正。'},
          {icon:'eye',      tone:'neutral',title:'委員審閱',desc:'檢視機關填報、對各題給意見（僅稽核委員可編輯）。'},
        ].map((m,i)=>(
          <a key={i} href="#" className="card card-pad" style={{display:'flex',gap:14,alignItems:'flex-start'}}>
            <div style={{width:44,height:44,borderRadius:10,background:`var(--${m.tone==='neutral'?'neutral-100':m.tone+'-50'})`,color:`var(--${m.tone==='neutral'?'neutral-600':m.tone+'-700'})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Icon name={m.icon} size={22}/>
            </div>
            <div>
              <div className="card-title">{m.title}</div>
              <div className="card-lede" style={{lineHeight:1.6,marginTop:6}}>{m.desc}</div>
            </div>
          </a>
        ))}
      </div>

      <div className="card card-pad">
        <div className="card-title">軌跡</div>
        <div className="card-lede" style={{marginBottom:16}}>週期狀態變更紀錄</div>
        <ol className="tl">
          <li><span className="tl-dot" data-tone="neutral"/><div className="tl-title">週期建立</div><div className="tl-meta">2026-03-01 09:00 · 平台管理員</div></li>
          <li><span className="tl-dot" data-tone="primary"/><div className="tl-title">填報人送出（83/83）</div><div className="tl-meta">2026-03-12 14:22 · 王小明</div></li>
          <li><span className="tl-dot" data-tone="primary"/><div className="tl-title">主管核可</div><div className="tl-meta">2026-03-13 09:05 · 張主任</div></li>
          <li><span className="tl-dot" data-tone="sage"/><div className="tl-title">進入委員審閱</div><div className="tl-meta">2026-03-15 10:30 · 陳委員 · 進行中</div></li>
        </ol>
      </div>
    </AppShell>
  );
};

// ---- Checklist ----
window.ChecklistScreen = function ChecklistScreen() {
  const items = [
    {no:'5.1', stem:'委外業務辦理前，應依風險等級進行風險評估，並作成紀錄。', comp:'部分符合', comment:'委外契約缺風險評估紀錄，請補附 2025 年度之風險評估文件。', round:1},
    {no:'5.2', stem:'委外廠商合約中應訂定資通安全責任條款，並明定違約處理。', comp:'符合'},
    {no:'5.3', stem:'對委外廠商進行資通安全查核，且留存查核紀錄。', comp:'不符合', comment:'本年度未對主要委外廠商進行任何查核。'},
    {no:'5.4', stem:'委外廠商人員存取機關資通系統，應設有權限管理與離職交接程序。', comp:null},
    {no:'5.5', stem:'委外人員接觸個資前，應簽署保密切結書與完成教育訓練。', comp:'不適用'},
  ];
  const dims = [
    ['策略與治理', 10], ['資產管理', 8], ['存取控制', 11], ['系統開發與維護', 9],
    ['委外管理', 7], ['事件應變', 8], ['持續營運', 9], ['實體與環境', 10], ['稽核與遵循', 11],
  ];
  return (
    <AppShell role="RESPONDENT" user={{name:'王小明',roleLabel:'填報人'}} active="cycles"
      crumbs={['總覽','稽核週期','115 · 示範大學附設醫院','檢核表']}>

      <div className="page-hero">
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--text-muted)'}}>
            <span className="mono">CK-115-NHIS-008</span><span>·</span><span>模組一</span>
          </div>
          <h1 style={{marginTop:6}}>檢核表填報</h1>
          <div className="lede">83 題 · 分 9 維度 · 自動存檔中</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>最後儲存 14:22</span>
          <button className="btn btn-secondary"><Icon name="download" size={15}/>Excel</button>
          <button className="btn btn-primary">儲存並送出主管核可</button>
        </div>
      </div>

      {/* Dimension tabs */}
      <div className="dim-tabs">
        {dims.map(([label,count],i)=>(
          <a key={i} href="#" className="dim-tab" data-active={i===4?'true':'false'}>
            {label}<span className="count">{count}</span>
          </a>
        ))}
      </div>

      {/* Filter row */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'var(--bg-surface-muted)',border:'1px solid var(--border-hairline)',borderRadius:10,marginBottom:16}}>
        <div className="input" style={{flex:1,maxWidth:340,height:34}}>
          <Icon name="search" size={14}/>
          <input placeholder="搜尋題號或題目內容…" style={{flex:1,border:0,outline:0,background:'transparent',marginLeft:8,fontSize:13}}/>
        </div>
        <div className="segmented">
          <button data-active="true">全部</button>
          <button>未作答</button>
          <button>部分符合</button>
          <button>不符合</button>
          <button>有意見待補</button>
        </div>
        <div style={{flex:1}}/>
        <div className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>
          <b style={{color:'var(--text-primary)',fontWeight:600}}>5</b> / 7 題
        </div>
      </div>

      {/* Progress bar */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
        <div className="pbar" style={{flex:1}}><div className="pbar-fill" style={{width:'86%',background:'var(--primary-600)'}}/></div>
        <div className="mono" style={{fontSize:13}}>
          <b>72</b> <span className="muted">/ 83</span> <span className="muted">(86%)</span>
        </div>
        <div className="row gap-2" style={{fontSize:11,color:'var(--text-muted)'}}>
          <span className="kbd">j</span><span className="kbd">k</span> 移動
          <span className="kbd">⏎</span> 展開
        </div>
      </div>

      <h2 className="section-title" style={{display:'flex',alignItems:'center',gap:8}}>
        委外管理 <Chip tone="neutral" dot={false}>{items.length}</Chip>
      </h2>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {items.map((it,i)=>{
          const toneMap = {'符合':'success','部分符合':'warning','不符合':'danger','不適用':'neutral'};
          return (
            <div key={i} className="cl-row" data-active={i===0?'true':'false'}>
              <div className="row gap-3" style={{alignItems:'flex-start'}}>
                <span className="cl-num">{it.no}</span>
                <div className="cl-stem">{it.stem}</div>
                <div className="row gap-2">
                  {it.comp ? <Chip tone={toneMap[it.comp]}>{it.comp}</Chip> : <Chip tone="neutral" dot={false}>未作答</Chip>}
                  {it.comment && <Chip tone="danger" dot={false}>意見 · 第 {it.round ?? 1} 輪</Chip>}
                </div>
              </div>

              {i === 0 && (
                <>
                  <div className="segmented compliance" style={{alignSelf:'flex-start'}}>
                    <button data-active="true" data-val="部分符合">部分符合</button>
                    <button data-val="符合">符合</button>
                    <button data-val="不符合">不符合</button>
                    <button data-val="不適用">不適用</button>
                  </div>
                  <div>
                    <label className="label">說明（符合情形與佐證摘要）</label>
                    <div className="input" style={{height:'auto',padding:'10px 14px',alignItems:'flex-start'}}>
                      <textarea rows={3} defaultValue="本院 2025 年度已對主要委外廠商進行資安風險評估，惟尚未涵蓋新簽訂之三家廠商，將於 5 月底前補齊並作成紀錄。" style={{flex:1,border:0,outline:0,background:'transparent',fontSize:14,lineHeight:1.65,resize:'vertical',fontFamily:'inherit'}}/>
                    </div>
                  </div>
                  <div className="row gap-2">
                    <button className="btn btn-secondary btn-sm"><Icon name="upload" size={14}/>附加佐證</button>
                    <span className="mono" style={{fontSize:12,color:'var(--text-muted)'}}>已附 2 份 PDF · 共 3.4 MB</span>
                  </div>
                  {it.comment && (
                    <div className="comment">
                      <div className="comment-hd">委員意見 · 第 {it.round} 輪 · 陳委員 · 2026-04-16</div>
                      {it.comment}
                      <div style={{marginTop:8,display:'flex',gap:8}}>
                        <button className="btn btn-xs btn-tonal">標記已補正</button>
                        <button className="btn btn-xs btn-ghost">回覆</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="toast-wrap">
        <div className="toast"><span className="dot"/>已儲存 · 第 5.1 題更新完成，軌跡留存中。</div>
      </div>
    </AppShell>
  );
};

// ---- Findings ----
window.FindingsScreen = function FindingsScreen() {
  const findings = [
    {id:'F-008', dim:'存取控制', type:'待改善', sev:'warning', title:'特權帳號密碼未符合複雜度要求',
     desc:'抽查 12 組系統管理員帳號，其中 3 組密碼長度不足、未含特殊字元。',
     rem:'已完成密碼政策調整、強制下次登入重設；預計 2026-05-10 前全部更新完成。',
     status:'改善中', round:2},
    {id:'F-009', dim:'委外管理', type:'待改善', sev:'warning', title:'委外廠商未定期提交資安報告',
     desc:'2025 下半年起，3 家主要委外廠商未依契約提交季度資安報告。',
     rem:'已發函要求補送，並於 2026-06-30 前完成全數契約修訂。',
     status:'已改善待審', round:1},
    {id:'F-010', dim:'事件應變', type:'建議', sev:'neutral', title:'建議增加跨單位通報演練頻率',
     desc:'目前每年 1 次演練，建議改為半年 1 次並納入外部單位。',
     rem:'', status:'待填改善', round:0},
  ];
  return (
    <AppShell role="AUDITOR" user={{name:'陳委員',roleLabel:'稽核委員'}} active="findings"
      crumbs={['總覽','稽核發現','115 · 示範大學附設醫院']}>
      <div className="page-hero">
        <div>
          <h1>稽核發現與改善</h1>
          <div className="lede">模組二 · 115 年度 · 示範大學附設醫院 · 共 7 項</div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-secondary"><Icon name="file" size={15}/>匯出改善報告</button>
          <button className="btn btn-primary"><Icon name="plus" size={15}/>新增稽核發現</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:22}}>
        {[['全部',7,'neutral'],['待改善',4,'warning'],['改善中',2,'primary'],['已通過',1,'success']].map(([l,n,t],i)=>(
          <div key={i} className="stat" style={{padding:'14px 16px',cursor:'pointer',borderColor:i===1?'var(--warning-200)':'var(--border-hairline)'}}>
            <div className="row spread">
              <div className="stat-label">{l}</div>
              <span className="chip-dot" style={{background:`var(--${t}-500)`}}/>
            </div>
            <div className="stat-value tabnum" style={{fontSize:22}}>{n}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {findings.map((f,i)=>(
          <div key={i} className="card card-pad">
            <div className="row gap-3" style={{alignItems:'flex-start'}}>
              <span className="cl-num" style={{background:'var(--sage-50)',color:'var(--sage-700)'}}>{f.id}</span>
              <div style={{flex:1,minWidth:0}}>
                <div className="row gap-2" style={{marginBottom:4}}>
                  <Chip tone="neutral" dot={false}>{f.dim}</Chip>
                  <Chip tone={f.sev}>{f.type}</Chip>
                  <span className="mono" style={{fontSize:11,color:'var(--text-muted)'}}>第 {f.round || '—'} 輪</span>
                </div>
                <div style={{fontSize:15,fontWeight:500,letterSpacing:'-0.01em'}}>{f.title}</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',marginTop:6,lineHeight:1.65}}>{f.desc}</div>
              </div>
              <Chip tone={f.status==='已改善待審'?'primary':f.status==='待填改善'?'neutral':'warning'}>{f.status}</Chip>
            </div>

            {f.rem && (
              <div style={{marginTop:14,paddingLeft:14,borderLeft:'2px solid var(--sage-300)'}}>
                <div style={{fontSize:11,color:'var(--sage-700)',fontWeight:500,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:4}}>改善措施</div>
                <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.65}}>{f.rem}</div>
              </div>
            )}

            <div className="row gap-2" style={{marginTop:12,borderTop:'1px solid var(--border-hairline)',paddingTop:12}}>
              <span className="mono" style={{fontSize:11,color:'var(--text-muted)'}}>最後更新 2026-04-16 · 王小明</span>
              <div style={{flex:1}}/>
              {f.status==='已改善待審' && <><button className="btn btn-sm btn-danger">持續改正</button><button className="btn btn-sm btn-success">審核通過</button></>}
              {f.status==='改善中' && <><button className="btn btn-sm btn-ghost">檢視附件</button><button className="btn btn-sm btn-tonal">進度回報</button></>}
              {f.status==='待填改善' && <button className="btn btn-sm btn-primary">填寫改善措施</button>}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
};
