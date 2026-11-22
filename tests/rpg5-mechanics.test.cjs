// Run with: node --test tests/rpg5-mechanics.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../js/rpg5-mechanics.js"),"utf8");
const context={window:{}};
vm.runInNewContext(source,context);
const M=context.window.RPG5_MECHANICS;
const hero=(extra={})=>({
 stats:{health:{current:3},stamina:{current:3},stress:{current:0},hunger:{current:4},thirst:{current:4}},
 skills:{},physical:{},status_effects:[],
 carried_weight:{known_kg:10,exact:true,inventory_complete:true},inventory_complete:true,
 ...extra
});
const plan=(extra={})=>({
 schema:"rpg5-d20-plan-v1",check_id:"test-check",action:"Учебная проверка",
 physical:true,possible:true,base_dc:10,skill_ids:[],physical_stat:null,
 situation:{bonus:0},applicable_statuses:[],
 consequences:{full_success:"A",partial_success:"B",partial_failure:"C",full_failure:"D"},
 ...extra
});
const roll=(p,h,n)=>M.calculateD20(p,h,n);

test("neutral d20 and four outcome categories",()=>{
 assert.equal(roll(plan(),hero(),1).category,"full_failure");
 assert.equal(roll(plan(),hero(),6).category,"partial_failure");
 assert.equal(roll(plan(),hero(),10).category,"partial_success");
 assert.equal(roll(plan(),hero(),15).category,"full_success");
 assert.equal(roll(plan({base_dc:20}),hero(),20).category,"partial_success");
});
test("stat penalties: health, stress, stamina, hunger, thirst",()=>{
 const h=hero({stats:{
  health:{current:1},stamina:{current:0},stress:{current:5},
  hunger:{current:0},thirst:{current:0}
 }});
 const result=roll(plan(),h,12);
 assert.equal(result.penalty_raw,13);
 assert.equal(result.penalty_limit,5);
 assert.equal(result.penalty,5);
});
test("level 4 skill insurance applies only at 1-9",()=>{
 const h=hero({skills:{melee_combat:{level:4}}});
 const p=plan({skill_ids:["melee_combat"]});
 assert.equal(roll(p,h,9).bonus,3);
 assert.equal(roll(p,h,10).bonus,2);
});
test("skill insurance and physical insurance never stack",()=>{
 const h=hero({skills:{melee_combat:{level:4}},physical:{agility:{level:3}}});
 const p=plan({skill_ids:["melee_combat"],physical_stat:"agility"});
 const v=roll(p,h,4);
 assert.equal(v.insurance,1);
 assert.equal(v.bonus,4);
});
test("positive and negative limits are independent",()=>{
 const h=hero({stats:{health:{current:1},stamina:{current:1},stress:{current:5},
   hunger:{current:0},thirst:{current:0}},skills:{melee_combat:{level:7}},
   physical:{strength:{level:5}},status_effects:[
    {id:"neg",polarity:"negative",severity:"critical",certainty:"confirmed"},
    {id:"pos",polarity:"positive",severity:"exceptional",certainty:"confirmed"}
   ]});
 const p=plan({skill_ids:["melee_combat"],physical_stat:"strength",
   situation:{bonus:3,reason:"Помощь"},applicable_statuses:[
    {id:"neg",polarity:"negative",severity:"critical",dc_adjustment:0},
    {id:"pos",polarity:"positive",severity:"exceptional",dc_adjustment:0}
   ]});
 const v=roll(p,h,2);
 assert.equal(v.bonus_limit,7);
 assert.equal(v.bonus,7);
 assert.equal(v.penalty_limit,7);
 assert.equal(v.penalty,7);
});
test("injury affects DC, not direct penalty",()=>{
 const h=hero({status_effects:[{id:"bruise",polarity:"negative",severity:"ordinary",certainty:"confirmed"}]});
 const p=plan({base_dc:11,applicable_statuses:[
  {id:"bruise",polarity:"negative",severity:"ordinary",dc_adjustment:3,reason:"Ушиб"}]});
 const v=roll(p,h,12);
 assert.equal(v.dc,14);
 assert.equal(v.penalty,0);
});
test("overload applies -2 and speed -2 only to physical d20",()=>{
 const h=hero({carried_weight:{known_kg:19,exact:true,inventory_complete:true},
 physical:{speed:{level:5}}});
 const physical=roll(plan({physical_stat:"speed"}),h,9);
 assert.equal(physical.penalty,2);
 assert.equal(physical.penalty_limit,6);
 assert.equal(physical.physical_level,3);
 const social=roll(plan({physical:false}),h,9);
 assert.equal(social.penalty,0);
 assert.equal(social.penalty_limit,5);
});
test("known incomplete load is not silently declared exact",()=>{
 const h=hero({carried_weight:{known_kg:19,exact:false}});
 assert.equal(M.loadBand(h).band,"unknown");
 assert.equal(roll(plan(),h,15).overload_applied,false);
});
test("thresholds 18 and 22 kg",()=>{
 assert.equal(M.loadBand(hero({carried_weight:{known_kg:18,exact:true}})).band,"normal");
 assert.equal(M.loadBand(hero({carried_weight:{known_kg:22,exact:true}})).band,"overloaded");
 assert.equal(M.loadBand(hero({carried_weight:{known_kg:23,exact:true}})).band,"overlimit");
});
test("reject missing stats, invalid roll, unconfirmed status, missing outcomes",()=>{
 assert.throws(()=>roll(plan(),hero({stats:{}}),9));
 assert.throws(()=>roll(plan(),hero(),21));
 assert.throws(()=>roll(plan({consequences:{}}),hero(),9));
 assert.throws(()=>roll(plan({applicable_statuses:[{
  id:"injury",polarity:"negative",severity:"heavy",dc_adjustment:0
 }]}),hero(),9));
});
test("arithmetic remains deterministic without consuming randomness",()=>{
 const p=plan({base_dc:10});
 assert.equal(roll(p,hero(),13).total,13);
 assert.equal(M.preview(p,hero()).natural,null);
});
test("site-generated d20 is always between 1 and 20",()=>{
 const numbers=[0,1,18,19,20,99,123456,4294967279];
 let i=0,calls=0;
 context.window.crypto={getRandomValues(words){calls++;words[0]=numbers[i++];return words;}};
 for(let value=1;value<=20;value++){
  if(i>=numbers.length)break;
  const result=M.rollAndCalculate(plan(),hero());
  assert.ok(result.natural>=1&&result.natural<=20);
  assert.equal(result.random_source,"browser_crypto");
  assert.equal(result.total,result.natural);
 }
 assert.equal(calls,numbers.length);
});
test("rejection sampling discards biased uint32 tail and accepts next word",()=>{
 let attempts=0;
 context.window.crypto={getRandomValues(words){
  words[0]=attempts++===0?0xffffffff:19;
  return words;
 }};
 const result=M.rollAndCalculate(plan(),hero());
 assert.equal(attempts,2);
 assert.equal(result.natural,20);
});
test("invalid plan must not consume randomness",()=>{
 let calls=0;
 context.window.crypto={getRandomValues(words){calls++;words[0]=7;return words;}};
 assert.throws(()=>M.rollAndCalculate(plan({base_dc:0}),hero()));
 assert.equal(calls,0);
 const result=M.rollAndCalculate(plan(),hero());
 assert.equal(calls,1);
 assert.equal(result.natural,8);
});
test("no random number source means an error, never a predictable fallback",()=>{
 delete context.window.crypto;
 assert.throws(()=>M.rollAndCalculate(plan(),hero()),/генератор/);
});
