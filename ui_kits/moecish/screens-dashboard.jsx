// Screens — dashboard + cycle detail + checklist + findings + login
window.LoginScreen = function LoginScreen() {
  const [email, setEmail] = React.useState('auditor@demo.tw');
  const [pw, setPw] = React.useState('');
  return (
    <div style={{minHeight:'100vh',display:'grid',gridTemplateColumns:'1fr 1fr',background:'#fff',position:'relative',overflow:'hidden'}}>
      <div aria-hidden style={{position:'absolute',width:720,height:720,borderRadius:'50%',left:-260,top:-200,background:'radial-gradient(circle,rgba(62,114,168,.06),transparent 62%)'}}/>
      <div aria-hidden style={{position:'absolute',width:680,height:680,borderRadius:'50%',right:-220,bottom:-220,background:'radial-gradient(circle,rgba(103,134,105,.05),transparent 62%)'}}/>

      <div style={{padding:'48px 56px',display:'flex',flexDirection:'column',justifyContent:'space-between',position:'relative'}}>
        <Brand size={32}/>
        <div style={{maxWidth:420}}>
          <h1 style={{fontSize:38,lineHeight:1.15,letterSpacing:'-0.028em',fontWeight:600,margin:0}}>
            讓每一次稽核<br/>都清楚、從容、<br/>留得下軌跡。
          </h1>
          <p style={{color:'var(--text-secondary)',marginTop:18,fontSize:15,lineHeight:1.65,maxWidth:380}}>
            MOECISH 承載 115 年度教育體系資通安全稽核作業。83 題檢核、多輪改善、審計軌跡完整保留。
          </p>
          <div style={{display:'flex',gap:18,marginTop:32,fontSize:12,color:'var(--text-tertiary)'}}>
            <span className="mono">v 0.9.4</span>
            <span>·</span>
            <span>上線 2026 年 2 月</span>
            <span>·</span>
            <span>教育部資訊及科技教育司</span>
          </div>
        </div>
        <div style={{fontSize:12,color:'var(--text-muted)'}}>© 2026 Ministry of Education · Taiwan</div>
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:48,position:'relative'}}>
        <div style={{width:400,background:'#fff',border:'1px solid var(--border-hairline)',borderRadius:'var(--radius-2xl)',padding:'32px 34px',boxShadow:'var(--shadow-lg)'}}>
          <div style={{fontSize:20,fontWeight:600,letterSpacing:'-0.018em'}}>登入平台</div>
          <div style={{fontSize:13,color:'var(--text-muted)',marginTop:4}}>以機關電子郵件登入；密碼由平台管理員配發。</div>

          <div style={{marginTop:22}}>
            <label className="label">機關電子郵件</label>
            <div className="input" style={{position:'relative'}}>
              <span style={{color:'var(--text-tertiary)',marginRight:8,display:'flex'}}><Icon name="mail" size={16}/></span>
              <input value={email} onChange={e=>setEmail(e.target.value)} style={{flex:1,border:0,outline:0,background:'transparent',fontFamily:'var(--font-mono)',fontSize:14}}/>
            </div>
          </div>
          <div style={{marginTop:16}}>
            <label className="label" style={{display:'flex',justifyContent:'space-between'}}>
              <span>密碼</span>
              <a href="#" style={{fontWeight:400,color:'var(--primary-700)',fontSize:12}}>忘記密碼</a>
            </label>
            <div className="input">
              <span style={{color:'var(--text-tertiary)',marginRight:8,display:'flex'}}><Icon name="lock" size={16}/></span>
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" style={{flex:1,border:0,outline:0,background:'transparent'}}/>
            </div>
          </div>

          <label className="checkbox" style={{marginTop:14}}>
            <input type="checkbox" defaultChecked/> 在此電腦保持登入 30 天
          </label>

          <button className="btn btn-primary" style={{width:'100%',marginTop:22,height:42,fontSize:15}}>
            進入管考系統
          </button>

          <div style={{display:'flex',alignItems:'center',gap:8,margin:'18px 0 14px'}}>
            <div style={{flex:1,height:1,background:'var(--border-hairline)'}}/>
            <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.1em'}}>或</div>
            <div style={{flex:1,height:1,background:'var(--border-hairline)'}}/>
          </div>
          <button className="btn btn-secondary" style={{width:'100%',height:40,fontSize:14,justifyContent:'center'}}>
            <Icon name="shield" size={15}/> 以自然人憑證登入
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- Dashboard ----
window.DashboardScreen = function DashboardScreen() {
  const greeting = '午安，陳委員。';
  return (
    <AppShell role="AUDITOR" user={{name:'陳委員',roleLabel:'稽核委員'}} active="cycles">
      <div className="page-hero">
        <div>
          <h1>{greeting}</h1>
          <div className="lede">今天有 <b style={{color:'var(--text-primary)',fontWeight:500}}>3</b> 項待辦 · 2026 年 4 月 18 日 星期六</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary"><Icon name="download" size={15}/>匯出管考月報</button>
          <button className="btn btn-primary"><Icon name="plus" size={15}/>開立稽核週期</button>
        </div>
      </div>

      {/* stat row */}
      <div className="grid-4" style={{marginBottom:28}}>
        <div className="stat">
          <div className="stat-label">進行中週期</div>
          <div className="stat-value tabnum">12</div>
          <div className="stat-sub">+ 2 自上週</div>
        </div>
        <div className="stat">
          <div className="stat-label">平均填答率</div>
          <div className="stat-value tabnum">86%</div>
          <div className="pbar" style={{marginTop:2}}><div className="pbar-fill" style={{width:'86%',background:'var(--primary-600)'}}/></div>
        </div>
        <div className="stat">
          <div className="stat-label">未結案稽核發現</div>
          <div className="stat-value tabnum" style={{color:'var(--warning-700)'}}>47</div>
          <div className="stat-sub">待改善 31 · 持續改正 16</div>
        </div>
        <div className="stat">
          <div className="stat-label">本週需審閱</div>
          <div className="stat-value tabnum">8</div>
          <div className="stat-sub">最近截止 2026-04-21</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:20}}>
        {/* Cycles list */}
        <div>
          <div className="row spread" style={{marginBottom:12}}>
            <h2 className="section-title">我負責的稽核週期</h2>
            <div className="segmented">
              <button data-active="true">全部</button>
              <button>待我處理</button>
              <button>本週截止</button>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              {org:'示範大學附設醫院', year:115, status:'IN_REVIEW', progress:86, due:'2026-06-30'},
              {org:'台北市立大安國民中學', year:115, status:'COMMENTS_RETURNED', progress:72, due:'2026-05-12'},
              {org:'國立北區科技大學', year:115, status:'RESPONDENT_SUBMITTED', progress:100, due:'2026-05-30'},
              {org:'新竹市教育局', year:115, status:'REMEDIATION_IN_PROGRESS', progress:100, due:'2026-04-25'},
              {org:'屏東縣偏鄉中學聯合', year:114, status:'CLOSED', progress:100, due:'2025-12-30'},
            ].map((c,i)=>{
              const s = cycleStatus[c.status];
              return (
                <a key={i} href="#" className="card card-pad" style={{display:'block'}}>
                  <div className="row spread" style={{alignItems:'flex-start'}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div className="card-title" style={{letterSpacing:'-0.01em'}}>{c.year} 年度 · {c.org}</div>
                      <div className="card-lede">起 {c.year}-03-01 · 截止 {c.due} · 83 題</div>
                    </div>
                    <Chip tone={s.tone}>{s.label}</Chip>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:14,marginTop:14}}>
                    <div className="pbar" style={{flex:1}}><div className="pbar-fill" style={{width:c.progress+'%',background: c.progress===100 ? 'var(--success-500)' : 'var(--primary-600)'}}/></div>
                    <div className="mono" style={{fontSize:12,color:'var(--text-secondary)',minWidth:70,textAlign:'right'}}><b style={{color:'var(--text-primary)',fontWeight:600}}>{c.progress}%</b> · {Math.round(c.progress*0.83)}/83</div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Todo + Timeline */}
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          <div className="card card-pad">
            <div className="row spread">
              <h3 className="section-title" style={{marginBottom:0,fontSize:15}}>待辦事項</h3>
              <span className="mono muted" style={{fontSize:12}}>3</span>
            </div>
            <div className="divider" style={{margin:'12px 0'}}/>
            <ul style={{listStyle:'none',margin:0,padding:0,display:'flex',flexDirection:'column',gap:10}}>
              {[
                ['審閱 115 年度 · 示範大學附設醫院 檢核表','4 月 21 日前','primary'],
                ['開立實地稽核 · 北區科大','4 月 28 日','sage'],
                ['審核改善措施 · 新竹市教育局 (3 項)','逾期 2 天','warning'],
              ].map(([t,m,tone],i)=>(
                <li key={i} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                  <span className="chip-dot" style={{background:`var(--${tone}-500)`,marginTop:8,width:7,height:7}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{t}</div>
                    <div style={{fontSize:12,color:tone==='warning'?'var(--danger-700)':'var(--text-muted)'}} className="mono">{m}</div>
                  </div>
                  <button className="btn btn-ghost btn-xs"><Icon name="arrowRight" size={13}/></button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card card-pad">
            <h3 className="section-title" style={{fontSize:15,marginBottom:14}}>近期軌跡</h3>
            <ol className="tl">
              <li><span className="tl-dot" data-tone="success"/><div className="tl-title">大安國中 主管已核可</div><div className="tl-meta">2026-04-18 10:22 · 張主任</div></li>
              <li><span className="tl-dot" data-tone="sage"/><div className="tl-title">示範醫院 進入委員審閱</div><div className="tl-meta">2026-04-17 16:05 · 陳委員</div></li>
              <li><span className="tl-dot" data-tone="warning"/><div className="tl-title">新竹市教育局 發出委員意見（第 2 輪）</div><div className="tl-meta">2026-04-16 09:41 · 陳委員</div></li>
              <li><span className="tl-dot" data-tone="primary"/><div className="tl-title">北區科大 填報人送出</div><div className="tl-meta">2026-04-15 18:12 · 王組長</div></li>
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  );
};
