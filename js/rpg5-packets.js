// RPG5-GPT — local Chrome extension transport. No server, chat URLs or Auth.
"use strict";
const $=id=>document.getElementById(id);
const status=$("gpt-remote-status"),packetLabel=$("bridge-last-packet");
const feedback=$("action-feedback");
const CACHE_KEY="rpg5_extension_latest_scene_v1";
const portraits=Object.freeze({oliver_hayes:"assets/portraits/oliver_hayes.png",bex:"assets/portraits/bex.png"});
const knownNames=Object.freeze({oliver_hayes:"Оливер Хейз",bex:"Бекс",ian_calder:"Иэн"});
const object=x=>(x&&typeof x==="object"&&!Array.isArray(x))?x:{};
const array=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==="string"?x:"";
let currentPacket=null,lastRenderedSequence=null;
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
function dispatchAction(action){
 if(typeof action!=="string"||!action.trim()){actionNotice("Сначала введи действие.","error");return;}
 const message=action.trim();
 const bridge=window.RPG5_ACTION_BRIDGE;
 if(bridge){
  let prepared;
  try{prepared=bridge.buildMessage(message,currentPacket,lastRenderedSequence);}
  catch(error){actionNotice("Действие не подготовлено: "+String(error?.message||error),"error");return;}
  // Synchronous clipboard fallback while the game tab still has focus.
  const copied=copySynchronously(prepared);
  actionNotice("Передаю действие и снимок состояния в игровой ChatGPT…","waiting");
  bridge.send(prepared,lastRenderedSequence,
   ()=>actionNotice("Действие вставлено в игровой ChatGPT. Проверь текст и нажми Enter — оно НЕ отправлено автоматически.","ready"),
   error=>{
    const why=String(error||"Не удалось вставить сообщение");
    if(why.startsWith("Действие для этой сцены уже вставлено")||why.startsWith("Предыдущий запрос"))
     {actionNotice(why,"error");return;}
    if(copied){
     actionNotice("Автовставка не удалась: "+why+" Подготовленный текст скопирован — при необходимости вставь Ctrl+V.","error");
    }else void copyAction(prepared).then(ok=>actionNotice(
      "Автовставка не удалась: "+why+(ok?" Текст скопирован; вставь Ctrl+V.":" Копирование тоже заблокировано."),"error"));
   });
  return;
 }
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
  if ($("world-time")) $("world-time").textContent=scene.time_label||"—:—";
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
function chatEntry(kind,speaker,text,speakerId="") {
  if(!str(text).trim())return;
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
  const badge=node("p","bridge-choice-mode",mode);
  area.append(badge);
  const choices=array(reply.choices);
  if(mode!=="Полная свобода")for(const choice of choices){
    const label=typeof choice==="string"?choice:object(choice).label||object(choice).text;
    const action=typeof choice==="string"?choice:object(choice).action||label;
    if(!str(label).trim())continue;
    const b=node("button","bridge-action-choice",label);
    b.type="button";
    b.addEventListener("click",()=>dispatchAction(action));
    area.append(b);
  }
  const input=$("action"), send=$("send");
  if(input) {input.disabled=false;input.placeholder=""; }
  if(send){send.disabled=false;send.textContent="Отправить";}
  if($("save")){$("save").disabled=false;$("save").textContent="Подготовить «сохранить»";}
  if($("start")){$("start").disabled=false;$("start").textContent="Проверить расширение";}
}
function renderPacket(packet, sequence) {
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

async function acceptPacket(raw,expected){
 if(typeof raw!=="string"||new TextEncoder().encode(raw).length>1800000)return;
 if(typeof expected!=="string"||!/^[0-9a-f]{64}$/.test(expected))return;
 const actual=await checksum(raw);
 if(actual!==expected){notice("Пакет отклонён: SHA-256 не совпала.","error");return;}
 let packet;
 try{packet=JSON.parse(raw);}catch{notice("Пакет отклонён: неверный JSON.","error");return;}
 if(!validPacket(packet)){notice("Пакет отклонён: неверная структура RPG5.","error");return;}
 if(lastRenderedSequence!==null&&lastRenderedSequence===actual)return;
 renderPacket(packet,actual);
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
  if(cached?.raw&&cached?.sha)await acceptPacket(cached.raw,cached.sha);
 }catch(e){console.warn("RPG5: no usable cache",e);}
}
function requestPacket(){
 window.postMessage({source:"RPG5_GAME",type:"READY"},location.origin);
 if(!currentPacket)notice("Ожидаю первый JSON из игрового чата ChatGPT.");
}
$("send")?.addEventListener("click",()=>dispatchAction($("action")?.value||""));
$("action")?.addEventListener("keydown",e=>{
 if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){
  e.preventDefault();dispatchAction(e.target.value);
 }
});
$("save")?.addEventListener("click",()=>dispatchAction("сохранить"));
$("start")?.addEventListener("click",requestPacket);
$("portrait-close")?.addEventListener("click",()=>$("portrait-dialog")?.close());
void restoreCache().then(requestPacket);
