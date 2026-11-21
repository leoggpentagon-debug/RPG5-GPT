(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const chat = $("chat"), drawer = $("service-drawer"), scrim = $("drawer-scrim"), toggle = $("service-toggle");
  function setDrawer(open) {
    drawer.classList.toggle("open",open);
    drawer.setAttribute("aria-hidden",String(!open));
    toggle.setAttribute("aria-expanded",String(open));
    scrim.hidden = !open;
    if(open) $("service-close").focus(); else toggle.focus();
  }
  toggle.addEventListener("click",() => setDrawer(!drawer.classList.contains("open")));
  $("service-close").addEventListener("click",() => setDrawer(false));
  scrim.addEventListener("click",() => setDrawer(false));
  window.addEventListener("keydown",e => {if(e.key==="Escape" && drawer.classList.contains("open"))setDrawer(false)});
  const panes=[...document.querySelectorAll(".game-pane")],tabs=[...document.querySelectorAll(".game-tab")];
  function openTab(name) {
    tabs.forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active))});
    panes.forEach(p=>{const active=p.dataset.pane===name;p.hidden=!active;p.classList.toggle("visible",active)});
  }
  tabs.forEach(b=>b.addEventListener("click",()=>openTab(b.dataset.tab)));
  // The original conversation is a read-only DOM source. No extra server requests.
  // Render it as one scrollable story, preserving the latest turn and portrait links.
  const story=$("story-page"),viewer=$("story-viewer");
  let firstRender=true,renderQueued=false;
  const colorPalette=["#c9b79d","#d7a97d","#a8c5c2","#d1b6c4","#acc397","#d9ba87","#aeb5d2"];
  const namedColors={oliver_hayes:"#f6efe5",bex:"#e3a69c",ian_calder:"#cbbf8a",
    may_walker:"#abc4a2",tom_walker:"#d8bd87",sarah:"#bfa8cc",david:"#9ebed0",
    ellie_morgan:"#e4c296",arthur_morgan:"#c1b3dc"};
  function getSpeakerColor(id,name){
    const key=String(id||"").trim().toLowerCase();
    if(namedColors[key])return namedColors[key];
    const identity=String(name||key);
    if(/^(оливер|oliver)\b/i.test(identity))return namedColors.oliver_hayes;
    if(/^(бекс|bex)\b/i.test(identity))return namedColors.bex;
    if(/^(иэн|ian)\b/i.test(identity))return namedColors.ian_calder;
    let hash=0;for(const ch of identity)hash=((hash*33)+ch.charCodeAt(0))>>>0;
    return colorPalette[hash%colorPalette.length];
  }
  function buildNarration(text){
    const block=document.createElement("section");
    block.className="narrative-block role-narrator";
    const body=document.createElement("div");body.className="dialogue-body";
    const content=document.createElement("p");content.className="dialogue-text";content.textContent=text;
    body.append(content);block.append(body);return block;
  }
  function buildDialogue(entry){
    const bubble=entry.querySelector(".bubble");if(!bubble)return null;
    const kind=entry.classList.contains("player")?"player":entry.classList.contains("npc")?"npc":
      entry.classList.contains("gm")?"narrator":"system";
    if(kind==="system")return null;
    const text=bubble.querySelector("div")?.textContent||"";
    if(!text.trim())return null;
    if(kind==="narrator")return buildNarration(text);
    const block=document.createElement("section");block.className="narrative-block role-"+kind;
    const speakerId=entry.dataset.speakerId||"";
    let label=kind==="player"?"Оливер":bubble.querySelector("b")?.textContent?.trim()||"Персонаж";
    label=label.replace(/\s*[·—-]\s*(?:ЧЕРНОВОЙ|ЧЕРНОВОЙ|СОХРАНЁННЫЙ|ЧАСТИЧНО ВОССТАНОВЛЕННЫЙ).*$/i,"").trim()||"Персонаж";
    const nameColor=getSpeakerColor(speakerId,label);
    block.style.setProperty("--speaker-color",nameColor);
    const avatar=entry.querySelector("img.avatar");
    if(avatar&&avatar.getAttribute("src")){
      const img=document.createElement("img");img.className="dialogue-avatar";
      img.src=avatar.src;img.alt=label;
      img.addEventListener("click",()=>{
        const modal=$("portrait-dialog"),full=$("portrait-full");
        full.src=img.src;full.alt=label;if(!modal.open)modal.showModal();
      });
      block.append(img);
    }
    const body=document.createElement("div");body.className="dialogue-body";
    const name=document.createElement("strong");name.className="dialogue-name";name.textContent=label;
    const content=document.createElement("p");content.className="dialogue-text";content.textContent=text;
    body.append(name,content);block.append(body);return block;
  }
  function refreshStory(){
    const stayBottom=firstRender||viewer.scrollHeight-viewer.clientHeight-viewer.scrollTop<95;
    const fragment=document.createDocumentFragment();
    let count=0;
    const sceneText=$("scene-text").textContent.trim();
    if(sceneText){fragment.append(buildNarration(sceneText));count++;}
    for(const entry of chat.querySelectorAll(":scope > .chat-entry")){
      const block=buildDialogue(entry);
      if(block){fragment.append(block);count++;}
    }
    story.replaceChildren(fragment);
    if(!count){
      const empty=document.createElement("p");empty.className="story-empty";
      empty.textContent="Загружаю сохранённую историю…";story.append(empty);
    }
    firstRender=false;
    if(stayBottom)viewer.scrollTop=viewer.scrollHeight;
  }
  new MutationObserver(()=>{
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;refreshStory()});
  }).observe(chat,{childList:true});
  refreshStory();
  const systemLog=$("system-log"),status=$("status");let lastStatus="";
  function pushLog(message,bad=false) {
    const content=String(message||"").trim();if(!content || content===lastStatus)return;
    lastStatus=content;
    const line=document.createElement("div");line.className=bad?"log-error":"log-info";
    line.textContent="["+new Date().toLocaleTimeString("ru-RU")+"] "+content;
    systemLog.append(line);while(systemLog.children.length>90)systemLog.firstElementChild?.remove();
    systemLog.scrollTop=systemLog.scrollHeight;
  }
  new MutationObserver(()=>pushLog(status.textContent,status.classList.contains("error"))).observe(status,{
    childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["class"]
  });
  pushLog(status.textContent);
  $("clear-log").addEventListener("click",()=>{systemLog.replaceChildren();lastStatus=""});
  function obj(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
  function list(x){return Array.isArray(x)?x:[]}
  function putText(id,val){$(id).textContent=val==null?"":String(val)}
  function getGeo(...values) {
    for(const raw of values) {
      const x=obj(raw),location=obj(x.location);
      const lat=Number(x.lat??x.latitude??location.lat??location.latitude);
      const lng=Number(x.lng??x.lon??x.long??x.longitude??location.lng??location.lon??location.longitude);
      const present=x.lat!==undefined||x.latitude!==undefined||location.lat!==undefined||location.latitude!==undefined;
      if(present&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat,lng};
    }
    return null;
  }
  function updateMap(scene,observable) {
    const geo=getGeo(scene.coordinates,scene.geo,scene.location,scene,observable.coordinates,observable.geo,observable.location,observable);
    const frame=$("map-frame"),placeholder=$("map-placeholder");
    if(!geo) {frame.hidden=true;frame.removeAttribute("src");placeholder.hidden=false;putText("map-coordinates","Координаты сцены пока неизвестны");return}
    const lat=geo.lat,lng=geo.lng,span=.015;
    putText("map-coordinates",lat.toFixed(5)+", "+lng.toFixed(5));
    const bbox=[lng-span,lat-span,lng+span,lat+span].map(x=>x.toFixed(6)).join(",");
    const src="https://www.openstreetmap.org/export/embed.html?bbox="+encodeURIComponent(bbox)+"&layer=mapnik&marker="+encodeURIComponent(lat+","+lng);
    if(frame.getAttribute("src")!==src)frame.src=src;
    frame.hidden=false;placeholder.hidden=true;
  }
  function updateImage(scene,observable) {
    const url=scene.image_url||scene.scene_image_url||observable.scene_image_url||observable.image_url;
    const wrap=$("scene-image-wrap"),image=$("scene-image");
    if(typeof url!=="string"||!/^https:\/\//i.test(url)) {image.removeAttribute("src");wrap.hidden=true;return}
    image.onerror=()=>{wrap.hidden=true};image.onload=()=>{wrap.hidden=false};image.src=url;
  }
  function updateJournal(scene,observable,hero) {
    const target=$("journal-entries");target.replaceChildren();
    const quests=list(observable.objectives).length?observable.objectives:
      list(observable.quests).length?observable.quests:
      list(scene.objectives).length?scene.objectives:
      list(scene.tasks).length?scene.tasks:list(hero.objectives);
    if(!quests.length) {
      const p=document.createElement("p");p.className="muted";p.textContent="В данных текущей сцены задачи пока не указаны.";target.append(p);return;
    }
    for(const quest of quests) {
      const item=document.createElement("div");item.className="journal-card";
      item.textContent=typeof quest==="string"?quest:String(quest.title||quest.text||quest.description||"Задача");
      target.append(item);
    }
  }
  function updateCharacters() {
    const target=$("character-cards");target.replaceChildren();
    const rows=[...$("party").querySelectorAll(".party-person")];
    if(!rows.length) {
      const p=document.createElement("p");p.className="muted";p.textContent="Персонажи рядом пока не установлены.";target.append(p);return;
    }
    for(const row of rows) {
      const speaker=row.querySelector("strong")?.textContent||"";
      row.style.setProperty("--speaker-color",getSpeakerColor("",speaker));
      const card=document.createElement("div");card.className="character-card";
      const img=row.querySelector("img");
      if(img) {const avatar=document.createElement("img");avatar.src=img.src;avatar.alt=img.alt;card.append(avatar)}
      const info=document.createElement("div");info.textContent=row.querySelector("strong")?.textContent||"Персонаж";card.append(info);target.append(card);
    }
  }
  window.addEventListener("rpg6:render",event=>{
    const d=obj(event.detail),scene=obj(d.scene),observable=obj(d.observable),hero=obj(d.hero);
    putText("world-day",scene.day===undefined?"День —":"День "+scene.day);
    putText("world-time",scene.time_label||"—:—");
    const weatherSource=scene.weather_label||scene.weather||observable.weather_label||observable.weather||"";
    const weather=typeof weatherSource==="string"?weatherSource:
      String(weatherSource?.description||weatherSource?.condition||weatherSource?.summary||"");
    let glyph="—";
    if(/гроз|storm|thunder/i.test(weather))glyph="⛈️";
    else if(/снег|snow|blizzard/i.test(weather))glyph="🌨️";
    else if(/дожд|rain|shower|осадк/i.test(weather))glyph="🌧️";
    else if(/туман|fog|mist|дымк/i.test(weather))glyph="🌫️";
    else if(/ветер|wind/i.test(weather))glyph="💨";
    else if(/облач|cloud|пасмур/i.test(weather))glyph="☁️";
    else if(/ясно|солн|sun|clear/i.test(weather))glyph="☀️";
    putText("world-weather",glyph);
    $("world-weather").title=weather||"Погода неизвестна";
    $("world-weather").setAttribute("aria-label",weather||"Погода неизвестна");
    updateMap(scene,observable);updateImage(scene,observable);updateJournal(scene,observable,hero);updateCharacters();
  });
  new MutationObserver(updateCharacters).observe($("party"),{childList:true});
})();