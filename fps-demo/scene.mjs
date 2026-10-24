import * as GS from '../assets/kits/game-scene.js';
import {at,createState,step,DURATION,HZ,CFG,SURFACES,targetsAt,hitboxes,aimAt,muzzleFrom,clamp} from './sim.mjs';
const {THREE}=GS,W=1920,H=1080;
const C={text:'#eef5f8',dim:'#aabcc9',hero:'#79e1d6',gold:'#ffd18a',panel:'rgba(9,21,32,.93)',line:'#345063'};
const $=id=>document.getElementById(id);
export function mount(HEAD){
  const baking=new URLSearchParams(location.search).has('render');if(baking)document.documentElement.classList.add('render');
  const ctx=$('c').getContext('2d'),stage=GS.createStage({W,H,tone:'aces',exposure:1.2,sky:null,background:'#708895',shadows:{size:512,extent:40},hemi:{sky:'#d5edf5',ground:'#51616b',intensity:2.4},sun:{color:'#fff3d8',intensity:3,offset:[-8,16,8]}});
  stage.gl.setSize(1280,720,false);
  stage.sun.position.set(-8,14,10);stage.sun.target.position.set(0,0,-8);stage.sun.target.updateMatrixWorld();
  const P=GS.painter(ctx,{sans:'Pretendard,sans-serif',mono:'"JetBrains Mono",monospace',theme:C});
  const {txt,panel,chip,line}=P;
  const text=(s,x,y,size=26,color=C.text,q={})=>txt(String(s),x,y,{size,color,...q});
  const M=GS.flatMat;
  const box=(size,position,material,parent=stage.scene)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const concrete=M('#8a9ca3'),steel=M('#3a5260',{metalness:.55,roughness:.5}),dark=M('#1d2a35'),accent=M('#efb350');
  for(const surface of SURFACES){const size=surface.max.map((v,i)=>v-surface.min[i]),center=surface.max.map((v,i)=>(v+surface.min[i])/2);box(size,center,surface.material==='metal'?steel:concrete);}
  const grid=new THREE.GridHelper(20,20,'#6b7f8d','#6b7f8d');grid.position.set(0,.006,-8);stage.scene.add(grid);
  for(const x of [-9.8,9.8])for(let z=8;z>-27;z-=5){box([.18,4.3,.25],[x,2.15,z],dark);box([.12,.12,2],[x,.08,z],accent);}
  for(const z of [-5,-15,-25]){box([19,.16,.2],[0,4.6,z],steel);for(const x of [-5,5])box([2,.035,.4],[x,4.45,z],GS.glowMat('#e8f6ff',1));}
  const sign=GS.canvasTex(1024,256,(g)=>{g.fillStyle='#162d3b';g.fillRect(0,0,1024,256);g.fillStyle='#cce7ed';g.font='bold 94px sans-serif';g.fillText('FPS / TEST RANGE',30,115);g.fillStyle='#e5b66c';g.font='38px monospace';g.fillText('HITSCAN · SURFACE IMPACT',36,202);});
  const board=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:sign}));board.position.set(0,3.7,-26.98);stage.scene.add(board);
  const robots=['A','B','C'].map(id=>{const root=new THREE.Group();stage.scene.add(root);
    box([.86,.95,.56],[0,1.175,0],M('#d7954f'),root);box([.48,.48,.48],[0,1.94,0],M('#dce8ea'),root);
    box([.5,.12,.025],[0,1.99,.253],GS.glowMat('#62d9d9',1),root);
    for(const x of [-.19,.19]){box([.18,.65,.25],[x,.375,0],steel,root);box([.24,.1,.4],[x,.05,.09],dark,root);}
    box([.44,.25,.03],[0,1.22,.295],dark,root);return {id,root};});
  const gun=new THREE.Group();stage.camera.add(gun);stage.scene.add(stage.camera);
  box([.16,.18,.56],[0,0,-.15],dark,gun);box([.12,.12,.53],[0,.015,-.65],steel,gun);
  box([.055,.055,.34],[0,.015,-1.02],dark,gun);box([.075,.13,.12],[0,-.16,-.05],dark,gun);
  box([.1,.29,.12],[0,-.2,-.3],steel,gun);box([.16,.09,.27],[0,.08,-.42],M('#496779'),gun);
  box([.028,.12,.045],[0,.15,-.85],dark,gun);box([.14,.025,.04],[0,.12,-.11],accent,gun);
  for(const x of [-.065,.065])box([.025,.1,.04],[x,.17,-.11],dark,gun);
  box([.15,.12,.32],[-.13,-.1,-.42],M('#bea28c'),gun);box([.14,.13,.2],[.09,-.2,-.01],M('#bea28c'),gun);
  const flash=new THREE.Mesh(new THREE.ConeGeometry(.16,.5,6),GS.glowMat('#ffd475',1.8));flash.rotation.x=-Math.PI/2;flash.position.set(0,.015,-1.34);gun.add(flash);
  const textures={};
  for(const [kind,color] of [['concrete','#333b40'],['metal','#091b22'],['armor','#20474d']]){
    textures[kind]=GS.canvasTex(128,128,(g)=>{
      g.clearRect(0,0,128,128);g.strokeStyle=kind==='metal'?'#ad9870':'#4b5152';g.lineWidth=8;g.beginPath();g.arc(64,64,20,0,Math.PI*2);g.stroke();
      g.fillStyle=color;g.beginPath();g.arc(64,64,13,0,Math.PI*2);g.fill();
      for(let i=0;i<9;i++){const a=i*Math.PI*2/9;g.strokeStyle=kind==='armor'?'#57a5a0':'#454b4e';g.lineWidth=2;g.beginPath();g.moveTo(64+Math.cos(a)*16,64+Math.sin(a)*16);g.lineTo(64+Math.cos(a+.15)*48,64+Math.sin(a+.15)*48);g.stroke();}
    });
  }
  const decals=Array.from({length:CFG.maxDecals},()=>{
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(8),2));geo.setIndex([0,1,2,0,2,3]);
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:textures.metal,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));stage.scene.add(mesh);return mesh;
  });
  const tracerGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);const tracer=new THREE.Line(tracerGeo,new THREE.LineBasicMaterial({color:'#ffe2a5',transparent:true}));stage.scene.add(tracer);
  const normalArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),.7,0x77e8cf,.16,.08);stage.scene.add(normalArrow);
  const fmt=a=>a.map(v=>v.toFixed(2)).join(', ');
  function render(t,live=null){
    const state=live||at(t),p=state.player,s=state.tick/HZ;window.fpsState=state;
    const targetPositions=targetsAt(state.tick);
    robots.forEach(robot=>{robot.root.position.set(...targetPositions.find(v=>v.id===robot.id).position);robot.root.visible=state.hp[robot.id]>0;});
    stage.camera.position.set(p.x,p.y,p.z);stage.camera.rotation.order='YXZ';stage.camera.rotation.set(p.pitch+state.recoil,-p.yaw,0);
    stage.camera.fov=72-27*state.ads;stage.camera.updateProjectionMatrix();stage.camera.updateMatrixWorld();
    const reload=state.reloadUntil?1-(state.reloadUntil-state.tick)/CFG.reloadTicks:0;
    const dip=reload?Math.sin(reload*Math.PI):0,moving=state.input.dx||state.input.dz;
    const bob=moving?Math.sin(s*11)*.012:Math.sin(s*2)*.002;
    gun.position.set(.36*(1-state.ads),-.3+.09*state.ads+bob-dip*.4,-.55+state.recoil*3+dip*.15);
    gun.rotation.set(-dip*.8,state.recoil*2,dip*-.5);
    flash.visible=!!state.shots.length&&(state.tick-state.shots.at(-1).tick)<2;
    const muzzle=muzzleFrom(p,state.ads);if(muzzle.blocked)gun.position.z+=.3;
    for(let i=0;i<decals.length;i++){
      const mesh=decals[i],decal=state.decals[i];mesh.visible=!!decal;if(!decal)continue;
      mesh.geometry.attributes.position.array.set(decal.geometry.vertices);mesh.geometry.attributes.position.needsUpdate=true;
      mesh.geometry.attributes.uv.array.set(decal.geometry.uv);mesh.geometry.attributes.uv.needsUpdate=true;
      mesh.geometry.computeBoundingSphere();mesh.material.map=textures[decal.material];mesh.material.opacity=clamp((CFG.decalTicks-(state.tick-decal.tick))/CFG.fadeTicks,0,1);
      const position=decal.target?targetPositions.find(v=>v.id===decal.target).position:[0,0,0];mesh.position.set(...position);if(decal.target&&state.hp[decal.target]<=0)mesh.visible=false;
    }
    const recent=state.shots.at(-1),age=recent?(state.tick-recent.tick)/HZ:99;
    tracer.visible=!!recent&&age<.1;
    if(tracer.visible){tracer.geometry.setFromPoints([new THREE.Vector3(...recent.muzzle),new THREE.Vector3(...(recent.hit?.point||recent.aim))]);tracer.material.opacity=1-age/.1;}
    const hit=state.lastHit,hitAge=hit?(state.tick-hit.tick)/HZ:99;
    normalArrow.visible=t>=44&&t<62&&hitAge<1.3;
    if(normalArrow.visible){normalArrow.position.set(...hit.point);normalArrow.setDirection(new THREE.Vector3(...hit.normal));}
    stage.gl.render(stage.scene,stage.camera);ctx.drawImage(stage.gl.domElement,0,0,W,H);
    const grad=ctx.createLinearGradient(0,0,0,240);grad.addColorStop(0,'#08131df5');grad.addColorStop(1,'#08131d00');ctx.fillStyle=grad;ctx.fillRect(0,0,W,240);
    const chapter=HEAD.findIndex(h=>t>=h[0]&&t<h[1]),title=live?'직접 조준하고 사격하세요':chapter<0?'FPS 입력부터 피격 데칼까지':HEAD[chapter][3];
    text('KO SEONGJONG / FPS PROTOTYPING',120,60,22,C.hero,{mono:true});text(title,120,126,50,C.text,{weight:800});
    text(live?'WASD 이동 · 마우스 시점 · 좌클릭 발사 · 우클릭 ADS · R 재장전':chapter<0?'조준·발사·충돌·피해·표면 효과를 실행하는 별도 FPS 데모':HEAD[chapter][4],120,177,27,C.dim);
    chip(live?'LIVE FPS':'FIRST PERSON / TECH DEMO',1800,85,C.hero,{align:'right',size:21});
    // A genuine crosshair and hit marker come from the current simulation.
    const gap=state.ads>0.8?4:13+state.recoil*800;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])line(960+dx*gap,540+dy*gap,960+dx*(gap+13),540+dy*(gap+13),C.text,2.5);
    if(hit?.target&&hitAge<.22){for(const [dx,dy] of [[1,1],[-1,1],[-1,-1],[1,-1]])line(960+dx*18,540+dy*18,960+dx*29,540+dy*29,hit.zone==='head'?C.gold:C.hero,3);text(hit.zone==='head'?'HEADSHOT '+hit.damage:'HIT '+hit.damage,960,604,28,hit.zone==='head'?C.gold:C.hero,{align:'center',weight:700});}
    panel(120,260,465,445,{r:16});text(t>=44?'IMPACT / DECAL':'FPS DEBUG',147,304,23,C.hero,{mono:true});
    const material=hit?({concrete:'CONCRETE',metal:'METAL',armor:'ARMOR'}[hit.material]):'—';
    const rows=t>=44?[['재질 / SURFACE',material],['HIT POINT',hit?fmt(hit.point):'—'],['NORMAL',hit?fmt(hit.normal):'—'],['DECALS',state.decals.length+' / '+CFG.maxDecals],['LIFETIME','12s / fade 2s']]:[
      ['ADS / FOV',(state.ads>.8?'ON':'OFF')+' / '+Math.round(stage.camera.fov)+'°'],['TICK',state.tick],['HIT ZONE',hit?.zone?.toUpperCase()||material],['DAMAGE',state.damage],['MUZZLE BLOCK',recent?.barrelBlocked?'YES':'NO']];
    rows.forEach(([label,value],i)=>{text(label,147,349+i*67,20,C.dim,{mono:true});text(value,147,378+i*67,label==='HIT POINT'||label==='NORMAL'?23:28,C.text,{mono:true});});
    panel(1465,762,335,89,{r:12});text(state.reloadUntil?'RELOADING':String(state.ammo).padStart(2,'0')+' / 10',1490,817,37,C.gold,{mono:true});
    if(state.collided)chip('COLLISION / 이동 제한',960,244,C.gold,{align:'center',size:24});
    const sentence=live?'입력·명중·데칼이 실제로 동작하는 별도 구현 데모입니다.':chapter<0?'이동하고 조준한 뒤 발사하면, 명중한 표면에 탄흔이 남습니다.':[
      '이동·ADS·발사·재장전이 카메라와 무기 상태에 반영됩니다.',
      '카메라 조준점을 구한 뒤, 총구에서 실제 명중 지점을 다시 검사합니다.',
      '머리와 몸통을 구분해 피해를 계산하고 HP·히트 마커를 갱신합니다.',
      '명중 지점과 법선에 데칼을 정렬하고, 표면 경계 안으로 잘라 냅니다.',
      '로컬 좌표로 표적에 부착하고, 수명에 따라 페이드 후 제거합니다.'
    ][chapter];
    panel(120,874,1680,95,{r:14});text(sentence,147,918,30,C.text,{weight:600});text('기술 설명을 위한 별도 FPS 구현 · 실제 Unreal 프로젝트 녹화 아님 · 수치는 예시',147,952,21,C.dim);
    text('FPS LAB / '+Math.floor(t)+'s',1800,1009,21,C.dim,{align:'right',mono:true});line(120,1038,1800,1038,C.line,4);line(120,1038,120+1680*t/DURATION,1038,C.hero,4);
  }
  window.renderAt=t=>render(t);window.DURATION=DURATION;
  window.ready=Promise.all([document.fonts.load('500 30px Pretendard'),document.fonts.load('500 24px "JetBrains Mono"')]).then(()=>render(3.2));
  if(!baking)controls(HEAD,render);
}

