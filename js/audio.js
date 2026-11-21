(() => {
  "use strict";
  // CC0 Kenney OGG effects; provenance in assets/audio/SOURCES.md.
  // Optional client-only audio. No contact with Gemini or the RPG6 save API.
  const ROOT="assets/audio/";
  const sources=Object.freeze({
    book_open:"book_open.ogg",book_close:"book_close.ogg",
    page_turn:"page_turn.ogg",page_turn_alt:"page_turn_alt.ogg",
    paper_stamp:"paper_stamp.ogg",paper_rustle:"paper_rustle.ogg",
    leather_creak:"leather_creak.ogg",
    ui_click:"ui_click.ogg",ui_select:"ui_select.ogg",ui_hover:"ui_hover.ogg",
    ui_confirm:"ui_confirm.ogg",ui_back:"ui_back.ogg",
    ui_open:"ui_open.ogg",ui_close:"ui_close.ogg",
    ui_error:"ui_error.ogg",ui_toggle:"ui_toggle.ogg",
    // Thematic, CC0, permanent hotlinks from SFXMint; Kenney spark is hosted locally.
    stat_health:"https://sfxmint.com/dl/horror-heartbeat-52.mp3",
    stat_stamina:"stat_electric.ogg",
    stat_stress:"https://sfxmint.com/dl/whisper-09.mp3",
    stat_hunger:"https://sfxmint.com/dl/cutlery-01.mp3",
    stat_thirst:"https://sfxmint.com/dl/water-drip-75.mp3"
  });
  const baseGain={
    book_open:.75,book_close:.75,page_turn:.85,page_turn_alt:.7,
    paper_stamp:.52,paper_rustle:.52,leather_creak:.4,
    ui_click:.5,ui_select:.48,ui_hover:.19,ui_confirm:.48,
    ui_back:.4,ui_open:.38,ui_close:.38,ui_error:.37,ui_toggle:.45,
    stat_health:1,stat_stamina:.70,stat_stress:.95,stat_hunger:.88,stat_thirst:1
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
    const now=performance.now(),minimum=name==="ui_hover"?165:45;
    if(now-(lastPlayed.get(name)||-10000)<minimum)return;
    lastPlayed.set(name,now);
    const gain=Number.isFinite(Number(options.gain))?Math.max(0,Math.min(1,Number(options.gain))):1;
    if(active.size>=8){const first=active.values().next().value;if(first){try{first.pause()}catch(error){}active.delete(first)}}
    try{
      const url=sources[name];
      const sound=new Audio(/^https:\/\//.test(url)?url:ROOT+url);
      sound.preload="auto";
      sound.volume=Math.max(0,Math.min(1,volume*(baseGain[name]??.5)*gain));
      const cleanup=()=>active.delete(sound);
      sound.addEventListener("ended",cleanup,{once:true});
      sound.addEventListener("error",cleanup,{once:true});
      active.add(sound);
      // The clip's audible playback, not its network loading, determines duration.
      const limit=Number(options.maxMs);
      if(Number.isFinite(limit)&&limit>100){
        sound.addEventListener("playing",()=>{
          const fadeLength=Math.min(220,limit*.3),fadeSteps=4;
          const startingVolume=sound.volume;
          for(let n=1;n<=fadeSteps;n++)setTimeout(()=>{
            if(active.has(sound))sound.volume=startingVolume*(1-n/fadeSteps);
          },Math.max(0,limit-fadeLength)+n*fadeLength/fadeSteps);
          setTimeout(()=>{if(active.has(sound)){sound.pause();cleanup()}},limit+30);
        },{once:true});
      }
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
  preview?.addEventListener("click",()=>play("book_open",{gain:.8}));
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
      ".game-tab,.profile-book-tab,#choices button,.service-drawer button"
    ):null;
    if(!target||target.disabled||target.closest("#sound-settings")||
       (event.relatedTarget instanceof Node&&target.contains(event.relatedTarget)))return;
    play("ui_hover",{gain:.55});
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
