import {astar,BLOCKED,valid} from './sim.mjs';
export const BATTLE_HZ=10,BATTLE_SECONDS=28;
export function createBattle(){
  const cells=[];for(let y=0;y<9;y++)for(let x=8;x<12;x++)if(valid([x,y]))cells.push([x,y]);
  return {tick:0,units:[
    {id:'warrior',name:'전사',role:'MELEE',x:100,y:200,hp:220,maxHp:220,range:100,damage:35,cooldown:6},
    {id:'mage',name:'마법사',role:'AOE',x:100,y:400,hp:180,maxHp:180,range:300,damage:24,cooldown:10},
    {id:'support',name:'지원가',role:'HEAL',x:100,y:700,hp:180,maxHp:180,range:300,damage:12,cooldown:9}
  ].map(u=>({...u,path:[],next:0,target:null,nextAttack:0,phase:'SEARCH',distance:0,dx:1,dy:0})),
  enemies:cells.slice(0,24).map((cell,i)=>({id:i,x:cell[0]*100,y:cell[1]*100,hp:90,maxHp:90,nextAttack:0})),
  effects:[],kills:0,damage:0,healing:0,replans:0,nextHeal:0};
}
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function hasLineOfSight(a,b){
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/20));
  for(let i=1;i<steps;i++){const k=i/steps;if(BLOCKED.has([Math.round((a.x+(b.x-a.x)*k)/100),Math.round((a.y+(b.y-a.y)*k)/100)].join(',')))return false;}
  return true;
}
export function chooseTarget(unit,enemies){
  const start=[Math.round(unit.x/100),Math.round(unit.y/100)];
  return enemies.filter(e=>e.hp>0).map(enemy=>({enemy,search:astar(start,[enemy.x/100,enemy.y/100])}))
    .filter(option=>option.search.path.length).sort((a,b)=>a.search.cost-b.search.cost||a.enemy.id-b.enemy.id)[0]||null;
}
function move(unit){
  const point=unit.path[unit.next];if(!point)return;
  const dx=point[0]*100-unit.x,dy=point[1]*100-unit.y;
  unit.dx=Math.sign(dx);unit.dy=Math.sign(dy);
  if(dx)unit.x+=Math.sign(dx)*Math.min(25,Math.abs(dx));
  else if(dy)unit.y+=Math.sign(dy)*Math.min(25,Math.abs(dy));
  unit.distance+=25;
  if(unit.x===point[0]*100&&unit.y===point[1]*100)unit.next++;
  unit.phase='MOVE';
}
export function stepBattle(state){
  const tick=state.tick;
  for(const unit of state.units){
    if(unit.hp<=0){unit.phase='DOWN';continue;}
    let enemy=state.enemies.find(e=>e.id===unit.target&&e.hp>0);
    if(!enemy){
      // Finish the current grid edge before planning from a new tile.
      if(unit.x%100||unit.y%100){move(unit);continue;}
      const choice=chooseTarget(unit,state.enemies);
      if(!choice){unit.target=null;unit.phase='CLEAR';continue;}
      enemy=choice.enemy;unit.target=enemy.id;unit.path=choice.search.path;unit.next=1;state.replans++;
    }
    // Range follows the remaining obstacle-free route, not straight-line
    // distance, so a close target on the far side of a wall is not attacked.
    const remaining=unit.path[unit.next];
    const routeDistance=remaining?dist(unit,{x:remaining[0]*100,y:remaining[1]*100})+(unit.path.length-1-unit.next)*100:dist(unit,enemy);
    if(routeDistance>unit.range||!hasLineOfSight(unit,enemy)){move(unit);continue;}
    unit.phase='ATTACK';unit.dx=Math.sign(enemy.x-unit.x);unit.dy=Math.sign(enemy.y-unit.y);
    if(tick<unit.nextAttack)continue;
    unit.nextAttack=tick+unit.cooldown;
    const victims=unit.role==='AOE'?state.enemies.filter(e=>e.hp>0&&dist(e,enemy)<=150&&hasLineOfSight(e,enemy)):[enemy];
    state.effects.push({tick,type:unit.role==='AOE'?'aoe':'attack',from:unit.id,x:unit.x,y:unit.y,tx:enemy.x,ty:enemy.y});
    for(const victim of victims){const damage=Math.min(victim.hp,unit.damage);victim.hp-=damage;state.damage+=damage;
      state.effects.push({tick,type:'damage',enemy:victim.id,x:victim.x,y:victim.y,value:damage});if(victim.hp===0)state.kills++;}
  }
  // Nearby monsters retaliate. The support restores actual missing HP.
  for(const enemy of state.enemies){
    if(enemy.hp<=0||tick<enemy.nextAttack)continue;
    const near=state.units.filter(u=>u.hp>0&&dist(u,enemy)<=150&&hasLineOfSight(u,enemy)).sort((a,b)=>dist(a,enemy)-dist(b,enemy));
    const unit=near[0];if(!unit)continue;
    enemy.nextAttack=tick+15;unit.hp=Math.max(0,unit.hp-4);
    state.effects.push({tick,type:'enemy',x:enemy.x,y:enemy.y,tx:unit.x,ty:unit.y});
  }
  const support=state.units[2];
  if(support.hp>0&&tick>=state.nextHeal){
    state.nextHeal=tick+12;
    for(const unit of state.units){if(unit.hp<=0)continue;const amount=Math.min(24,unit.maxHp-unit.hp);if(!amount)continue;
      unit.hp+=amount;state.healing+=amount;state.effects.push({tick,type:'heal',x:unit.x,y:unit.y,value:amount});}
  }
  state.effects=state.effects.filter(e=>tick-e.tick<10);state.tick++;return state;
}
const initial=createBattle();
export const BATTLE_SEARCH=chooseTarget(initial.units[0],initial.enemies).search;
export const BATTLE_TARGET=chooseTarget(initial.units[0],initial.enemies).enemy;
export const BATTLE_RECORD=(()=>{const state=createBattle(),frames=[structuredClone(state)];for(let t=0;t<BATTLE_SECONDS*BATTLE_HZ;t++){stepBattle(state);frames.push(structuredClone(state));}return frames;})();
export const battleAt=seconds=>BATTLE_RECORD[Math.min(BATTLE_RECORD.length-1,Math.max(0,Math.floor(seconds*BATTLE_HZ)))];
