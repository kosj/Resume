// Educational model of authority, queued messages and reconciliation, not UE runtime.
export const DURATION=80, STEP=.05, LATENCY=.25, DAMAGE=30;
export const SHOTS=[6,7.4,7.5,10.4,16.4];
const copy=v=>JSON.parse(JSON.stringify(v));
export function simulate(end=20){
  const s={time:0,server:{x:-4,hp:100,ammo:3,lastShot:-99,prop:'GOLD'},A:{x:-4,hp:100,ack:0,prop:'GOLD'},B:{x:-4,hp:100,connected:true,prop:null},moves:[],events:[],flight:[],corrections:[],effects:[],history:[]};
  let seq=0,queue=[],serial=0;
  const log=(kind,data={})=>s.events.push({time:s.time,kind,...data});
  const send=(from,to,kind,payload,delay=LATENCY)=>{const m={from,to,kind,payload:copy(payload),sent:s.time,due:Math.round((s.time+delay)*100)/100,serial:serial++};queue.push(m);s.flight.push(m);};
  for(let tick=0;tick<=Math.round(end/STEP);tick++){
    s.time=+(tick*STEP).toFixed(2);
    s.B.connected=!(s.time>=9.5&&s.time<12.5);
    if(tick%2===0&&s.time>=.5&&s.time<4.5){
      const m={seq:++seq,dt:.1,input:1};s.moves.push(m);s.A.x+=m.dt*1.2;
      send('A','SERVER','MOVE',m); // Deliberate 20% speed mismatch to demonstrate correction.
    }
    for(const at of SHOTS)if(Math.abs(s.time-at)<.001){
      const from=at===16.4?'B':'A';send(from,'SERVER','ServerFire',{pawn:'A',aim:'target'});if(from==='A')s.effects.push({time:s.time,client:'A',type:'muzzle'});
    }
    if(Math.abs(s.time-12.5)<.001){send('SERVER','B','INITIAL',{x:s.server.x,hp:s.server.hp},.3);log('JOIN');}
    if(Math.abs(s.time-14.5)<.001){send('SERVER','B','PROP',{color:s.server.prop});log('RELEVANT');}
    // Stable delivery order; messages created by receive are delivered on later ticks.
    const due=queue.filter(m=>m.due<=s.time+.00001).sort((a,b)=>a.due-b.due||a.serial-b.serial);queue=queue.filter(m=>m.due>s.time+.00001);
    for(const m of due){
      if(m.to==='B'&&!s.B.connected)continue;
      if(m.kind==='MOVE'){
        s.server.x+=m.payload.dt;send('SERVER','A','ACK',{seq:m.payload.seq,x:s.server.x});if(s.B.connected)send('SERVER','B','POSITION',{x:s.server.x});
      }else if(m.kind==='ACK'){
        s.moves=s.moves.filter(v=>v.seq>m.payload.seq);const corrected=m.payload.x+s.moves.reduce((v,i)=>v+i.dt*1.2,0);
        s.corrections.push({time:s.time,before:s.A.x,after:corrected,error:s.A.x-corrected,replayed:s.moves.length,seq:m.payload.seq});s.A.x=corrected;s.A.ack=m.payload.seq;
      }else if(m.kind==='POSITION'){s.B.previous=s.B.x;s.B.x=m.payload.x;s.B.positionTime=s.time;
      }else if(m.kind==='ServerFire'){
        const reason=m.from!=='A'?'OWNERSHIP':s.time-s.server.lastShot<.5?'COOLDOWN':s.server.ammo<=0?'AMMO':Math.abs(1.7-s.server.x)>5?'RANGE':null;
        if(reason){log('REJECT',{reason,from:m.from});continue;}
        s.server.lastShot=s.time;s.server.ammo--;s.server.hp=Math.max(0,s.server.hp-DAMAGE);log('HIT',{hp:s.server.hp,from:m.from});
        send('SERVER','A','HP',{hp:s.server.hp},.4);if(s.B.connected)send('SERVER','B','HP',{hp:s.server.hp},.6);
        send('SERVER','A','FX',{hp:s.server.hp},.3);
        // First B cosmetic event deliberately lost; durable HP still arrives.
        if(s.B.connected&&s.server.ammo!==2)send('SERVER','B','FX',{},.4);else log('FX_NOT_DELIVERED',{client:'B'});
      }else if(m.kind==='HP'){s[m.to].hp=m.payload.hp;log('OnRep_Health',{client:m.to,hp:m.payload.hp});
      }else if(m.kind==='FX'){s.effects.push({time:s.time,client:m.to,type:'hit'});
      }else if(m.kind==='INITIAL'){s.B.x=m.payload.x;s.B.previous=m.payload.x;s.B.hp=m.payload.hp;log('INITIAL_STATE',{hp:m.payload.hp});
      }else if(m.kind==='PROP'){s.B.prop=m.payload.color;log('PROP_STATE');}
    }
    s.history.push(copy({time:s.time,server:s.server,A:s.A,B:s.B}));
  }
  s.flight=s.flight.filter(m=>m.sent<=end&&m.due>end);return s;
}
export const RUN=simulate();
export function stateAt(filmTime){const t=Math.max(0,Math.min(20,filmTime/4)),s=simulate(Math.floor(t/STEP)*STEP);s.visualTime=t;return s;}
