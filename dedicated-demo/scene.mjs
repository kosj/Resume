import * as GS from '../assets/kits/game-scene.js';
import {DURATION,stateAt} from './sim.mjs';
const {THREE,clamp}=GS,W=1920,H=1080;
const C={text:'#edf3fa',dim:'#aabbd0',A:'#69d9eb',server:'#f0be73',B:'#b5a0f0',line:'#344963',panel:'#101e31'};
export function mount(HEAD){
const $=id=>document.getElementById(id),baking=new URLSearchParams(location.search).has('render');if(baking)document.documentElement.classList.add('render');
const ctx=$('c').getContext('2d'),P=GS.painter(ctx,{sans:'Pretendard,sans-serif',mono:'"JetBrains Mono",monospace',theme:{...C,client:C.A}}),{txt,panel,line,dot}=P;
const text=(s,x,y,size=26,color=C.text,q={})=>txt(String(s),x,y,{size,color,...q});
const stage=GS.createStage({W,H,sky:null,background:'#1b2b40',tone:'aces',exposure:1.3,shadows:{size:256,extent:20},hemi:{sky:'#e0edff',ground:'#4b6079',intensity:2},sun:{color:'#fff0dc',intensity:2.7}});stage.gl.setSize(640,360,false);
function box(size,pos,color){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),GS.flatMat(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;stage.scene.add(m);return m;}
box([12,.2,8],[0,-.15,0],'#3d536e');const grid=new THREE.GridHelper(12,12,'#7094b4','#4d6682');grid.position.y=.01;stage.scene.add(grid);
box([.35,1.4,4],[4,.6,0],'#637a91');box([1.3,.8,1.3],[2,.4,-2.2],'#879aab');
const mats={top:GS.flatMat('#409aad'),bottom:GS.flatMat('#364c6b'),skin:GS.flatMat('#e1b58f'),hair:GS.flatMat('#26374a'),boots:GS.flatMat('#253347'),collar:GS.flatMat('#d7dfeb')};
const hero=GS.buildChar(stage,{mats,ring:C.A,proportions:{height:.7}});const weapon=box([.15,.15,.65],[0,0,0],'#a9c2d6');hero.chest.add(weapon);weapon.position.set(.25,.2,.45);
const ally=GS.buildChar(stage,{mats:{...mats,top:GS.flatMat('#8d6fb5')},ring:C.B,proportions:{height:.7}});
const enemy=GS.buildChar(stage,{mats:{...mats,top:GS.flatMat('#a56a65')},ring:'#db9d88',proportions:{height:.8}});
const prop=box([.8,.8,.8],[2.5,.4,2.3],C.server);
const lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:C.server}));stage.scene.add(lamp);
const fixed=[...stage.scene.children].filter(o=>o.isMesh);function setWire(on){for(const mesh of fixed){if(!mesh.material||Array.isArray(mesh.material))continue;mesh.material.wireframe=on;}for(const actor of[hero,ally,enemy])actor.root.traverse(m=>{if(m.isMesh&&m.material)m.material.wireframe=on;});}
const captions=[
 '입력은 클라이언트에서 시작하고, 전투 결과는 서버 권한으로 확정합니다.',
 'CharacterMovement: 로컬 예측 → 이동 전달 → 서버 보정 → 미확인 이동 재실행',
 '자신이 소유한 Pawn으로 요청합니다. 서버가 소유권·주기·탄약·사거리를 검사합니다.',
 'HP는 복제 프로퍼티로 유지하고 OnRep_Health에서 HUD를 갱신합니다.',
 '재접속하면 현재 HP를 받습니다. 관련성이 생긴 프랍도 현재 상태를 받습니다.',
 '서버 권한·소유권·복제 범위를 나누고, 지속 상태와 일회성 연출을 구분합니다.'
];
const snippets=[
 ['NM_DedicatedServer','게임 로직·충돌·복제 실행','로컬 플레이어·게임 화면 없음'],
 ['AutonomousProxy → Server','SavedMove → ACK / Correction','미확인 이동 재실행'],
 ['UFUNCTION(Server, Reliable)','ServerFire(AimDirection)','서버에서 조건 검사 후 ApplyDamage'],
 ['UPROPERTY(ReplicatedUsing=OnRep_Health)','float Health;','OnRep_Health() → UpdateHUD()'],
 ['Initial replication → current Health','Net Relevancy → client별 대상 선택','지속 상태는 과거 Multicast 없이 복원'],
 ['GameMode: 서버에만 존재','GameState: 복제 가능한 공용 상태','PlayerController: 서버 + 소유 클라이언트']
];
function render(t){
 t=clamp(t,0,DURATION-.001);const s=stateAt(t),clock=s.visualTime;window.dedicatedState=s;
 const ch=Math.max(0,HEAD.findIndex(h=>t>=h[0]&&t<h[1]));ctx.fillStyle='#081322';ctx.fillRect(0,0,W,H);
 text('UNREAL ENGINE / DEDICATED SERVER',120,56,23,C.A,{mono:true});text(HEAD[ch][3],120,123,49,C.text,{weight:800});text(HEAD[ch][4],120,177,27,C.dim);text('별도 기술 재현 · 4배 느리게 표시',1800,54,23,C.server,{align:'right'});
 const xs=[120,700,1280],names=['CLIENT A','DEDICATED SERVER','CLIENT B'],keys=['A','server','B'],colors=[C.A,C.server,C.B];
 for(let i=0;i<3;i++){
  const x=xs[i],key=keys[i],st=s[key],off=i===2&&!s.B.connected;
  panel(x,213,520,411,{fill:C.panel,stroke:C.line,r:14});text(names[i],x+22,249,25,colors[i],{mono:true,weight:700});
  const px=i===0?s.A.x:i===1?s.server.x:s.B.previous===undefined?s.B.x:s.B.previous+(s.B.x-s.B.previous)*Math.min(1,(clock-(s.B.positionTime||0))/.1);
  GS.pose(hero,{x:px,z:0,yaw:-Math.PI/2,d:(px+4)*2,k:clock<4.7?1:0,t:clock,aim:clock>=5?1:0});GS.setRing(hero,1);
  GS.pose(ally,{x:-2.8,z:2,yaw:-Math.PI/2,d:0,k:0,t:clock});GS.setRing(ally,1);ally.root.visible=key!=='B'||!off;
  GS.pose(enemy,{x:1.7,z:0,yaw:Math.PI/2,d:0,k:0,t:clock});GS.setRing(enemy,1);
  const hit=(key==='server'?s.events.filter(e=>e.kind==='HIT'):s.effects.filter(e=>e.client===key&&e.type==='hit')).at(-1);
  const shot=key==='server'?s.events.filter(e=>e.kind==='HIT').at(-1):s.effects.filter(e=>e.client===key&&e.type==='muzzle').at(-1);
  const age=shot?clock-shot.time:99;lamp.visible=age>=0&&age<.25;lamp.position.set(px+(1.7-px)*Math.min(1,age/.25),1,0);
  enemy.root.scale.setScalar(hit&&clock-hit.time<.12?1.05:1);prop.visible=key!=='B'||!!s.B.prop;
  setWire(i===1);GS.camSet(stage,GS.camFrom([4.5,6,8.5],[-.4,.2,0],{fov:43}));stage.gl.render(stage.scene,stage.camera);ctx.drawImage(stage.gl.domElement,x+8,265,504,283.5);
  if(!off){
   const project=(wx,wy,wz)=>{const [a,b]=GS.proj(stage,wx,wy,wz);return[x+8+a/W*504,265+b/H*283.5];};
   const [hx,hy]=project(1.7,2.2,0);panel(hx-27,hy,54,6,{fill:'#422c34',stroke:null,r:2});panel(hx-27,hy,54*st.hp/100,6,{fill:'#eead89',stroke:null,r:2});
   if(age>=0&&age<.25){const [sx,sy]=project(px,1,0),[tx,ty]=project(1.7,1,0);line(sx,sy,tx,ty,colors[i],3,1-age/.25);dot(tx,ty,6,colors[i],1-age/.25,4);}
   if(hit&&clock-hit.time<.35){const [a,b]=project(1.7,2.9,0);text('−30',a,b,25,C.server,{align:'center',weight:800});}
  }
  if(off){panel(x+8,265,504,284,{fill:'rgba(8,19,34,.88)',stroke:null});text('연결 끊김 / OFFLINE',x+260,388,29,C.dim,{align:'center'});text('서버 전투는 계속 진행',x+260,433,23,C.dim,{align:'center'});}
  text(i===0?'Autonomous Proxy':i===1?'Authority · 진단용 개념 뷰':'Simulated Proxy · 원격 캐릭터',x+22,578,22,colors[i]);
  text('TARGET HP '+st.hp,x+22,611,25,C.text,{mono:true});text(i===1?'NO LOCAL PLAYER':i===0?'예측 + 보정':'보간 + HUD 반영',x+498,610,20,C.dim,{align:'right',mono:i===1});
 }
 const arrows=[[380,960,'A','SERVER',C.A],[960,1540,'SERVER','B',C.B]];
 for(const[a,b,from,to,color]of arrows){line(a,666,b,666,C.line,3);for(const m of s.flight){if(m.from===from&&m.to===to){const u=(clock-m.sent)/(m.due-m.sent);dot(a+(b-a)*clamp(u,0,1),666,9,color,1,3);}if(m.from===to&&m.to===from){const u=(clock-m.sent)/(m.due-m.sent);dot(b-(b-a)*clamp(u,0,1),677,7,C.server,1,3);}}}
 text(ch===1?'SavedMove →':'ServerFire →',520,654,21,C.A,{align:'center',mono:true});text('← ACK / 상태 복제',770,702,21,C.server,{align:'center'});text('상태 복제 / 연출 RPC →',1250,654,21,C.B,{align:'center'});
 panel(120,727,800,259,{fill:C.panel,stroke:C.line,r:14});panel(944,727,856,259,{fill:C.panel,stroke:C.line,r:14});
 text(['서버와 클라이언트의 역할','이동 오차를 보정하는 과정','서버가 요청을 판정','지속 상태와 연출을 분리','현재 상태를 복원','언리얼의 클래스별 책임'][ch],146,768,27,C.server,{weight:700});
 let lines=[];
 if(ch===0)lines=['서버: 게임 규칙·충돌·권한 판정','클라이언트: 입력·예측·화면과 소리','중앙 3D는 서버 상태의 진단용 시각화'];
 if(ch===1){const c=s.corrections.at(-1);lines=['테스트: 클라이언트 이동 속도 20% 오차 주입',c?'ACK #'+c.seq+' · 미확인 이동 '+c.replayed+'개 재실행':'이동 명령 전송 대기','원격 캐릭터는 수신 위치 사이를 보간'];}
 if(ch===2){const e=s.events.filter(e=>e.kind==='HIT'||e.kind==='REJECT').at(-1);lines=['요청: 데미지 값 대신 조준 방향 전달',e?(e.kind==='HIT'?'판정 승인 · HP '+e.hp+' · 서버 탄약 '+s.server.ammo:'요청 거부 · '+e.reason):'서버 도착 전에는 HP를 바꾸지 않음','연속 요청도 서버의 쿨다운 검사로 거부'];}
 if(ch===3)lines=['HP '+s.server.hp+' → 복제 수신 → OnRep → HUD','예시: B의 첫 피격 FX 패킷 유실','FX가 없어도 복제된 HP는 정상 반영'];
 if(ch===4)lines=[s.events.some(e=>e.kind==='INITIAL_STATE')?'B 재접속: 초기 복제로 현재 HP '+s.B.hp:'B 재접속: 현재 상태 수신 대기','과거 피격 RPC를 다시 재생하지 않음',s.B.prop?'프랍이 관련성 범위 진입 → GOLD 상태 수신':'프랍은 아직 B의 관련성 범위 밖'];
 if(ch===5){const e=s.events.find(e=>e.kind==='REJECT'&&e.reason==='OWNERSHIP');lines=[e?'B → A Pawn Server RPC: 소유권 불일치로 거부':'Server RPC는 소유 연결을 통해 요청','Replicates · Relevancy · 복제 조건으로 제어','틱·갱신 빈도와 전송 지연은 서로 다름'];}
 lines.forEach((v,i)=>text(v,146,821+i*52,25,i===0?C.text:C.dim));
 snippets[ch].forEach((v,i)=>text(v,970,776+i*53,i===0?25:23,i===0?C.A:C.text,{mono:true}));
 text('브라우저 모형 · Unreal 실행/실제 통신 아님 · 지연·수치 예시',970,956,21,C.dim);
 text(captions[ch],120,1021,27,C.text,{weight:600});line(120,1050,1800,1050,C.line,4);line(120,1050,120+1680*t/DURATION,1050,C.A,4);
}
window.renderAt=render;window.DURATION=DURATION;window.ready=Promise.all([document.fonts.load('500 30px Pretendard'),document.fonts.load('500 24px "JetBrains Mono"')]).then(()=>render(29));
if(baking)return;
let t=0,playing=false,rate=1,last=0;
const ui=()=>{$('time').textContent=`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')} / 1:20`;$('scrub').value=t;$('big').hidden=playing;$('play').textContent=playing?'Ⅱ':'▶';$('rate').textContent=rate+'×';};
const play=()=>{if(t>=DURATION)t=0;playing=true;last=performance.now();ui();};const toggle=()=>{if(playing){playing=false;ui();}else play();};const seek=v=>{t=clamp(v,0,DURATION);render(t);ui();};
HEAD.forEach(([s,e,n,title])=>{const b=document.createElement('button');b.textContent=n+' '+title;b.onclick=()=>{seek(s+.02);play();};$('chapters').append(b);});$('big').onclick=toggle;$('play').onclick=toggle;$('scrub').oninput=e=>seek(+e.target.value);$('rate').onclick=()=>{const rates=[1,.75,.5];rate=rates[(rates.indexOf(rate)+1)%3];ui();};
function frame(now){if(playing){t=Math.min(DURATION,t+Math.min(.12,(now-last)/1000)*rate);if(t===DURATION)playing=false;render(t);ui();}last=now;requestAnimationFrame(frame);}
window.ready.then(()=>{const deep=/^#ch(\d\d)$/.exec(location.hash),row=deep&&HEAD.find(h=>h[2]===deep[1]);if(row)seek(row[0]+.02);ui();last=performance.now();requestAnimationFrame(frame);});
}
