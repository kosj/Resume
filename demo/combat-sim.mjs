// Educational game implementation. Integer stats/positions, fixed-step simulation,
// deterministic PRNG, and a bounded projectile pool. No real network or UE code.
export const HZ = 30;
export const SCALE = 100;
export const CONFIG = Object.freeze({ attack: 8000, defense: 2000, hp: 48000,
  buffMultiplier: 15000, buffTicks: 120, cooldown: 18, poolSize: 6 });
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const display = n => (n / SCALE).toFixed(n % SCALE ? 1 : 0);

export function createState(seed = 2026) {
  return { tick: 0, rng: seed >>> 0, hero: { x: -330, z: 130, distance: 0 },
    enemies: [{ id: 1, x: 260, z: -90, hp: CONFIG.hp },
      { id: 2, x: 60, z: -320, hp: CONFIG.hp },
      { id: 3, x: 390, z: 230, hp: CONFIG.hp }],
    pool: Array.from({ length: CONFIG.poolSize }, (_, id) => ({ id, active: false, uses: 0 })),
    hits: [], casts: [], buffs: [], damage: 0, launched: 0, reuses: 0, dropped: 0,
    nextAttack: 0, nextBuff: 0, buffUntil: 0, rngCalls: 0, input: {} };
}

function randomInt(state, limit) {
  // xorshift32, integer range selection; seed zero is replaced by a nonzero seed.
  let x = state.rng || 2026;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  state.rngCalls++;
  return state.rng % limit;
}

export function step(state, input = {}) {
  const t = state.tick;
  state.input = { ...input };
  const dx = clamp(input.dx || 0, -1, 1), dz = clamp(input.dz || 0, -1, 1);
  const speed = dx && dz ? 7 : 10;
  state.hero.x = clamp(state.hero.x + dx * speed, -550, 550);
  state.hero.z = clamp(state.hero.z + dz * speed, -420, 420);
  state.hero.distance += Math.abs(dx * speed) + Math.abs(dz * speed);
  if (input.buff && t >= state.nextBuff) {
    state.buffUntil = t + CONFIG.buffTicks;
    state.nextBuff = t + 180;
    state.buffs.push(t);
  }
  // Projectiles return to the same pool slots when their travel ends.
  for (const projectile of state.pool) {
    if (!projectile.active || t < projectile.arrival) continue;
    projectile.active = false;
    const enemy = state.enemies.find(e => e.id === projectile.target);
    if (!enemy || enemy.hp <= 0) continue;
    const applied = Math.min(enemy.hp, projectile.damage);
    enemy.hp -= applied;
    state.damage += applied;
    state.hits.push({ tick: t, target: enemy.id, damage: applied,
      raw: projectile.damage, crit: projectile.crit, buff: projectile.buff,
      slot: projectile.id, x: enemy.x, z: enemy.z });
  }
  if (input.attack && t >= state.nextAttack) {
    const alive = state.enemies.filter(e => e.hp > 0);
    alive.sort((a,b) => ((a.x-state.hero.x)**2+(a.z-state.hero.z)**2)
      - ((b.x-state.hero.x)**2+(b.z-state.hero.z)**2) || a.id-b.id);
    const target = alive[0];
    if (target && (target.x-state.hero.x)**2+(target.z-state.hero.z)**2 <= 1000**2) {
      const slot = state.pool.find(p => !p.active);
      if (slot) {
        const buff = t < state.buffUntil;
        const crit = randomInt(state, 100) < 20;
        const attack = Math.trunc(CONFIG.attack * (buff ? CONFIG.buffMultiplier : 10000) / 10000);
        const damage = Math.trunc(Math.max(100, attack - CONFIG.defense) * (crit ? 15000 : 10000) / 10000);
        const travel = Math.max(6, Math.ceil(Math.hypot(target.x-state.hero.x,target.z-state.hero.z) / 35));
        if (slot.uses) state.reuses++;
        Object.assign(slot, { active:true, uses:slot.uses+1, start:t, arrival:t+travel,
          x:state.hero.x, z:state.hero.z, tx:target.x, tz:target.z,
          target:target.id, damage, crit, buff });
        state.casts.push({ tick:t, target:target.id, slot:slot.id, buff, crit });
        state.launched++;
      } else state.dropped++;
      state.nextAttack = t + CONFIG.cooldown;
    }
  }
  // History is only visual FX. Bound it so interactive play does not leak memory.
  state.hits = state.hits.filter(h => t - h.tick < 90);
  state.casts = state.casts.filter(c => t - c.tick < 90);
  state.buffs = state.buffs.filter(b => t - b < 180);
  state.tick++;
  return state;
}

export function scriptedInput(tick) {
  const sec = tick / HZ;
  // Continuous movement around training targets, while attacks and buffs execute.
  const phase = Math.floor(Math.max(0,sec-1)/2) % 4;
  return { dx: sec < 1 ? 1 : phase===1 ? 1 : phase===3 ? -1 : 0,
    dz: sec < 1 ? 0 : phase===0 ? -1 : phase===2 ? 1 : 0,
    attack: sec > 1.05, buff: tick === 105 || tick === 300 };
}

export function record(seed = 2026, seconds = 16, inputAt = scriptedInput) {
  const state = createState(seed), frames = [structuredClone(state)];
  for (let tick = 0; tick < seconds * HZ; tick++) {
    step(state,inputAt(tick));
    frames.push(structuredClone(state));
  }
  return frames;
}

// Diagnostic fingerprint of gameplay-relevant state, not a cryptographic proof.
export function fingerprint(state) {
  const payload = [state.tick,state.rng,state.hero.x,state.hero.z,state.damage,
    state.buffUntil,state.nextAttack,state.launched,state.reuses,
    ...state.enemies.flatMap(e=>[e.id,e.hp]),
    ...state.pool.flatMap(p=>[p.id,+p.active,p.uses,p.start||0,p.arrival||0])].join(',');
  let hash = 2166136261;
  for (const ch of payload) hash = Math.imul(hash ^ ch.charCodeAt(0),16777619) >>> 0;
  return hash.toString(16).padStart(8,'0').toUpperCase();
}

export const CLIENT = record();
export const SERVER = record(); // Separate initial state and separate full run.
export function at(frames, seconds) {
  return frames[clamp(Math.floor(seconds * HZ),0,frames.length-1)];
}
