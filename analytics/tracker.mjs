import {API_BASE} from './config.mjs';
const root=new URL('../',import.meta.url);
const KEY='resume.analytics.session.v1',TTL=30*60*1000;
function start(){
  if(!API_BASE || location.protocol==='file:' || navigator.globalPrivacyControl || navigator.doNotTrack==='1' ||
     location.pathname.startsWith(root.pathname+'admin/') || new URL(location.href).searchParams.has('render'))return;
  try{
    const api=new URL(API_BASE);if(api.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(api.hostname))return;
    try{if(localStorage.getItem('resume.analytics.disabled')==='1')return;}catch{}
    const now=Date.now();let session;
    try{session=JSON.parse(sessionStorage.getItem(KEY));}catch{}
    if(!session || typeof session.id!=='string' || !Number.isFinite(session.seen) || now-session.seen>TTL){
      const query=new URL(location.href).searchParams;let referrer='';
      try{const ref=new URL(document.referrer);if(ref.origin!==location.origin)referrer=ref.hostname;}catch{}
      session={id:crypto.randomUUID(),seen:now,referrer,source:query.get('utm_source')||'',medium:query.get('utm_medium')||'',campaign:query.get('utm_campaign')||''};
    }
    session.seen=now;
    try{sessionStorage.setItem(KEY,JSON.stringify(session));}catch{}
    const body=JSON.stringify({id:crypto.randomUUID(),session:session.id,path:location.pathname,referrer:session.referrer,source:session.source,medium:session.medium,campaign:session.campaign,device:matchMedia('(pointer: coarse)').matches?'touch':'desktop'});
    // No referrer URL, raw query string, fragment, IP address or UA is sent in the payload.
    fetch(new URL('/collect',api),{method:'POST',body,headers:{'Content-Type':'text/plain'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true}).catch(()=>{});
  }catch{/* Analytics must never break the resume. */}
}
if(document.visibilityState==='prerender')document.addEventListener('visibilitychange',start,{once:true});else start();
