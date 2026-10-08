/* A&N Control · indicadores de novedades por comunidad · v186 */
(() => {
  const key = group => 'aynCommunityReadV1:' + group + ':wall';
  let currentGroup = '';
  let items = [];
  let lastRequest = 0;
  let loading = false;
  const stamp = value => Number.isFinite(Date.parse(value || '')) ? Date.parse(value) : 0;
  const indicators = () => {
    const read = Number(localStorage.getItem(key(currentGroup)) || 0);
    const community = items.some(item => item.type === 'notice' && stamp(item.createdAt) > read);
    const polls = items.some(item => item.type === 'poll' && !item.closed &&
      (item.myVote === null || item.myVote === undefined) && stamp(item.closesAt) > Date.now());
    return {all: community || polls, wall: community, polls};
  };
  function paint() {
    const pending = currentGroup ? indicators() : {all:false,wall:false,polls:false};
    document.querySelectorAll('[data-community-pending]').forEach(el => {
      const type = el.dataset.communityPending;
      const active = Boolean(pending[type]);
      el.classList.toggle('has-community-pending', active);
      el.dataset.notificationStatus = active ? 'pendiente' : 'al-dia';
      if(active)el.title = type === 'polls' ? 'Hay encuestas pendientes' :
        type === 'wall' ? 'Hay novedades en la comunidad' : 'Hay novedades pendientes';
      else el.removeAttribute('title');
    });
  }
  function update(data) {
    if(!data || !Array.isArray(data.items) || !data.groupId)return;
    currentGroup = data.groupId;
    items = data.items;
    paint();
  }
  function markRead(section, group = currentGroup, list = items) {
    if(section !== 'wall' || !group)return;
    const newest = (list || []).filter(item => item.type === 'notice')
      .reduce((max,item) => Math.max(max,stamp(item.createdAt)),0);
    if(newest) localStorage.setItem(key(group),String(Math.max(newest,Number(localStorage.getItem(key(group))||0))));
    if(group === currentGroup)paint();
  }
  async function refresh(force=false) {
    if(loading || document.hidden)return;
    if(!force && Date.now() - lastRequest < 8000)return;
    const pin = localStorage.getItem('relayPin') || document.getElementById('pin')?.value.trim();
    const device = localStorage.getItem('relayDeviceId');
    if(!pin || !device)return;
    loading = true;lastRequest=Date.now();
    try{
      const selected = localStorage.getItem('aynLastRole') === 'super_master' ?
        sessionStorage.getItem('aynCommunityActiveGroup') : '';
      const url = '/api/community' + (selected ? '?groupId=' + encodeURIComponent(selected) : '');
      const response = await fetch(url,{headers:{'x-app-pin':pin,'x-device-id':device},cache:'no-store'});
      if(!response.ok){if([401,403].includes(response.status)){currentGroup='';items=[];paint();}return;}
      update(await response.json());
    }catch{}finally{loading=false;}
  }
  window.AynCommunityAlerts = {update,markRead,refresh};
  document.addEventListener('ayn-menu-view',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  window.addEventListener('pageshow',()=>refresh(true));
  setInterval(()=>refresh(true),30000);
  paint();refresh(true);
})();
