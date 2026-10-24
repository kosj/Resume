// New educational FPS prototype; independent of the original Unreal project.
export const HZ=30, DURATION=76;
export const CFG=Object.freeze({magazine:10,fireTicks:7,reloadTicks:42,decalTicks:360,fadeTicks:60,maxDecals:24,range:60});
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,k)=>a.map(v=>v*k);
export const norm=a=>mul(a,1/(Math.hypot(...a)||1));
export const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
export function direction(yaw,pitch){return [Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
export function aimAt(from,to){const d=sub(to,from);return {yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}

export const SURFACES=[
  {id:'floor',material:'concrete',min:[-10,-.4,-28],max:[10,0,12]},
  {id:'back-wall',material:'concrete',min:[-10,0,-27.5],max:[10,5,-27]},
  {id:'left-wall',material:'concrete',min:[-10.5,0,-28],max:[-10,5,12]},
  {id:'right-wall',material:'metal',min:[10,0,-28],max:[10.5,5,12]},
  {id:'concrete-panel',material:'concrete',min:[-6.4,0,-8],max:[-3.3,3.5,-7.65]},
  {id:'steel-panel',material:'metal',min:[3.5,.3,-9],max:[6.6,3.5,-8.7]},
  {id:'cover',material:'metal',min:[-1.4,0,-1.4],max:[1.4,1.48,-.8]},
  {id:'crate',material:'metal',min:[4.2,0,-14],max:[6.2,1.4,-12]},
];
export function targetsAt(tick){
  const time=tick/HZ;
  return [{id:'A',position:[-1.8+Math.sin(time*.65)*.65,0,-11]},
    {id:'B',position:[2+Math.sin(time*.5)*.7,0,-18]},
    {id:'C',position:[Math.sin(time*.4),0,-24]}];
}
export function hitboxes(target){
  const [x,y,z]=target.position;
  const specs=[['head',[-.24,1.7,-.24],[.24,2.18,.24]],
    ['body',[-.43,.7,-.28],[.43,1.65,.28]],
    ['legs',[-.28,.05,-.2],[.28,.7,.2]]];
  return specs.map(([zone,min,max])=>({id:target.id+'-'+zone,target:target.id,zone,material:'armor',min:add(min,[x,y,z]),max:add(max,[x,y,z])}));
}

// Slab intersection returns the closest positive intersection, its face normal,
// and the exact face bounds used to clip the impact decal.
export function rayBox(origin,dir,box,maxDistance=CFG.range){
  let enter=-Infinity,exit=Infinity,entryNormal=[0,0,0],exitNormal=[0,0,0];
  for(let axis=0;axis<3;axis++){
    if(Math.abs(dir[axis])<1e-9){if(origin[axis]<box.min[axis]||origin[axis]>box.max[axis])return null;continue;}
    let a=(box.min[axis]-origin[axis])/dir[axis],b=(box.max[axis]-origin[axis])/dir[axis];
    let na=[0,0,0],nb=[0,0,0];na[axis]=-1;nb[axis]=1;
    if(a>b){[a,b]=[b,a];[na,nb]=[nb,na];}
    if(a>enter){enter=a;entryNormal=na;}
    if(b<exit){exit=b;exitNormal=nb;}
    if(enter>exit)return null;
  }
  const distance=enter>=0?enter:exit,normal=enter>=0?entryNormal:exitNormal;
  if(distance<0||distance>maxDistance)return null;
  return {...box,distance,point:add(origin,mul(dir,distance)),normal};
}
export function castRay(origin,dir,boxes){
  let closest=null;
  for(const box of boxes){const hit=rayBox(origin,dir,box,closest?.distance??CFG.range);if(hit)closest=hit;}
  return closest;
}

// For this axis-aligned range, clip the decal quad to the struck box face.
// UVs still refer to the original quad, so clipping does not stretch the texture.
export function projectDecal(hit,size){
  const axis=hit.normal.findIndex(v=>v!==0),axes=[0,1,2].filter(a=>a!==axis);
  const [u,v]=axes;
  const loU=Math.max(hit.min[u],hit.point[u]-size/2),hiU=Math.min(hit.max[u],hit.point[u]+size/2);
  const loV=Math.max(hit.min[v],hit.point[v]-size/2),hiV=Math.min(hit.max[v],hit.point[v]+size/2);
  const vertices=[],uv=[];
  for(const [a,b] of [[loU,loV],[hiU,loV],[hiU,hiV],[loU,hiV]]){
    const point=[...hit.point];point[axis]+=hit.normal[axis]*.012;point[u]=a;point[v]=b;
    vertices.push(...point);uv.push((a-hit.point[u])/size+.5,(b-hit.point[v])/size+.5);
  }
  return {vertices,uv,normal:hit.normal};
}

export function createState(){return {tick:0,player:{x:0,z:6,y:1.65,yaw:0,pitch:0,vy:0,grounded:true},
  ads:0,recoil:0,ammo:CFG.magazine,reloadUntil:0,nextFire:0,shots:[],decals:[],serial:0,
  hp:{A:180,B:180,C:180},respawn:{A:0,B:0,C:0},damage:0,hits:0,headshots:0,
  lastHit:null,lastAim:null,collided:false,input:{},rng:42};}
function random(state){let x=state.rng;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x>>>0;return state.rng/4294967296;}
function collides(x,z){return SURFACES.some(b=>b.max[1]>.1&&x+.25>b.min[0]&&x-.25<b.max[0]&&z+.25>b.min[2]&&z-.25<b.max[2]);}
export function allBoxes(state){return [...SURFACES,...targetsAt(state.tick).filter(t=>state.hp[t.id]>0).flatMap(hitboxes)];}
export function muzzleFrom(player,ads,boxes=SURFACES){
  const origin=[player.x,player.y,player.z],side=[Math.cos(player.yaw),0,Math.sin(player.yaw)];
  const desired=add(add(origin,mul(side,.36*(1-ads))),add([0,-.3+.09*ads,0],mul(direction(player.yaw,player.pitch),1.7)));
  const segment=sub(desired,origin),block=castRay(origin,norm(segment),boxes);
  const blocked=!!block&&block.distance<Math.hypot(...segment);
  return {position:blocked?add(block.point,mul(block.normal,.025)):desired,blocked,hit:blocked?block:null};
}

export function step(state,input={}){
  const p=state.player,t=state.tick;
  state.input={...input};state.collided=false;
  if(input.yaw!==undefined)p.yaw=input.yaw;
  if(input.pitch!==undefined)p.pitch=clamp(input.pitch,-1.2,1.2);
  const speed=(input.sprint?4.5:2.6)/HZ;
  const move=norm([input.dx||0,0,input.dz||0]);
  const dx=(Math.cos(p.yaw)*move[0]+Math.sin(p.yaw)*move[2])*speed;
  const dz=(Math.sin(p.yaw)*move[0]-Math.cos(p.yaw)*move[2])*speed;
  if(!collides(p.x+dx,p.z))p.x+=dx;else state.collided=!!dx;
  if(!collides(p.x,p.z+dz))p.z+=dz;else state.collided=state.collided||!!dz;
  if(input.jump&&p.grounded){p.vy=4.5;p.grounded=false;}
  if(!p.grounded){p.vy-=9.8/HZ;p.y+=p.vy/HZ;if(p.y<=1.65){p.y=1.65;p.vy=0;p.grounded=true;}}
  state.ads+=((input.ads?1:0)-state.ads)*.25;
  state.recoil*=.8;
  for(const target of targetsAt(t)){if(state.hp[target.id]<=0&&t>=state.respawn[target.id]){state.hp[target.id]=180;state.decals=state.decals.filter(d=>d.target!==target.id);}}
  if(state.reloadUntil&&t>=state.reloadUntil){state.ammo=CFG.magazine;state.reloadUntil=0;}
  if(input.reload&&!state.reloadUntil&&state.ammo<CFG.magazine)state.reloadUntil=t+CFG.reloadTicks;
  const origin=[p.x,p.y,p.z],dir=direction(p.yaw,p.pitch+state.recoil),boxes=allBoxes(state);
  const cameraHit=castRay(origin,dir,boxes);
  state.lastAim=cameraHit;
  if(input.fire&&t>=state.nextFire&&!state.reloadUntil&&state.ammo>0){
    const muzzleState=muzzleFrom(p,state.ads),muzzle=muzzleState.position;
    const aim=cameraHit?.point||add(origin,mul(dir,CFG.range));
    const hit=muzzleState.hit||castRay(muzzle,norm(sub(aim,muzzle)),boxes);
    const shot={id:++state.serial,tick:t,muzzle,aim,cameraHit,hit,ads:state.ads,barrelBlocked:muzzleState.blocked};
    if(hit){
      let applied=0;
      if(hit.target){const raw=hit.zone==='head'?90:30;applied=Math.min(state.hp[hit.target],raw);state.hp[hit.target]-=applied;
        state.damage+=applied;state.hits++;if(hit.zone==='head')state.headshots++;
        if(state.hp[hit.target]<=0)state.respawn[hit.target]=t+90;}
      const target=targetsAt(t).find(v=>v.id===hit.target);
      const size=hit.material==='concrete'?.55:hit.material==='metal'?.35:.25;
      const geometry=projectDecal(hit,size);
      // Store target-local vertices so a moving target carries its decal.
      if(target)geometry.vertices=geometry.vertices.map((v,i)=>v-target.position[i%3]);
      const decal={id:shot.id,tick:t,material:hit.material,target:hit.target,geometry};
      state.decals.push(decal);if(state.decals.length>CFG.maxDecals)state.decals.shift();
      state.lastHit={...hit,tick:t,damage:applied,id:shot.id};
    }
    state.shots.push(shot);state.ammo--;state.nextFire=t+CFG.fireTicks;
    state.recoil+=.009+random(state)*.006;
  }
  state.shots=state.shots.filter(s=>t-s.tick<20);
  state.decals=state.decals.filter(d=>t-d.tick<CFG.decalTicks);
  state.tick++;return state;
}

export function scriptedInput(state){
  const s=state.tick/HZ,p=state.player;
  let target=[-1.8,1.12,-11],input={fire:true,ads:true,reload:state.ammo===0};
  if(s<6){input.dx=s<2?-1:s<4?1:0;target=add(targetsAt(state.tick)[0].position,[0,1.12,0]);}
  else if(s<18){input.dz=s<9?1:0;input.dx=s>10&&s<12?-1:s>13&&s<15?1:0;input.ads=s>10;target=add(targetsAt(state.tick)[0].position,[0,s>13?1.94:1.12,0]);}
  else if(s<30){input.ads=false;input.dz=s<21?1:0;target=[0,1.45,-25];}
  else if(s<44){target=add(targetsAt(state.tick)[1].position,[0,s<36?1.12:1.94,0]);input.dx=s<32?-1:s>40?1:0;}
  else if(s<62){target=s<50?[-4.6,1.75,-7.65]:s<56?[4.8,1.6,-8.7]:[-5.3,2.35,-7.65];input.dx=s>56&&s<59?-1:0;input.ads=s<57;}
  else {target=add(targetsAt(state.tick)[0].position,[0,s>68?1.94:1.12,0]);input.fire=s<67;input.dx=s>70&&s<73?1:0;}
  const aim=aimAt([p.x,p.y,p.z],target);
  // Smooth aim motion remains a deterministic part of the recorded input.
  const delta=Math.atan2(Math.sin(aim.yaw-p.yaw),Math.cos(aim.yaw-p.yaw));
  input.yaw=p.yaw+delta*.16;input.pitch=p.pitch+(aim.pitch-p.pitch)*.16;
  return input;
}
export function record(){const state=createState(),frames=[structuredClone(state)];for(let i=0;i<DURATION*HZ;i++){step(state,scriptedInput(state));frames.push(structuredClone(state));}return frames;}
export const RECORDING=record();
export const at=seconds=>RECORDING[clamp(Math.floor(seconds*HZ),0,RECORDING.length-1)];
