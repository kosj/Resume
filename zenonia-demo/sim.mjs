export const WIDTH=12,HEIGHT=9,DURATION=90;
export const BLOCKED=new Set(['3,0','3,1','3,2','3,3','3,4','3,6','3,7','3,8','7,1','7,2','7,3','7,4','7,5','7,6','7,7','5,3','5,4','9,5','10,5']);
export const START=[1,2],GOAL=[10,6],key=cell=>cell.join(',');
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
export const valid=([x,y])=>x>=0&&x<WIDTH&&y>=0&&y<HEIGHT&&!BLOCKED.has(key([x,y]));
export const neighbors=([x,y])=>[[x+1,y],[x,y+1],[x-1,y],[x,y-1]].filter(valid);
const h=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
export function astar(start,goal){
  if(!valid(start)||!valid(goal))return {path:[],steps:[],cost:null};
  const open=new Map([[key(start),{cell:start,g:0,h:h(start,goal)}]]),closed=new Set(),parents=new Map(),steps=[];
  while(open.size){
    const current=[...open.values()].sort((a,b)=>(a.g+a.h)-(b.g+b.h)||a.h-b.h||a.cell[1]-b.cell[1]||a.cell[0]-b.cell[0])[0];
    open.delete(key(current.cell));closed.add(key(current.cell));
    steps.push({current:current.cell,g:current.g,h:current.h,f:current.g+current.h,open:[...open.values()].map(n=>n.cell),closed:[...closed].map(k=>k.split(',').map(Number))});
    if(same(current.cell,goal)){
      const path=[goal];let p=key(goal);
      while(parents.has(p)){const cell=parents.get(p);path.unshift(cell);p=key(cell);}
      return {path,steps,cost:current.g};
    }
    for(const cell of neighbors(current.cell)){
      const k=key(cell),g=current.g+1;
      if(closed.has(k))continue;
      if(!open.has(k)||g<open.get(k).g){open.set(k,{cell,g,h:h(cell,goal)});parents.set(k,current.cell);}
    }
  }
  return {path:[],steps,cost:null};
}
export const SEARCH=astar(START,GOAL);
export function createState(){return {tick:0,units:[{id:'A',x:START[0]*100,y:START[1]*100,path:[],next:0},{id:'B',x:100,y:700,path:[],next:0}]};}
export function applyBatch(state,batch){
  if(batch.tick!==state.tick)throw new Error('Missing or out-of-order lockstep tick');
  if(batch.commands.length!==2||new Set(batch.commands.map(c=>c.player)).size!==2||!batch.commands.some(c=>c.player==='A')||!batch.commands.some(c=>c.player==='B'))throw new Error('Incomplete tick inputs');
  for(const cmd of batch.commands){
    if(cmd.type!=='goto')continue;
    const unit=state.units.find(u=>u.id===cmd.player);
    const start=[Math.round(unit.x/100),Math.round(unit.y/100)];
    unit.path=astar(start,cmd.goal).path;unit.next=1;
  }
  for(const unit of state.units){
    const target=unit.path[unit.next];if(!target)continue;
    const tx=target[0]*100,ty=target[1]*100;
    const dx=tx-unit.x,dy=ty-unit.y;
    // Four-neighbor paths advance 25 integer units per tick. No interpolation
    // or wall-clock delta participates in gameplay state.
    if(dx)unit.x+=Math.sign(dx)*Math.min(25,Math.abs(dx));
    else if(dy)unit.y+=Math.sign(dy)*Math.min(25,Math.abs(dy));
    if(unit.x===tx&&unit.y===ty)unit.next++;
  }
  state.tick++;return state;
}
export const fingerprint=state=>{
  const data=JSON.stringify(state);let hash=2166136261;
  for(const ch of data)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  return hash.toString(16).padStart(8,'0').toUpperCase();
};

// Illustrative relay lockstep: every client sends an input (including no-op).
// Server orders both inputs, advances its own state, and distributes that batch.
// Peers advance only after receiving the next complete batch in tick order.
export function networkTimeline(){
  const server=createState(),clientA=createState(),clientB=createState();
  const history={server:[structuredClone(server)],A:[structuredClone(clientA)],B:[structuredClone(clientB)]};
  const batches=[],events=[];let nextA=0,nextB=0,serverReady=0;
  for(let tick=0;tick<88;tick++){
    const start=Math.max(tick*.1,serverReady),sendA=Math.max(start,nextA),sendB=Math.max(start,nextB);
    const delayed=tick===18,arriveA=sendA+.07,arriveB=sendB+(delayed?1.5:.09);
    const broadcast=Math.max(arriveA,arriveB),receiveA=broadcast+.06,receiveB=broadcast+.11;
    const commands=[{player:'A',type:tick===0?'goto':'noop',...(tick===0?{goal:GOAL}:{})},
      {player:'B',type:tick===0?'goto':'noop',...(tick===0?{goal:[10,7]}:{})}];
    const batch={tick,commands};
    applyBatch(server,batch);applyBatch(clientA,batch);applyBatch(clientB,batch);
    for(const [name,state] of [['server',server],['A',clientA],['B',clientB]])history[name].push(structuredClone(state));
    batches.push({...batch,sendA,sendB,arriveA,arriveB,broadcast,receiveA,receiveB,delayed});
    events.push({time:broadcast,actor:'server',tick:tick+1},{time:receiveA,actor:'A',tick:tick+1},{time:receiveB,actor:'B',tick:tick+1});
    nextA=receiveA+.07;nextB=receiveB+.07;serverReady=broadcast+.03;
  }
  const duration=batches.at(-1).receiveB;
  return {batches,events,history,duration};
}
export const NETWORK=networkTimeline();
export function networkAt(time){
  const ticks={server:0,A:0,B:0};for(const event of NETWORK.events)if(event.time<=time)ticks[event.actor]=event.tick;
  const common=Math.min(...Object.values(ticks));
  const pending=NETWORK.batches.find(b=>time>=Math.min(b.sendA,b.sendB)&&time<b.receiveB)||null;
  return {ticks,common,pending,states:Object.fromEntries(Object.entries(ticks).map(([name,tick])=>[name,NETWORK.history[name][tick]]))};
}
export function walkAt(seconds,path=SEARCH.path){
  const pos=Math.max(0,seconds*.9),index=Math.min(path.length-1,Math.floor(pos)),next=Math.min(path.length-1,index+1),k=Math.min(1,pos-index);
  const a=path[index]||START,b=path[next]||a;
  return {x:(a[0]+(b[0]-a[0])*k)*100,y:(a[1]+(b[1]-a[1])*k)*100,dx:b[0]-a[0],dy:b[1]-a[1]};
}