function controls(HEAD,render){
  let t=0,playing=false,started=false,rate=1,last=0,live=null,acc=0,drag=false,px=0,py=0;
  const keys=new Set(),mmss=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const draw=()=>render(started?t:3.2,live),ui=()=>{$('time').textContent=mmss(t)+' / 1:16';$('scrub').value=t;$('play').textContent=playing?'Ⅱ':'▶';$('big').hidden=playing||!!live;$('rate').textContent=rate+'×';};
  function stopLive(){live=null;keys.clear();document.exitPointerLock?.();$('interactive').textContent='직접 조작하기';$('interactive').setAttribute('aria-pressed','false');$('touch-controls').hidden=true;$('reset').hidden=true;}
  function play(){if(live)stopLive();if(t>=DURATION)t=0;playing=true;started=true;last=performance.now();ui();}
  const toggle=()=>{if(playing){playing=false;ui();}else play();};
  const seek=v=>{if(live)stopLive();t=clamp(v,0,DURATION);started=true;draw();ui();};
  HEAD.forEach(([s,e,n,title])=>{const b=document.createElement('button');b.textContent=n+' '+title;b.onclick=()=>{seek(s+.02);play();};$('chapters').append(b);});
  $('big').onclick=toggle;$('play').onclick=toggle;$('scrub').oninput=e=>seek(+e.target.value);
  $('rate').onclick=()=>{const r=[1,.75,.5];rate=r[(r.indexOf(rate)+1)%r.length];ui();};
  $('fs').onclick=()=>document.fullscreenElement?document.exitFullscreen?.():$('stage').requestFullscreen?.();
  $('interactive').onclick=()=>{if(live){stopLive();draw();ui();return;}playing=false;live=createState();acc=0;last=performance.now();$('interactive').textContent='설명 영상으로 돌아가기';$('interactive').setAttribute('aria-pressed','true');$('touch-controls').hidden=false;$('reset').hidden=false;$('c').focus();draw();ui();};
  $('reset').onclick=()=>{live=createState();keys.clear();draw();};
  $('pointer-lock').onclick=()=>{if(live)$('c').requestPointerLock?.();};
  const look=(dx,dy)=>{if(live){live.player.yaw+=dx*.003;live.player.pitch=clamp(live.player.pitch-dy*.003,-1.2,1.2);}};
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===$('c'))look(e.movementX,e.movementY);});
  $('c').addEventListener('contextmenu',e=>e.preventDefault());
  $('c').addEventListener('pointerdown',e=>{if(!live)return;e.preventDefault();$('c').focus();if(e.pointerType==='mouse'){keys.add(e.button===2?'ads':'fire');}drag=true;px=e.clientX;py=e.clientY;$('c').setPointerCapture(e.pointerId);});
  $('c').addEventListener('pointermove',e=>{if(drag&&!document.pointerLockElement){look(e.clientX-px,e.clientY-py);px=e.clientX;py=e.clientY;}});
  const release=()=>{drag=false;keys.delete('fire');keys.delete('ads');};$('c').addEventListener('pointerup',release);$('c').addEventListener('pointercancel',release);
  document.addEventListener('keydown',e=>{if(e.target.matches('input,button,a'))return;if(live&&['KeyW','KeyA','KeyS','KeyD','KeyR','Space','ShiftLeft'].includes(e.code)){e.preventDefault();keys.add(e.code);}else if(!live&&e.code==='Space'){e.preventDefault();toggle();}});
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();playing=false;ui();});
  document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.key));});
  const frame=now=>{const dt=Math.min(.12,(now-last)/1000);last=now;if(live){acc+=dt;while(acc>=1/HZ){step(live,{dx:+keys.has('KeyD')- +keys.has('KeyA'),dz:+keys.has('KeyW')- +keys.has('KeyS'),fire:keys.has('fire'),ads:keys.has('ads'),reload:keys.has('KeyR'),jump:keys.has('Space'),sprint:keys.has('ShiftLeft')});acc-=1/HZ;}draw();}else if(playing){t=Math.min(DURATION,t+dt*rate);if(t===DURATION)playing=false;draw();ui();}requestAnimationFrame(frame);};
  window.ready.then(()=>{const deep=/^#ch(\d\d)$/.exec(location.hash),row=deep&&HEAD.find(h=>h[2]===deep[1]);if(row)seek(row[0]+.02);ui();last=performance.now();requestAnimationFrame(frame);});
}
