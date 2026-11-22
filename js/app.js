(() => {
  "use strict";
  const BUILD = "RPG6-AUTO-D20-UI";
  // Stable protocol version (not the Edge Function deployment number).
  const SUPPORTED_API_VERSION = 1;
  const config = window.RPG6_CONFIG || {};
  // Access code is entered by the player, never embedded in hosted source files.
  const ACCESS_KEY = "rpg6_access_session";
  const PERSISTED_ACCESS_KEY = "rpg6_access_remembered_v1";
  const validAccess = value => /^RPG6-[A-Za-z0-9_-]{30,100}$/.test(value);
  let token = "";
  let accessRemembered = false;
  // Persistent storage is opt-in only. Nothing about the code goes in the URL.
  try {
    const stored = localStorage.getItem(PERSISTED_ACCESS_KEY) || "";
    if (validAccess(stored)) { token=stored;accessRemembered=true; }
    else if (stored) localStorage.removeItem(PERSISTED_ACCESS_KEY);
  } catch { /* persistent storage blocked */ }
  if (!token) {
    try { token = sessionStorage.getItem(ACCESS_KEY) || ""; } catch { /* storage disabled */ }
  }
  function getAccessToken() {
    if (token) return token;
    const entered = window.prompt("Введи личный код доступа к игре. Он не публикуется на сайте.");
    if (entered === null || !entered.trim()) throw new Error("Для продолжения игры требуется личный код доступа RPG6.");
    const next = entered.trim();
    if (!validAccess(next))
      throw new Error("Неверный формат кода RPG6. Проверь его и попробуй снова.");
    token = next;
    try { sessionStorage.setItem(ACCESS_KEY,token); } catch { /* one-tab memory only */ }
    return token;
  }
  function clearAccessToken() {
    token = "";
    accessRemembered = false;
    try { sessionStorage.removeItem(ACCESS_KEY); } catch { /* storage disabled */ }
    try { localStorage.removeItem(PERSISTED_ACCESS_KEY); } catch { /* storage disabled */ }
    const rememberBox=document.getElementById("remember-access");
    if(rememberBox)rememberBox.checked=false;
  }
  const $ = id => document.getElementById(id);
  const nameById = {oliver_hayes:"Оливер Хейз",bex:"Бекс",ian_calder:"Иэн Колдер"};
  const state = {loaded:false,busy:false,revision:0,sequence:0,draft:[],scene:null,hero:null,pending:null};
  const portrait = id => (typeof APPROVED_PORTRAITS !== "undefined" && APPROVED_PORTRAITS[id]) || "";
  const word = text => text == null ? "" : String(text);
  const safeObj = x => x && typeof x === "object" && !Array.isArray(x) ? x : {};
  const many = x => Array.isArray(x) ? x : [];
  const uuid=()=>{if(!globalThis.crypto?.randomUUID)throw new Error("Запусти игру через Live Server (localhost), а не из file://");return crypto.randomUUID()};
  const report = (message,bad=false) => { $("status").textContent=message; $("status").classList.toggle("error",bad); $("diagnostic").textContent=`${BUILD}\n${message}\nАдрес: ${location.href}`; };
  async function rpc(op,data={}) {
    if(!config.supabaseUrl || !config.edgeFunction)throw new Error("Нет адреса Supabase в js/config.js");
    const requestToken = getAccessToken();
    const timer=new AbortController();const time=setTimeout(()=>timer.abort(),op==="save"?138000:op==="turn"?148000:25000);
    let response;
    try {
      response=await fetch(`${config.supabaseUrl}/functions/v1/${config.edgeFunction}`,{
        method:"POST",mode:"cors",cache:"no-store",signal:timer.signal,
        headers:{"Content-Type":"application/json","apikey":config.publishableKey,"x-rpg6-access":requestToken},
        body:JSON.stringify({op,...data}),
      });
    } catch(error){throw new Error(error?.name ? `${error.name}: ${error.message||String(error)}` : String(error));}
    finally{clearTimeout(time)}
    const raw=await response.text();let val;
    try{val=JSON.parse(raw)}catch{throw new Error("Ответ сервера не JSON, HTTP "+response.status+": "+raw.slice(0,300));}
    if(!response.ok || val?.error){
      const problem=word(val?.error||"HTTP "+response.status);
      if(response.status===401 || response.status===403 ||
         /(?:неверн.{0,30}код|неверн.{0,30}токен|invalid.{0,30}(?:token|access)|unauthori[sz]ed|игровой код отсутствует)/i.test(problem))
        clearAccessToken();
      throw new Error(problem);
    }
    // The semantic API contract is stable. Build strings are diagnostics ONLY.
    // Legacy server success statuses "staged" and "ok" have identical turn payloads.
    if(val?.schema !== undefined && val.schema !== "rpg6")
      throw new Error("Неверная схема сервера RPG6: "+word(val.schema));
    if(val?.api_version !== undefined && Number(val.api_version) !== SUPPORTED_API_VERSION)
      throw new Error("Версия API не поддерживается (сервер: "+word(val.api_version)+
        ", HTML: "+SUPPORTED_API_VERSION+"). Обнови интерфейс.");
    if(op==="health" && (val?.status!=="ok" || val?.schema!=="rpg6"))
      throw new Error("Не удалось проверить RPG6 API: неверные служебные поля health.");
    if(op==="load" && (!val?.scene || !val?.hero || !Array.isArray(val?.draft_turns) ||
         !Number.isInteger(Number(val?.draft_sequence))))
      throw new Error("Ответ загрузки RPG6 неполный: не хватает scene, hero или draft_turns.");
    if(op==="turn" && (!val?.reply || typeof val.reply.narration!=="string" ||
         !Number.isInteger(Number(val?.draft_sequence))))
      throw new Error("Ответ игрового хода RPG6 неполный: не хватает reply.narration или draft_sequence.");
    if(op==="save" && !["saved","nothing_to_save"].includes(val?.status))
      throw new Error("Неизвестный результат сохранения RPG6: "+word(val?.status||"отсутствует"));
    return val;
  }
  function busy(flag){state.busy=flag;$("start").disabled=flag;$("send").disabled=flag||!state.loaded||!!state.pending;$("save").disabled=flag||!state.loaded||state.sequence===0;$("export").disabled=flag||!state.loaded;$("action").disabled=flag||!state.loaded||!!state.pending;$("send-roll").disabled=flag||!state.loaded||!state.pending?.saved;$("send").textContent=flag?"Обрабатывается…":"Отправить действие";}
  function child(tag, className="", text="") {const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=word(text);return el;}
  function msg(label,text,kind="gm",speakerId=""){
    if(!word(text))return;
    // Dialogue now uses speaker names only; portraits belong on the nearby dossier board.
    const wrap=child("div","chat-entry "+kind);wrap.dataset.speakerId=speakerId||"";
    const bubble=child("div","bubble");bubble.append(child("b","",label),child("div","",text));wrap.append(bubble);$("chat").append(wrap);
  }
  function zoom(src,label){$("portrait-full").src=src;$("portrait-full").alt=label;$("portrait-dialog").showModal()}
  // The hero portrait now opens the animated dossier on a 500ms hold (profile-ui.js).
  $("portrait-close").addEventListener("click",()=>$("portrait-dialog").close());
  // A narration is one ordered stream. Speech ranges refer to this single text,
  // so NPC dialogue is never duplicated or moved to the end of the scene.
  // Ordered parts. Modern scenes use server-provided character ranges;
  // older drafts contain speech inside prose and sometimes duplicate dialogue arrays.
  function storyChunks(reply) {
    const r=safeObj(reply),narration=word(r.narration);
    const ranges=many(r.segments).map(safeObj);
    if(ranges.length && ranges.every((s,i)=>
      ["narration","dialogue"].includes(s.type) && Number.isInteger(s.start) &&
      Number.isInteger(s.end) && s.start>=0 && s.end>s.start &&
      s.end<=narration.length && (i===0||ranges[i-1].end<=s.start))) {
      return ranges.map(s=>({type:s.type,text:narration.slice(s.start,s.end),
        speaker_id:word(s.speaker_id),name:word(s.name)}));
    }

    const old=many(r.dialogue).map(safeObj).filter(d=>word(d.text).trim());
    const normalize=s=>word(s).toLowerCase().replace(/ё/g,"е")
      .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/g," ").trim();
    const startKey=s=>normalize(s).slice(0,Math.min(21,normalize(s).length));
    const identities=[
      {speaker_id:"ian_calder",name:"Иэн",forms:["Иэн","Иан"]},
      {speaker_id:"bex",name:"Бекс",forms:["Бекс"]},
      {speaker_id:"oliver_hayes",name:"Оливер",forms:["Оливер"]}
    ];
    for(const d of old){
      if(!d.speaker_id||!d.name||identities.some(x=>x.speaker_id===d.speaker_id))continue;
      identities.push({speaker_id:d.speaker_id,name:d.name,forms:[d.name]});
    }
    const knownSpeaker=actor=>actor ? {speaker_id:actor.speaker_id,name:actor.name} : null;
    function findActor(text){
      const str=word(text);
      let best=null,bestIndex=Infinity;
      for(const actor of identities)for(const form of actor.forms){
        const index=str.toLowerCase().indexOf(form.toLowerCase());
        if(index>=0 && index<bestIndex){bestIndex=index;best=actor;}
      }
      return bestIndex<130?knownSpeaker(best):null;
    }
    function matchListedSpeech(text){
      const normalized=normalize(text);
      for(const d of old){
        const key=startKey(d.text);
        if(key.length>=12 && normalized.startsWith(key))
          return {speaker_id:word(d.speaker_id),name:word(d.name)};
      }
      return null;
    }
    const chunks=[],seen=new Set();
    let contextSpeaker=null;
    const put=(type,text,speaker=null)=>{
      if(!word(text).trim())return;
      const clean=word(text).trim();
      if(type==="dialogue" && speaker && speaker.speaker_id){
        chunks.push({type:"dialogue",text:clean,
          speaker_id:speaker.speaker_id,name:speaker.name});
      }else chunks.push({type:"narration",text:clean});
    };
    const attributionPattern=/([,!?])\s*[—–]\s*([^—–]{4,180}?[.!?])\s*[—–]\s*/g;
    function speakParagraph(full,speaker){
      const spoken=full.replace(/^\s*[—–]\s*/,"");
      if(!speaker?.speaker_id){put("narration",full);return;}
      let cursor=0,match;
      attributionPattern.lastIndex=0;
      while((match=attributionPattern.exec(spoken))){
        const comment=match[2];
        if(!/(?:говор|сказ|отвеч|отзыва|шеп|произн|броса|спрос|бурч|прошеп|губы|голос|улыб|взгляд|кив|оборачива|прикрыва|поднима|пожима)/i.test(comment))
          continue;
        put("dialogue",spoken.slice(cursor,match.index+1),speaker);
        put("narration",comment);
        cursor=attributionPattern.lastIndex;
      }
      put("dialogue",spoken.slice(cursor),speaker);
      contextSpeaker=speaker;
    }
    for(const paragraph of narration.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean)){
      const inline=paragraph.match(/^([\s\S]{1,400}?:)\s*(—\s*[\s\S]+)$/);
      if(inline){
        put("narration",inline[1]);
        contextSpeaker=findActor(inline[1])||contextSpeaker;
        const candidate=matchListedSpeech(inline[2])||contextSpeaker;
        speakParagraph(inline[2],candidate);
      }else if(/^\s*[—–]\s*/.test(paragraph)){
        const candidate=matchListedSpeech(paragraph.replace(/^\s*[—–]\s*/,""))
          ||findActor(paragraph.match(/(?:сказал|сказала|говорит|отвечает|шепчет|отзывается)\s+([^\s,.]+)/i)?.[1]||"")
          ||contextSpeaker;
        speakParagraph(paragraph,candidate);
      }else{
        put("narration",paragraph);
        contextSpeaker=findActor(paragraph.split(/[.!?]/)[0])||contextSpeaker;
      }
    }
    // If a complete legacy speech line was already embedded in narration,
    // do not render it a second time after the story.
    const normalizedNarration=normalize(narration);
    for(const d of old){
      const key=startKey(d.text);
      if(key.length>=12&&normalizedNarration.includes(key))continue;
      const id=word(d.speaker_id),spoken=word(d.text);
      const hash=id+"|"+normalize(spoken);
      if(seen.has(hash))continue;seen.add(hash);
      put("dialogue",spoken,{speaker_id:id,name:word(d.name)});
    }
    return chunks;
  }
  // Tiny attribution/gesture asides belong visually to their speaker bubble,
  // not as a detached narrator paragraph. Full actions remain narration.
  function joinMicroGestures(parts){
    const blocks=parts.map(p=>({...p}));
    const isMicro=s=>{
      const v=word(s).trim();
      return v.length>0&&v.length<=90
        && /(?:кив(?:ает|нула|нул)|вздых(?:ает|нула|нул)|усмеха(?:ется|ется)|говорит|сказала|сказал|отвечает|прошептала|прошептал|пожимает плечами)/i.test(v)
        && /^(?:(?:Бекс|Иэн|Иан|Оливер)\s+)?(?:(?:коротко|тихо|нервно|молча|едва заметно|сдержанно)\s+)?(?:кив|вздых|усмех|говор|сказ|отвеч|прошепт|пожима)/i.test(v);
    };
    function who(text) {
      if(/\bБекс\b/i.test(text))return "bex";
      if(/\bИэн\b|\bИан\b/i.test(text))return "ian_calder";
      if(/\bОливер\b/i.test(text))return "oliver_hayes";
      return "";
    }
    for(let i=blocks.length-1;i>=0;i--){
      const part=blocks[i];if(part.type!=="narration"||!isMicro(part.text))continue;
      const hinted=who(part.text);
      const before=blocks[i-1],after=blocks[i+1];
      const same=b=>b?.type==="dialogue"&&b.speaker_id&&(!hinted||b.speaker_id===hinted);
      const target=same(before)?before:(same(after)?after:null);
      if(!target)continue;
      const direction=part.text.trim().replace(/[.!]+$/,"");
      if(target===before)target.text+="\n("+direction+")";
      else target.text="("+direction+")\n"+target.text;
      blocks.splice(i,1);
    }
    return blocks;
  }
  function showReply(reply){
    const r=safeObj(reply);
    if(r.roll){const v=r.roll;msg("🎲 ПРОВЕРКА d20",`Натуральный: ${v.natural}\n${v.natural} − ${v.negative} + ${v.positive} = ${v.total}; DC ${v.dc}\n${v.category}: ${v.consequence}`,"system")}
    for(const part of joinMicroGestures(storyChunks(r))){
      // Old draft diagnostic markers belong to the service log, not the story.
      const clean=part.text.replace(/\[Недостаточно данных для корректного плана d20: проверка не открыта\.\]/g,"").trim();
      if(!clean)continue;
      if(part.type==="dialogue"){
        const hero=part.speaker_id==="oliver_hayes";
        msg(part.name||nameById[part.speaker_id]||part.speaker_id||"Персонаж",
          clean,hero?"player":"npc",part.speaker_id);
      }else msg("",clean,"gm");
    }
    $("choices").replaceChildren();for(const choice of many(r.choices)){const b=child("button","",choice);b.addEventListener("click",()=>{if(state.busy||!state.loaded)return;$("action").value=choice;void act()});$("choices").append(b)}
  }
  function showRoll(){
    const savedRoll=safeObj(safeObj(state.scene).pending_roll);
    const pending=safeObj(state.pending);
    const actual=savedRoll.check_id?savedRoll:pending.check_id?pending:null;
    $("roll-panel").hidden=!actual;
    if(actual){
      const lines=[`Действие: ${actual.action||"Проверка"}`,`DC: ${actual.base_dc||"?"} → ${actual.final_dc||"?"}`,
        `Бонус: +${actual.fixed_bonus||0}/${actual.bonus_limit||5}; штраф: −${actual.fixed_penalty||0}/${actual.penalty_limit||5}`,
        `Страховка +1 при натуральном 1–9: ${actual.insurance_available?"возможна":"нет"}`,
        `Полный успех: ${safeObj(actual.outcomes).full_success||"—"}`,
        `Частичный успех: ${safeObj(actual.outcomes).partial_success||"—"}`,
        `Частичная неудача: ${safeObj(actual.outcomes).partial_failure||"—"}`,
        `Полная неудача: ${safeObj(actual.outcomes).full_failure||"—"}`];
      $("roll-details").textContent=lines.join("\n");
      $("send-roll").textContent=savedRoll.check_id?"АВТОМАТИЧЕСКИЙ d20":"СНАЧАЛА СОХРАНИТЬ RPG6";
    }
    state.pending=actual?{...actual,saved:!!savedRoll.check_id}:null;
    busy(state.busy);
  }
  function renderState(data){
    const scene=safeObj(data.scene),hero=safeObj(data.hero),observable=safeObj(data.player_observable);
    state.scene=scene;state.hero=hero;state.revision=Number(data.revision||0);
    state.sequence=Number(data.draft_sequence||0);state.draft=many(data.draft_turns);state.loaded=true;
    $("scene-counter").textContent=`СЮЖЕТНАЯ ЛИНИЯ · ЭПИЗОД ${scene.episode_number??"?"} · СЦЕНА ${scene.scene_number??"?"}`;
    $("scene-title").textContent=`Сцена ${scene.scene_number??"?"}`;
    $("scene-location").textContent=scene.location_detail||observable.location_detail||"Местоположение не уточнено";
    $("scene-text").textContent=observable.scene_text||scene.scene_text||"Сохранённая сцена не содержит текста";
    $("canon-revision").textContent="Каноническая ревизия RPG6: "+state.revision;
    $("draft-count").textContent="Черновых ходов: "+state.sequence;
    const stats=safeObj(hero.stats);$("hero-stats").replaceChildren();for(const [key,label] of Object.entries({health:"Здоровье",stamina:"Выносливость",stress:"Стресс",hunger:"Голод",thirst:"Жажда"})){
      const v=safeObj(stats[key]);const box=child("div","stat-chip");box.title=label+": "+(v.current??"—")+"/"+(v.max??"—");box.setAttribute("aria-label",box.title);
      const icon=child("img","stat-icon");const current=Number(v.current);
      icon.alt="";icon.src="assets/status/"+key+"/"+key+"_"+(Number.isFinite(current)?current:"unknown")+".webp";
      icon.addEventListener("error",()=>{const fb=child("span","stat-fallback",({health:"♥",stamina:"⚡",stress:"◉",hunger:"◴",thirst:"💧"})[key]);icon.replaceWith(fb)},{once:true});
      box.append(icon,child("strong","",(v.current??"—")+"/"+(v.max??"—")));$("hero-stats").append(box);
    }
    // Dynamic companions dossier board. Every confirmed nearby character gets
    // a Polaroid, including characters who do not have an approved photograph.
    const party=many(observable.characters).filter(x=>
      x && typeof x==="object" && x.character_id!=="oliver_hayes");
    const partyFragment=document.createDocumentFragment();
    for(const [partyIndex,person] of party.entries()){
      const id=person.character_id;
      const name=person.name||person.display_name||nameById[id]||"Человек рядом";
      const row=child("div","party-person");
      const frame=child("div","polaroid polaroid-npc");
      const imagePath=portrait(id);
      // A known photograph can be enlarged. Unknown photographs show a
      // non-interactive question mark without inventing a face.
      const holder=child("button","portrait-button");
      holder.type="button";
      holder.dataset.partyIndex=String(partyIndex);
      holder.setAttribute("aria-label","Удерживай 0,5 секунды, чтобы открыть досье "+name);
      const placeholder=()=>{
        holder.classList.add("portrait-is-unknown");
        holder.replaceChildren(child("span","party-portrait-unknown","?"));
        holder.setAttribute("aria-label","Фотография "+name+" неизвестна. Удерживай 0,5 секунды для досье.");
      };
      if(imagePath){
        const img=child("img");img.src=imagePath;img.alt=name;img.loading="lazy";
        img.addEventListener("error",placeholder,{once:true});
        holder.append(img);
      }else{
        placeholder();
      }
      // Short first names on the paper keep the dossier readable at 100% zoom.
      // The full name is still used in the game state, alt text and tooltip.
      const shortName=String(name).trim().split(/\s+/)[0]||name;
      const label=child("div","party-portrait-name");
      label.append(child("strong","",shortName));
      frame.title=name; // full name also available on hover
      frame.append(holder,label);
      row.append(frame);
      partyFragment.append(row);
    }
    if(!party.length)partyFragment.append(child("p","muted","Никого рядом не установлено"));
    $("party").replaceChildren(partyFragment);
    // Fit the hand-lettered given names onto the EXISTING paper tabs.
    // Refit once the optional web font loads; offline fallback remains legible.
    const fitPartyNames=()=>{
      for(const label of $("party").querySelectorAll(".party-portrait-name")){
        const title=label.querySelector("strong");
        if(!title || !title.isConnected)continue;
        for(let size=20;size>=11;size-=.5){
          title.style.fontSize=size+"px";
          if(title.scrollWidth<=label.clientWidth-3 &&
             title.scrollHeight<=label.clientHeight-1)break;
        }
      }
    };
    requestAnimationFrame(fitPartyNames);
    if(document.fonts && document.fonts.status!=="loaded"){
      document.fonts.ready.then(()=>requestAnimationFrame(fitPartyNames));
    }
    $("inventory").replaceChildren();const inv=safeObj(hero.inventory);const items=many(inv.items);
    for(const item of items){const wrap=child("div","inventory-item");wrap.append(child("strong","",item.name||item.item_id||"Предмет"),child("small","",`Количество: ${item.quantity??"не уточнено"} ${item.unit||""} · ${item.location||item.location_scope||"место неизвестно"}`));$("inventory").append(wrap)}
    if(!items.length)$("inventory").append(child("p","muted","Инвентарь пока пуст или не указан"));
    $("weight-label").textContent=inv.complete?"Инвентарь полностью учтён":"Инвентарь может быть неполным";
    $("chat").replaceChildren();
    msg("ТЕКУЩАЯ СЦЕНА",observable.scene_text||scene.scene_text||"Сцена загружена.","system");
    const history=safeObj(data.saved_history);
    const saved=many(history.saved_turns);
    if(saved.length){
      msg("ИСТОРИЯ СОХРАНЁННЫХ ХОДОВ",`Восстановлено ${saved.length} ходов из серверного архива. Архив не является новым игровым событием.`,"system");
      for(const record of saved){
        const turn=safeObj(record),reply=safeObj(turn.reply);
        const partial=turn.source==="recovered_partial";
        const label="Оливер";
        msg(label,turn.action||"Действие не сохранилось полностью","player","oliver_hayes");
        if(partial && !reply.narration && !many(reply.segments).length) {
          if(reply.summary)msg("СОХРАНЁННАЯ СВОДКА · НЕ ПОЛНЫЙ ТЕКСТ",reply.summary,"system");
        } else showReply({...reply,choices:[]});
      }
    } else {
      const latest=new Set(many(history.last_commit_event_ids).map(Number));
      for(const event of many(history.recent_events)){
        const e=safeObj(event);
        if(latest.has(Number(e.event_id)))msg("",e.summary,"system");
      }
    }
    for(const turn of state.draft){msg("Оливер",turn.action,"player","oliver_hayes");showReply(turn.reply)}
    $("save-info").textContent=`Канон: ревизия ${state.revision}. ${state.sequence} несохранённых ходов. Сохранение только по явной команде.`;
    state.pending=data.pending_roll||null;showRoll();busy(false);
    window.dispatchEvent(new CustomEvent("rpg6:render",{detail:{scene,observable,hero}}));
    $("chat").scrollTop=$("chat").scrollHeight;
  }
  async function start(){busy(true);report("Загружаю настоящую сохранённую сцену RPG6…");try{
    const meta=await rpc("health");if(!meta.gemini_configured)report("Сервер работает, но в Secrets нет GEMINI_API_KEY. Сцену можно загрузить, но Gemini пока не ответит.",true);
    const data=await rpc("load");if(data.readiness!=="ready")throw new Error("Каноническая RPG6 не готова: "+data.readiness);
    renderState(data);report(`Подключено. RPG6 ревизия ${state.revision}, день ${safeObj(state.scene).day}, сцена ${safeObj(state.scene).scene_number}.`);
    if(!meta.gemini_configured)report("Сцена из RPG6 загружена. Для ответов Gemini добавь GEMINI_API_KEY в Edge Functions → Secrets.",true);
  }catch(error){report(error.message||String(error),true)}finally{busy(false);if(state.pending?.saved)void act("auto")}}
  async function act(roll=null){if(state.busy)return;const action=$("action").value.trim();if(roll===null && !action)return;
    if(roll===null && action.toLowerCase()==="сохранить"){await save();return;}
    busy(true);report("Отправляю ход Gemini. Каноническая база не меняется до сохранения.");
    try{
      const result=await rpc("turn",{draft_sequence:state.sequence,action, ...(roll===null?{}:{roll})});
      const actionShown=roll===null?action:"🎲 Автоматический бросок d20";
      state.sequence=Number(result.draft_sequence);state.pending=result.pending_roll||null;
      msg("Оливер",actionShown,"player","oliver_hayes");showReply(result.reply);
      state.draft.push({turn:state.sequence,action:actionShown,reply:result.reply});
      $("action").value="";
      $("draft-count").textContent="Черновых ходов: "+state.sequence;
      $("save-info").textContent=`${state.sequence} ходов ещё НЕ внесено в канон. Для записи нажми «Сохранить RPG6».`;
      showRoll();$("chat").scrollTop=$("chat").scrollHeight;
      report(state.pending?"Старый план d20 ожидает сохранения; дальше сервер сам бросит кубик.":`Ход ${state.sequence} завершён. Для записи в канон используй «Сохранить RPG6».`);
    }catch(error){
      // A response can be lost AFTER Supabase has already staged the turn.
      // Reconcile before allowing the player to accidentally submit it twice.
      const expectedSequence=state.sequence;
      try {
        const latest=await rpc("load");
        if(Number(latest.draft_sequence)>expectedSequence){
          renderState(latest);
          report("Ход уже записан в Supabase и восстановлен из черновика. Повторять действие не нужно.");
          return;
        }
      }catch(recoveryError){console.warn("RPG6 turn recovery:",recoveryError)}
      report(error.message||String(error),true);
    }finally{busy(false);showRoll()}
  }
  async function save(){if(state.busy||!state.loaded)return;if(!state.sequence){report("Новых ходов для сохранения нет.");return;}
    busy(true);report("Gemini готовит пакет событий; SQL проверит его до записи. Это может занять время.");
    try{const result=await rpc("save",{idempotency_key:uuid()});report("RPG6 сохранилась. Квитанция проверяется повторным чтением…");
      const latest=await rpc("load");if(Number(latest.revision)<=state.revision)throw new Error("Сервер не подтвердил новую ревизию RPG6");
      renderState(latest);report("СОХРАНЕНО В RPG6: новая ревизия "+latest.revision+". RPG5 не менялась.");
    }catch(error){
      // Save may have committed even if the confirmation or subsequent load failed.
      // Verify canonical revision before reporting a failure.
      try {
        const latest=await rpc("load");
        if(Number(latest.revision)>state.revision){
          renderState(latest);
          report("СОХРАНЕНО В RPG6: ревизия "+latest.revision+" подтверждена повторным чтением.");
          return;
        }
      }catch(recoveryError){console.warn("RPG6 save recovery:",recoveryError)}
      report("СОХРАНЕНИЕ НЕ ПОДТВЕРЖДЕНО: "+(error.message||String(error))+
        ". Не отправляй тот же пакет повторно, пока не проверишь состояние через «Продолжить RPG6».",true);
    }finally{busy(false);showRoll()}
  }
  function exportDraft(){const out={build:BUILD,schema:"rpg6",revision:state.revision,draft_turns:state.draft};
    const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="RPG6_Отчёт_черновик.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),3000);
  }
  $("remember-access").checked=accessRemembered;
  $("remember-access").addEventListener("change",event=>{
    const checked=event.currentTarget.checked;
    if(checked){
      if(!token || !validAccess(token)){
        event.currentTarget.checked=false;
        report("Сначала загрузи игру, чтобы запомнить действующий код.",true);
        return;
      }
      try{
        localStorage.setItem(PERSISTED_ACCESS_KEY,token);
        accessRemembered=true;
        report("Код доступа запомнен только в этом браузере. Не используй на общем компьютере.");
      }catch(error){
        accessRemembered=false;
        event.currentTarget.checked=false;
        report("Браузер запрещает постоянное хранение кода. Попробуй без приватного режима.",true);
      }
    }else{
      accessRemembered=false;
      try{localStorage.removeItem(PERSISTED_ACCESS_KEY)}catch{/* storage disabled */}
      report("Постоянное хранение кода выключено. В этой вкладке доступ сохранится до закрытия.");
    }
  });
  $("forget-access").addEventListener("click",()=>{
    clearAccessToken();
    // Reload removes in-memory game state and requires access again.
    window.location.reload();
  });
  $("start").addEventListener("click",start);
  $("send").addEventListener("click",()=>act());
  $("save").addEventListener("click",save);
  $("export").addEventListener("click",exportDraft);
  $("send-roll").addEventListener("click",()=>{if(!state.pending?.saved){save();return;}act("auto")});
  $("action").addEventListener("keydown",event=>{if(event.key==="Enter"&&event.ctrlKey){event.preventDefault();act()}});
  report("Автоматически загружаю игровое сохранение…");
  void start();
})();
