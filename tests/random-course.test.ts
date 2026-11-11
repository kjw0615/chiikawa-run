import test from 'node:test';
import assert from 'node:assert/strict';
import {RunnerModel, RULES, COURSE_RANDOM, difficultyAt} from '../src/model.ts';
const food = (kind:string) => kind==='food'||kind==='gold';
function course(seed:number, platforms=false, sliced=false) {
  const m=new RunnerModel(seed,true,{platforms,encounters:false});
  if(sliced) for(let d=0;d<=3000;d+=25) {m.distance=d;(m as any).generate();}
  else {m.distance=3000;(m as any).generate();}
  return m;
}
const signature=(m:RunnerModel)=>m.items.map(({id,...i})=>i).sort((a,b)=>a.x-b.x);
test('random course reproduces by seed regardless of generation slices, including food art',()=>{
  for(const seed of [1,7,99,13579]) for(const platforms of [false,true]) {
    assert.deepEqual(signature(course(seed,platforms)),signature(course(seed,platforms,true)));
  }
  assert.notDeepEqual(signature(course(1,true)),signature(course(2,true)));
});
test('hazards draw random types and bounded random gaps instead of a six-item cycle',()=>{
  const firstKinds=new Set<string>(), gaps:number[]=[], counts:Record<string,number>={};let repeats=0;
  for(let seed=1;seed<=32;seed++) {
    const hs=course(seed).items.filter(i=>!food(i.kind));firstKinds.add(hs[0].kind);
    assert.ok(hs[0].x>=COURSE_RANDOM.firstHazardMin&&hs[0].x<=COURSE_RANDOM.firstHazardMax);
    hs.forEach((h,n)=>{
      counts[h.kind]=(counts[h.kind]??0)+1;
      if(!n)return;
      const prior=hs[n-1], gap=h.x-prior.x, base=difficultyAt(prior.x).obstacleSpacing;
      assert.ok(gap>=base-1e-8&&gap<=base+COURSE_RANDOM.hazardExtra+1e-8);
      assert.ok(gap-(h.w+prior.w)/2/RULES.scale>=12.9,'minimum reaction clearance');
      gaps.push(gap-base); if(h.kind===prior.kind)repeats++;
    });
  }
  assert.equal(firstKinds.size,5);assert.ok(repeats>50);
  assert.ok(Math.min(...gaps)<.1&&Math.max(...gaps)>4.9);
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  for(const [kind,n] of Object.entries(counts)) assert.ok(Math.abs(n/total-(kind==='block'?1/3:1/6))<.04);
});
test('food art is random, stable and independent of the gold flag',()=>{
  const variants=new Set<number>(), counts=[0,0,0];let sameNeighbors=0,goldKinds=new Set<number>();
  for(let seed=1;seed<=16;seed++) {
    const fs=course(seed,true).items.filter(i=>food(i.kind)).sort((a,b)=>a.x-b.x);
    fs.forEach((f,n)=>{
      assert.ok(f.variant!==undefined&&f.variant>=0&&f.variant<=2);
      variants.add(f.variant!);counts[f.variant!]++;if(f.kind==='gold')goldKinds.add(f.variant!);
      if(n&&f.variant===fs[n-1].variant)sameNeighbors++;
    });
  }
  assert.equal(variants.size,3);assert.equal(goldKinds.size,3);assert.ok(sameNeighbors>100);
  const total=counts.reduce((a,b)=>a+b,0);for(const n of counts)assert.ok(Math.abs(n/total-1/3)<.05);
});
test('random food placement preserves separation and clear hazard approaches',()=>{
  for(let seed=1;seed<=32;seed++) {
    const m=course(seed,true), fs=m.items.filter(i=>food(i.kind)).sort((a,b)=>a.x-b.x);
    for(let n=0;n<fs.length;n++) {
      const f=fs[n];if(n)assert.ok(f.x-fs[n-1].x>=RULES.minFoodSpacing-1e-8);
      for(const h of m.items.filter(i=>!food(i.kind))) assert.ok(Math.abs(f.x-h.x)>(h.w/2+RULES.halfHitWidth+16)/RULES.scale+RULES.foodHazardMargin-1e-8);
    }
  }
});
test('upper obstacle kinds, food positions and gate offsets also vary safely',()=>{
  const kinds=new Set<string>(), foodOffsets:number[]=[], gateOffsets:number[]=[];
  for(let seed=1;seed<=32;seed++) {
    const m=course(seed,true);
    for(const p of m.platforms) {
      const f=m.items.find(i=>food(i.kind)&&i.x>=p.start+3&&i.x<=p.start+3.5)!;
      assert.ok(f);foodOffsets.push(f.x-p.start);assert.ok(p.y-f.y>=48&&p.y-f.y<=100);
      if(p.gateX!==undefined){gateOffsets.push(p.gateX-p.start);assert.ok(p.gateX-p.start>=20&&p.gateX-p.start<=24);}
      for(const h of m.items.filter(i=>!food(i.kind)&&i.x>=p.start&&i.x<=p.end)) kinds.add(h.kind);
    }
  }
  assert.deepEqual([...kinds].sort(),['beam','block','long']);
  assert.ok(Math.min(...foodOffsets)<3.1&&Math.max(...foodOffsets)>3.4);
  assert.ok(Math.min(...gateOffsets)<20.5&&Math.max(...gateOffsets)>23.5);
});
