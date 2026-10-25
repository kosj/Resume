const encoder=new TextEncoder();
const DAY=86400,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNELS=['utm','search','social','referral','direct'];
const topic='(?:demo|fps-demo|zenonia-demo|isometric-demo|dedicated-demo)';
function response(data,status=200,origin=''){
 return new Response(data===null?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
}
function validConfig(env){return env.DB&&env.SITE_ORIGIN&&env.BASE_PATH&&env.ADMIN_TOKEN?.length>=32&&env.SESSION_SALT?.length>=32;}
const clean=v=>typeof v==='string'&&/^[\p{L}\p{N}_. -]{0,80}$/u.test(v)?v.trim():'';
export function attribution(referrer,source){
 if(source)return 'utm';
 if(!referrer)return 'direct';
 const family=domains=>domains.some(d=>referrer===d||referrer.endsWith('.'+d));
 if(family(['google.com','google.co.kr','naver.com','daum.net','bing.com','duckduckgo.com','search.yahoo.com']))return 'search';
 if(family(['linkedin.com','lnkd.in','facebook.com','instagram.com','t.co','twitter.com','x.com','youtube.com','youtu.be','threads.net','threads.com']))return 'social';
 return 'referral';
}
export function validateEvent(raw,env){
 if(!raw||!UUID.test(raw.id)||!UUID.test(raw.session))throw Error('invalid id');
 let path=raw.path;
 if(typeof path!=='string'||!path.startsWith(env.BASE_PATH))throw Error('invalid path');
 const relative=path.slice(env.BASE_PATH.length);
 if(!new RegExp('^(?:index\\.html|'+topic+'/(?:index\\.html|article\\.html|terms\\.html)?)?$').test(relative))throw Error('invalid path');
 path=path.replace(/index\.html$/,'');
 let referrer='';
 if(typeof raw.referrer==='string'&&raw.referrer.length<=253){
  try{const u=new URL('https://'+raw.referrer);if(u.hostname===raw.referrer.toLowerCase()&&u.origin!==env.SITE_ORIGIN)referrer=u.hostname;}catch{}
 }
 const source=clean(raw.source).toLowerCase(),medium=clean(raw.medium).toLowerCase(),campaign=clean(raw.campaign);
 return{id:raw.id,session:raw.session,path,referrer,source,medium,campaign,channel:attribution(referrer,source),device:raw.device==='touch'?'touch':'desktop'};
}
async function hash(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
async function authorized(request,env){
 const token=request.headers.get('Authorization')||'';if(!token.startsWith('Bearer ')||token.length>512)return false;
 const[a,b]=await Promise.all([hash(token.slice(7)),hash(env.ADMIN_TOKEN)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function sessionHash(id,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(salt),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(id)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('invalid date');const ms=Date.parse(s+'T00:00:00+09:00');if(!Number.isFinite(ms)||new Date(ms+9*3600000).toISOString().slice(0,10)!==s)throw Error('invalid date');return ms/1000;}
export function range(url,now=Date.now()){
 const today=new Date(now+9*3600000).toISOString().slice(0,10);
 const to=url.searchParams.get('to')||today,from=url.searchParams.get('from')||new Date((date(to)-29*DAY)*1000+9*3600000).toISOString().slice(0,10);
 const start=date(from),end=date(to)+DAY;if(end<=start||end-start>90*DAY)throw Error('range must be 1–90 days');
 const channel=url.searchParams.get('channel')||'all';if(channel!=='all'&&!CHANNELS.includes(channel))throw Error('invalid channel');
 return{from,to,start,end,channel};
}
async function report(env,r){
 const filter=r.channel==='all'?'':' AND s.channel = ?',filterArgs=r.channel==='all'?[]:[r.channel];
 const args=[r.start,r.end,...filterArgs];
 const sw='s.started_at >= ? AND s.started_at < ?'+filter;
 const pw='p.at >= ? AND p.at < ?'+filter;
 const prep=(sql,bindings=args)=>env.DB.prepare(sql).bind(...bindings);
 const queries=[
  prep(`SELECT COUNT(*) AS visits, COALESCE(SUM(CASE WHEN s.channel != 'direct' THEN 1 ELSE 0 END),0) AS attributed, COALESCE(SUM(CASE WHEN s.channel = 'utm' THEN 1 ELSE 0 END),0) AS campaigns FROM sessions s WHERE ${sw}`),
  prep(`SELECT COUNT(*) AS views FROM pageviews p JOIN sessions s ON s.id=p.session_id WHERE ${pw}`),
  prep(`SELECT date(s.started_at,'unixepoch','+9 hours') AS day, COUNT(*) AS visits FROM sessions s WHERE ${sw} GROUP BY day ORDER BY day`),
  prep(`SELECT date(p.at,'unixepoch','+9 hours') AS day, COUNT(*) AS views FROM pageviews p JOIN sessions s ON s.id=p.session_id WHERE ${pw} GROUP BY day ORDER BY day`),
  prep(`SELECT s.channel, CASE WHEN s.channel='utm' THEN s.source WHEN s.referrer='' THEN 'direct' ELSE s.referrer END AS label, COUNT(*) AS visits FROM sessions s WHERE ${sw} GROUP BY s.channel,label ORDER BY visits DESC,label LIMIT 50`),
  prep(`SELECT s.landing AS path,COUNT(*) AS visits FROM sessions s WHERE ${sw} GROUP BY s.landing ORDER BY visits DESC,path LIMIT 50`),
  prep(`SELECT p.path,COUNT(*) AS views FROM pageviews p JOIN sessions s ON s.id=p.session_id WHERE ${pw} GROUP BY p.path ORDER BY views DESC,p.path LIMIT 50`),
  prep(`SELECT s.source,s.medium,s.campaign,COUNT(*) AS visits FROM sessions s WHERE ${sw} AND s.source != '' GROUP BY s.source,s.medium,s.campaign ORDER BY visits DESC,s.source,s.medium,s.campaign LIMIT 50`),
  prep(`SELECT s.device,COUNT(*) AS visits FROM sessions s WHERE ${sw} GROUP BY s.device ORDER BY visits DESC`)
 ];
 const results=await env.DB.batch(queries);const rows=i=>results[i].results;
 const days=[];for(let d=r.start;d<r.end;d+=DAY){const day=new Date(d*1000+9*3600000).toISOString().slice(0,10);days.push({day,visits:rows(2).find(v=>v.day===day)?.visits||0,views:rows(3).find(v=>v.day===day)?.views||0});}
 return{range:{from:r.from,to:r.to,channel:r.channel,timezone:'Asia/Seoul'},summary:{...rows(0)[0],...rows(1)[0]},daily:days,sources:rows(4),landings:rows(5),pages:rows(6),campaigns:rows(7),devices:rows(8),generatedAt:new Date().toISOString()};
}
export default{
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin')||'',allowed=origin===env.SITE_ORIGIN;
  if(!allowed)return response({error:'Origin not allowed'},403);
  if(!validConfig(env))return response({error:'Analytics backend is not configured'},503,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
  try{
   if(url.pathname==='/collect'&&request.method==='POST'){
    if(Number(request.headers.get('Content-Length')||0)>4096)return response({error:'Payload too large'},413,origin);
    // Limit the stream too: a missing Content-Length must not permit unbounded bodies.
    const reader=request.body?.getReader();if(!reader)return response({error:'Missing body'},400,origin);
    let size=0,chunks=[];for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return response({error:'Payload too large'},413,origin);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    let e;try{e=validateEvent(JSON.parse(new TextDecoder().decode(bytes)),env);}catch{return response({error:'Invalid event'},400,origin);}
    const id=await sessionHash(e.session,env.SESSION_SALT),at=Math.floor(Date.now()/1000);
    await env.DB.batch([
     env.DB.prepare('INSERT OR IGNORE INTO sessions(id,started_at,landing,referrer,source,medium,campaign,channel,device) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM pageviews WHERE id=?)').bind(id,at,e.path,e.referrer,e.source,e.medium,e.campaign,e.channel,e.device,e.id),
     env.DB.prepare('INSERT OR IGNORE INTO pageviews(id,session_id,at,path) VALUES(?,?,?,?)').bind(e.id,id,at,e.path)
    ]);
    return response(null,204,origin);
   }
   if(url.pathname==='/report'&&request.method==='GET'){
    if(!await authorized(request,env))return response({error:'Unauthorized'},401,origin);
    let r;try{r=range(url);}catch{return response({error:'Invalid date range or channel (maximum 90 days)'},400,origin);}
    return response(await report(env,r),200,origin);
   }
   return response({error:'Not found'},404,origin);
  }catch{return response({error:'Analytics service unavailable'},500,origin);}
 },
 async scheduled(event,env,ctx){
  const cutoff=Math.floor(Date.now()/1000)-90*DAY;
  ctx.waitUntil(env.DB.batch([env.DB.prepare('DELETE FROM pageviews WHERE at < ?').bind(cutoff),env.DB.prepare('DELETE FROM sessions WHERE started_at < ? AND NOT EXISTS (SELECT 1 FROM pageviews WHERE pageviews.session_id=sessions.id)').bind(cutoff)]));
 }
};
