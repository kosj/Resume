// Explicit opt-in preview data. Never posted to the collection API.
export function demoReport(from,to,channel='all'){
 const sources=[['search','www.google.com','','',''],['social','www.linkedin.com','','',''],['utm','','linkedin','social','resume_2026'],['utm','','wanted','profile','game_client'],['referral','github.com','','',''],['direct','','','','']];
 const root='/Resume/',paths=[root,root+'dedicated-demo/',root+'fps-demo/',root+'zenonia-demo/'];
 const sessions=[],daily=[];
 for(let d=Date.parse(from+'T00:00:00+09:00'),end=Date.parse(to+'T00:00:00+09:00');d<=end;d+=86400000){
  const day=new Date(d+32400000).toISOString().slice(0,10),seed=Math.floor(d/86400000),count=6+((seed*7)%17);
  let visits=0,views=0;
  for(let i=0;i<count;i++){const [c,referrer,source,medium,campaign]=sources[(seed+i)%sources.length];if(channel!=='all'&&channel!==c)continue;const s={channel:c,label:source||referrer||'direct',source,medium,campaign,path:paths[(i+seed)%paths.length],device:i%3?'desktop':'touch',views:1+i%3};sessions.push(s);visits++;views+=s.views;}
  daily.push({day,visits,views});
 }
 const group=(key,value='visits')=>{const m=new Map();for(const s of sessions){const obj=key(s);if(!obj)continue;const k=JSON.stringify(obj);m.set(k,{...obj,[value]:(m.get(k)?.[value]||0)+(value==='views'?s.views:1)});}return[...m.values()].sort((a,b)=>b[value]-a[value]);};
 return{range:{from,to,channel,timezone:'Asia/Seoul'},summary:{visits:sessions.length,views:sessions.reduce((n,s)=>n+s.views,0),attributed:sessions.filter(s=>s.channel!=='direct').length,campaigns:sessions.filter(s=>s.channel==='utm').length},daily,sources:group(s=>({channel:s.channel,label:s.label})),landings:group(s=>({path:s.path})),pages:group(s=>({path:s.path}),'views'),campaigns:group(s=>s.source?{source:s.source,medium:s.medium,campaign:s.campaign}:null),devices:group(s=>({device:s.device})),generatedAt:new Date().toISOString()};
}
