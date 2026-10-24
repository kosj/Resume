import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,stepBattle,chooseTarget,BATTLE_RECORD,hasLineOfSight} from '../zenonia-demo/battle.mjs';
import {valid} from '../zenonia-demo/sim.mjs';

test('each role chooses the reachable enemy with the lowest A-star cost',()=>{
  const state=createBattle();
  assert.equal(state.units.length,3);assert.equal(state.enemies.length,24);
  const option=chooseTarget(state.units[0],state.enemies);
  assert.equal(option.enemy.id,0);assert.equal(option.search.cost,15);
  const blocked={id:99,x:300,y:200,hp:100};
  assert.notEqual(chooseTarget(state.units[0],[blocked,...state.enemies]).enemy.id,99);
});
test('recorded movement stays on traversable grid cells and obeys step distance',()=>{
  for(let i=1;i<BATTLE_RECORD.length;i++)for(let j=0;j<3;j++){
    const u=BATTLE_RECORD[i].units[j],prev=BATTLE_RECORD[i-1].units[j];
    assert(valid([Math.round(u.x/100),Math.round(u.y/100)]));
    assert(Math.abs(u.x-prev.x)+Math.abs(u.y-prev.y)<=25);
  }
});
test('party combat applies damage, healing, retargeting and finishes the encounter',()=>{
  const last=BATTLE_RECORD.at(-1);
  assert.equal(last.kills,24);assert.equal(last.damage,24*90);
  assert(last.healing>0);assert(last.replans>3);
  assert(last.units.every(u=>u.hp>0&&u.hp<=u.maxHp));
  assert(BATTLE_RECORD.some(s=>s.effects.some(e=>e.type==='aoe')));
  assert(BATTLE_RECORD.some(s=>s.effects.some(e=>e.type==='enemy')));
  for(const state of BATTLE_RECORD)for(const effect of state.effects){
    if(['attack','aoe','enemy'].includes(effect.type))assert(hasLineOfSight(effect,{x:effect.tx,y:effect.ty}));
  }
});
test('battle replay is independent of render order and reproducible',()=>{
  const state=createBattle();
  for(let tick=0;tick<280;tick++)stepBattle(state);
  assert.deepEqual(state,BATTLE_RECORD.at(-1));
});
