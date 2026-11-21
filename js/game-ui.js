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
    const n=identity.trim().toLowerCase();
    if(n.startsWith("оливер")||n.startsWith("oliver"))return namedColors.oliver_hayes;
    if(n.startsWith("бекс")||n.startsWith("bex"))return namedColors.bex;
    if(n.startsWith("иэн")||n.startsWith("ian"))return namedColors.ian_calder;
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
    requestAnimationFrame(()=>{renderQueued=false;try{refreshStory()}catch(error){console.error("Survival story rendering:",error);const box=$("diagnostic");if(box)box.textContent+="\nОшибка отображения сюжета: "+String(error?.message||error)}});
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
  // Keep the scenic stage visible, even when the save has no generated image.
  // Never treat an absent picture as an absent scene.
  function updateImage(scene,observable) {
    const fallback="assets/ui/background/background_cinematic_street_2k.webp";
    const url=scene.image_url||scene.scene_image_url||observable.scene_image_url||observable.image_url;
    const wrap=$("scene-image-wrap"),image=$("scene-image");
    wrap.hidden=false;
    image.onerror=null;
    image.onload=null;
    if(typeof url==="string" && /^https:\/\//i.test(url)) {
      image.onerror=()=>{
        image.onerror=null;
        image.alt="Атмосферный фон сцены";
        image.src=fallback;
      };
      image.alt="Изображение текущей сцены";
      image.src=url;
    } else {
      image.alt="Атмосферный фон сцены";
      if(image.getAttribute("src")!==fallback) image.src=fallback;
    }
  }
  function updateJournal(scene,observable,hero) {
    // Journal tab is now the Objectives section inside the survivor dossier.
    const target=$("profile-objectives");if(!target)return;target.replaceChildren();
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
  // Adjustable scene image / narrative split.
  // The preferred ratio is local to this browser and does not touch RPG6 state.
  const scenePane=$("pane-story");
  const imagePane=$("scene-image-wrap");
  const divider=$("stage-divider");
  const sceneHeading=scenePane.querySelector(".scene-heading");
  const actionPane=scenePane.querySelector(".action-area");
  const sizeStorageKey="28days.scene-image-ratio.v1";
  const defaultImageRatio=0.25;
  let imageRatio=defaultImageRatio;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  try {
    const saved=Number(localStorage.getItem(sizeStorageKey));
    if(Number.isFinite(saved)&&saved>=0.10&&saved<=0.55)imageRatio=saved;
  } catch(error) { /* Storage is optional. */ }

  function imageSizeLimits() {
    // The shared scene heading now sits outside the story pane; subtract it only in legacy layouts.
    const headingHeight=sceneHeading?.getBoundingClientRect().height||0;
    const fullHeight=Math.max(1,scenePane.clientHeight-headingHeight);
    const actionHeight=actionPane.getBoundingClientRect().height;
    const dividerHeight=divider.getBoundingClientRect().height||12;
    const minStory=Math.min(175,Math.max(105,fullHeight*0.25));
    const minImage=Math.min(110,Math.max(50,fullHeight*0.10));
    const maxImage=Math.max(minImage,Math.min(fullHeight*0.55,fullHeight-actionHeight-dividerHeight-minStory));
    return {fullHeight,minImage,maxImage};
  }
  function applyImageRatio() {
    const b=imageSizeLimits();
    const px=clamp(b.fullHeight*imageRatio,b.minImage,b.maxImage);
    imagePane.style.setProperty("--scene-resized-height",Math.round(px)+"px");
    const percentage=Math.round(100*px/b.fullHeight);
    divider.setAttribute("aria-valuenow",String(percentage));
    divider.setAttribute("aria-valuetext","Изображение сцены: "+percentage+"% высоты");
  }
  function saveImageRatio(){
    try{localStorage.setItem(sizeStorageKey,String(imageRatio))}catch(error){/* Private browsing or disabled storage. */}
  }
  let dragging=false,dragOriginY=0,dragOriginHeight=0;
  divider.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const bounds=imageSizeLimits();
    dragOriginY=event.clientY;
    dragOriginHeight=clamp(bounds.fullHeight*imageRatio,bounds.minImage,bounds.maxImage);
    dragging=true;
    divider.classList.add("dragging");
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener("pointermove",event=>{
    if(!dragging)return;
    const b=imageSizeLimits();
    const pixels=clamp(dragOriginHeight+event.clientY-dragOriginY,b.minImage,b.maxImage);
    imageRatio=clamp(pixels/b.fullHeight,0.10,0.55);
    applyImageRatio();
  });
  function finishDrag(){
    if(!dragging)return;
    dragging=false;
    divider.classList.remove("dragging");
    saveImageRatio();
  }
  divider.addEventListener("pointerup",finishDrag);
  divider.addEventListener("pointercancel",finishDrag);
  divider.addEventListener("lostpointercapture",finishDrag);
  divider.addEventListener("dblclick",()=>{
    imageRatio=defaultImageRatio;
    applyImageRatio();
    saveImageRatio();
  });
  divider.addEventListener("keydown",event=>{
    const b=imageSizeLimits();
    const current=clamp(imageRatio*b.fullHeight,b.minImage,b.maxImage);
    let next=null;
    if(event.key==="ArrowUp")next=current-14;
    else if(event.key==="ArrowDown")next=current+14;
    else if(event.key==="PageUp")next=current-42;
    else if(event.key==="PageDown")next=current+42;
    else if(event.key==="Home")next=b.minImage;
    else if(event.key==="End")next=b.maxImage;
    if(next===null)return;
    event.preventDefault();
    imageRatio=clamp(clamp(next,b.minImage,b.maxImage)/b.fullHeight,0.10,0.55);
    applyImageRatio();
    saveImageRatio();
  });
  if(typeof ResizeObserver!=="undefined"){
    const resizeObserver=new ResizeObserver(applyImageRatio);
    resizeObserver.observe(scenePane);
    resizeObserver.observe(actionPane);
  }else window.addEventListener("resize",applyImageRatio);
  requestAnimationFrame(applyImageRatio);

  window.addEventListener("rpg6:render",event=>{
    // An explicit refresh after a verified load prevents stale "loading" text even
    // when MutationObserver callbacks are delayed by rendering or tab visibility.
    try { refreshStory(); } catch (error) {
      console.error("Survival story rendering:",error);
      const box=$("diagnostic");
      if(box)box.textContent+="\nОшибка отображения сюжета: "+String(error?.message||error);
    }
    const d=obj(event.detail),scene=obj(d.scene),observable=obj(d.observable),hero=obj(d.hero);
    putText("world-day",scene.day===undefined?"День —":"День "+scene.day);
    putText("world-time",scene.time_label||"—:—");
    // Prefer explicit data from RPG6; no fictional weather is generated by the browser.
    const sceneEnv=obj(scene.environment),observableEnv=obj(observable.environment);
    const weatherSource=scene.weather_label||scene.weather||sceneEnv.weather||
      sceneEnv.weather_label||observable.weather_label||observable.weather||
      observableEnv.weather||observableEnv.weather_label||"";
    const rawWeather=typeof weatherSource==="string"?weatherSource:
      String(weatherSource?.description||weatherSource?.condition||weatherSource?.summary||weatherSource?.label||"");
    const weather=rawWeather.trim();
    let glyph="🌡️?";
    if(/гроз|storm|thunder/i.test(weather))glyph="⛈️";
    else if(/снег|snow|blizzard/i.test(weather))glyph="🌨️";
    else if(/дожд|rain|shower|осадк/i.test(weather))glyph="🌧️";
    else if(/туман|fog|mist|дымк/i.test(weather))glyph="🌫️";
    else if(/ветер|wind/i.test(weather))glyph="💨";
    else if(/облач|cloud|пасмур/i.test(weather))glyph="☁️";
    else if(/ясно|солн|sun|clear/i.test(weather))glyph="☀️";
    else if(weather)glyph="🌦️";
    const temperatureValue=weatherSource?.temperature_c??scene.temperature_c??sceneEnv.temperature_c??observable.temperature_c??observableEnv.temperature_c;
    const temperature=temperatureValue===undefined||temperatureValue===null||temperatureValue===""?null:Number(temperatureValue);
    const degree=temperature!==null&&Number.isFinite(temperature)?" "+(temperature>0?"+":"")+Math.round(temperature)+"°":"";
    putText("world-weather",glyph+degree);
    const weatherTitle=weather||"Погода пока не указана в игровом состоянии";
    $("world-weather").title=weatherTitle;
    $("world-weather").setAttribute("aria-label",weatherTitle);
    updateMap(scene,observable);updateImage(scene,observable);updateJournal(scene,observable,hero);updateCharacters();
  });
  new MutationObserver(updateCharacters).observe($("party"),{childList:true});
})();