import * as GS from '../assets/kits/game-scene.js';
import {WIDTH,HEIGHT,BLOCKED,START,GOAL,SEARCH,NETWORK,networkAt,walkAt,fingerprint,DURATION} from './sim.mjs';
const {THREE,clamp}=GS,W=1920,H=1080,C={text:'#f4f1e7',dim:'#b9c3bc',hero:'#8de0ba',gold:'#edc884',blue:'#93bafa',panel:'rgba(14,29,31,.95)',line:'#41615b'};
const $=id=>document.getElementById(id);
export function mount(HEAD){
  const baking=new URLSearchParams(location.search).has('render');if(baking)document.documentElement.classList.add('render');
  const ctx=$('c').getContext('2d'),stage=GS.createStage({W,H,tone:'aces',exposure:1.25,sky:null,background:'#13282b',shadows:{size:512,extent:30},hemi:{sky:'#d7e6d7',ground:'#354840',intensity:2},sun:{color:'#fff1cd',intensity:2.7,offset:[-8,18,12]}});
  stage.gl.setSize(1280,720,false);
  const P=GS.painter(ctx,{sans:'Pretendard,sans-serif',mono:'"JetBrains Mono",monospace',theme:C}),{txt,panel,chip,line,dot}=P;
  const text=(s,x,y,size=26,color=C.text,q={})=>txt(String(s),x,y,{size,color,...q});
  const tiles=new Map();
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const obstacle=BLOCKED.has([x,y].join(',')),mat=GS.flatMat(obstacle?'#63736c':'#465d50');
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.96,obstacle?1.4:.12,.96),mat);mesh.position.set(x-WIDTH/2,obstacle?.65:-.07,y-HEIGHT/2);mesh.castShadow=obstacle;mesh.receiveShadow=true;stage.scene.add(mesh);tiles.set([x,y].join(','),mesh);
  }
  const mats={top:GS.flatMat('#c7944c'),bottom:GS.flatMat('#344944'),skin:GS.flatMat('#dcb28c'),hair:GS.flatMat('#333b35'),boots:GS.flatMat('#273333'),collar:GS.flatMat('#d7c583')};
  const hero=GS.buildChar(stage,{mats,ring:C.hero,proportions:{height:.62,bulk:1.1}});
  const second=GS.buildChar(stage,{mats:{...mats,top:GS.flatMat('#6b8ba5')},ring:C.blue,proportions:{height:.62}});
  const goal=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,1.7,6),GS.flatMat('#d6bd7c'));goal.position.set(GOAL[0]-WIDTH/2,.8,GOAL[1]-HEIGHT/2);stage.scene.add(goal);
  const flag=new THREE.Mesh(new THREE.BoxGeometry(.55,.35,.04),GS.flatMat('#85d9ae'));flag.position.set(goal.position.x+.25,1.5,goal.position.z);stage.scene.add(flag);
  function grid(searchStep,pathVisible){
    const closed=new Set((searchStep?.closed||[]).map(c=>c.join(','))),open=new Set((searchStep?.open||[]).map(c=>c.join(','))),path=new Set(pathVisible?SEARCH.path.map(c=>c.join(',')):[]);
    for(const [key,tile]of tiles){let col=BLOCKED.has(key)?'#63736c':path.has(key)?'#bfa566':closed.has(key)?'#527f70':open.has(key)?'#9a8b5c':'#465d50';if(key===START.join(','))col='#6cbba0';if(key===GOAL.join(','))col='#cfb45c';tile.material.color.set(col);}
  }
  function render(t){
    t=clamp(t,0,DURATION-.001);stage.beginFrame();
    const chapter=HEAD.findIndex(h=>t>=h[0]&&t<h[1]);
    const searching=t>=6&&t<24,index=searching?Math.min(SEARCH.steps.length-1,Math.floor((t-6)/15*SEARCH.steps.length)):SEARCH.steps.length-1;
    const searchStep=SEARCH.steps[Math.max(0,index)],pathVisible=!searching||t>21;
    grid(searching?searchStep:null,pathVisible);
    let position,net=null;
    if(t<38){position=walkAt(t<6?3+t*1.2:t<24?0:(t-24)*1.5);}
    else {
      const clock=t<58?(t-38)*.2:t<74?4.5+(t-58)*.24:8+(t-74)*1.15;
      net=networkAt(Math.min(NETWORK.duration,clock));window.lockstepState=net;
      position={...net.states.A.units[0],dx:1,dy:0};
      const b=net.states.A.units[1];GS.pose(second,{x:b.x/100-WIDTH/2,z:b.y/100-HEIGHT/2,yaw:0,d:net.ticks.A*.25,k:net.pending&&clock<net.pending.broadcast?0:1,t:clock});GS.setRing(second,1);
    }
    const moving=t<38?!searching:net&&!(net.pending&&t>=58&&t<74&&net.pending.delayed&&net.states.A.tick===18);
    GS.pose(hero,{x:position.x/100-WIDTH/2,z:position.y/100-HEIGHT/2,yaw:-Math.atan2(position.dy||0,position.dx||1),d:t<38?(t-24)*1.5:net.ticks.A*.25,k:moving?1:0,t});GS.setRing(hero,1);
    GS.camSet(stage,GS.camFrom([10,13,15],[0,0,0],{fov:39,sx:-260}));stage.gl.render(stage.scene,stage.camera);ctx.drawImage(stage.gl.domElement,0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,0,240);grad.addColorStop(0,'#102326');grad.addColorStop(1,'#10232600');ctx.fillStyle=grad;ctx.fillRect(0,0,W,240);
    text('KO SEONGJONG / ZENONIA ENGINEERING',120,59,22,C.hero,{mono:true});text(chapter<0?'자동 길찾기부터 입력 동기화까지':HEAD[chapter][3],120,125,49,C.text,{weight:800});text(chapter<0?'장애물을 피해 이동하고, 같은 틱의 입력으로 같은 상태를 계산합니다.':HEAD[chapter][4],120,177,27,C.dim);
    chip('별도 구현 / 수치 예시',1800,86,C.gold,{align:'right',size:23});
    panel(1370,250,430,580,{r:17});
    if(t<38){
      text('A* / GRID SEARCH',1396,294,23,C.hero,{mono:true});
      [['GRID','12 × 9'],['MOVE','4 directions'],['g / h / f',searchStep.g+' / '+searchStep.h+' / '+searchStep.f],['PATH COST',SEARCH.cost],['CLOSED',searchStep.closed.length]].forEach(([k,v],i)=>{text(k,1396,351+i*88,21,C.dim,{mono:true});text(v,1396,389+i*88,34,C.text,{mono:true});});
      if(searching){const [x,y]=GS.proj(stage,searchStep.current[0]-WIDTH/2,.2,searchStep.current[1]-HEIGHT/2);chip('f='+searchStep.f,x,y,C.gold,{align:'center',size:23});}
    }else{
      text('LOCKSTEP / INPUTS',1396,294,23,C.hero,{mono:true});
      const pending=net.pending,common=net.common;
      [['SERVER',net.ticks.server],['CLIENT A',net.ticks.A],['CLIENT B',net.ticks.B]].forEach(([name,tick],i)=>{text(name,1396,350+i*67,22,C.dim,{mono:true});text('TICK '+tick,1766,350+i*67,27,C.text,{align:'right',mono:true});});
      text('공통 TICK / '+common,1396,574,25,C.gold,{mono:true});
      const snapshots=['server','A','B'].map(name=>NETWORK.history[name][common]);const equal=snapshots.every(s=>JSON.stringify(s)===JSON.stringify(snapshots[0]));
      text(fingerprint(snapshots[0]),1396,621,34,C.hero,{mono:true});chip(equal?'전체 상태 일치':'상태 불일치',1396,673,C.hero,{size:24});
      text('메시지: tick + input',1396,733,23,C.dim,{mono:true});text('위치 스냅숏 전송 없음',1396,775,23,C.dim);
      const clock=t<58?(t-38)*.2:t<74?4.5+(t-58)*.24:8+(t-74)*1.15;
      const y=750,x0=165,x1=630,x2=1100;
      panel(120,693,1160,145,{r:14});
      text('CLIENT A',x0,732,21,C.hero,{mono:true});text('SERVER',x1,732,21,C.gold,{mono:true});text('CLIENT B',x2,732,21,C.blue,{mono:true});
      line(x0+45,770,x1+25,770,C.line,3);line(x2+35,798,x1+25,798,C.line,3);
      if(pending){
        const flight=(start,end,xa,xb,color,y)=>{if(clock>=start&&clock<=end){const k=(clock-start)/(end-start);dot(xa+(xb-xa)*k,y,9,color,1,5);}};
        flight(pending.sendA,pending.arriveA,x0+45,x1+25,C.hero,770);flight(pending.sendB,pending.arriveB,x2+35,x1+25,C.blue,798);
        const waiting=clock>=pending.arriveA&&clock<pending.arriveB;
        text(waiting?'B 입력 대기':'틱 '+pending.tick+' 입력 수집',x1+25,818,22,waiting?C.gold:C.dim,{align:'center'});
      }
    }
    const caption=chapter<0?'목적지를 지정하면 A* 경로를 찾고, 장애물을 피해 자동으로 이동합니다.':[
      'g+h가 작은 후보부터 탐색하고, 이 격자에서 비용 17의 최단 경로를 찾습니다.',
      '계산한 경로의 경유점을 순서대로 따라가며 캐릭터를 이동시킵니다.',
      '서버가 같은 틱의 입력을 모아, 모든 모델에 같은 순서로 전달합니다.',
      'B의 입력이 늦으면 틱을 기다립니다. 도착한 뒤 같은 입력 묶음으로 재개합니다.',
      '서로 다른 최신 틱 대신, 세 모델이 모두 처리한 같은 틱의 전체 상태를 비교합니다.'
    ][chapter];
    panel(120,874,1680,95,{r:14});text(caption,147,918,29,C.text,{weight:600});text('별도 브라우저 시연 · 실제 제노니아 화면·프로토콜 아님 · 네트워크 시간 모사 · 수치는 예시',147,951,21,C.dim);line(120,1038,1800,1038,C.line,4);line(120,1038,120+1680*t/DURATION,1038,C.hero,4);
  }
  window.renderAt=render;window.DURATION=DURATION;window.ready=Promise.all([document.fonts.load('500 30px Pretendard'),document.fonts.load('500 24px "JetBrains Mono"')]).then(()=>render(3.4));
  if(baking)return;
  let t=0,playing=false,rate=1,last=0,started=false;
  const ui=()=>{$('time').textContent=`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')} / 1:30`;$('scrub').value=t;$('big').hidden=playing;$('play').textContent=playing?'Ⅱ':'▶';$('rate').textContent=rate+'×';};
  const play=()=>{if(t>=90)t=0;playing=true;started=true;last=performance.now();ui();};
  const toggle=()=>{if(playing){playing=false;ui();}else play();};const seek=x=>{t=clamp(x,0,90);started=true;render(t);ui();};
  HEAD.forEach(([s,e,n,title])=>{const b=document.createElement('button');b.textContent=n+' '+title;b.onclick=()=>{seek(s+.02);play();};$('chapters').append(b);});$('big').onclick=toggle;$('play').onclick=toggle;$('scrub').oninput=e=>seek(+e.target.value);$('rate').onclick=()=>{const rates=[1,.75,.5];rate=rates[(rates.indexOf(rate)+1)%3];ui();};
  const frame=now=>{if(playing){t=Math.min(90,t+Math.min(.12,(now-last)/1000)*rate);if(t===90)playing=false;render(t);ui();}last=now;requestAnimationFrame(frame);};window.ready.then(()=>{const deep=/^#ch(\d\d)$/.exec(location.hash),row=deep&&HEAD.find(h=>h[2]===deep[1]);if(row)seek(row[0]+.02);ui();last=performance.now();requestAnimationFrame(frame);});
}
