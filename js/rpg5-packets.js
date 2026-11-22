// RPG5-GPT | Player-visible JSON -> existing RPG visual engine.
// Only Supabase Auth + the private read-only Edge Function. No Gemini or paid API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
const $ = id => document.getElementById(id);
const cfg = window.RPG5_GPT_CONFIG || {};
const rawView = $("bridge-json"), status = $("gpt-remote-status");
const emailField = $("bridge-email"), authPanel = $("bridge-auth");
const signIn = $("bridge-sign-in"), signOut = $("bridge-sign-out");
const refresh = $("gpt-remote-check");
const chatTarget = $("bridge-chat-url"), saveChatTarget = $("bridge-chat-save");
const chatPrefill = $("bridge-prefill");
const preparedPreview = $("bridge-prepared-prompt");
const packetLabel = $("bridge-last-packet");
const CURSOR_KEY = "rpg5_gpt_bridge_cursor_v1";
const CACHE_KEY = "rpg5_gpt_bridge_last_scene_v1";
const TARGET_KEY = "rpg5_gpt_chat_target_v1";
const PREFILL_KEY = "rpg5_gpt_chat_try_prefill_v1";
const portraits = Object.freeze({
  oliver_hayes: "assets/portraits/oliver_hayes.png",
  bex: "assets/portraits/bex.png",
});
const knownNames = Object.freeze({
  oliver_hayes: "Оливер Хейз", bex: "Бекс", ian_calder: "Иэн",
});
const object = x => (x && typeof x === "object" && !Array.isArray(x)) ? x : {};
const array = x => Array.isArray(x) ? x : [];
const str = x => (typeof x === "string" ? x : "");
let currentPacket = null, connected = false, busy = false;
let lastRenderedSequence = null;

