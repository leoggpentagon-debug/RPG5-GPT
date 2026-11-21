(() => {
  "use strict";
  // CC0 Kenney OGG effects; provenance in assets/audio/SOURCES.md.
  // Optional client-only audio. No contact with Gemini or the RPG6 save API.
  const ROOT="assets/audio/";
  const sources=Object.freeze({
    book_open:"book_open.ogg",book_close:"book_close.ogg",paper_brush:"paper_brush.ogg",
    page_turn:"page_turn.ogg",page_turn_alt:"page_turn_alt.ogg",
    paper_stamp:"paper_stamp.ogg",paper_rustle:"paper_rustle.ogg",
    leather_creak:"leather_creak.ogg",
    ui_click:"ui_click.ogg",ui_select:"ui_select.ogg",ui_hover:"ui_hover.ogg",
    ui_confirm:"ui_confirm.ogg",ui_back:"ui_back.ogg",
    ui_open:"ui_open.ogg",ui_close:"ui_close.ogg",
    ui_error:"ui_error.ogg",ui_toggle:"ui_toggle.ogg"
  });
  const baseGain={
    book_open:.34,book_close:.34,page_turn:.95,page_turn_alt:.95,paper_brush:.95,
    paper_stamp:.24,paper_rustle:.4,leather_creak:.16,
    ui_click:.5,ui_select:.48,ui_hover:.19,ui_confirm:.48,
    ui_back:.4,ui_open:.38,ui_close:.38,ui_error:.37,ui_toggle:.45
  };
  const STORE_ENABLED="survival.audio.enabled.v1",STORE_VOLUME="survival.audio.volume.v1";
  let enabled=true,volume=.35;
  const active=new Set();
  const lastPlayed=new Map();
  const $=id=>document.getElementById(id);
  try{
    const saved=localStorage.getItem(STORE_ENABLED);
    if(saved==="false")enabled=false;
    const savedVolume=localStorage.getItem(STORE_VOLUME);
    if(savedVolume!==null&&savedVolume!==""){
      const v=Number(savedVolume);
      if(Number.isFinite(v))volume=Math.max(0,Math.min(1,v));
    }
  }catch(error){ /* Storage is optional. */ }
  function store(){
    try{localStorage.setItem(STORE_ENABLED,String(enabled));localStorage.setItem(STORE_VOLUME,String(volume))}
    catch(error){/* Private browsing / disabled storage. */}
  }
  function silence(){
    for(const sound of active){try{sound.pause();sound.currentTime=0}catch(error){}}
    active.clear();
  }
  function play(name,options={}){
    if(!enabled||volume<=0||!Object.hasOwn(sources,name)||typeof Audio==="undefined")return;
    const now=performance.now(),minimum=name==="paper_brush"?490:name==="ui_hover"?165:45;
    if(now-(lastPlayed.get(name)||-10000)<minimum)return;
    lastPlayed.set(name,now);
    const gain=Number.isFinite(Number(options.gain))?Math.max(0,Math.min(1,Number(options.gain))):1;
    if(active.size>=8){const first=active.values().next().value;if(first){try{first.pause()}catch(error){}active.delete(first)}}
    try{
      const sound=new Audio(ROOT+sources[name]);
      sound.preload="auto";
      sound.volume=Math.max(0,Math.min(1,volume*(baseGain[name]??.5)*gain));
      if(Number.isFinite(Number(options.rate)))sound.playbackRate=Math.max(.72,Math.min(1.25,Number(options.rate)));
      const cleanup=()=>active.delete(sound);
      sound.addEventListener("ended",cleanup,{once:true});
      sound.addEventListener("error",cleanup,{once:true});
      active.add(sound);
      const result=sound.play();
      if(result&&typeof result.catch==="function")result.catch(cleanup);
      return sound;
    }catch(error){return null;}
  }
  function render(){
    const toggle=$("sfx-toggle"),slider=$("sfx-volume"),value=$("sfx-value");
    if(toggle){
      toggle.setAttribute("aria-pressed",String(enabled));
      toggle.textContent=enabled?"Включены":"Выключены";
      toggle.classList.toggle("is-muted",!enabled);
    }
    if(slider){
      slider.value=String(Math.round(volume*100));
      slider.disabled=!enabled;
    }
    if(value)value.textContent=Math.round(volume*100)+"%";
  }
  function setEnabled(next){
    enabled=Boolean(next);store();render();
    if(!enabled)silence();else play("ui_toggle",{gain:.65});
  }
  function setVolume(percent){
    const next=Number(percent);
    if(!Number.isFinite(next))return;
    volume=Math.max(0,Math.min(1,next/100));store();render();
    for(const sound of active)try{sound.volume=Math.min(sound.volume,volume)}catch(error){}
  }
  window.RPG6_SFX=Object.freeze({play,setEnabled,setVolume,get enabled(){return enabled},get volume(){return volume}});

  const toggle=$("sfx-toggle"),slider=$("sfx-volume"),preview=$("sfx-preview");
  toggle?.addEventListener("click",()=>setEnabled(!enabled));
  slider?.addEventListener("input",event=>setVolume(event.target.value));
  slider?.addEventListener("change",()=>play("ui_select",{gain:.7}));
  preview?.addEventListener("click",()=>{play("paper_brush",{gain:.8});setTimeout(()=>play("page_turn",{gain:.8}),340)});
  render();

  // Clicking an action confirms the *input*, not a successful game turn/save.
  document.addEventListener("click",event=>{
    const el=event.target instanceof Element?event.target.closest("button,summary"):null;
    if(!el||el.disabled||el.closest("#sound-settings"))return;
    if(el.closest(".profile-book-tabs")||el.closest("#hero-portrait-button")||
       el.closest("#profile-close")||el.closest("#profile-backdrop"))return;
    const id=el.id;
    if(id==="service-toggle")return play("ui_open");
    if(id==="service-close")return play("ui_close");
    if(id==="portrait-close")return play("ui_close");
    if(id==="send"||id==="send-roll"||el.closest("#choices"))return play("ui_select");
    if(id==="save")return play("ui_click");
    if(id==="export")return play("ui_confirm");
    if(id==="start")return play("ui_open");
    if(id==="clear-log")return play("ui_back");
    if(el.matches("summary"))return play("ui_toggle",{gain:.7});
    if(el.matches(".game-tab")){
      if(el.dataset.tab==="inventory")return play("paper_rustle",{gain:.5});
      if(el.dataset.tab==="map")return play("page_turn_alt",{gain:.5});
      return play("ui_select");
    }
    if(el.closest(".party-person")||el.closest(".character-card"))return play("ui_open",{gain:.65});
    return play("ui_click",{gain:.65});
  },true);
  // Hover audio is only for deliberate high-value controls, not every text link.
  document.addEventListener("pointerover",event=>{
    if(event.pointerType==="touch")return;
    const target=event.target instanceof Element?event.target.closest(
      ".game-tab,#choices button,.service-drawer button"
    ):null;
    if(!target||target.disabled||target.closest("#sound-settings")||
       (event.relatedTarget instanceof Node&&target.contains(event.relatedTarget)))return;
    play("ui_hover",{gain:.55});
  },{passive:true});

  // Paper is not a button. A gentle brush is heard only after the pointer
  // has travelled a meaningful distance over an exposed page, not every pixel.
  let lastPaperX=null,lastPaperY=null,lastPaperAt=0,paperPhase=0;
  document.addEventListener("pointermove",event=>{
    if(event.pointerType!=="mouse"||!enabled||volume<=0)return;
    const target=event.target instanceof Element?event.target.closest(".book-left-page,.profile-book-page,.profile-book-tab,.profile-stat"):null;
    const dossier=document.getElementById("profile-overlay");
    if(!target||!dossier?.classList.contains("is-open")||
      dossier.classList.contains("is-entering")||dossier.classList.contains("is-exiting")){lastPaperX=null;lastPaperY=null;return;}
    if(!target.closest(".profile-body")||target.closest(".profile-page-turn"))return;
    if(lastPaperX===null){lastPaperX=event.clientX;lastPaperY=event.clientY;return;}
    const distance=Math.hypot(event.clientX-lastPaperX,event.clientY-lastPaperY);
    if(distance<68)return;
    lastPaperX=event.clientX;lastPaperY=event.clientY;
    const now=performance.now();
    if(now-lastPaperAt<850)return;
    lastPaperAt=now;
    const soft=target.closest(".profile-book-tab,.profile-stat")?.matches(".profile-book-tab,.profile-stat");
    play("paper_brush",{gain:soft?.24:.29,rate:paperPhase++%2?.87:1.04});
  },{passive:true});

  // Only announce a save acoustically after a server-confirmed success message.
  const status=$("status");
  if(status&&typeof MutationObserver!=="undefined"){
    let oldStatus="",oldError=false;
    new MutationObserver(()=>{
      const message=status.textContent.trim(),error=status.classList.contains("error");
      if(message!==oldStatus&&/^СОХРАНЕНО В RPG6:/i.test(message))play("ui_confirm",{gain:.85});
      else if(error&&!oldError)play("ui_error",{gain:.65});
      oldStatus=message;oldError=error;
    }).observe(status,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class"]});
  }
})();
