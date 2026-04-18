// Shared UI helpers for MOECISH UI kit
// Icon set — inlined SVG, 24x24, stroke 1.75, round caps
window.Icon = function Icon({ name, size = 18, className = '' }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', className };
  const paths = {
    home:       <><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z"/></>,
    clipboard:  <><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9.5 13l2 2 3.5-4"/></>,
    triangle:   <><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6" fill="currentColor"/></>,
    eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    search:     <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    command:    <><path d="M7 7a2 2 0 100-4 2 2 0 000 4zm0 0h10m0 0a2 2 0 104 0 2 2 0 00-4 0zm0 0v10m0 0a2 2 0 104 0 2 2 0 00-4 0zm0 0H7m0 0a2 2 0 10-4 0 2 2 0 004 0zm0 0V7"/></>,
    menu:       <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    plus:       <><path d="M12 5v14M5 12h14"/></>,
    check:      <><path d="M5 12l5 5 9-11"/></>,
    x:          <><path d="M6 6l12 12M18 6L6 18"/></>,
    chevRight:  <><path d="m9 6 6 6-6 6"/></>,
    chevDown:   <><path d="m6 9 6 6 6-6"/></>,
    chevUp:     <><path d="m6 15 6-6 6 6"/></>,
    download:   <><path d="M12 4v12m0 0l-4-4m4 4l4-4"/><path d="M4 19h16"/></>,
    upload:     <><path d="M12 20V8m0 0l-4 4m4-4l4 4"/><path d="M4 5h16"/></>,
    file:       <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/></>,
    bell:       <><path d="M6 9a6 6 0 1112 0v3l1.5 3H4.5L6 12V9z"/><path d="M10 18a2 2 0 004 0"/></>,
    settings:   <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.12-1.3l2-1.6-2-3.4-2.4.9a7 7 0 00-2.2-1.3L14 3h-4l-.28 2.3a7 7 0 00-2.2 1.3L5.12 5.7l-2 3.4 2 1.6A7 7 0 005 12c0 .45.04.88.12 1.3l-2 1.6 2 3.4 2.4-.9a7 7 0 002.2 1.3L10 21h4l.28-2.3a7 7 0 002.2-1.3l2.4.9 2-3.4-2-1.6c.08-.42.12-.85.12-1.3z"/></>,
    shield:     <><path d="M12 3l8 3v6c0 5-4 9-8 10-4-1-8-5-8-10V6l8-3z"/></>,
    users:      <><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0112 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 20a4.8 4.8 0 017-4.3"/></>,
    activity:   <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    mail:       <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    lock:       <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 118 0v3"/></>,
    calendar:   <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></>,
    arrowRight: <><path d="M4 12h16m0 0l-6-6m6 6l-6 6"/></>,
    stamp:      <><path d="M8 3h8l-1 6h2a2 2 0 012 2v4H5v-4a2 2 0 012-2h2L8 3z"/><path d="M4 19h16"/></>,
  };
  if (!paths[name]) return <svg {...common}><circle cx="12" cy="12" r="4"/></svg>;
  return <svg {...common}>{paths[name]}</svg>;
};

// Brand
window.Brand = function Brand({ size = 28 }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:size,height:size,borderRadius:6,background:'linear-gradient(135deg,#5389bd,#27436a)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'var(--shadow-xs)',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,rgba(255,255,255,.45),transparent 60%)'}}/>
        <svg width={size*0.56} height={size*0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{position:'relative'}}><path d="M5 12l5 5 9-11"/></svg>
      </div>
      <div style={{lineHeight:1.1}}>
        <div style={{fontWeight:600,fontSize:15,letterSpacing:'-0.01em'}}>MOECISH</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>資安稽核管考平台</div>
      </div>
    </div>
  );
};

// Avatar
window.Avatar = function Avatar({ name = '王', role = 'RESPONDENT', size = 30 }) {
  return <div className="avatar" data-role={role} style={{width:size,height:size,fontSize:size*0.4}}>{name[0]}</div>;
};

// Chip
window.Chip = function Chip({ tone = 'neutral', dot = true, children }) {
  return (
    <span className={`chip chip-${tone}`}>
      {dot && <span className="chip-dot" style={{background:`var(--${tone === 'neutral' ? 'neutral-400' : tone+'-500'})`}}/>}
      {children}
    </span>
  );
};

// Status helpers
window.cycleStatus = {
  DRAFT: {tone:'neutral', label:'草稿'},
  RESPONDENT_SUBMITTED: {tone:'primary', label:'填報人已送出'},
  SUPERVISOR_APPROVED: {tone:'primary', label:'主管已核可'},
  IN_REVIEW: {tone:'sage', label:'委員審閱中'},
  ONSITE_SCHEDULED: {tone:'sage', label:'實地稽核已排定'},
  COMMENTS_RETURNED: {tone:'warning', label:'委員意見待補'},
  FINDINGS_ISSUED: {tone:'warning', label:'稽核發現已開立'},
  REMEDIATION_IN_PROGRESS: {tone:'warning', label:'改善進行中'},
  CLOSED: {tone:'success', label:'已結案'},
};