function notice(message, kind="waiting") {
  if (!status) return;
  status.dataset.state = kind;
  status.textContent = message;
}
function node(tag, className="", text="") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(text);
  return el;
}
function storageGet(key, fallback="") {
  try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* Browsers can disable storage. */ }
}
function storageDelete(key) { try { sessionStorage.removeItem(key); } catch { /* optional */ } }
function cursor() {
  const v=storageGet(CURSOR_KEY,"0");
  return /^[0-9]{1,16}$/.test(v) ? v : "0";
}
async function checksum(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,"0")).join("");
}
function validChatUrl(input) {
  try {
    const u=new URL(input);
    if (u.protocol !== "https:" || u.hostname !== "chatgpt.com" ||
        u.username || u.password || u.hash || u.port) return null;
    const path=u.pathname.replace(/\/+$/,"");
    // A personal ChatGPT conversation, including one inside a project.
    if (!(/^\/c\/[a-z0-9-]+$/i.test(path) ||
          /^\/g\/g-p-[a-z0-9_-]+\/c\/[a-z0-9-]+$/i.test(path))) return null;
    return u.origin+path;
  } catch { return null; }
}
function rememberTarget() {
  const target=validChatUrl(chatTarget?.value?.trim() || "");
  if (!target) {
    notice("Вставь адрес ОТКРЫТОЙ переписки ChatGPT из адресной строки: https://chatgpt.com/c/…", "error");
    return false;
  }
  try {
    localStorage.setItem(TARGET_KEY,target);
    localStorage.setItem(PREFILL_KEY,chatPrefill?.checked ? "1" : "0");
  } catch { /* User can still use it until page reload. */ }
  if (chatTarget) chatTarget.value=target;
  notice("Чат сохранён на этом устройстве. Теперь выбирай действие на игровом экране.", "ready");
  return true;
}
function promptForAction(action) {
  const p=object(currentPacket), scene=object(p.scene), reply=object(p.reply);
  const id="web_"+crypto.randomUUID().replace(/-/g,"");
  const message=[
    "28 DAYS LATER: SURVIVAL — игровой ход из сайта RPG5-GPT.",
    "ID запроса: "+id,
    "Линия: "+String(p.storyline_id||"protagonist_oliver")+
      "; каноническая ревизия: "+String(p.memory_revision??"неизвестна")+
      "; эпизод: "+String(scene.episode_number??"?")+
      "; сцена: "+String(scene.scene_number??"?")+
      "; день: "+String(scene.day??"?")+
      "; время: "+String(scene.time_label??"неизвестно")+".",
    "ДЕЙСТВИЕ ИГРОКА: "+action,
    "",
    "Пятница, обработай только это действие управляемого героя, по engine_rules.md и ТЕХНИЧЕСКИЙ_ПРОТОКОЛ.md.",
    "Сверь актуальный контекст rpg5 перед продолжением; не заменяй решения игрока.",
    "После ответа опубликуй полный JSON, предназначенный игроку, в Supabase:",
    "SELECT * FROM rpg5_bridge.publish_packet('protagonist_oliver','scene','"+id+"',<ПОЛНЫЙ_ТЕКСТ_JSON>);",
    "JSON должен содержать schema='rpg5-gpt-packet-v1', scene, storyline_id,",
    "memory_revision, hero, characters (только видимое игроку), reply.narration,",
    "reply.dialogue, reply.choices, reply.choice_mode и reply.scene_state.",
    "Не сокращай пакет и не передавай закрытые данные NPC или режиссёрские планы.",
    "Это только доставка ответа: НЕ вызывай rpg5.commit_scene без буквальной команды «сохранить».",
    "Если действию нужна честная d20-проверка, открой её по правилам и не придумывай результат."
  ];
  if (action.trim().toLowerCase()==="сохранить") {
    return "сохранить";
  }
  return message.join("\n");
}
function dispatchAction(action) {
  if (!currentPacket || typeof action!=="string" || !action.trim()) {
    notice("Сначала дождись текущей сцены и введи действие.", "error");return;
  }
  const target=validChatUrl(chatTarget?.value?.trim()||"");
  if (!target) {
    notice("Сначала вставь ссылку на нужную переписку ChatGPT в служебном меню.", "error");
    if (!$("service-drawer")?.classList.contains("open")) $("service-toggle")?.click();
    chatTarget?.focus();
    return;
  }
  rememberTarget();
  const prompt=promptForAction(action.trim());
  if (preparedPreview) preparedPreview.value=prompt;
  // ?q= is best-effort ONLY: ChatGPT may ignore it for an existing conversation.
  const url=new URL(target);
  if (chatPrefill?.checked) url.searchParams.set("q",prompt);
  const copyJob=(navigator.clipboard && typeof navigator.clipboard.writeText==="function")
    ? navigator.clipboard.writeText(prompt).then(()=>true,()=>false)
    : Promise.resolve(false);
  window.open(url.toString(),"_blank","noopener,noreferrer");
  void copyJob.then(copied=>{
    if (!copied) notice("Чат открыт. Автокопирование заблокировано — запрос можно скопировать из служебного меню.", "error");
    else notice("Запрос скопирован. Если ChatGPT не подставил его, нажми Ctrl+V и Enter. Вернись за результатом.", "ready");
  });
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
  if(send){send.disabled=false;send.textContent="Продолжить";}
  if($("save")){$("save").disabled=false;$("save").textContent="Сохранить через ChatGPT";}
  if($("start")){$("start").disabled=false;$("start").textContent="Проверить ответы";}
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
  if($("status")) $("status").textContent="Сцена загружена из Supabase. Выбери действие.";
}
async function restoreCache() {
  const raw=storageGet(CACHE_KEY);
  if(!raw) {storageDelete(CURSOR_KEY);return;}
  try {
    const saved=JSON.parse(raw);
    if(typeof saved.text!=="string" || (await checksum(saved.text))!==saved.sha)
      throw Error("Cache checksum mismatch");
    const packet=JSON.parse(saved.text);
    rawView.textContent=saved.text;
    packetLabel.textContent="№"+saved.sequence+" · восстановлен из проверенного кеша";
    renderPacket(packet, saved.sequence);
    storageSet(CURSOR_KEY,String(saved.sequence));
  } catch {
    storageDelete(CURSOR_KEY);storageDelete(CACHE_KEY);
  }
}
const valid=(status&&signIn&&signOut&&refresh&&cfg.supabaseUrl&&cfg.publishableKey&&cfg.gatewayUrl);
if(!valid) {
  notice("Подключение к Supabase не настроено.", "error");
} else {
  const sb=createClient(cfg.supabaseUrl,cfg.publishableKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
      flowType:"implicit",storage:window.sessionStorage},
  });
  async function getSession() {
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    connected=Boolean(data.session?.access_token);
    authPanel.hidden=connected;signOut.hidden=!connected;refresh.disabled=!connected;
    return data.session;
  }
  async function poll() {
    if(busy||document.hidden)return;
    busy=true;
    try {
      const session=await getSession();
      if(!session){notice("Войди по почте Supabase Auth, чтобы получить историю.");return;}
      // Catch up in order, including the original transport test and game scenes.
      for(let i=0;i<12;i++){
        const url=new URL(cfg.gatewayUrl);url.searchParams.set("after",cursor());
        const res=await fetch(url.toString(),{
          method:"GET",mode:"cors",cache:"no-store",credentials:"omit",
          headers:{"Authorization":"Bearer "+session.access_token,"apikey":cfg.publishableKey},
        });
        if(res.status===204) {
          notice(currentPacket?"Подключено. Выбирай действие — ответ появится здесь.":"Подключено. Ожидаю сцену.", "ready");
          break;
        }
        if(res.status===401||res.status===403) {notice("Доступ отклонён. Проверь вход Supabase.", "error");break;}
        if(!res.ok)throw Error("HTTP "+res.status);
        const text=await res.text(),expected=res.headers.get("X-Packet-Sha256")||"";
        const sequence=res.headers.get("X-Packet-Sequence")||"";
        const kind=res.headers.get("X-Packet-Kind")||"";
        if(!/^[0-9a-f]{64}$/.test(expected)||!/^[0-9]{1,16}$/.test(sequence))
          throw Error("Сервер не предоставил контрольную сумму или номер.");
        if((await checksum(text))!==expected)throw Error("Контрольная сумма JSON не совпала.");
        const packet=JSON.parse(text);
        if(!packet||typeof packet!=="object"||Array.isArray(packet))throw Error("Ожидался JSON-объект.");
        rawView.textContent=text; // complete original JSON, no shortening
        packetLabel.textContent="№"+sequence+" · SHA-256 верна · "+new TextEncoder().encode(text).length+" байт";
        if(kind!=="test") {
          renderPacket(packet, sequence);
          storageSet(CACHE_KEY,JSON.stringify({text,sha:expected,sequence}));
        }
        storageSet(CURSOR_KEY,sequence);
        notice("Получен пакет №"+sequence+(kind==="test"?" · транспортный тест":" · игровая сцена"),"ready");
      }
    } catch(err){ notice("Ошибка получения: "+String(err?.message||err),"error"); }
    finally{busy=false;}
  }
  signIn.addEventListener("click",async()=>{
    const email=emailField?.value?.trim()||"";
    if(!email.includes("@")){notice("Введи почту существующего пользователя Supabase Auth.","error");return;}
    signIn.disabled=true;
    try {
      const {error}=await sb.auth.signInWithOtp({
        email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname},
      });
      if(error)throw error;
      notice("Письмо отправлено. Перейди по ссылке для входа.");
    }catch(e){notice("Ошибка авторизации: "+String(e?.message||e),"error");}
    finally{signIn.disabled=false;}
  });
  signOut.addEventListener("click",async()=>{
    await sb.auth.signOut();connected=false;
    authPanel.hidden=false;signOut.hidden=true;refresh.disabled=true;
    storageDelete(CACHE_KEY);storageDelete(CURSOR_KEY);
    notice("Вход завершён.");
  });
  refresh.addEventListener("click",()=>{void poll();});
  $("start")?.addEventListener("click",()=>{void poll();});
  $("send")?.addEventListener("click",()=>dispatchAction($("action")?.value||""));
  $("action")?.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) {e.preventDefault();dispatchAction($("action").value);}
  });
  $("save")?.addEventListener("click",()=>dispatchAction("сохранить"));
  $("portrait-close")?.addEventListener("click",()=>$("portrait-dialog")?.close());
  saveChatTarget?.addEventListener("click",rememberTarget);
  if(chatTarget) {
    try {
      chatTarget.value=localStorage.getItem(TARGET_KEY)||"";
      if(chatPrefill)chatPrefill.checked=localStorage.getItem(PREFILL_KEY)!=="0";
    } catch { if(chatPrefill)chatPrefill.checked=true; }
  }
  sb.auth.onAuthStateChange(()=>{
    setTimeout(()=>{void getSession().then(s=>{if(s)void poll();});},0);
  });
  void restoreCache().then(()=>getSession()).then(s=>{
    if(s)void poll();
    else notice("Войди в Supabase Auth, чтобы получить текущую сцену.");
  }).catch(e=>notice("Ошибка запуска: "+String(e?.message||e),"error"));
  setInterval(()=>{if(connected&&!document.hidden)void poll();},8000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&connected)void poll();});
}
