import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,step,rayBox,projectDecal,aimAt,targetsAt,CFG} from '../fps-demo/sim.mjs';
import {astar,SEARCH,START,GOAL,neighbors,valid,NETWORK,networkAt,createState as createLockstep,applyBatch} from '../zenonia-demo/sim.mjs';

test('ray intersections return closest face normal, including origin inside a box',()=>{
  const box={min:[-1,-1,-5],max:[1,1,-3]};
  const hit=rayBox([0,0,0],[0,0,-1],box);
  assert.deepEqual(hit.point,[0,0,-3]);assert.deepEqual(hit.normal,[0,0,1]);
  assert.equal(rayBox([3,0,0],[0,0,-1],box),null);
  const inside=rayBox([0,0,-4],[1,0,0],box);
  assert.deepEqual(inside.point,[1,0,-4]);assert.deepEqual(inside.normal,[1,0,0]);
});

test('actual head and body collisions apply different damage',()=>{
  for(const [height,zone,damage] of [[1.94,'head',90],[1.12,'body',30]]){
    const state=createState(),target=targetsAt(0)[0];
    state.player.x=target.position[0];state.player.z=-5;
    const aim=aimAt([state.player.x,state.player.y,state.player.z],[target.position[0],height,target.position[2]]);
    step(state,{...aim,fire:true});
    assert.equal(state.lastHit.zone,zone);assert.equal(state.lastHit.damage,damage);
    assert.equal(state.hp.A,180-damage);
  }
});

test('a barrel overlapping cover cannot hit a target beyond that cover',()=>{
  const state=createState();state.player.z=.7;
  const aim=aimAt([0,1.65,.7],[0,1.45,-25]);step(state,{...aim,fire:true});
  assert.equal(state.shots[0].barrelBlocked,true);
  assert.notEqual(state.shots[0].cameraHit.id,'cover');
  assert.equal(state.lastHit.id,state.shots[0].id);assert.equal(state.lastHit.material,'metal');
  assert.equal(state.damage,0);
});

test('decal projection clips to a face and keeps UV coordinates in range',()=>{
  const hit={min:[-1,-1,-3],max:[1,1,-2],point:[.95,.9,-2],normal:[0,0,1]};
  const decal=projectDecal(hit,.55);
  for(let i=0;i<12;i+=3){assert(decal.vertices[i]<=1&&decal.vertices[i]>=-1);assert(decal.vertices[i+1]<=1&&decal.vertices[i+1]>=-1);assert.equal(decal.vertices[i+2],-1.988);}
  assert(decal.uv.every(v=>v>=0&&v<=1));
});

test('decal count is bounded, expired decals disappear and reload restores magazine',()=>{
  const state=createState();
  for(let i=0;i<600;i++)step(state,{fire:true,reload:state.ammo===0});
  assert(state.decals.length>0&&state.decals.length<=CFG.maxDecals);
  for(let i=0;i<CFG.decalTicks+1;i++)step(state);
  assert.equal(state.decals.length,0);
  const reload=createState();step(reload,{fire:true});step(reload,{reload:true});
  assert.equal(reload.ammo,CFG.magazine-1);
  while(reload.reloadUntil)step(reload);
  assert.equal(reload.ammo,CFG.magazine);
});

test('A* returns a valid shortest path matching an independent breadth-first search',()=>{
  const queue=[[START,0]],visited=new Set([START.join(',')]);let shortest;
  for(let i=0;i<queue.length;i++){const [cell,cost]=queue[i];if(cell.join(',')===GOAL.join(',')){shortest=cost;break;}
    for(const next of neighbors(cell)){if(visited.has(next.join(',')))continue;visited.add(next.join(','));queue.push([next,cost+1]);}}
  assert.equal(shortest,17);assert.equal(SEARCH.cost,shortest);
  assert(SEARCH.path.every(valid));
  for(let i=1;i<SEARCH.path.length;i++)assert.equal(Math.abs(SEARCH.path[i][0]-SEARCH.path[i-1][0])+Math.abs(SEARCH.path[i][1]-SEARCH.path[i-1][1]),1);
  assert.equal(astar(START,[3,2]).path.length,0);
});

test('relay waits for the delayed input and clients do not skip ticks',()=>{
  const delayed=NETWORK.batches[18];
  const waiting=networkAt((delayed.arriveA+delayed.arriveB)/2);
  assert.equal(waiting.ticks.server,18);assert.equal(waiting.ticks.A,18);assert.equal(waiting.ticks.B,18);
  const after=networkAt(delayed.receiveB+.001);
  assert.equal(after.ticks.A,19);assert.equal(after.ticks.B,19);
  assert.throws(()=>applyBatch(createLockstep(),{tick:1,commands:[]}),/out-of-order/);
  assert.throws(()=>applyBatch(createLockstep(),{tick:0,commands:[{player:'A',type:'noop'}]}),/Incomplete/);
});

test('all independent models have identical complete state at each common tick',()=>{
  assert.notEqual(NETWORK.history.server[20],NETWORK.history.A[20]);
  assert.deepEqual(NETWORK.history.server,NETWORK.history.A);assert.deepEqual(NETWORK.history.A,NETWORK.history.B);
  const b=NETWORK.batches[10],between=networkAt((b.broadcast+b.receiveA)/2);
  assert.notEqual(between.ticks.server,between.ticks.A);
  assert.equal(between.common,10);
  assert(NETWORK.batches.every(b=>b.commands.every(cmd=>!('position' in cmd))));
});
