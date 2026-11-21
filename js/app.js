(() => {
  "use strict";
  const BUILD = "RPG6-AUTO-D20-UI";
  // Stable protocol version (not the Edge Function deployment number).
  const SUPPORTED_API_VERSION = 1;
  const config = window.RPG6_CONFIG || {};
  // Access code is entered by the player, never embedded in hosted source files.
  const ACCESS_KEY = "rpg6_access_session";
  let token = "";
  try { token = sessionStorage.getItem(ACCESS_KEY) || ""; } catch { /* storage disabled */ }
  function getAccessToken() {
    if (token) return token;
    const entered = window.prompt("Введи личный код доступа к игре. Он не публикуется на сайте.");
    if (entered === null || !entered.trim()) throw new Error("Для продолжения игры требуется личный код доступа RPG6.");
    const next = entered.trim();
    if (!/^RPG6-[A-Za-z0-9_-]{30,100}$/.test(next))
      throw new Error("Неверный формат кода RPG6. Проверь его и попробуй снова.");
    token = next;
    try { sessionStorage.setItem(ACCESS_KEY,token); } catch { /* one-tab memory only */ }
    return token;
  }
  function clearAccessToken() {
    token = "";
    try { sessionStorage.removeItem(ACCESS_KEY); } catch { /* storage disabled */ }
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
    const timer=new AbortController();const time=setTimeout(()=>timer.abort(),op==="save"?138000:op==="turn"?138000:25000);
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
    const wrap=child("div","chat-entry "+kind);wrap.dataset.speakerId=speakerId||"";const avatar=portrait(speakerId);
    if(avatar){const img=child("img","avatar");img.src=avatar;img.alt=label;img.addEventListener("click",()=>zoom(img.src,label));wrap.append(img)}
    const bubble=child("div","bubble");bubble.append(child("b","",label),child("div","",text));wrap.append(bubble);$("chat").append(wrap);
  }
  function zoom(src,label){$("portrait-full").src=src;$("portrait-full").alt=label;$("portrait-dialog").showModal()}
  $("hero-portrait-button").addEventListener("click",()=>zoom($("hero-portrait").src,"Оливер Хейз"));
  $("portrait-close").addEventListener("click",()=>$("portrait-dialog").close());
  function showReply(reply){
    const r=safeObj(reply);
    if(r.roll){const v=r.roll;msg("🎲 ПРОВЕРКА d20",`Натуральный: ${v.natural}\n${v.natural} − ${v.negative} + ${v.positive} = ${v.total}; DC ${v.dc}\n${v.category}: ${v.consequence}`,"system")}
    msg("",r.narration||"","gm");
    for(const line of many(r.dialogue)){const a=safeObj(line);msg(a.name||nameById[a.speaker_id]||a.speaker_id||"NPC",a.text||"","npc",a.speaker_id)}
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
    $("party").replaceChildren();const party=many(observable.characters).filter(x=>x?.character_id!=="oliver_hayes");
    for(const person of party){const id=person?.character_id,name=person?.name||person?.display_name||nameById[id]||"Человек рядом";const row=child("div","party-person");
      const imagePath=portrait(id);if(imagePath){const img=child("img");img.src=imagePath;img.alt=name;const frame=child("div","polaroid polaroid-npc");const portraitButton=child("button","portrait-button");portraitButton.type="button";portraitButton.setAttribute("aria-label","Увеличить портрет "+name);portraitButton.append(img);portraitButton.addEventListener("click",()=>zoom(imagePath,name));frame.append(portraitButton);row.append(frame)}
      const details=child("div");details.append(child("strong","",name));row.append(details);$("party").append(row);
    }
    if(!party.length)$("party").append(child("p","muted","Никого рядом не установлено"));
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
        if(partial){
          if(reply.narration)msg("",reply.narration,"gm");
          else if(reply.summary)msg("СОХРАНЁННАЯ СВОДКА · НЕ ПОЛНЫЙ ТЕКСТ",reply.summary,"system");
          for(const line of many(reply.dialogue)){
            const d=safeObj(line);
            msg(d.name||nameById[d.speaker_id]||"NPC",d.text,"npc",d.speaker_id);
          }
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
  $("start").addEventListener("click",start);
  $("send").addEventListener("click",()=>act());
  $("save").addEventListener("click",save);
  $("export").addEventListener("click",exportDraft);
  $("send-roll").addEventListener("click",()=>{if(!state.pending?.saved){save();return;}act("auto")});
  $("action").addEventListener("keydown",event=>{if(event.key==="Enter"&&event.ctrlKey){event.preventDefault();act()}});
  report("Автоматически загружаю игровое сохранение…");
  void start();
})();
