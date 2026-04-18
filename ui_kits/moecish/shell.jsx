// App shell — sidebar + topstrip + content slot
window.AppShell = function AppShell({ role = 'RESPONDENT', user = { name: '王小明', roleLabel: '填報人' }, active = 'cycles', crumbs = [], children, topRight }) {
  const nav = [
    { group: '稽核作業', items: [
      { id: 'cycles', label: '稽核週期', icon: 'clipboard' },
      { id: 'findings', label: '稽核發現', icon: 'triangle' },
      { id: 'review', label: '委員審閱', icon: 'eye' },
    ]},
    { group: '管理', items: [
      { id: 'activity', label: '審計軌跡', icon: 'activity' },
      { id: 'users', label: '使用者', icon: 'users' },
      { id: 'settings', label: '設定', icon: 'settings' },
    ]},
  ];
  return (
    <div className="app">
      <aside className="sidebar" data-role={role}>
        <div className="brand"><Brand /></div>
        {nav.map((g, gi) => (
          <React.Fragment key={gi}>
            <div className="nav-group">{g.group}</div>
            {g.items.map(it => (
              <a key={it.id} href="#" className="nav-item" data-active={active === it.id ? 'true' : 'false'}>
                <span className="nav-icon"><Icon name={it.icon} size={17}/></span>
                <span>{it.label}</span>
              </a>
            ))}
          </React.Fragment>
        ))}
        <div className="sidebar-footer">
          <div className="user-chip">
            <Avatar name={user.name} role={role}/>
            <div style={{minWidth:0}}>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.roleLabel}</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <div className="topstrip">
          <div className="topstrip-crumbs">
            {crumbs.length === 0
              ? <b>總覽</b>
              : crumbs.map((c, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Icon name="chevRight" size={13}/>}
                    {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
                  </React.Fragment>
                ))
            }
          </div>
          <div style={{flex:1}}/>
          <div className="search">
            <Icon name="search" size={14}/>
            <span style={{flex:1}}>搜尋週期、題目或委員…</span>
            <span className="kbd">⌘</span><span className="kbd">K</span>
          </div>
          <button className="btn btn-ghost" style={{padding:'0 8px',height:32}} aria-label="通知"><Icon name="bell" size={17}/></button>
          {topRight}
        </div>
        <main className="page">{children}</main>
      </div>
    </div>
  );
};
