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
  // #chat contains actual saved and staged history; the visible viewer reads it in pages.
  const story=$("story-page"),counter=$("page-count"),prev=$("page-prev"),next=$("page-next");
  let pages=[],pageIndex=0,wasEmpty=true;
  function splitNarrative(raw) {
    let rest=String(raw||"").trim();
    if(!rest)return [""];
    const chunks=[];
    while(rest.length>530) {
      let cut=rest.lastIndexOf("\n",530);
      if(cut<200)cut=rest.lastIndexOf(" ",530);
      if(cut<200)cut=530;
      chunks.push(rest.slice(0,cut).trim());
      rest=rest.slice(cut).trimStart();
    }
    if(rest)chunks.push(rest);
    return chunks;
  }
  function showPage() {
    story.replaceChildren();
    if(!pages.length) {
      const p=document.createElement("p");p.textContent="Подключаюсь к сохранённой истории…";story.append(p);
    } else {
      for(const entry of pages[pageIndex]) {
        const speaker=document.createElement("span"),p=document.createElement("p");
        speaker.className="story-speaker";speaker.textContent=entry.speaker;
        p.textContent=entry.text||"…";story.append(speaker,p);
      }
    }
    counter.textContent=pages.length?(pageIndex+1)+" / "+pages.length:"— / —";
    prev.disabled=pageIndex<=0;next.disabled=pageIndex>=pages.length-1;
  }
  prev.addEventListener("click",()=>{pageIndex=Math.max(0,pageIndex-1);showPage()});
  next.addEventListener("click",()=>{pageIndex=Math.min(pages.length-1,pageIndex+1);showPage()});
  function refreshPages() {
    const built=[];
    const sceneText=$("scene-text").textContent.trim();
    if(sceneText)for(const piece of splitNarrative(sceneText))built.push({speaker:"ТЕКУЩАЯ СЦЕНА",text:piece});
    for(const entry of chat.querySelectorAll(":scope > .chat-entry")) {
      if(entry.classList.contains("system"))continue;
      const bubble=entry.querySelector(".bubble");if(!bubble)continue;
      const label=bubble.querySelector("b")?.textContent||"История";
      const body=bubble.querySelector("div")?.textContent||"";
      for(const piece of splitNarrative(body))built.push({speaker:label,text:piece});
    }
    // Pack nearby dialogue and narration into actual pages, not one bubble per page.
    const grouped=[];let group=[],used=0;
    for(const item of built) {
      const size=item.text.length + Math.min(70,item.speaker.length);
      if(group.length && (used+size>1450 || group.length>=4)) {
        grouped.push(group);group=[];used=0;
      }
      group.push(item);used+=size;
    }
    if(group.length)grouped.push(group);
    // Avoid a last page consisting of just one short NPC sentence.
    if(grouped.length>1) {
      const last=grouped[grouped.length-1],lastLength=last.reduce((n,e)=>n+e.text.length,0);
      const previous=grouped[grouped.length-2];
      if(lastLength<350 && previous.length>1) {
        last.unshift(previous.pop());
        if(!previous.length)grouped.splice(grouped.length-2,1);
      }
    }
    const latest=wasEmpty || pageIndex>=pages.length-1;
    pages=grouped;pageIndex=pages.length?(latest?pages.length-1:Math.min(pageIndex,pages.length-1)):0;
    wasEmpty=pages.length===0;showPage();
  }
  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refreshPages()});
  }).observe(chat,{childList:true});
  refreshPages();
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
      const card=document.createElement("div");card.className="character-card";
      const img=row.querySelector("img");
      if(img) {const avatar=document.createElement("img");avatar.src=img.src;avatar.alt=img.alt;card.append(avatar)}
      const info=document.createElement("div");info.textContent=row.querySelector("strong")?.textContent||"Персонаж";card.append(info);target.append(card);
    }
  }
  window.addEventListener("rpg6:render",event=>{
    const d=obj(event.detail),scene=obj(d.scene),observable=obj(d.observable),hero=obj(d.hero);
    putText("world-day",scene.day===undefined?"День —":"День "+scene.day);
    putText("world-time",scene.time_label||"Время —");
    putText("world-location",scene.location_detail||observable.location_detail||"Местоположение неизвестно");
    updateMap(scene,observable);updateImage(scene,observable);updateJournal(scene,observable,hero);updateCharacters();
  });
  new MutationObserver(updateCharacters).observe($("party"),{childList:true});
})();