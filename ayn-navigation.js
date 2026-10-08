/* A&N Control: navegación local entre vistas, sin credenciales ni datos personales. */
(()=>{
 const KEY='ayn:navigation:v1',pages=new Set(['admin','app','matrix']);
 const valid=t=>Boolean(t&&pages.has(t.page)&&/^[a-zA-Z][\w-]{0,30}$/.test(t.view));
 const same=(a,b)=>Boolean(a&&b&&a.page===b.page&&a.view===b.view);
 let stored={};try{stored=JSON.parse(sessionStorage.getItem(KEY)||'{}')||{};}catch{}
 let last=valid(stored.last)?stored.last:null;
 let stack=Array.isArray(stored.stack)?stored.stack.filter(valid).slice(-24):[];
 let pending=valid(stored.pending)?stored.pending:null;
 const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify({last,stack,pending}));}catch{}};
 const here=()=>location.pathname.endsWith('/administracion.html')?'admin':location.pathname.endsWith('/matrix.html')?'matrix':'app';
 const url=t=>t.page==='admin'?'/administracion.html#'+encodeURIComponent(t.view):t.page==='matrix'?'/matrix.html':'/#'+encodeURIComponent(t.view);
 function visit(page,view){
  const next={page,view};if(!valid(next))return;
  if(same(last,next)){pending=null;save();return;}
  if(pending&&same(pending,next)){last=next;pending=null;save();return;}
  pending=null;
  if(last&&!same(last,next)){if(!same(stack[stack.length-1],last))stack.push(last);stack=stack.slice(-24);}
  last=next;save();
 }
 function go(target){
  if(!valid(target))return;
  last=target;pending=target;save();
  if(here()===target.page)window.dispatchEvent(new CustomEvent('ayn:navigate',{detail:target}));
  else location.assign(url(target));
 }
 function home(page){
  if(!pages.has(page))return;
  stack=[];
  go(page==='app'?{page:'app',view:'control'}:{page:'admin',view:'home'});
 }
 function back(page){
  if(!pages.has(page))return;
  const previous=stack.pop();
  if(previous)go(previous);
  else home(page==='matrix'?'admin':page);
 }
 window.AynNavigation=Object.freeze({visit,back,home});
})();