import * as GS from '../assets/kits/game-scene.js';
import { HZ, CONFIG, CLIENT, SERVER, at, display, createState, step, fingerprint } from './combat-sim.mjs';
const { THREE, clamp, lerp } = GS;
const W=1920, H=1080, DURATION=90;
const C={ text:'#eef6f7',dim:'#aabeca',hero:'#74efd6',enemy:'#bd8aff',buff:'#ffdb88',
  server:'#8cbbff',panel:'rgba(8,22,34,.94)',line:'rgba(153,194,208,.24)' };
const $=id=>document.getElementById(id);

export function mount(HEAD) {
  if (new URLSearchParams(location.search).has('render')) document.documentElement.classList.add('render');
  const ctx=$('c').getContext('2d');
  let stage;
  try {
    stage=GS.createStage({W,H,tone:'aces',exposure:1.35,fov:42,
      shadows:{size:512,extent:20},sky:null,background:'#0b1926',
      fog:{color:'#0b1926',near:42,far:80},hemi:{sky:'#c0dce6',ground:'#304057',intensity:2.1},
      sun:{color:'#eafcff',intensity:2.7,offset:[-8,15,10]},bloom:{strength:0}});
  } catch(error) {
    $('runtime-status').textContent='이 브라우저에서 3D 데모를 시작하지 못했습니다. MP4 영상이나 설명 페이지를 이용해 주세요.';
    $('big').hidden=true;
    window.ready=Promise.reject(error);
    return;
  }
  // Render the world at 720p, text/HUD at 1080p. Bypass bloom for software WebGL
  // and mobile; the kit still supplies stage, rig, materials, cameras and painter.
  stage.gl.setSize(1280,720,false);
  stage.render=()=>{stage.gl.render(stage.scene,stage.camera);ctx.drawImage(stage.gl.domElement,0,0,W,H);};
  const P=GS.painter(ctx,{sans:'Pretendard, sans-serif',mono:'"JetBrains Mono", monospace',theme:C});
  const {txt,panel,chip,line}=P;
  const mat=GS.flatMat;
  const heroMats={top:mat('#d9f1eb'),bottom:mat('#306b70'),skin:mat('#e6ba97'),
    hair:mat('#293b50'),boots:mat('#273044'),collar:mat('#d5ad5b')};
  const enemyMats={top:mat('#7c4b9f'),bottom:mat('#3c2a61'),skin:mat('#9c86b1'),
    hair:mat('#29213e'),boots:mat('#372645'),collar:mat('#dcbcf0')};

  function arena(offset) {
    const group=new THREE.Group();group.position.x=offset;stage.scene.add(group);
    const floor=new THREE.Mesh(new THREE.CylinderGeometry(8.4,8.7,.6,8),mat('#30465a',{metalness:.12}));
    floor.position.y=-.34;floor.receiveShadow=true;group.add(floor);
    const inner=new THREE.Mesh(new THREE.CylinderGeometry(7.9,7.9,.08,8),mat('#435b6c'));
    inner.position.y=-.03;inner.receiveShadow=true;group.add(inner);
    const grid=new THREE.GridHelper(12,12,'#6b8b9b','#597385');grid.position.y=.025;group.add(grid);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(8.2,.035,4,8),GS.glowMat('#5bbaa9',1));
    rim.rotation.x=Math.PI/2;rim.position.y=.05;group.add(rim);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+Math.PI/8,x=Math.cos(a)*7.4,z=Math.sin(a)*7.4;
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.27,.43,1.45,6),mat('#26384c'));
      pillar.position.set(x,.72,z);pillar.castShadow=true;group.add(pillar);
      const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.35),GS.glowMat(i%2?'#91b8e6':'#7dd6c3',.9));
      crystal.position.set(x,1.8,z);group.add(crystal);
    }
    return group;
  }

  function makeCast() {
    const hero=GS.buildChar(stage,{mats:heroMats,head:'hair',ring:C.hero,proportions:{height:1.15,bulk:1.15}});
    const staff=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,2.1,6),mat('#6c523d'));
    staff.position.set(.5,.3,.35);hero.chest.add(staff);
    const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.19),GS.glowMat(C.hero,1.2));
    crystal.position.set(.5,1.4,.35);hero.chest.add(crystal);
    const enemies=[1,2,3].map(()=>{
      const char=GS.buildChar(stage,{mats:enemyMats,head:'bald',ring:C.enemy,proportions:{height:1.3,bulk:1.65,head:.9}});
      for(const z of [-.16,.16]){
        const horn=new THREE.Mesh(new THREE.ConeGeometry(.09,.4,5),mat('#d5cbe2'));
        horn.position.set(-.07,.5,z);horn.rotation.z=.3;char.head.add(horn);
      }
      return char;
    });
    const projectiles=Array.from({length:CONFIG.poolSize},()=>{
      const group=new THREE.Group();
      const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.14,0),GS.glowMat(C.hero,1.3));group.add(core);
      const halo=new THREE.Mesh(new THREE.SphereGeometry(.24,8,6),new THREE.MeshBasicMaterial({color:C.hero,transparent:true,opacity:.2}));group.add(halo);
      const tail=new THREE.Mesh(new THREE.ConeGeometry(.12,.8,6),GS.glowMat(C.hero,1));
      tail.rotation.z=Math.PI/2;tail.position.x=-.32;group.add(tail);
      stage.scene.add(group);stage.transient(group);return group;
    });
    const aura=new THREE.Mesh(new THREE.RingGeometry(.75,.81,40),new THREE.MeshBasicMaterial({color:C.buff,transparent:true,opacity:.9,side:THREE.DoubleSide}));
    aura.rotation.x=-Math.PI/2;stage.scene.add(aura);stage.transient(aura);
    const impacts=Array.from({length:12},()=>{
      const ring=new THREE.Mesh(new THREE.RingGeometry(.7,.9,24),new THREE.MeshBasicMaterial({color:C.hero,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;stage.scene.add(ring);stage.transient(ring);return ring;
    });
    return {hero,enemies,projectiles,aura,impacts};
  }
  const maps=[arena(0),arena(-9),arena(9)],casts=[makeCast(),makeCast()];
  let tags=[];
  function world(state,cast,offset,clock) {
    const h=state.hero,alive=state.enemies.filter(e=>e.hp>0);
    const recent=state.casts.at(-1),attackAge=recent?(state.tick-recent.tick)/HZ:99;
    const target=state.enemies.find(e=>e.id===recent?.target&&e.hp>0)||alive[0]||{x:260,z:-90};
    const move=state.input.dx||state.input.dz;
    const yaw=move&&attackAge>=.25?-Math.atan2(state.input.dz||0,state.input.dx||0):-Math.atan2(target.z-h.z,target.x-h.x);
    GS.pose(cast.hero,{x:offset+h.x/100,z:h.z/100,yaw,d:h.distance/100,t:clock,k:move?1:0,aim:attackAge<.25?1:0});
    GS.setRing(cast.hero,1);
    const buffed=state.tick<state.buffUntil;
    if(buffed){cast.aura.visible=true;cast.aura.position.set(offset+h.x/100,.09,h.z/100);cast.aura.scale.setScalar(1+Math.sin(clock*4)*.08);}
    state.enemies.forEach((enemy,i)=>{
      const last=state.hits.filter(v=>v.target===enemy.id).at(-1);
      const age=last?(state.tick-last.tick)/HZ:99;
      if(enemy.hp<=0&&age>.55)return;
      const death=enemy.hp<=0?clamp(age/.55):0;
      GS.pose(cast.enemies[i],{x:offset+enemy.x/100,z:enemy.z/100,
        yaw:-Math.atan2(h.z-enemy.z,h.x-enemy.x),t:clock,hit:Math.max(0,1-age/.25),
        y:-death*1.9,crouch:death});
      GS.setRing(cast.enemies[i],enemy.hp>0?1:0);
      if(enemy.hp>0)tags.push({x:offset+enemy.x/100,y:3.1,z:enemy.z/100,hp:enemy.hp,id:enemy.id});
    });
    state.pool.forEach((slot,i)=>{
      if(!slot.active)return;
      const k=clamp((state.tick-slot.start)/(slot.arrival-slot.start));
      const object=cast.projectiles[i];object.visible=true;
      object.position.set(offset+lerp(slot.x,slot.tx,k)/100,1.45+Math.sin(k*Math.PI)*.5,lerp(slot.z,slot.tz,k)/100);
      object.rotation.y=-Math.atan2(slot.tz-slot.z,slot.tx-slot.x);
      object.children[0].rotation.x=clock*5;
    });
    state.hits.slice(-12).forEach((hit,i)=>{
      const age=(state.tick-hit.tick)/HZ;
      if(age<0||age>.7)return;
      const impact=cast.impacts[i];impact.visible=true;
      impact.position.set(offset+hit.x/100,.08,hit.z/100);impact.scale.setScalar(.6+age*3);
      impact.material.opacity=1-age/.7;impact.material.color.set(hit.buff?C.buff:C.hero);
      tags.push({x:offset+hit.x/100,y:4.1+age*1.5,z:hit.z/100,hit,alpha:1-age/.7});
    });
  }

  function write(value,x,y,size=28,color=C.text,options={}) {txt(value,x,y,{size,color,...options});}
  function drawLabels() {
    for(const tag of tags){
      const [x,y]=GS.proj(stage,tag.x,tag.y,tag.z);
      if(x<80||x>1840||y<200||y>885)continue;
      if(tag.hit){write((tag.hit.crit?'CRIT ':'')+display(tag.hit.damage),x,y,tag.hit.crit?44:36,tag.hit.buff?C.buff:C.hero,{align:'center',weight:800,alpha:tag.alpha,sh:6});}
      else {
        const width=110;panel(x-width/2,y-20,width,9,{fill:'#1a2638',stroke:null,r:4});
        panel(x-width/2,y-20,Math.max(1,width*tag.hp/CONFIG.hp),9,{fill:C.enemy,stroke:null,r:4});
        write('HP '+display(tag.hp),x,y-31,19,C.text,{align:'center',mono:true,sh:4});
      }
    }
  }
  function metric(label,value,x,y,color=C.hero){write(label,x,y,22,C.dim);write(String(value),x,y+39,34,color,{mono:true,weight:700});}
  function inspector(state,mode,other) {
    const x=1410;panel(x,247,390,566,{r:18});
    if(mode==='pool'){
      write('PROJECTILE POOL',x+26,291,22,C.hero,{mono:true});
      write('동일한 6개 슬롯을 재사용',x+26,330,25);
      state.pool.forEach((slot,i)=>{
        const y=365+i*52;panel(x+24,y,342,42,{fill:slot.active?'#244e54':'#142b3b',stroke:slot.active?C.hero:C.line});
        write('#'+slot.id,x+38,y+29,21,C.hero,{mono:true});
        write(slot.active?'비행 중':'대기',x+100,y+29,22);
        write(slot.uses+'회',x+310,y+29,21,C.dim,{align:'right',mono:true});
      });
      metric('발사',state.launched,x+26,728);metric('재사용',state.reuses,x+188,728);
    } else if(mode==='buff'){
      const active=state.tick<state.buffUntil;
      write('STAT → DAMAGE → FX',x+26,291,22,C.buff,{mono:true});
      chip(active?'강화 활성':'기본 상태',x+26,345,active?C.buff:C.hero,{size:25});
      metric('기본 공격력',80,x+26,403);
      metric('공격력 배율',active?'× 1.5':'× 1.0',x+200,403,C.buff);
      metric('방어력',20,x+26,499);
      metric('일반 피해',active?100:60,x+200,499,C.buff);
      write(active?'80 × 1.5 − 20 = 100':'80 − 20 = 60',x+26,625,25,C.text,{mono:true});
      write('치명타: 계산 피해 × 1.5',x+26,675,24,C.dim);
      write('남은 강화 시간',x+26,729,23,C.dim);
      write(Math.max(0,(state.buffUntil-state.tick)/HZ).toFixed(1)+' s',x+26,778,36,C.buff,{mono:true});
      write('발사 시 강화 상태로 피해 계산',x+26,805,18,C.dim);
    } else {
      write(mode==='replay'?'INPUT RECORD':'COMBAT TRACE',x+26,291,22,C.hero,{mono:true});
      const rows=[['입력',state.input.attack?'ATTACK':'MOVE'],['시뮬레이션 틱',state.tick],
        ['난수 호출',state.rngCalls],['누적 피해',display(state.damage)],['발사 수',state.launched]];
      rows.forEach(([k,v],i)=>{write(k,x+26,352+i*66,23,C.dim);write(String(v),x+338,352+i*66,26,C.text,{align:'right',mono:true});});
      write('STATE ID',x+26,710,20,C.dim,{mono:true});
      write(fingerprint(state),x+26,752,36,C.hero,{mono:true});
      write('수치·계산 규칙은 예시',x+26,788,20,C.dim);
    }
  }
  function footer(caption,t,chapter,state) {
    panel(120,874,1680,96,{fill:'rgba(8,22,34,.97)',r:14});
    write(caption,150,918,31,C.text,{weight:600});
    write('고성종 · 전투 공통 로직 / Unreal 콘텐츠 / 오브젝트 풀링',150,950,20,C.dim);
    write('별도 구현 데모 · 실제 프로젝트 녹화 아님 · 수치는 예시',120,1006,21,C.dim);
    write('COMBAT LAB / '+String(Math.floor(t)).padStart(2,'0')+'s',1800,1006,20,C.dim,{align:'right',mono:true});
    line(120,1038,1800,1038,'#294150',4);line(120,1038,120+1680*t/DURATION,1038,C.hero,4);
  }

  function renderScene(t,liveState=null) {
    t=clamp(t,0,DURATION-.001);
    const split=!liveState&&t>=22&&t<35;
    let clock=t<8?1+t*1.25:t<22?(t-8)*.73:t<35?(t-22)*.9:t<55?(t-35)*.65:t<75?.7+(t-55)*.7:(t-75)*.95;
    if(liveState)clock=liveState.tick/HZ;
    const state=liveState||at(CLIENT,clock),other=at(SERVER,clock);
    window.demoState=state;window.comparisonState=other;
    stage.beginFrame();tags=[];
    maps.forEach((map,i)=>map.visible=split?i>0:i===0);
    if(split){world(state,casts[0],-9,clock);world(other,casts[1],9,clock);}
    else world(state,casts[0],0,clock);
    const target=split?[0,.5,0]:[-.5,.5,.2];
    // Side-on enough to see projectile travel; overhead enough to read positions.
    const eye=split?[0,27,28]:[12,15,18];
    GS.camSet(stage,GS.camFrom(eye,target,{fov:split?45:42,sx:split?0:-190}));
    stage.render();
    // Header is separate from world labels and never covers the combat HUD.
    const gradient=ctx.createLinearGradient(0,0,0,245);gradient.addColorStop(0,'#08131d');gradient.addColorStop(.7,'#08131df5');gradient.addColorStop(1,'#08131d00');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,W,245);
    let index=HEAD.findIndex(row=>t>=row[0]&&t<row[1]);
    let title=index<0?'공격 한 발이 게임에 반영되기까지':HEAD[index][3];
    let subtitle=index<0?'이동·공격·피해 계산이 실제로 실행되는 3D 전투 데모':HEAD[index][4];
    if(liveState){title='직접 움직이고 공격해 보세요';subtitle='WASD 이동 · Space 공격 · E 강화 · R 초기화';}
    write('KO SEONGJONG / GAMEPLAY ENGINEERING',120,62,22,C.hero,{mono:true});
    write(title,120,129,50,C.text,{weight:800});
    write(subtitle,122,179,27,C.dim);
    chip(liveState?'LIVE DEMO':split?'INDEPENDENT RUNS':'RECORDED INPUT',1800,94,split?C.server:C.hero,{align:'right',size:21});
    drawLabels();
    if(split){
      line(960,265,960,800,C.line,2);
      chip('CLIENT MODEL',520,261,C.hero,{align:'center',size:28});
      chip('SERVER MODEL',1400,261,C.server,{align:'center',size:28});
      const a=fingerprint(state),b=fingerprint(other);
      panel(310,734,1300,100,{fill:C.panel});
      write('TICK '+state.tick+' / HP '+state.enemies.map(e=>display(e.hp)).join(' · '),345,774,24,C.text,{mono:true});
      write(a,345,814,28,C.hero,{mono:true});write(b,1400,814,28,C.server,{mono:true,align:'right'});
      chip(a===b?'상태 일치':'상태 불일치',1015,790,a===b?C.hero:'#ff8c87',{align:'center',size:27});
    } else {
      const mode=t>=55&&t<75?'pool':t>=35&&t<55?'buff':t>=75?'replay':'trace';
      inspector(state,mode,other);
      panel(120,252,440,105,{fill:C.panel});
      write('PLAYER / ARC CASTER',144,288,22,C.hero,{mono:true});
      write('공격 Space',144,330,25);write('강화 E',370,330,25,C.buff);
    }
    let caption=index<0?'이동하고, 공격하고, 명중하면 HP가 줄어듭니다.':[
      '발사한 투사체가 대상에 도착한 틱에 피해를 반영합니다.',
      '입력·데이터·시드·연산 순서가 같으면 같은 결과를 얻습니다.',
      '강화 상태를 읽어 공격력과 피해, 캐릭터 효과를 함께 바꿉니다.',
      '명중 후 반환한 투사체 슬롯을 다음 공격에 다시 사용합니다.',
      '같은 입력을 다시 계산하고, 웹 데모에서는 직접 조작할 수 있습니다.'
    ][index];
    if(liveState)caption=state.enemies.every(e=>e.hp<=0)?'모든 대상을 처치했습니다. R 또는 처음부터 버튼으로 다시 시작하세요.':'이동·공격·강화 입력이 전투 상태와 화면에 바로 반영됩니다.';
    footer(caption,t,index,state);
  }

  window.DURATION=DURATION;
  window.renderAt=t=>renderScene(t);
  window.ready=(async()=>{
    await Promise.all([document.fonts.load('500 30px Pretendard'),document.fonts.load('500 24px "JetBrains Mono"')]);
    renderScene(4.2);
  })();
  if(document.documentElement.classList.contains('render'))return;

  let time=0,playing=false,started=false,rate=1,last=0,interactive=false,live=createState(),accumulator=0;
  const keys=new Set();
  const mmss=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  function ui(){
    $('time').textContent=mmss(time)+' / 1:30';$('scrub').value=time;
    $('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'일시정지':'재생');
    $('big').hidden=playing||interactive;$('rate').textContent=rate+'×';
    [...$('chapters').children].forEach((button,i)=>button.setAttribute('aria-current',String(started&&time>=HEAD[i][0]&&time<HEAD[i][1])));
  }
  function draw(){renderScene(started?time:4.2,interactive?live:null);}
  function leaveInteractive(){interactive=false;keys.clear();$('interactive').textContent='직접 조작하기';$('interactive').setAttribute('aria-pressed','false');$('reset').hidden=true;$('touch-controls').hidden=true;}
  function play(){if(interactive)leaveInteractive();if(time>=90)time=0;started=true;playing=true;last=performance.now();ui();}
  function pause(){playing=false;ui();}
  function toggle(){playing?pause():play();}
  function seek(value){if(interactive)leaveInteractive();started=true;time=clamp(value,0,90);draw();ui();}
  HEAD.forEach(([s,e,n,title])=>{
    const button=document.createElement('button');button.textContent=n+' '+title;
    button.addEventListener('click',()=>{seek(s+.02);play();});$('chapters').append(button);
  });
  $('big').addEventListener('click',toggle);$('play').addEventListener('click',toggle);
  $('c').addEventListener('click',()=>{if(!interactive)toggle();});
  $('scrub').addEventListener('input',event=>seek(Number(event.target.value)));
  const rates=[1,.75,.5];$('rate').addEventListener('click',()=>{rate=rates[(rates.indexOf(rate)+1)%rates.length];ui();});
  $('fs').addEventListener('click',()=>{
    if(document.fullscreenElement)document.exitFullscreen?.();else $('stage').requestFullscreen?.().catch(()=>{});
  });
  const reset=()=>{live=createState();accumulator=0;keys.clear();draw();};
  $('reset').addEventListener('click',reset);
  $('interactive').addEventListener('click',()=>{
    if(interactive){leaveInteractive();draw();ui();return;}
    pause();interactive=true;live=createState();accumulator=0;last=performance.now();
    $('interactive').textContent='설명 영상으로 돌아가기';$('interactive').setAttribute('aria-pressed','true');
    $('reset').hidden=false;$('touch-controls').hidden=false;$('c').focus({preventScroll:true});ui();draw();
  });
  const gameKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE'];
  document.addEventListener('keydown',event=>{
    if(event.target.matches('input,button,a'))return;
    if(interactive&&gameKeys.includes(event.code)){event.preventDefault();keys.add(event.code);}
    else if(interactive&&event.code==='KeyR'){event.preventDefault();reset();}
    else if(!interactive&&event.code==='Space'){event.preventDefault();toggle();}
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{keys.clear();if(playing)pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pause();accumulator=0;}});
  document.querySelectorAll('[data-key]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.key);});
    const release=()=>keys.delete(button.dataset.key);
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  function frame(now){
    const dt=Math.min(.12,(now-last)/1000);last=now;
    if(interactive){
      accumulator+=dt;
      while(accumulator>=1/HZ){
        step(live,{dx:+(keys.has('KeyD')||keys.has('ArrowRight'))- +(keys.has('KeyA')||keys.has('ArrowLeft')),
          dz:+(keys.has('KeyS')||keys.has('ArrowDown'))- +(keys.has('KeyW')||keys.has('ArrowUp')),
          attack:keys.has('Space'),buff:keys.has('KeyE')});
        accumulator-=1/HZ;
      }
      draw();
    } else if(playing){time=Math.min(90,time+dt*rate);if(time>=90)playing=false;draw();ui();}
    requestAnimationFrame(frame);
  }
  const deep=/^#ch(\d\d)$/.exec(location.hash);
  window.ready.then(()=>{if(deep){const row=HEAD.find(row=>row[2]===deep[1]);if(row)seek(row[0]+.02);}ui();last=performance.now();requestAnimationFrame(frame);});
}
