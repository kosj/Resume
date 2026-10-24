import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT, SERVER, createState, step, record, HZ, CONFIG } from '../demo/combat-sim.mjs';

test('independent runs reproduce every tick, and a different seed changes the battle',()=>{
  assert.notEqual(CLIENT,SERVER);
  assert.notEqual(CLIENT[100],SERVER[100]);
  assert.deepEqual(CLIENT,SERVER);
  assert.notDeepEqual(record(2027),CLIENT);
});

test('damage is applied only on arrival, and returning projectiles reuse their slots',()=>{
  const state=createState(),pool=state.pool,slot=pool[0];
  step(state,{attack:true});
  assert.equal(state.damage,0);
  assert.equal(slot.active,true);
  const arrival=slot.arrival;
  while(state.tick<arrival)step(state);
  assert.equal(state.damage,0);
  step(state);
  assert(state.damage>0);
  assert.equal(slot.active,false);
  for(let i=0;i<14*HZ;i++)step(state,{attack:true});
  assert.equal(state.pool,pool);
  assert.equal(state.pool[0],slot);
  assert(state.reuses>0);
  assert.equal(state.pool.length,CONFIG.poolSize);
  assert.equal(state.dropped,0);
});

test('buff affects damage at launch and expires without changing an existing projectile',()=>{
  // Seed 1 produces a non-critical first cast, making the example formula exact.
  const ordinary=createState(1),enhanced=createState(1);
  step(ordinary,{attack:true});
  step(enhanced,{attack:true,buff:true});
  assert.equal(ordinary.pool[0].crit,false);
  assert.equal(ordinary.pool[0].damage,6000);
  assert.equal(enhanced.pool[0].damage,10000);
  const captured=enhanced.pool[0].damage;
  while(enhanced.tick<=enhanced.buffUntil)step(enhanced);
  assert.equal(enhanced.pool[0].damage,captured);
  assert(enhanced.tick>enhanced.buffUntil);
});

test('movement stays inside the arena, and damage never creates negative HP',()=>{
  const state=createState();
  for(let i=0;i<3000;i++)step(state,{dx:1,dz:1,attack:true,buff:true});
  assert(state.hero.x<=550&&state.hero.z<=420);
  assert(state.enemies.every(e=>Number.isInteger(e.hp)&&e.hp>=0));
  assert(state.damage<=CONFIG.hp*state.enemies.length);
});
