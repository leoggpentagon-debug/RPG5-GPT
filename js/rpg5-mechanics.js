// RPG5-GPT deterministic mechanics v1. Pure calculations; no RNG, network, or saves.
(function (root) {
  "use strict";
  const D_SKILLS = new Set([
    "shooting_pistols","shooting_shotguns","shooting_rifles","shooting_assault",
    "shooting_machine_guns","shooting_heavy_weapons","throwing","melee_combat",
    "stealth","first_aid","medicine","lockpicking","eloquence","leadership",
    "radio_communications","guitar","shooting_bow","shooting_crossbow"
  ]);
  const PHYSICAL = new Set(["strength","agility","speed","reaction"]);
  const LIMITS = Object.freeze({
    negative: {ordinary:5,heavy:6,critical:7},
    positive: {ordinary:5,strong:6,exceptional:7}
  });
  const OUTCOMES = ["full_success","partial_success","partial_failure","full_failure"];
  function fail(message) { throw new Error("RPG5 d20: " + message); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function isInt(value,min,max) { return Number.isInteger(value) && value >= min && value <= max; }
  function requiredInt(value,min,max,label) {
    if (!isInt(value,min,max)) fail(label + " должно быть целым числом " + min + "–" + max);
    return value;
  }
  function currentStat(hero,key,max) {
    const source = obj(obj(hero).stats)[key];
    const value = typeof source === "number" ? source : obj(source).current;
    return requiredInt(value,0,max,"Показатель " + key);
  }
  function level(source,id,max) {
    let value;
    if (Array.isArray(source)) value = source.find(s => s && (s.skill_id === id || s.id === id || s.stat_id === id));
    else {
      const data = obj(source);
      value = data[id] ?? obj(data.levels)[id] ?? obj(data.skills)[id];
    }
    if (value === undefined || value === null) return null;
    const found = typeof value === "number" ? value : obj(value).level;
    return requiredInt(found,1,max,"Уровень " + id);
  }
  function loadBand(hero) {
    const weight = obj(obj(hero).carried_weight);
    const kg = weight.known_kg;
    const exact = weight.exact === true &&
      weight.inventory_complete !== false && obj(hero).inventory_complete !== false;
    if (typeof kg !== "number" || !Number.isFinite(kg) || kg < 0)
      return {known_kg:null,complete:false,band:"unknown"};
    if (!exact) return {known_kg:kg,complete:false,band:"unknown"};
    return {known_kg:kg,complete:true,
      band:kg<=18?"normal":kg<=22?"overloaded":"overlimit"};
  }
  function statusList(hero) {
    return Array.isArray(obj(hero).status_effects) ? hero.status_effects : [];
  }
  function prepare(plan,hero,natural=null) {
    const p=obj(plan),h=obj(hero);
    if (p.schema !== "rpg5-d20-plan-v1") fail("неизвестная схема плана");
    if (typeof p.check_id !== "string" || !p.check_id.trim()) fail("нет check_id");
    if (typeof p.action !== "string" || !p.action.trim()) fail("не указано действие");
    if (typeof p.physical !== "boolean") fail("physical должно быть true/false");
    if (p.possible === false) fail("невозможное действие нельзя проверять");
    const baseDC=requiredInt(p.base_dc,1,20,"Базовый DC");
    const situation=obj(p.situation);
    const situational=requiredInt(situation.bonus,0,3,"Ситуационный бонус");
    if (situational>0 && !String(situation.reason||"").trim())
      fail("для ситуационного бонуса нужна причина");
    if (!Array.isArray(p.skill_ids) || !p.skill_ids.every(x=>typeof x==="string"))
      fail("skill_ids должен быть массивом идентификаторов");
    if (p.skill_ids.length>30 || new Set(p.skill_ids).size!==p.skill_ids.length)
      fail("повторные или избыточные навыки");
    if (p.physical_stat != null && (!p.physical || !PHYSICAL.has(p.physical_stat)))
      fail("неверная физическая характеристика");
    if (!Array.isArray(p.applicable_statuses)) fail("нет applicable_statuses");
    const consequences=obj(p.consequences);
    if (!OUTCOMES.every(k=>typeof consequences[k]==="string"&&consequences[k].trim()))
      fail("нужны четыре возможных последствия, определённых до броска");
    const stats={
      health:currentStat(h,"health",3),stamina:currentStat(h,"stamina",3),
      stress:currentStat(h,"stress",5),hunger:currentStat(h,"hunger",4),
      thirst:currentStat(h,"thirst",4)
    };
    if (stats.health===0) fail("герой мёртв; d20 невозможен");
    if (natural!==null) requiredInt(natural,1,20,"Натуральный d20");
    const load=loadBand(h),active=statusList(h);
    const selected=[],ids=new Set();
    for (const raw of p.applicable_statuses) {
      const s=obj(raw),id=s.id;
      if (typeof id!=="string"||!id||ids.has(id)) fail("некорректные или дублирующиеся статусы");
      ids.add(id);
      const known=active.find(x=>obj(x).id===id);
      if (!known || known.confirmed===false ||
          (known.certainty!==undefined && known.certainty!=="confirmed"))
        fail("статус " + id + " не подтверждён в данных героя");
      const polarity=s.polarity, severity=s.severity;
      if (!Object.hasOwn(LIMITS,polarity) || !Object.hasOwn(LIMITS[polarity],severity))
        fail("неверная полярность или степень статуса " + id);
      if (known.polarity && known.polarity!==polarity) fail("полярность статуса не совпала");
      if (known.severity && known.severity!==severity) fail("степень статуса не совпала");
      const dc=requiredInt(s.dc_adjustment,0,20,"Поправка DC от статуса");
      if (polarity==="positive"&&dc) fail("положительный статус не увеличивает DC");
      if (id==="overloaded") {
        if (!p.physical || polarity!=="negative"||severity!=="heavy"||dc!==0)
          fail("перегрузка даёт -2 только на физические d20, не поправку DC");
        if (load.complete&&load.band!=="overloaded")
          fail("перегрузка противоречит точной массе");
      }
      if (dc>0&&!String(s.reason||"").trim())
        fail("поправке DC требуется обоснование");
      selected.push({id,polarity,severity,dc_adjustment:dc,reason:String(s.reason||"")});
    }
    // Exact mass or an already confirmed active status establishes overload.
    const confirmedOverload=active.some(x=>obj(x).id==="overloaded"&&
      x.confirmed!==false&&(x.certainty===undefined||x.certainty==="confirmed"));
    const overload=p.physical && (load.band==="overloaded"||(confirmedOverload&&!load.complete));
    if (overload&&!ids.has("overloaded"))
      selected.push({id:"overloaded",polarity:"negative",severity:"heavy",dc_adjustment:0,reason:"Перегрузка"});
    if (load.complete&&load.band==="overlimit") fail("масса более 22 кг: требуется сверка с каноном");
    const finalDC=baseDC+selected.reduce((n,s)=>n+s.dc_adjustment,0);
    if (!isInt(finalDC,1,20)) fail("итоговый DC вышел за пределы 1–20");
    let bonusLimit=5,penaltyLimit=5;
    for(const s of selected){
      const value=LIMITS[s.polarity][s.severity];
      if(s.polarity==="positive")bonusLimit=Math.max(bonusLimit,value);
      else penaltyLimit=Math.max(penaltyLimit,value);
    }
    const physicalLevel=p.physical_stat?level(h.physical,p.physical_stat,5):null;
    const effectiveLevel=p.physical_stat==="speed"&&overload&&physicalLevel!==null?
      Math.max(1,physicalLevel-2):physicalLevel;
    const physicalBonus=effectiveLevel===null?0:effectiveLevel<=2?0:effectiveLevel-2;
    const insurablePhysical=effectiveLevel!==null&&effectiveLevel>=2;
    const insuranceWindow=natural!==null&&natural<=9;
    const candidates=[{id:null,level:null,base:0,insurable:false}];
    for(const id of p.skill_ids){
      if (!D_SKILLS.has(id)) fail("навык " + id + " не имеет бонуса D");
      const skillLevel=level(h.skills,id,7);
      if (skillLevel===null) continue; // Not learned, never invent a level.
      candidates.push({id,level:skillLevel,base:Math.ceil(skillLevel/2),
        insurable:[2,4,6,7].includes(skillLevel)});
    }
    candidates.sort((a,b)=>{
      const score=x=>x.base+(insuranceWindow&&!insurablePhysical&&x.insurable?1:0);
      return score(b)-score(a) || b.base-a.base || String(a.id).localeCompare(String(b.id));
    });
    const chosen=candidates[0];
    const insured=insuranceWindow&&(insurablePhysical||chosen.insurable);
    const bonusRaw=chosen.base+physicalBonus+situational+(insured?1:0);
    const bonus=Math.min(bonusRaw,bonusLimit);
    const penalties=[
      ["Здоровье",[2,1,0,0][stats.health]],
      ["Стресс",[0,0,0,1,2,4][stats.stress]],
      ["Выносливость",p.physical?[2,1,0,0][stats.stamina]:0],
      ["Голод",[2,1,0,0,0][stats.hunger]],
      ["Жажда",[3,2,1,0,0][stats.thirst]],
      ["Перегрузка",overload?2:0]
    ].filter(x=>x[1]>0).map(([reason,value])=>({reason,value}));
    const penaltyRaw=penalties.reduce((n,x)=>n+x.value,0);
    const penalty=Math.min(penaltyRaw,penaltyLimit);
    const result={
      schema:"rpg5-d20-result-v1",check_id:p.check_id,action:p.action,
      base_dc:baseDC,dc_adjustments:selected.filter(s=>s.dc_adjustment>0).map(s=>({
        status_id:s.id,value:s.dc_adjustment,reason:s.reason})),dc:finalDC,
      skill_id:chosen.id,skill_level:chosen.level,physical_stat:p.physical_stat||null,
      physical_level:effectiveLevel,physical_bonus:physicalBonus,skill_bonus:chosen.base,
      situation_bonus:situational,insurance:insured?1:0,
      insurance_possible:insurablePhysical||candidates.some(s=>s.insurable),
      bonus_raw:bonusRaw,bonus,bonus_limit:bonusLimit,
      penalties,penalty_raw:penaltyRaw,penalty,penalty_limit:penaltyLimit,
      overload_applied:overload,load_assessment:load,
      natural, total:null,category:null
    };
    if(natural!==null){
      result.total=natural+bonus-penalty;
      const delta=result.total-finalDC;
      result.category=delta>=5?"full_success":delta>=0?"partial_success":
        delta>=-4?"partial_failure":"full_failure";
    }
    return result;
  }
  root.RPG5_MECHANICS=Object.freeze({
    version:"1.0.0",loadBand,
    preview:(plan,hero)=>prepare(plan,hero),
    calculateD20:(plan,hero,natural)=>prepare(plan,hero,natural)
  });
})(typeof window!=="undefined"?window:globalThis);
