// RPG5-GPT — local Chrome extension transport. No server, chat URLs or Auth.
"use strict";
const $=id=>document.getElementById(id);
const status=$("gpt-remote-status"),packetLabel=$("bridge-last-packet");
const feedback=$("action-feedback");
const CACHE_KEY="rpg5_extension_latest_scene_v1";
const LAST_ROLL_KEY="rpg5_last_submitted_roll_v1";
const ROLL_RECORD_KEY="rpg5_site_generated_roll_v2";
const portraits=Object.freeze({oliver_hayes:"assets/portraits/oliver_hayes.png",bex:"assets/portraits/bex.png"});
const knownNames=Object.freeze({oliver_hayes:"Оливер Хейз",bex:"Бекс",ian_calder:"Иэн"});
const object=x=>(x&&typeof x==="object"&&!Array.isArray(x))?x:{};
const array=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==="string"?x:"";
let currentPacket=null,lastRenderedSequence=null;
let activeRoll=null;
function storedRoll(checkId){
 try {
  const data=JSON.parse(localStorage.getItem(ROLL_RECORD_KEY)||"null");
  if(data?.check_id===checkId)return data; // migrate a previous single receipt
  return object(data?.records)[checkId]||null;
 }catch{return null;}
}
function persistRoll(value){
 const data=JSON.parse(localStorage.getItem(ROLL_RECORD_KEY)||"null");
 const records=object(data?.records);
 if(data?.check_id)records[data.check_id]=data;
 records[value.check_id]=value;
 localStorage.setItem(ROLL_RECORD_KEY,JSON.stringify({schema:"rpg5-roll-ledger-v1",records}));
}
function rollMessage(result){return "Результат автоматического d20 сайта: "+result.natural;}
function node(tag,className="",text=""){
 const el=document.createElement(tag);
 if(className)el.className=className;
 el.textContent=String(text);return el;
}
function notice(message,kind="waiting"){
 if(status){status.dataset.state=kind;status.textContent=message;}
 if($("status"))$("status").textContent=message;
}
function actionNotice(message,kind="ready"){
 if(feedback){feedback.hidden=false;feedback.textContent=message;feedback.dataset.state=kind;}
 notice(message,kind);
}
function clearActionFeedback(){
 if(feedback){feedback.textContent="";feedback.hidden=true;delete feedback.dataset.state;}
}
function copySynchronously(value){
 const field=document.createElement("textarea"),previous=document.activeElement;
 field.value=value;field.readOnly=true;field.setAttribute("aria-hidden","true");
 Object.assign(field.style,{position:"fixed",top:"0",left:"0",width:"1px",height:"1px",opacity:"0",pointerEvents:"none"});
 document.body.append(field);let ok=false;
 try{field.focus({preventScroll:true});field.select();field.setSelectionRange(0,value.length);
 ok=document.execCommand("copy")===true;}catch(e){console.warn("RPG5 clipboard:",e);}
 field.remove();if(previous?.isConnected)try{previous.focus({preventScroll:true});}catch{}
 return ok;
}
async function copyAction(value){
 if(copySynchronously(value))return true;
 try{await navigator.clipboard.writeText(value);return true;}catch{return false;}
}
function dispatchAction(action,rollReceipt=null,automatic=false){
 if(typeof action!=="string"||!action.trim()){actionNotice("Сначала введи действие.","error");return;}
 const message=action.trim();
 const bridge=window.RPG5_ACTION_BRIDGE;
 if(bridge){
  let prepared;
  try{prepared=rollReceipt?
    bridge.buildRollMessage(rollReceipt,currentPacket,lastRenderedSequence):
    bridge.buildMessage(message,currentPacket,lastRenderedSequence);}
  catch(error){actionNotice("Действие не подготовлено: "+String(error?.message||error),"error");return;}
  // Synchronous clipboard fallback while the game tab still has focus.
  const copied=automatic?false:copySynchronously(prepared);
  // The extension switches to the ChatGPT tab; successful autofill is silent.
  clearActionFeedback();
  bridge.send(prepared,lastRenderedSequence,
   ()=>{
    if(rollReceipt){
     try{localStorage.setItem(LAST_ROLL_KEY,JSON.stringify({check_id:rollReceipt.check_id,packet_sha:lastRenderedSequence}));}
     catch(e){console.warn("RPG5 roll acknowledgement cache:",e);}
     try{const r=storedRoll(rollReceipt.check_id);if(r?.check_id===rollReceipt.check_id){r.delivered=true;persistRoll(r);}}catch(e){console.warn("RPG5 roll receipt:",e);}
     activeRoll=null;
     const rollButton=$("send-roll");if(rollButton){rollButton.disabled=true;rollButton.textContent="Результат передан";}
     const hint=$("roll-error");if(hint)hint.textContent="Результат вставлен в ChatGPT. Проверь текст и нажми Enter.";
    }
    clearActionFeedback();
   },
   error=>{
    const why=String(error||"Не удалось вставить сообщение");
    if(rollReceipt){const retry=$("send-roll");if(retry){retry.disabled=false;retry.textContent="Повторить отправку того же результата";}}
    if(why.startsWith("Действие для этой сцены уже вставлено")||why.startsWith("Предыдущий запрос"))
     {actionNotice(why,"error");return;}
    if(automatic){actionNotice("Автопередача d20 не удалась: "+why+". Повтори отправку; число не изменится.","error");return;}
    if(copied){
     actionNotice("Автовставка не удалась: "+why+" Подготовленный текст скопирован — при необходимости вставь Ctrl+V.","error");
    }else void copyAction(prepared).then(ok=>actionNotice(
      "Автовставка не удалась: "+why+(ok?" Текст скопирован; вставь Ctrl+V.":" Копирование тоже заблокировано."),"error"));
   });
  return;
 }
 if(rollReceipt){actionNotice("Для передачи результата d20 требуется рабочее расширение Chrome.","error");return;}
 // Compatibility with an older cached website / extension version.
 void copyAction(message).then(ok=>{
  if(ok)actionNotice("Скопировано: «"+message.slice(0,90)+"». В игровом чате нажми Ctrl+V и Enter.","ready");
  else{actionNotice("Копирование заблокировано. Выдели действие и скопируй Ctrl+C.","error");
       const input=$("action");if(input){input.value=message;input.focus();input.select();}}
 });
}
async function checksum(text){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function validPacket(packet){
 return Boolean(packet&&typeof packet==="object"&&!Array.isArray(packet)
 &&packet.schema==="rpg5-gpt-packet-v1"
 &&packet.storyline_id==="protagonist_oliver"
 &&object(packet.scene).scene_number!==undefined
 &&packet.hero&&typeof packet.hero==="object"
 &&Array.isArray(packet.characters)
 &&packet.reply&&typeof packet.reply==="object"
 &&!["director_secrets","director_lens","episode_plans","loaded_characters","personal_secrets"].some(k=>Object.hasOwn(packet,k)));
}
function exactTime(scene) {
  // The canonical numeric minute is authoritative; labels can include "около".
  const minute=scene.minute_of_day;
  if(Number.isInteger(minute)&&minute>=0&&minute<1440)
    return String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0");
  const match=str(scene.time_label).match(/(?:^|[^\d])(2[0-3]|[01]?\d):([0-5]\d)(?!\d)/);
  return match?match[1].padStart(2,"0")+":"+match[2]:"—:—";
}
function renderHeader(packet) {
  const scene=object(packet.scene||object(packet.reply).scene_state);
  if ($("scene-title")) $("scene-title").textContent="Эпизод "+(scene.episode_number??"?")+" · Сцена "+(scene.scene_number??"?");
  if ($("scene-location")) $("scene-location").textContent=scene.location_detail||"Локация не установлена";
  if ($("scene-counter")) $("scene-counter").textContent=
    "СЮЖЕТНАЯ ЛИНИЯ · ЭПИЗОД "+(scene.episode_number??"?")+" · СЦЕНА "+(scene.scene_number??"?");
  if ($("canon-revision")) $("canon-revision").textContent="Ревизия RPG5: "+(packet.memory_revision??"?");
  if ($("draft-count")) $("draft-count").textContent="Доставка JSON — не сохранение";
  if ($("save-info")) $("save-info").textContent="Канон RPG5 не меняется при получении JSON. Для сохранения отправь буквальную команду «сохранить» через ChatGPT.";
  if ($("world-day")) $("world-day").textContent=scene.day==null?"День —":"День "+scene.day;
  if ($("world-time")) $("world-time").textContent=exactTime(scene);
}
function renderHero(hero) {
  // The HERO stats belong exclusively in Oliver's interactive diary.
  // The original RPG6 interface kept the under-portrait legacy panel hidden.
  const area=$("hero-stats");
  if (area) { area.replaceChildren(); area.hidden=true; }
  const inv=object(hero.inventory), list=$("inventory");
  if (list) {
    list.replaceChildren();
    for(const item of array(inv.items)){
      const v=object(item),row=node("div","inventory-item");
      row.append(node("strong","",v.name||v.item_id||"Предмет"));
      row.append(node("small","",
        "Количество: "+(v.quantity??"неизвестно")+" "+(v.unit||"")+" · "+
        (v.location||v.location_scope||"размещение неизвестно")+
        (v.weight_kg==null?"":" · "+v.weight_kg+" кг/шт")));
      list.append(row);
    }
    if(!list.childNodes.length)list.append(node("p","muted","Достоверный перечень пока отсутствует."));
  }
  if ($("weight-label")) $("weight-label").textContent=
    "Известная масса: "+(object(hero.carried_weight).known_kg??"—")+
    " кг. "+(hero.inventory_complete===true?"Учёт полный.":"Учёт неполный — неизвестное не считается нулём.");
}
function renderCharacters(packet) {
  const scene=object(packet.scene), observable=object(packet.player_observable);
  const cast=array(packet.characters).length?array(packet.characters):array(observable.characters);
  const dossierPeople=(array(observable.characters).length ? array(observable.characters) : cast)
    .filter(p=>p&&typeof p==="object"&&p.character_id!=="oliver_hayes");
  const ids=new Set(array(scene.cast_ids));
  const holder=$("party");if(!holder)return;
  holder.replaceChildren();
  for(const raw of cast) {
    const p=object(raw), id=str(p.character_id);
    if (!id || id==="oliver_hayes" || (ids.size&&!ids.has(id)))continue;
    const name=p.name||p.display_name||knownNames[id]||"Человек рядом";
    const person=node("div","party-person");
    person.dataset.characterId=id;
    const frame=node("div","polaroid polaroid-npc"), button=node("button","portrait-button");
    button.type="button";
    // Companion journal resolves the exact character_id, not position in a mutable list.
    button.dataset.characterId=id;
    const dossierIndex=dossierPeople.findIndex(p=>p.character_id===id);
    if(dossierIndex>=0) button.dataset.partyIndex=String(dossierIndex);
    button.setAttribute("aria-label","Удерживай портрет, чтобы открыть досье: "+name);
    if (portraits[id]) {
      const img=node("img");img.src=portraits[id];img.alt=name;img.loading="lazy";
      img.addEventListener("error",()=>{button.replaceChildren(node("span","party-portrait-unknown","?"));},{once:true});
      button.append(img);
    } else {
      button.classList.add("portrait-is-unknown");
      button.append(node("span","party-portrait-unknown","?"));
    }
    const label=node("div","party-portrait-name");
    label.append(node("strong","",String(name).split(/\s+/)[0]));
    frame.title=name;
    frame.append(button,label);
    person.append(frame);holder.append(person);
  }
  if(!holder.childNodes.length)holder.append(node("p","muted","Другие персонажи рядом не подтверждены."));
}
// Keep technical scene metadata in the scene header, never in the story viewer.
// This is presentation-only cleanup: it never invents dialogue or changes game state.
function cleanStoryText(value) {
 const source=str(value).replace(/\r\n?/g,"\n").trim();
 if(!source)return "";
 const lines=source.split("\n");
 const plain=line=>line.trim().replace(/^(?:#{1,6}\s*|>\s*)/,"").replace(/\*\*/g,"").trim();
 function isMetadata(line) {
  const text=plain(line);
  if(/^Сюжетная линия\s*:\s*.+(?:Эпизод\s*\d+|Сцена\s*\d+)/i.test(text))return true;
  if(/^Эпизод\s*\d+\s*[·:.,—-]\s*Сцена\s*\d+\.?$/i.test(text))return true;
  // Remove only a short standalone date/time/location stamp, not prose about a day.
  if(text.length<110 && /^День\s+\d+\s*[,—-]\s*(?:около\s*)?\d{1,2}:\d{2}[.,]\s*[^.!?\n]{1,65}[.!?]?$/i.test(text))return true;
  return false;
 }
 while(lines.length && (!lines[0].trim() || isMetadata(lines[0])))lines.shift();
 return lines.join("\n").trim();
}
function chatEntry(kind,speaker,text,speakerId="") {
  text=cleanStoryText(text);
  if(!text)return;
  const wrap=node("div","chat-entry "+kind);
  wrap.dataset.speakerId=speakerId;
  const bubble=node("div","bubble");
  bubble.append(node("b","",speaker),node("div","",text));
  wrap.append(bubble);
  $("chat")?.append(wrap);
}
function renderStory(packet, append=false) {
  const reply=object(packet.reply),scene=object(packet.scene),source=$("chat");
  if (!source) return;
  if(!append) source.replaceChildren();
  if ($("scene-text")) $("scene-text").textContent="";
  const segments=array(reply.segments);
  if(segments.length){
    for(const segment of segments) {
      const s=object(segment);
      if(s.type==="dialogue") {
        const id=s.speaker_id||s.character_id||"";
        chatEntry(id==="oliver_hayes"?"player":"npc",s.name||s.speaker||knownNames[id]||"Персонаж",s.text,id);
      } else if(s.type==="narration")chatEntry("gm","",s.text);
    }
  } else {
    chatEntry("gm","",reply.narration||reply.scene_text||scene.scene_text||"Сцена ожидает уточнения.");
    for(const line of array(reply.dialogue).concat(array(reply.lines))){
      const d=object(line),id=d.speaker_id||d.character_id||"";
      chatEntry(id==="oliver_hayes"?"player":"npc",d.speaker||d.name||knownNames[id]||"Персонаж",d.text||d.line,id);
    }
  }
  // The existing cinematic game-ui listens to this event and renders story,
  // geography, dossier, scene image and weather from player-visible inputs.
}
function renderChoices(packet) {
  const reply=object(packet.reply),scene=object(packet.scene),area=$("choices");
  if(!area)return;
  area.replaceChildren();
  const mode=reply.choice_mode||scene.choice_mode||"Полная свобода";
  if(mode!=="Полная свобода")area.append(node("p","bridge-choice-mode",mode));
  // Render exactly the valid options supplied by the current game packet,
  // regardless of choice_mode; never hide extra options by fixed height.
  let visibleChoices=0;
  for(const choice of array(reply.choices)){
    const entry=object(choice);
    const label=typeof choice==="string"?choice:entry.label||entry.text;
    const action=typeof choice==="string"?choice:entry.action||label;
    if(!str(label).trim())continue;
    const b=node("button","bridge-action-choice",label);
    b.type="button";
    b.addEventListener("click",()=>dispatchAction(action));
    area.append(b);visibleChoices++;
  }
  area.classList.toggle("single-choice",visibleChoices===1);
  area.hidden=visibleChoices===0&&mode==="Полная свобода";
  const input=$("action"), send=$("send");
  if(input) {input.disabled=false;input.placeholder=""; }
  if(send){send.disabled=false;send.textContent="Отправить";}
  if($("save")){$("save").disabled=false;$("save").textContent="Подготовить «сохранить»";}
  if($("start")){$("start").disabled=false;$("start").textContent="Проверить расширение";}
}
// The GM freezes the plan; the site samples a natural die exactly once per check_id.
function showRollResult(result) {
 const details=$("roll-details");
 if(!details||!result)return;
 const names={full_success:"Полный успех",partial_success:"Частичный успех",
  partial_failure:"Частичная неудача",full_failure:"Полная неудача"};
 details.textContent+="\n\n🎲 Случайный d20: "+result.natural+
  "\nРасчёт: "+result.natural+" − "+result.penalty+" + "+result.bonus+" = "+
  result.total+"\nИтог: "+(names[result.category]||result.category);
}
function renderRoll(packet,autoTransfer=false) {
 const panel=$("roll-panel"),button=$("send-roll");
 if(!panel||!button)return;
 activeRoll=null;button.disabled=true;button.textContent="Передать результат";
 const plan=object(object(packet.mechanics).pending_d20);
 if(!Object.keys(plan).length){panel.hidden=true;return;}
 panel.hidden=false;
 const error=$("roll-error"),details=$("roll-details");
 if(error)error.textContent="";
 if(plan.schema!=="rpg5-d20-plan-v1"){
  details.textContent="Нужен полный план mechanics.pending_d20 (rpg5-d20-plan-v1).";
  return;
 }
 try {
  const engine=window.RPG5_MECHANICS;
  if(!engine)throw Error("Вычислительный модуль не загружен.");
  const pre=engine.preview(plan,packet.hero);
  details.textContent=[
   "Действие: "+plan.action,
   "Базовый DC: "+pre.base_dc+" · Итоговый DC: "+pre.dc,
   "Навык: "+(pre.skill_id||"нет")+" · +"+pre.skill_bonus,
   "Физическая характеристика: "+(pre.physical_stat||"нет")+
    (pre.physical_level===null?"":" (ур. "+pre.physical_level+")")+
    " · +"+pre.physical_bonus,
   "Ситуация: +"+pre.situation_bonus+
    (plan.situation?.reason?" ("+plan.situation.reason+")":""),
   "Бонус до броска: "+pre.bonus+"/"+pre.bonus_limit,
   "Штраф: "+pre.penalty+"/"+pre.penalty_limit,
   pre.insurance_possible?"При d20 1–9 возможна страховка +1.":"Страховка отсутствует."
  ].join("\n");
  const previous=storedRoll(plan.check_id);
  if(previous?.check_id===plan.check_id) {
   if(previous.plan_json!==JSON.stringify(plan))
    throw Error("Условия ранее начатой проверки изменились при том же check_id. Нужна сверка.");
   if(!previous.result||previous.result.schema!=="rpg5-d20-result-v1")
    throw Error("Повреждена сохранённая квитанция броска.");
   activeRoll=previous.result;
   showRollResult(activeRoll);
   button.disabled=previous.delivered===true;
   button.textContent=previous.delivered?"Результат уже передан":"Повторить отправку результата";
   if(error)error.textContent=previous.delivered?
    "Эта проверка уже вставлена в ChatGPT, повторного броска не будет.":
    "Бросок уже сделан. Можно повторить передачу без переброса.";
   return;
  }
  // Old manually delivered rolls also block rerolls of a legacy check_id.
  const legacy=(()=>{try{return JSON.parse(localStorage.getItem(LAST_ROLL_KEY)||"null");}catch{return null;}})();
  if(legacy?.check_id===plan.check_id)
   throw Error("Этот check_id уже отправлялся. Для новой проверки нужен новый ID.");
  const result=engine.rollAndCalculate(plan,packet.hero);
  persistRoll({check_id:plan.check_id,plan_json:JSON.stringify(plan),
    packet_sha:lastRenderedSequence,result,delivered:false});
  activeRoll=result;
  showRollResult(result);
  button.disabled=false;
  button.textContent="Повторить передачу результата";
  if(autoTransfer){
   if(error)error.textContent="Сайт сделал бросок. Передаю результат в ChatGPT…";
   dispatchAction(rollMessage(result),result,true);
  } else if(error)error.textContent="Число уже случайно выбрано сайтом. Нажми для передачи.";
 }catch(e){
  activeRoll=null;button.disabled=true;
  if(error)error.textContent="Проверка заблокирована: "+String(e?.message||e);
 }
}
function submitRoll() {
 const error=$("roll-error");
 if(!activeRoll||!currentPacket){
  if(error)error.textContent="Нет готового результата.";return;
 }
 const record=storedRoll(activeRoll.check_id);
 if(!record || record.check_id!==activeRoll.check_id || record.delivered){
  if(error)error.textContent="Этот результат уже передан либо не подтверждён.";return;
 }
 dispatchAction(rollMessage(activeRoll),activeRoll);
}
function renderPacket(packet, sequence, fromCache=false) {
  if(!packet || typeof packet!=="object" || Array.isArray(packet))return;
  const kind=packet.packet_kind||packet.kind;
  if(kind==="test")return;
  if (lastRenderedSequence !== null && String(lastRenderedSequence) === String(sequence))return;
  const append=lastRenderedSequence!==null;
  lastRenderedSequence=String(sequence);
  currentPacket=packet;
  renderHeader(packet);
  renderHero(object(packet.hero));
  renderCharacters(packet);
  renderStory(packet, append);
  renderChoices(packet);
  renderRoll(packet,!fromCache);
  const scene=object(packet.scene), observable=object(packet.player_observable);
  const names=Object.fromEntries(array(packet.characters).map(c=>[c.character_id,c.name]));
  const visibleCast=array(observable.characters).map(person=>({
    ...person,name:names[person.character_id]||person.name||knownNames[person.character_id]||"Человек рядом",
  }));
  window.dispatchEvent(new CustomEvent("rpg6:render",{
    detail:{scene,observable:{...observable,
      characters:visibleCast.length?visibleCast:array(packet.characters)},hero:object(packet.hero)},
  }));
  if($("generation-model")) $("generation-model").textContent="Модель: ChatGPT Plus · через проект";
  if($("generation-context")) $("generation-context").textContent="Сцена из RPG5 · не автосохранение";
  if($("status")) $("status").textContent="Сцена получена через расширение Chrome. Выбери действие.";
}

async function acceptPacket(raw,expected,fromCache=false){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>1800000)return;
 if(typeof expected!=="string"||!/^[0-9a-f]{64}$/.test(expected))return;
 const actual=await checksum(raw);
 if(actual!==expected){notice("Пакет отклонён: SHA-256 не совпала.","error");return;}
 let packet;
 try{packet=JSON.parse(raw);}catch{notice("Пакет отклонён: неверный JSON.","error");return;}
 if(!validPacket(packet)){notice("Пакет отклонён: неверная структура RPG5.","error");return;}
 if(lastRenderedSequence!==null&&lastRenderedSequence===actual)return;
 renderPacket(packet,actual,fromCache);
 if(packetLabel)packetLabel.textContent="Сцена "+object(packet.scene).scene_number+" · JSON проверен";
 try{localStorage.setItem(CACHE_KEY,JSON.stringify({raw,sha:actual}));}catch(e){console.warn("RPG5 cache:",e);}
 notice("Сцена получена через расширение Chrome. Выбирай действие.","ready");
}
window.addEventListener("message",event=>{
 if(event.source!==window||event.origin!==location.origin)return;
 const data=event.data;
 if(data?.source!=="RPG5_EXTENSION")return;
 if(data.type==="CONNECTED") {
  if(!currentPacket)notice("Расширение Chrome подключено. Ожидаю игровую сцену.","ready");
  return;
 }
 if(data.type!=="RPG5_PACKET")return;
 void acceptPacket(data.raw,data.sha);
});
async function restoreCache(){
 try{
  const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
  if(cached?.raw&&cached?.sha)await acceptPacket(cached.raw,cached.sha,true);
 }catch(e){console.warn("RPG5: no usable cache",e);}
}
function requestPacket(){
 window.postMessage({source:"RPG5_GAME",type:"READY"},location.origin);
 if(!currentPacket)notice("Ожидаю первый JSON из игрового чата ChatGPT.");
}
$("send")?.addEventListener("click",()=>dispatchAction($("action")?.value||""));
$("send-roll")?.addEventListener("click",submitRoll);
$("action")?.addEventListener("keydown",e=>{
 if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){
  e.preventDefault();dispatchAction(e.target.value);
 }
});
$("save")?.addEventListener("click",()=>dispatchAction("сохранить"));
$("start")?.addEventListener("click",requestPacket);
$("portrait-close")?.addEventListener("click",()=>$("portrait-dialog")?.close());
void restoreCache().then(requestPacket);
