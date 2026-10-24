import * as GS from '../assets/kits/game-scene.js';
import {WIDTH,HEIGHT,BLOCKED,START,GOAL,SEARCH,NETWORK,networkAt,walkAt,fingerprint,DURATION} from './sim.mjs';
import {battleAt,BATTLE_SEARCH,BATTLE_TARGET,BATTLE_HZ} from './battle.mjs';
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
  const party=[hero,
    GS.buildChar(stage,{mats:{...mats,top:GS.flatMat('#638aaa'),collar:GS.flatMat('#bfcee1')},ring:C.blue,proportions:{height:.62}}),
    GS.buildChar(stage,{mats:{...mats,top:GS.flatMat('#70a384'),collar:GS.flatMat('#d7e3b1')},ring:C.hero,proportions:{height:.62}})];
  for(const actor of party.slice(1)){const staff=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1.8,5),GS.flatMat('#a5a482'));staff.position.set(.25,.3,.3);actor.chest.add(staff);}
  const monsterParts=[
    [new THREE.BoxGeometry(.52,.65,.42),.62],
    [new THREE.IcosahedronGeometry(.27,0),1.12],
    [new THREE.BoxGeometry(.4,.3,.3),.15]
  ].map(([geometry,height])=>{const mesh=new THREE.InstancedMesh(geometry,GS.flatMat('#8b7594'),24);mesh.castShadow=true;stage.scene.add(mesh);return {mesh,height};});
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();
  function grid(searchStep,pathVisible,route=SEARCH.path){
    const closed=new Set((searchStep?.closed||[]).map(c=>c.join(','))),open=new Set((searchStep?.open||[]).map(c=>c.join(','))),path=new Set(pathVisible?route.map(c=>c.join(',')):[]);
    for(const [key,tile]of tiles){let col=BLOCKED.has(key)?'#63736c':path.has(key)?'#bfa566':closed.has(key)?'#527f70':open.has(key)?'#9a8b5c':'#465d50';if(key===START.join(','))col='#6cbba0';if(key===(route.at(-1)||GOAL).join(','))col='#cfb45c';tile.material.color.set(col);}
  }
  function render(t){
    t=clamp(t,0,DURATION-.001);stage.beginFrame();
    const chapter=HEAD.findIndex(h=>t>=h[0]&&t<h[1]);
    const isBattle=t<50,searching=t>=6&&t<24;
    const battle=isBattle?battleAt(t<6?8+t*1.25:searching?0:t-24):null;
    window.partyBattleState=battle;
    const activeSearch=isBattle?BATTLE_SEARCH:SEARCH;
    const index=searching?Math.min(activeSearch.steps.length-1,Math.floor((t-6)/15*activeSearch.steps.length)):activeSearch.steps.length-1;
    const searchStep=activeSearch.steps[Math.max(0,index)],pathVisible=!searching||t>21;
    const route=isBattle?(searching?BATTLE_SEARCH.path:battle.units[0].path):SEARCH.path;
    grid(searching?searchStep:null,pathVisible,route);
    goal.visible=flag.visible=!isBattle;
    let net=null;
    if(isBattle){
      battle.units.forEach((unit,i)=>{const latest=battle.effects.filter(e=>e.from===unit.id).at(-1);const attack=latest?(battle.tick-latest.tick)/BATTLE_HZ:99;
        GS.pose(party[i],{x:unit.x/100-WIDTH/2+(i===2?.15:0),z:unit.y/100-HEIGHT/2+(i===2?.12:0),yaw:-Math.atan2(unit.dy,unit.dx||.001),d:unit.distance/100,k:unit.phase==='MOVE'?1:0,aim:attack<.3?1:0,t:battle.tick/BATTLE_HZ});GS.setRing(party[i],1);});
      for(const {mesh,height} of monsterParts){mesh.visible=true;
        battle.enemies.forEach((enemy,i)=>{const last=battle.effects.filter(e=>e.type==='damage'&&e.enemy===enemy.id).at(-1);const age=last?(battle.tick-last.tick)/BATTLE_HZ:99;
          const scale=enemy.hp>0?1:Math.max(0,1-age/.5);
          matrix.compose(new THREE.Vector3(enemy.x/100-WIDTH/2,height*scale,enemy.y/100-HEIGHT/2),quaternion,new THREE.Vector3(scale,scale,scale));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(age<.2?C.gold:'#b7a2c6'));});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
    } else {
      monsterParts.forEach(({mesh})=>mesh.visible=false);
      const clock=t<66?(t-50)*.25:t<80?4.5+(t-66)*.28:8+(t-80)*1.71;
      net=networkAt(Math.min(NETWORK.duration,clock));window.lockstepState=net;
      const a=net.states.A.units[0],b=net.states.A.units[1];
      GS.pose(hero,{x:a.x/100-WIDTH/2,z:a.y/100-HEIGHT/2,yaw:0,d:net.ticks.A*.25,k:1,t:clock});GS.setRing(hero,1);
      GS.pose(second,{x:b.x/100-WIDTH/2,z:b.y/100-HEIGHT/2,yaw:0,d:net.ticks.A*.25,k:net.pending&&clock<net.pending.broadcast?0:1,t:clock});GS.setRing(second,1);
    }
    const battleClose=isBattle&&!searching;
    const center=battleClose?[battle.units[0].x/100-WIDTH/2,.3,battle.units[0].y/100-HEIGHT/2]:[0,0,0];
    GS.camSet(stage,GS.camFrom(battleClose?[center[0]+7,10,center[2]+10]:[10,13,15],center,{fov:41,sx:-230}));stage.gl.render(stage.scene,stage.camera);ctx.drawImage(stage.gl.domElement,0,0,W,H);
    if(isBattle){
      const point=(x,y,height=1)=>GS.proj(stage,x/100-WIDTH/2,height,y/100-HEIGHT/2);
      const selected=searching?BATTLE_TARGET:battle.enemies.find(e=>e.id===battle.units[0].target&&e.hp>0);
      if(selected){const [x,y]=point(selected.x,selected.y,2);if(x>120&&x<1300&&y>220&&y<830)chip('대상 M'+selected.id,x,y,C.gold,{align:'center',size:20});}
      for(const enemy of battle.enemies){if(enemy.hp<=0)continue;const [x,y]=point(enemy.x,enemy.y,1.55);if(x<100||x>1310||y<220||y>840)continue;panel(x-23,y,46,5,{fill:'#273f3b',stroke:null,r:2});panel(x-23,y,46*enemy.hp/enemy.maxHp,5,{fill:'#c5a7d6',stroke:null,r:2});}
      for(const effect of battle.effects){const age=(battle.tick-effect.tick)/BATTLE_HZ;if(age>.65)continue;const k=age/.65;
        const [x,y]=point(effect.x,effect.y,1.3);
        if(effect.type==='damage'||effect.type==='heal'){text((effect.type==='heal'?'+':'−')+effect.value,x,y-age*65,23,effect.type==='heal'?C.hero:C.gold,{align:'center',weight:800,alpha:1-k});}
        else {const [tx,ty]=point(effect.tx,effect.ty,1.15);line(x,y,tx,ty,effect.type==='enemy'?'#d6a5ad':effect.type==='aoe'?C.blue:C.gold,3,1-k);dot(x+(tx-x)*Math.min(1,k*3),y+(ty-y)*Math.min(1,k*3),5,effect.type==='aoe'?C.blue:C.gold,1-k,6);
          if(effect.type==='aoe'){const corners=[[effect.tx+150,effect.ty],[effect.tx,effect.ty+150],[effect.tx-150,effect.ty],[effect.tx,effect.ty-150]].map(([a,b])=>point(a,b,.1));ctx.save();ctx.globalAlpha=.23*(1-k);ctx.fillStyle=C.blue;ctx.beginPath();corners.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fill();ctx.restore();}}
      }
      battle.units.forEach((unit,i)=>{const [x,y]=point(unit.x,unit.y,1.9+i*.25);if(x>120&&x<1300&&y>215&&y<835)chip(unit.name,x,y,i===1?C.blue:C.hero,{align:'center',size:18});});
    }
    const grad=ctx.createLinearGradient(0,0,0,240);grad.addColorStop(0,'#102326');grad.addColorStop(1,'#10232600');ctx.fillStyle=grad;ctx.fillRect(0,0,W,240);
    text('KO SEONGJONG / ZENONIA ENGINEERING',120,59,22,C.hero,{mono:true});text(chapter<0?'대상을 찾아 파티로 자동 전투':HEAD[chapter][3],120,125,49,C.text,{weight:800});text(chapter<0?'3인 AI 파티 · 24마리 몬스터 · A* 접근 · 근접·광역·회복':HEAD[chapter][4],120,177,27,C.dim);
    chip('별도 구현 / 수치 예시',1800,86,C.gold,{align:'right',size:23});
    panel(1370,250,430,580,{r:17});
    if(isBattle){
      text(searching?'TARGET SEARCH / A*':'PARTY / AUTO BATTLE',1396,294,22,C.hero,{mono:true});
      if(searching){
        [['MONSTERS',24],['TARGET','M'+BATTLE_TARGET.id],['g / h / f',searchStep.g+' / '+searchStep.h+' / '+searchStep.f],['PATH COST',BATTLE_SEARCH.cost],['CLOSED',searchStep.closed.length]].forEach(([k,v],i)=>{text(k,1396,351+i*88,21,C.dim,{mono:true});text(v,1396,389+i*88,34,C.text,{mono:true});});
        const [x,y]=GS.proj(stage,searchStep.current[0]-WIDTH/2,.2,searchStep.current[1]-HEIGHT/2);chip('f='+searchStep.f,x,y,C.gold,{align:'center',size:23});
      }else{
        battle.units.forEach((unit,i)=>{const y=345+i*105;text(unit.name+' / '+unit.role,1396,y,23,i===1?C.blue:C.hero);text(unit.phase+'  HP '+unit.hp,1396,y+34,23,C.text,{mono:true});text(unit.target===null?'대상 없음':'TARGET M'+unit.target,1396,y+65,18,C.dim,{mono:true});});
        text('몬스터 '+(24-battle.kills)+' / 24',1396,702,30,C.gold);text('처치 '+battle.kills+' · 회복 '+battle.healing,1396,751,25,C.hero);text('AI 파티 · 수치 예시',1396,799,20,C.dim);
      }
    }else{
      text('LOCKSTEP / INPUTS',1396,294,23,C.hero,{mono:true});
      const pending=net.pending,common=net.common;
      [['SERVER',net.ticks.server],['CLIENT A',net.ticks.A],['CLIENT B',net.ticks.B]].forEach(([name,tick],i)=>{text(name,1396,350+i*67,22,C.dim,{mono:true});text('TICK '+tick,1766,350+i*67,27,C.text,{align:'right',mono:true});});
      text('공통 TICK / '+common,1396,574,25,C.gold,{mono:true});
      const snapshots=['server','A','B'].map(name=>NETWORK.history[name][common]);const equal=snapshots.every(s=>JSON.stringify(s)===JSON.stringify(snapshots[0]));
      text(fingerprint(snapshots[0]),1396,621,34,C.hero,{mono:true});chip(equal?'전체 상태 일치':'상태 불일치',1396,673,C.hero,{size:24});
      text('메시지: tick + input',1396,733,23,C.dim,{mono:true});text('위치 스냅숏 전송 없음',1396,775,23,C.dim);
      const clock=t<66?(t-50)*.25:t<80?4.5+(t-66)*.28:8+(t-80)*1.71;
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
    const caption=chapter<0?'전사·마법사·지원가가 대상을 찾아 이동하고, 다수의 몬스터와 싸웁니다.':[
      '도달 가능한 몬스터 중 경로 비용이 가장 작은 대상을 고르고 A*로 접근합니다.',
      'A* 이동 → 사거리 확인 → 근접·광역 공격, 지원가는 실제 손실 HP를 회복합니다.',
      '서버가 같은 틱의 입력을 모아, 모든 모델에 같은 순서로 전달합니다.',
      'B의 입력이 늦으면 틱을 기다립니다. 도착한 뒤 같은 입력 묶음으로 재개합니다.',
      '서로 다른 최신 틱 대신, 세 모델이 모두 처리한 같은 틱의 전체 상태를 비교합니다.'
    ][chapter];
    panel(120,874,1680,95,{r:14});text(caption,147,918,29,C.text,{weight:600});text('별도 브라우저 시연 · 실제 제노니아 화면·프로토콜 아님 · 파티원은 AI · 네트워크 시간 모사 · 수치는 예시',147,951,21,C.dim);line(120,1038,1800,1038,C.line,4);line(120,1038,120+1680*t/DURATION,1038,C.hero,4);
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
