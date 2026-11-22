(() => {
  "use strict";
  // Kenney CC0 UI effects and user-approved stress MP3s; see assets/audio/SOURCES.md.
  // Optional client-only audio. No contact with Gemini or the RPG6 save API.
  const ROOT="assets/audio/";
  const sources=Object.freeze({
    book_open:"book_open.ogg",book_close:"book_close.ogg",
    page_turn:"page_turn.ogg",page_turn_alt:"page_turn_alt.ogg",
    paper_stamp:"paper_stamp.ogg",paper_rustle:"paper_rustle.ogg",
    leather_creak:"leather_creak.ogg",
    ui_click:"ui_click.ogg",ui_hover:"ui_hover.ogg",
    ui_confirm:"ui_confirm.ogg",ui_back:"ui_back.ogg",
    ui_error:"ui_error.ogg",ui_toggle:"ui_toggle.ogg",
    stat_health:"stat_health.ogg",stat_stamina:"stat_stamina.ogg",
    stat_hunger:"stat_hunger.ogg",stat_thirst:"stat_thirst.ogg",
    stress_calm:"stress/woodland_birdies_stress_0-1_8s_fade.mp3",
    stress_2:"stress/universfield-old-wooden-door-402153.mp3",
    stress_3:"stress/dragon-studio-scary-bells-359875.mp3",
    stress_4:"stress/freeeverythingxx-open-the-door-horror-268582.mp3",
    stress_5_demonic:"stress/freesound_community-demonic-whisper-100425.mp3",
    stress_5_behind:"stress/freesound_community-075283_quotbehind-youquot-whisper-86744.mp3",
    stress_5_ghost:"stress/dragon-studio-ghost-whisper-351569.mp3",
    stress_5_voices:"stress/freesound_community-four_voices_whispering-6943.mp3",
    stress_5_spell:"stress/yodguard-dark-spell-chant-3-533018.mp3",
    stress_5_moan:"stress/freesound_community-creepy-moan-87456.mp3"
  });
  const baseGain={
    book_open:.75,book_close:.75,page_turn:.85,page_turn_alt:.7,
    paper_stamp:.52,paper_rustle:.52,leather_creak:.4,
    ui_click:.5,ui_hover:.19,ui_confirm:.48,
    ui_back:.4,ui_error:.37,ui_toggle:.45,
    stat_health:.86,stat_stamina:.72,stat_hunger:.6,stat_thirst:.95,
    stress_calm:1,stress_2:1,stress_3:1,stress_4:1,
    stress_5_demonic:1,stress_5_behind:1,stress_5_ghost:1,
    stress_5_voices:1,stress_5_spell:1,stress_5_moan:1
  };
  // At 0/5 and 1/5 use exactly the same approved eight-second woodland clip.
  const STRESS_BY_LEVEL=Object.freeze(["stress_calm","stress_calm","stress_2","stress_3","stress_4"]);
  // Six equally likely candidates; pick ONE at playback time, never a mix.
  const STRESS_AT_FIVE=Object.freeze([
    "stress_5_demonic","stress_5_behind","stress_5_ghost",
    "stress_5_voices","stress_5_spell","stress_5_moan"
  ]);
  function stressSound(level) {
    if(!Number.isInteger(level)||level<0||level>5)return null;
    if(level===5)return STRESS_AT_FIVE[Math.floor(Math.random()*STRESS_AT_FIVE.length)];
    return STRESS_BY_LEVEL[level];
  }
  const STORE_ENABLED="rpg5.audio.enabled.v1",STORE_VOLUME="rpg5.audio.volume.v1";
  let enabled=true,volume=.55;
  const active=new Set();
  const lastPlayed=new Map();
  let activeStat=null,lastStatTime=-10000,lastStatKey="";
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
    active.clear();activeStat=null;
  }
  function play(name,options={}){
    // Reject the unwanted selection, drawer-open and drawer-close tones globally.
    if(name==="ui_select"||name==="ui_open"||name==="ui_close")return;
    if(!enabled||volume<=0||!Object.hasOwn(sources,name)||typeof Audio==="undefined")return;
    const now=performance.now(),isStat=name.startsWith("stat_")||name.startsWith("stress_"),minimum=name==="ui_hover"?165:45;
    if(isStat&&(now-lastStatTime<300||(name===lastStatKey&&now-lastStatTime<1000)))return;
    if(now-(lastPlayed.get(name)||-10000)<minimum)return;
    lastPlayed.set(name,now);
    if(isStat){lastStatTime=now;lastStatKey=name;}
    const gain=Number.isFinite(Number(options.gain))?Math.max(0,Math.min(1,Number(options.gain))):1;
    if(active.size>=8){const first=active.values().next().value;if(first){try{first.pause()}catch(error){}active.delete(first)}}
    try{
      if(isStat&&activeStat){
        try{activeStat.pause();activeStat.currentTime=0;}catch(error){}
        active.delete(activeStat);activeStat=null;
      }
      const sound=new Audio(ROOT+sources[name]);
      sound.preload="auto";
      sound.volume=Math.max(0,Math.min(1,volume*(baseGain[name]??.5)*gain));
      const cleanup=()=>{active.delete(sound);if(activeStat===sound)activeStat=null;};
      sound.addEventListener("ended",cleanup,{once:true});
      sound.addEventListener("error",()=>{
        cleanup();
        console.warn("RPG5 audio asset cannot be loaded:",sound.src);
      },{once:true});
      active.add(sound);
      if(isStat)activeStat=sound;
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
  function stopStat(){
    if(!activeStat)return;
    try{activeStat.pause();activeStat.currentTime=0}catch(error){}
    active.delete(activeStat);activeStat=null;
  }
  // Preload the four unchanged stat clips plus ONLY the relevant stress tier.
  // At 5/5 all six files may be downloaded, but only ONE is ever played.
  const statPreloads=new Map();
  function preloadOne(name) {
    if(typeof Audio==="undefined"||!Object.hasOwn(sources,name)||statPreloads.has(name))return;
    const sound=new Audio(ROOT+sources[name]);
    sound.preload="auto";
    statPreloads.set(name,sound);
    sound.load();
  }
  function preloadStats(stressLevel) {
    for(const key of ["health","stamina","hunger","thirst"])preloadOne("stat_"+key);
    if(!Number.isInteger(stressLevel)||stressLevel<0||stressLevel>5)return;
    const cues=stressLevel===5?STRESS_AT_FIVE:[STRESS_BY_LEVEL[stressLevel]];
    for(const name of cues)preloadOne(name);
  }
  function playStat(key,level) {
    if(key==="stress") {
      const name=stressSound(level);
      return name?play(name):null;
    }
    return play("stat_"+key);
  }
  window.RPG6_SFX=Object.freeze({
    play,playStat,preloadStats,stopStat,setEnabled,setVolume,
    get enabled(){return enabled},get volume(){return volume}
  });

  const toggle=$("sfx-toggle"),slider=$("sfx-volume"),preview=$("sfx-preview");
  toggle?.addEventListener("click",()=>setEnabled(!enabled));
  slider?.addEventListener("input",event=>setVolume(event.target.value));
  // Slider feedback stays visual; no menu-selection tone.
  preview?.addEventListener("click",()=>play("book_open",{gain:.8}));
  render();

  // Clicking an action confirms the *input*, not a successful game turn/save.
  document.addEventListener("click",event=>{
    const el=event.target instanceof Element?event.target.closest("button,summary"):null;
    if(!el||el.disabled||el.closest("#sound-settings"))return;
    if(el.closest(".profile-book-tabs")||el.closest(".profile-stat")||el.closest("#hero-portrait-button")||
       el.closest("#profile-close")||el.closest("#profile-backdrop"))return;
    const id=el.id;
    if(id==="service-toggle")return; // Drawer opening is silent.
    if(id==="service-close")return; // Drawer closing is silent.
    if(id==="portrait-close")return; // Same unwanted closing cue disabled.
    if(id==="send"||el.closest("#choices"))return play("ui_click",{gain:.9});
    if(id==="send-roll")return;
    if(id==="save")return play("ui_click");
    if(id==="export")return play("ui_confirm");
    if(id==="start")return;
    if(id==="clear-log")return play("ui_back");
    if(el.matches("summary"))return play("ui_toggle",{gain:.7});
    if(el.matches(".game-tab")){
      if(el.dataset.tab==="inventory")return play("paper_rustle",{gain:.5});
      if(el.dataset.tab==="map")return play("page_turn_alt",{gain:.5});
      return; // Other top-level tabs, including Отряд, are silent.
    }
    if(el.closest(".party-person")||el.closest(".character-card"))return;
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
