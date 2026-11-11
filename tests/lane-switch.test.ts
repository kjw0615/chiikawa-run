import test from 'node:test';
import assert from 'node:assert/strict';
import { RunnerModel, RULES, type Platform } from '../src/model.ts';
const DT = 1/120;
function stage(upper = true) {
  const m = new RunnerModel(1, false); m.start();
  const p: Platform = { id: 11, start: 10, end: 46, y: RULES.floor-RULES.platformHeight, required: true, gateX:32 };
  m.platforms.push(p); m.distance = 14; m.y = upper ? p.y : RULES.floor;
  return {m,p};
}
function run(m: RunnerModel, seconds: number, before?: () => void) {
  for (let n=0;n<seconds/DT && m.phase==='running';n++) { before?.(); m.step(DT); }
}
test('crouch+jump on a branch drops through only that branch without a jump or penalty', () => {
  const {m,p}=stage(); m.crouch=true; m.jump();
  assert.equal(m.droppingPlatformId,p.id); assert.ok(m.vy>0); assert.equal(m.grounded,false);
  m.releaseJump(); m.jump(); // cannot cancel the intentional drop with an air jump
  assert.ok(m.vy>0);
  run(m,1);
  assert.equal(m.y,RULES.floor); assert.equal(m.droppingPlatformId,null);
  assert.equal(m.hits,0); assert.equal(m.rescue,null); assert.equal(m.gap,30);
  assert.ok(Math.abs(m.distance-20)<1e-8);
  assert.equal(m.jumps,0); assert.equal(m.platforms[0],p);
});
test('drop keeps normal, exhausted and golden run speed; falling itself has no hit', () => {
  for(const state of ['normal','exhausted','gold'] as const) {
    const {m}=stage(); m.stamina=state==='exhausted'?0:80; m.exhausted=state==='exhausted'; m.boost=state==='gold'?1:0;
    const speed=m.speed; m.crouch=true; m.jump(); const x=m.distance;
    run(m,.5);
    assert.ok(Math.abs(m.distance-x-speed*.5)<.001,state); assert.equal(m.y,RULES.floor);
    assert.equal(m.hits,0); assert.equal(m.rescue,null);
  }
});
test('normal upper jump still goes up; crouch+jump on the ground is a normal jump', () => {
  const up=stage().m; up.jump(); up.step(DT); assert.ok(up.vy<0); assert.equal(up.droppingPlatformId,null);
  const down=stage(false).m; down.crouch=true; down.jump(); down.step(DT);
  assert.ok(down.vy<0); assert.equal(down.droppingPlatformId,null);
});
test('drop input is ignored during pause or an encounter; paused drop physics freezes', () => {
  const {m}=stage(); m.crouch=true; m.pause(); m.jump(); assert.equal(m.droppingPlatformId,null);
  m.start(); m.crouch=true; m.jump(); m.step(DT); m.pause();
  const snap=[m.distance,m.y,m.vy,m.gap,m.stamina,m.droppingPlatformId]; run(m,2); m.step(2);
  assert.deepEqual([m.distance,m.y,m.vy,m.gap,m.stamina,m.droppingPlatformId],snap);
  m.phase='minigame'; m.jump(); assert.deepEqual([m.distance,m.y,m.vy,m.gap,m.stamina,m.droppingPlatformId],snap);
});
test('a full-height upper gate cannot be bypassed by crouch, single/double jump or gold', () => {
  for(const action of ['walk','crouch','single','double','gold'] as const) {
    const {m,p}=stage(); let jumped=false, twice=false;
    run(m,6,()=>{
      m.stamina=80; m.gap=30;
      m.crouch=action==='crouch'; if(action==='gold')m.boost=1;
      if(['single','double'].includes(action) && !jumped && p.gateX!-m.distance<6) { m.jump(); jumped=true; }
      if(action==='double' && jumped && !twice && m.jumps===1 && m.vy>-100) { m.releaseJump();m.jump();twice=true; }
    });
    assert.ok(m.distance<=p.gateX!-(RULES.gateWidth/2+RULES.halfHitWidth)/RULES.scale+1e-8,action);
    assert.equal(m.blocked,true,action); assert.equal(m.hits,0,action);
  }
});
test('a gate stop is a stall, then crouch+jump lets the player continue below it', () => {
  const {m,p}=stage(); run(m,4,()=>{m.stamina=80;m.gap=30;});
  assert.ok(m.blocked); const x=m.distance; m.gap=30; const st=m.stamina;
  run(m,1);
  assert.equal(m.distance,x); assert.ok(Math.abs(m.gap-24)<1e-6);
  assert.ok(Math.abs(m.stamina-(st-4))<1e-6); assert.equal(m.hits,0);
  m.crouch=true; m.jump(); run(m,3);
  assert.equal(m.y,RULES.floor); assert.ok(m.distance>p.gateX!+3);
  assert.equal(m.blocked,false); assert.equal(m.hits,0); assert.equal(m.rescue,null);
});
test('preemptive descent clears the gate without stalling at every run speed', () => {
  for(const speed of [RULES.speed,RULES.exhaustedSpeed,RULES.boostSpeed]) {
    const {m,p}=stage(); m.distance=p.gateX!-6; m.exhausted=speed===RULES.exhaustedSpeed;
    m.stamina=m.exhausted?0:80; m.boost=speed===RULES.boostSpeed?1:0;
    m.crouch=true;m.jump(); let stalled=false;
    run(m,2,()=>{if(m.blocked)stalled=true;});
    assert.equal(stalled,false); assert.ok(m.distance>p.gateX!+1); assert.equal(m.hits,0);
  }
});
test('generated switch routes require ascent and descent, with clear lower landings and no NPC after the gate', () => {
  for(let seed=1;seed<=32;seed++) {
    const m=new RunnerModel(seed);m.distance=3000;(m as any).generate();
    const gates=m.platforms.filter(p=>p.gateX!==undefined);assert.ok(gates.length>=2);
    for(const p of gates) {
      assert.equal(p.required,true);assert.equal(p.end-p.start,36);assert.ok(p.gateX!>=p.start+20&&p.gateX!<=p.start+24);
      for(const h of m.items.filter(i=>!['food','gold'].includes(i.kind))) assert.ok(h.x<p.start||h.x>p.end);
      for(const e of m.encounters) assert.ok(e.x<p.gateX!-8||e.x>p.end+8);
      for(const f of m.items.filter(i=>['food','gold'].includes(i.kind))) assert.ok(f.x<p.gateX!-6||f.x>p.end+4);
    }
  }
});
