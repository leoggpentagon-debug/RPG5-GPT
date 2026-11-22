/* Survival UI v57 — independent, read-only companion field journal.
 * Reuses the established profile book art, photo-flight motion, paper
 * turning keyframes and sound cues. No RPG state mutation or invented lore.
 */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const overlay = $("companion-overlay"), panel = $("companion-dossier");
  const party = $("party"), photoFrame = $("companion-polaroid");
  const closeButton = $("companion-close"), photo = $("companion-photo");
  const unknownPhoto = $("companion-photo-unknown");
  const notesBox = $("companion-notes"), pageSheet = $("companion-page-turn");
  const pageNumber = $("companion-page-number"), pageHeading = $("companion-page-heading");
  const previousButton = $("companion-prev"), nextButton = $("companion-next");
  if (![overlay,panel,party,photoFrame,closeButton,photo,unknownPhoto,
        notesBox,pageSheet,pageNumber,pageHeading,previousButton,nextButton].every(Boolean)) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const animateAvailable = typeof panel.animate === "function";
  const HOLD_MS = 500, DRIFT_PX = 15;
  const obj = x => x && typeof x === "object" && !Array.isArray(x) ? x : {};
  const arr = x => Array.isArray(x) ? x : [];
  const nameOf = x => typeof x === "string" ? x.trim() : "";
  const knownRelations = {
    bex: "близкая спутница",
    ian_calder: "незнакомец"
  }; // Established by the player. Live RPG6 data takes precedence.
  let latest = {}, opened = false, phase = "closed", currentIndex = -1;
  let sourceFrame = null, sourceButton = null, previousFocus = null;
  let holdTimer = null, holdButton = null, holdFrame = null, x0 = 0, y0 = 0;
  let animations = [], timeouts = [], ghost = null, seq = 0;
  let pages = [], pageIndex = 0, turning = false, recordBlocks = [];

  function people() {
    return arr(obj(latest.observable).characters).filter(person =>
      person && typeof person === "object" && person.character_id !== "oliver_hayes");
  }
  function first(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const found = first(value.description,value.text,value.label,value.name,value.status,value.value);
        if (found) return found;
      }
    }
    return "";
  }
  function remarks(value, limit = 6) {
    if (typeof value === "string") return value.trim().slice(0,1600);
    if (Array.isArray(value)) return value.slice(0,limit).map(v => first(v)).filter(Boolean).join("; ").slice(0,1600);
    if (value && typeof value === "object") {
      const v=obj(value);
      return first(v.description,v.text,v.summary,v.details,v.status);
    }
    return "";
  }
  function relationsFor(person) {
    const observable = obj(latest.observable), id=String(person.character_id || "");
    const raw = observable.relationships || observable.connections;
    if (Array.isArray(raw)) return obj(raw.find(r => String(obj(r).character_id || obj(r).id) === id));
    return obj(obj(raw)[id]);
  }
  function makeRecord(person) {
    const related = relationsFor(person), id=String(person.character_id||"");
    const fullName=first(person.name,person.display_name,person.alias) || "Человек рядом";
    const relationship=first(person.relationship_to_oliver,person.relationship_to_hero,
      person.relationship_to_player,person.relationship,person.relation,
      person.connection,related.relationship,related.description,related.status,
      knownRelations[id]) || "отношение пока не установлено";
    const summary=remarks(person.description) || remarks(person.biography) ||
      remarks(person.background) || remarks(person.role_description) ||
      remarks(person.character_notes);
    const observations=remarks(person.notes) || remarks(person.observations) ||
      remarks(person.context) || remarks(person.last_interaction) ||
      remarks(related.notes) || remarks(related.context);
    const important=remarks(person.important_moments) || remarks(person.important_events) ||
      remarks(person.memories) || remarks(person.history) || remarks(related.history);
    const promises=remarks(person.promises) || remarks(person.commitments) ||
      remarks(related.promises) || remarks(related.commitments);
    const threats=remarks(person.threats) || remarks(person.warnings) ||
      remarks(related.threats) || remarks(related.warnings);
    const statements = [
      {heading:"Кто рядом со мной",text:fullName+" сейчас рядом. Наши отношения: "+relationship+"."},
      {heading:"Что о нём известно",text:summary || "Подтверждённых сведений о прошлом пока нет."},
      {heading:"Что я заметил",text:observations || "Новых наблюдений пока не записано."},
      {heading:"Важные моменты",text:important || "События, которые стоит отметить, ещё не внесены в записи."},
      {heading:"Обещания",text:promises || "Подтверждённых обещаний в доступных записях нет."},
      {heading:"Предупреждения и угрозы",text:threats || "Подтверждённых угроз в доступных записях нет."}
    ];
    return {fullName,relationship,statements};
  }
  function segment(text, max = 125) {
    const words=String(text).split(/\s+/).filter(Boolean), result=[];
    let line="";
    for (const word of words) {
      if (line && line.length+word.length+1>max) {result.push(line);line="";}
      if (word.length>max) {
        if (line){result.push(line);line="";}
        for(let i=0;i<word.length;i+=max)result.push(word.slice(i,i+max));
      } else line += (line?" ":"")+word;
    }
    if(line)result.push(line);
    return result.length ? result : [""];
  }
  function noteElement(note) {
    const box=document.createElement("p");box.className="companion-entry";
    if(note.heading){const title=document.createElement("strong");title.textContent=note.heading;box.append(title);}
    const span=document.createElement("span");span.textContent=note.text;box.append(span);
    return box;
  }
  function showPage(index) {
    pageIndex=Math.max(0,Math.min(index,pages.length-1));
    notesBox.replaceChildren(...(pages[pageIndex]||[]).map(noteElement));
    pageNumber.textContent="Лист "+String(pageIndex+1).padStart(2,"0")+
      " / "+String(Math.max(1,pages.length)).padStart(2,"0");
    pageHeading.textContent="ЗАПИСИ ОБ "+$("companion-name").textContent.toLocaleUpperCase("ru-RU");
    previousButton.disabled=pageIndex===0;
    nextButton.disabled=pageIndex>=pages.length-1;
  }
  function repaginate() {
    if(phase==="closed")return;
    const retainPage=pageIndex;
    const items=recordBlocks.flatMap(({heading,text})=>segment(text).map((part,i)=>({
      heading:i===0?heading:"",text:part
    })));
    pages=[];let page=[];
    notesBox.style.visibility="hidden";
    notesBox.replaceChildren();
    for(const item of items){
      const node=noteElement(item);
      notesBox.append(node);
      if(notesBox.scrollHeight>notesBox.clientHeight+2 && page.length){
        node.remove();pages.push(page);page=[];
        notesBox.replaceChildren();notesBox.append(node);
      }
      page.push(item);
    }
    if(page.length)pages.push(page);
    if(!pages.length)pages=[[{heading:"Заметки",text:"Пока нет подтверждённых сведений."}]];
    notesBox.style.visibility="";
    showPage(Math.min(retainPage,pages.length-1));
  }
  function clearPageTurn() {
    for(const id of timeouts)clearTimeout(id);
    timeouts=[];
    pageSheet.classList.remove("turning","reverse");turning=false;
  }
  function turn(delta) {
    if(phase!=="open"||turning)return;
    const target=pageIndex+delta;
    if(target<0||target>=pages.length)return;
    window.RPG6_SFX?.play(delta<0?"page_turn_alt":"page_turn",{gain:.7});
    if(reduced.matches){showPage(target);return;}
    turning=true;pageSheet.classList.toggle("reverse",delta<0);
    pageSheet.classList.add("turning");
    timeouts.push(setTimeout(()=>showPage(target),295));
    timeouts.push(setTimeout(clearPageTurn,650));
  }
  previousButton.addEventListener("click",()=>turn(-1));
  nextButton.addEventListener("click",()=>turn(1));

  function metrics(el){const r=el.getBoundingClientRect();return {
    x:r.x,y:r.y,width:r.width,height:r.height,
    centerX:r.x+r.width/2,centerY:r.y+r.height/2
  };}
  function stopAnimation(){
    for(const a of animations){try{a.cancel()}catch(_){}}
    animations=[];
    for(const t of timeouts)clearTimeout(t);timeouts=[];
    if(ghost){ghost.remove();ghost=null;}
  }
  function animate(el,keyframes,options){
    if(!animateAvailable||!el)return;
    try{animations.push(el.animate(keyframes,{...options,fill:"both"}));}
    catch(e){console.warn("Companion animation:",e);}
  }
  function flyingCopy(source,rect){
    const copy=source.cloneNode(true);
    copy.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
    copy.removeAttribute("id");
    copy.classList.remove("hold-progress","companion-source-hidden");
    copy.classList.add("companion-flight-ghost");
    copy.setAttribute("inert","");copy.setAttribute("aria-hidden","true");
    Object.assign(copy.style,{position:"fixed",left:rect.x+"px",top:rect.y+"px",
      width:rect.width+"px",height:rect.height+"px",margin:"0",transform:"none",
      transformOrigin:"center center"});
    document.body.append(copy);ghost=copy;return copy;
  }
  function flightFrames(from,to){
    const dx=to.centerX-from.centerX,dy=to.centerY-from.centerY;
    const sx=to.width/Math.max(1,from.width),sy=to.height/Math.max(1,from.height);
    const pose=(fraction,lift,angle)=>{
      const x=dx*fraction,y=dy*fraction-lift;
      const xx=1+(sx-1)*fraction,yy=1+(sy-1)*fraction;
      return `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${angle}deg) scale(${xx.toFixed(4)},${yy.toFixed(4)})`;
    };
    return [
      {offset:0,opacity:1,transform:pose(0,0,-1.6),filter:"drop-shadow(2px 5px 6px #000a)"},
      {offset:.38,opacity:1,transform:pose(.37,15,1.3),filter:"drop-shadow(5px 14px 12px #000a)"},
      {offset:.82,opacity:1,transform:pose(.84,4,-2.5),filter:"drop-shadow(4px 9px 9px #0008)"},
      {offset:1,opacity:1,transform:pose(1,0,-2),filter:"drop-shadow(2px 5px 6px #0009)"}
    ];
  }
  function cue(sound,delay=0,gain=.7){
    const fn=()=>window.RPG6_SFX?.play(sound,{gain});
    if(delay)timeouts.push(setTimeout(fn,delay)); else fn();
  }
  function finishOpen(serial){
    if(serial!==seq||phase!=="opening")return;
    stopAnimation();photoFrame.style.opacity="";
    overlay.classList.remove("is-entering");
    phase="open";closeButton.focus({preventScroll:true});
  }
  function finishClose(serial){
    if(serial!==seq||phase!=="closing")return;
    panel.style.opacity="0";
    stopAnimation();clearPageTurn();photoFrame.style.opacity="";
    sourceFrame?.classList.remove("companion-source-hidden");
    overlay.classList.remove("is-entering","is-exiting","is-open");
    overlay.setAttribute("aria-hidden","true");
    document.body.classList.remove("dossier-visible","dossier-cinematic");
    panel.style.opacity="";
    phase="closed";opened=false;
    if(previousFocus && previousFocus.isConnected && typeof previousFocus.focus==="function")
      previousFocus.focus({preventScroll:true});
    else sourceButton?.focus({preventScroll:true});
    sourceFrame=null;sourceButton=null;currentIndex=-1;
  }
  function openCompanion(button) {
    if(phase!=="closed"||document.querySelector("#profile-overlay.is-open"))return;
    const candidates=people();
    const characterId=String(button.dataset.characterId||button.closest(".party-person")?.dataset.characterId||"");
    // The earlier RPG6 UI passed partyIndex. RPG5 now gives stable character_id.
    // Prefer ID to avoid silently opening the wrong dossier when cast order changes.
    const i=characterId ? candidates.findIndex(p=>p.character_id===characterId)
      : Number(button.dataset.partyIndex);
    const person=candidates[i];
    if(!person || !Number.isInteger(i) || i<0)return;
    const frame=button.closest(".polaroid-npc");if(!frame)return;
    const record=makeRecord(person);recordBlocks=record.statements;
    currentIndex=i;sourceButton=button;sourceFrame=frame;
    previousFocus=document.activeElement;
    $("companion-name").textContent=record.fullName;
    $("companion-stamp").textContent=record.relationship.toLocaleUpperCase("ru-RU");
    $("companion-relationship").textContent="Мои записи об отношении: "+record.relationship+".";
    const image=button.querySelector("img");
    if(image && image.complete && image.naturalWidth===0){
      photo.hidden=true;unknownPhoto.hidden=false;
    }else if(image){
      photo.src=image.currentSrc||image.src;photo.alt=record.fullName;
      photo.hidden=false;unknownPhoto.hidden=true;
    }else{photo.hidden=true;unknownPhoto.hidden=false;}
    panel.style.opacity="";
    phase="opening";opened=true;const serial=++seq;
    clearPageTurn();pageIndex=0;stopAnimation();
    overlay.setAttribute("aria-hidden","false");
    overlay.classList.remove("is-exiting");
    overlay.classList.add("is-open","is-entering");
    document.body.classList.add("dossier-visible","dossier-cinematic");
    closeButton.focus({preventScroll:true});
    void panel.offsetWidth;
    repaginate();
    const from=metrics(frame),to=metrics(photoFrame);
    if(reduced.matches||!animateAvailable){
      sourceFrame.classList.add("companion-source-hidden");
      overlay.classList.remove("is-entering");phase="open";
      cue("book_open",0,.8);return;
    }
    cue("paper_rustle",0,.5);cue("book_open",200,.75);
    const flying=flyingCopy(frame,from);
    sourceFrame.classList.add("companion-source-hidden");
    photoFrame.style.opacity="0";
    animate(flying,flightFrames(from,to),{delay:35,duration:910,easing:"cubic-bezier(.2,.77,.24,1)"});
    animate(panel,[
      {offset:0,opacity:.62,clipPath:"inset(0 97% 0 0 round 5px)",transform:"translateX(-20px) scale(.965) rotate(-1.2deg)"},
      {offset:.31,opacity:1,clipPath:"inset(0 64% 0 0 round 5px)",transform:"translateX(-10px) scale(.98) rotate(-.7deg)"},
      {offset:.79,opacity:1,clipPath:"inset(0 0 0 0 round 5px)",transform:"translateX(3px) scale(1.012) rotate(.3deg)"},
      {offset:1,opacity:1,clipPath:"inset(0 0 0 0 round 4px)",transform:"none"}
    ],{delay:250,duration:665,easing:"cubic-bezier(.2,.8,.22,1)"});
    animate(photoFrame,[{opacity:0},{opacity:1}],{delay:780,duration:185,easing:"ease-in-out"});
    timeouts.push(setTimeout(()=>finishOpen(serial),1550));
  }
  function closeCompanion() {
    if(phase==="closed"||phase==="closing")return;
    if(phase==="opening"){
      stopAnimation();photoFrame.style.opacity="";
      overlay.classList.remove("is-entering");phase="open";
    }
    clearPageTurn();phase="closing";const serial=++seq;
    stopAnimation();overlay.classList.add("is-exiting");
    if(reduced.matches||!animateAvailable){cue("book_close",0,.8);finishClose(serial);return;}
    cue("book_close",140,.8);cue("paper_rustle",380,.28);
    const to=sourceFrame?.isConnected?metrics(sourceFrame):null;
    if(to){
      const from=metrics(photoFrame),flying=flyingCopy(photoFrame,from);
      photoFrame.style.opacity="0";
      const frames=flightFrames(from,to);
      animate(flying,frames,{delay:120,duration:770,easing:"cubic-bezier(.4,.12,.26,1)"});
    }
    animate(panel,[
      {offset:0,opacity:1,clipPath:"inset(0 0 0 0 round 4px)",transform:"none"},
      {offset:.4,opacity:1,clipPath:"inset(0 40% 0 0 round 4px)",transform:"translateX(-8px) scale(.99) rotate(-.5deg)"},
      {offset:1,opacity:.42,clipPath:"inset(0 97% 0 0 round 4px)",transform:"translateX(-15px) scale(.965) rotate(-1deg)"}
    ],{delay:170,duration:530,easing:"cubic-bezier(.42,0,.85,.25)"});
    timeouts.push(setTimeout(()=>finishClose(serial),1000));
  }

  function cancelHold(){
    if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null;}
    if(holdFrame)holdFrame.classList.remove("hold-progress");
    holdFrame=null;holdButton=null;
  }
  function validTarget(node){
    const button=node?.closest?.(".party-person .portrait-button");
    return button?.closest("#party")===party?button:null;
  }
  party.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    if(phase!=="closed"||document.querySelector("#profile-overlay.is-open"))return;
    const button=validTarget(e.target);if(!button)return;
    cancelHold();x0=e.clientX;y0=e.clientY;
    holdButton=button;holdFrame=button.closest(".polaroid-npc");
    holdFrame.classList.add("hold-progress");
    holdTimer=setTimeout(()=>{const selected=holdButton;cancelHold();if(selected?.isConnected)openCompanion(selected);},HOLD_MS);
  });
  window.addEventListener("pointermove",e=>{
    if(holdButton && (Math.abs(e.clientX-x0)>DRIFT_PX||Math.abs(e.clientY-y0)>DRIFT_PX))cancelHold();
  },{passive:true});
  window.addEventListener("pointerup",cancelHold);
  window.addEventListener("pointercancel",cancelHold);
  party.addEventListener("pointerout",e=>{
    if(holdButton && holdButton.contains(e.target) && !holdButton.contains(e.relatedTarget)) cancelHold();
  });
  party.addEventListener("contextmenu",e=>{if(validTarget(e.target))e.preventDefault();});
  party.addEventListener("click",e=>{if(validTarget(e.target))e.preventDefault();});
  party.addEventListener("keydown",e=>{
    if((e.key!==" "&&e.key!=="Enter")||e.repeat)return;
    const button=validTarget(e.target);if(!button)return;
    e.preventDefault();cancelHold();holdButton=button;holdFrame=button.closest(".polaroid-npc");
    holdFrame.classList.add("hold-progress");
    holdTimer=setTimeout(()=>{const selected=holdButton;cancelHold();if(selected?.isConnected)openCompanion(selected);},HOLD_MS);
  });
  party.addEventListener("keyup",e=>{if(e.key===" "||e.key==="Enter")cancelHold();});

  closeButton.addEventListener("click",closeCompanion);
  $("companion-backdrop").addEventListener("click",closeCompanion);
  overlay.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.preventDefault();closeCompanion();return;}
    if(e.key==="ArrowRight" && e.target.tagName!=="BUTTON"){e.preventDefault();turn(1);}
    if(e.key==="ArrowLeft" && e.target.tagName!=="BUTTON"){e.preventDefault();turn(-1);}
    if(e.key!=="Tab")return;
    const all=[closeButton,previousButton,nextButton].filter(el=>!el.disabled&&el.getClientRects().length);
    if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all[all.length-1].focus();}
    else if(!e.shiftKey&&document.activeElement===all[all.length-1]){e.preventDefault();all[0].focus();}
  });
  window.addEventListener("rpg6:render",e=>{
    latest=e.detail||{};
    if(phase==="open") repaginate();
  });
  window.addEventListener("resize",()=>{
    if(phase==="open"&&!turning)requestAnimationFrame(repaginate);
  },{passive:true});
})();
