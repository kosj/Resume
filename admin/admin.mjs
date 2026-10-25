import {API_BASE} from '../analytics/config.mjs';
import {demoReport} from './demo.mjs';
const $=id=>document.getElementById(id),fmt=v=>new Intl.NumberFormat('ko-KR').format(v);
const labels={utm:'UTM 캠페인',search:'검색',social:'SNS',referral:'외부 링크',direct:'직접 / 알 수 없음'};
const state={mode:'disconnected',token:'',api:'',data:null,request:0,abort:null};
const today=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
function setDays(n){$('to').value=today();$('from').value=new Date(Date.parse(today()+'T00:00:00+09:00')-(n-1)*86400000+32400000).toISOString().slice(0,10);}
setDays(30);
try{$('api').value=API_BASE||localStorage.getItem('resume.analytics.api')||'';}catch{$('api').value=API_BASE;}
if(API_BASE)$('setup-note').textContent='수집 API가 설정되어 있습니다. 관리자 키를 입력해 조회하세요.';
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function mode(value){state.mode=value;$('mode').textContent={disconnected:'연결 전',demo:'예시 데이터',live:'실제 데이터'}[value];$('demo-banner').hidden=value!=='demo';$('logout').hidden=value==='disconnected';$('connection').hidden=value==='live';$('demo').textContent=value==='demo'?'예시 화면 닫기':'예시 데이터로 둘러보기';}
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function empty(container,text='선택한 기간에 기록이 없습니다.'){container.replaceChildren(node('p',text,'empty'));}
function clear(){state.data=null;for(const id of ['visits','views','attributed','campaigns'])$(id).textContent='—';for(const id of ['sources','devices','chart'])empty($(id),'분석 API에 연결하거나 예시 데이터를 선택하세요.');for(const id of ['landings','pages','campaign-table'])$(id).replaceChildren();$('updated').textContent='아직 조회하지 않음';$('export').disabled=true;}
function rows(id,data,fields,total){
 const body=$(id);body.replaceChildren();if(!data.length){const r=node('tr'),td=node('td','선택한 기간에 기록이 없습니다.');td.colSpan=fields.length;td.className='muted';r.append(td);body.append(r);return;}
 for(const row of data){const r=node('tr');for(const field of fields){const val=field==='share'?(total?(row.visits??row.views)/total*100:0).toFixed(1)+'%':row[field]??'—';r.append(node('td',typeof val==='number'?fmt(val):val,['visits','views','share'].includes(field)?'num':''));}body.append(r);}
}
function bars(id,data,total,isDevices=false){
 const box=$(id);box.replaceChildren();if(!data.length){empty(box);return;}
 for(const row of data){const item=node('div',undefined,'source-row'),label=node('div',undefined,'source-label'),name=node('span',isDevices?(row.device==='touch'?'터치 포인터':'마우스 / 트랙패드'):row.label==='direct'?'직접 / 알 수 없음':row.label);if(!isDevices)name.append(node('small',labels[row.channel]));label.append(name,node('b',fmt(row.visits)));const bar=node('div',undefined,'bar'),fill=node('span');fill.style.width=Math.min(100,total?row.visits/total*100:0)+'%';bar.append(fill);item.append(label,bar);box.append(item);}
}
function chart(data){
 const box=$('chart');if(!data.some(d=>d.visits||d.views)){empty(box,'선택한 기간에 기록이 없습니다. 공유 링크를 통해 첫 방문을 확인하세요.');return;}
 const ns='http://www.w3.org/2000/svg',make=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
 const width=Math.max(280,Math.round(box.getBoundingClientRect().width));
 const svg=make('svg',{viewBox:`0 0 ${width} 250`,role:'img','aria-label':'날짜별 방문 세션과 페이지 조회 추이. 정확한 값은 CSV로 내보낼 수 있습니다.'});
 const max=Math.max(4,...data.map(d=>Math.max(d.visits,d.views))),x=i=>52+i/Math.max(1,data.length-1)*(width-80),y=v=>210-v/max*180;
 for(let i=0;i<5;i++){const v=max*i/4,yy=y(v);svg.append(make('line',{x1:52,y1:yy,x2:width-28,y2:yy,stroke:'#e8ede6'}),make('text',{x:38,y:yy+4,fill:'#819182','font-size':12,'text-anchor':'end'},Math.round(v)));}
 for(const[key,color]of[['views','#b48c51'],['visits','#2d7257']]){
  const path=data.map((d,i)=>(i?'L':'M')+x(i)+','+y(d[key])).join(' ');svg.append(make('path',{d:path,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round'}));
  data.forEach((d,i)=>{const circle=make('circle',{cx:x(i),cy:y(d[key]),r:3,fill:color});circle.append(make('title',{},d.day+' · '+(key==='views'?'조회 ':'방문 ')+d[key]));svg.append(circle);});
 }
 for(const i of [...new Set([0,Math.floor((data.length-1)/2),data.length-1])])svg.append(make('text',{x:x(i),y:241,fill:'#819182','font-size':12,'text-anchor':i===0?'start':i===data.length-1?'end':'middle'},data[i].day.slice(5)));
 box.replaceChildren(svg);
}
function render(data){state.data=data;for(const id of ['visits','views','attributed','campaigns'])$(id).textContent=fmt(data.summary[id]);chart(data.daily);bars('sources',data.sources,data.summary.visits);bars('devices',data.devices,data.summary.visits,true);rows('landings',data.landings,['path','visits','share'],data.summary.visits);rows('pages',data.pages,['path','views','share'],data.summary.views);rows('campaign-table',data.campaigns,['source','medium','campaign','visits']);$('updated').textContent=(state.mode==='demo'?'예시 생성: ':'마지막 조회: ')+new Date(data.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});$('export').disabled=false;}
function dates(){const from=$('from').value,to=$('to').value;const days=(Date.parse(to)-Date.parse(from))/86400000+1;if(!from||!to||!Number.isFinite(days)||days<1||days>90)throw Error('조회 기간은 1일부터 90일 사이로 선택하세요.');return{from,to,channel:$('channel').value};}
async function load(){
 let r;try{r=dates();}catch(e){status(e.message,true);return;}
 if(state.mode==='disconnected'){status('먼저 분석 API에 연결하거나 예시 데이터를 선택하세요.');return;}
 const request=++state.request;state.abort?.abort();state.abort=new AbortController();$('refresh').disabled=true;$('export').disabled=true;status('데이터를 조회하고 있습니다.');
 try{
  let data;if(state.mode==='demo'){data=demoReport(r.from,r.to,r.channel);}else{
   const url=new URL('/report',state.api);for(const[k,v]of Object.entries(r))url.searchParams.set(k,v);
   const timeout=setTimeout(()=>state.abort?.abort(),15000);let result;
   try{result=await fetch(url,{headers:{Authorization:'Bearer '+state.token},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:state.abort.signal});}finally{clearTimeout(timeout);}
   if(result.status===401){state.token='';mode('disconnected');$('token').value='';clear();throw Error('관리자 키가 올바르지 않습니다. 다시 연결하세요.');}
   if(!result.ok)throw Error('데이터 조회에 실패했습니다. API 설정과 서버 상태를 확인하세요. ('+result.status+')');
   data=await result.json();
  }
  if(request!==state.request)return;render(data);status(state.mode==='demo'?'예시 데이터를 표시합니다. 실제 방문 기록이 아닙니다.':data.summary.views?'최신 데이터를 표시합니다. 한국 시간 기준으로 집계합니다.':'연결되었습니다. 선택한 기간에는 아직 수집된 방문이 없습니다.');
 }catch(e){if(request===state.request){$('export').disabled=true;status(e.name==='AbortError'?'조회가 취소되었거나 응답 시간이 초과되었습니다. 다시 조회하세요.':e.message+(state.data?' 현재 화면은 이전 조회 결과입니다.':''),true);}}finally{if(request===state.request)$('refresh').disabled=false;}
}
$('connect-form').addEventListener('submit',async event=>{event.preventDefault();let api;
 try{api=new URL($('api').value.trim());const local=['localhost','127.0.0.1'];if(api.protocol!=='https:'&&!(api.protocol==='http:'&&local.includes(api.hostname)&&local.includes(location.hostname)))throw Error();if(api.username||api.password||api.search||api.hash)throw Error();}catch{status('HTTPS API 주소를 입력하세요. 로컬 개발 주소는 로컬 화면에서만 허용됩니다.',true);return;}
 if($('token').value.length<32){status('관리자 키는 최소 32자여야 합니다.',true);return;}
 state.abort?.abort();state.request++;state.token=$('token').value;$('token').value='';state.api=api.origin;clear();mode('live');try{localStorage.setItem('resume.analytics.api',api.origin);}catch{}await load();
});
$('logout').onclick=()=>{state.abort?.abort();state.request++;state.token='';$('token').value='';mode('disconnected');clear();$('refresh').disabled=false;status('로그아웃했습니다. 관리자 키는 저장하지 않습니다.');};
$('demo').onclick=()=>{state.abort?.abort();state.request++;state.token='';$('token').value='';clear();if(state.mode==='demo'){mode('disconnected');$('refresh').disabled=false;status('실제 데이터는 API 연결 후 조회할 수 있습니다.');}else{mode('demo');load();}};
$('filters').onsubmit=e=>{e.preventDefault();load();};document.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{setDays(+b.dataset.days);load();});
function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return'"'+text.replaceAll('"','""')+'"';}
$('export').onclick=()=>{if(!state.data)return;const d=state.data,lines=[['데이터',state.mode==='demo'?'예시':'실제'],['기간',d.range.from,d.range.to],['유형',d.range.channel],[],['날짜','방문 세션','페이지 조회'],...d.daily.map(r=>[r.day,r.visits,r.views]),[],['출처','유입 유형','방문'],...d.sources.map(r=>[r.label,labels[r.channel],r.visits]),[],['진입 페이지','방문'],...d.landings.map(r=>[r.path,r.visits]),[],['캠페인 출처','매체','캠페인','방문'],...d.campaigns.map(r=>[r.source,r.medium,r.campaign,r.visits]),[],['페이지','조회'],...d.pages.map(r=>[r.path,r.views]),[],['입력 기기','방문'],...d.devices.map(r=>[r.device,r.visits])];const url=URL.createObjectURL(new Blob(['\ufeff'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download=`resume-${state.mode}-${d.range.from}-${d.range.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('utm-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),url=new URL('https://kosj.github.io/Resume/');for(const key of ['source','medium','campaign']){const value=String(f.get(key)||'').trim();if((key!=='campaign'&&!value)||!/^([\p{L}\p{N}_. -]{0,80})$/u.test(value)){status('출처·매체는 필수이며 문자·숫자·공백·점·밑줄·하이픈을 사용할 수 있습니다.',true);return;}if(value)url.searchParams.set('utm_'+key,value);}url.hash=String(f.get('section')||'');$('utm-link').value=url.href;$('copy').disabled=false;status('공유 링크를 만들었습니다. 복사해 사용하세요.');};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('utm-link').value);status('공유 링크를 복사했습니다.');}catch{$('utm-link').select();status('링크를 선택했습니다. 복사 단축키를 사용하세요.');}};

let lastChartWidth=0;new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width!==lastChartWidth){lastChartWidth=width;if(state.data)chart(state.data.daily);}}).observe($('chart'));
