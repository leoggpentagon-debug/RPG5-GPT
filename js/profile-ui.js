(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const portrait=$("hero-portrait-button");
  const photoFrame=document.querySelector(".polaroid-player");
  const overlay=$("profile-overlay");
  const panel=$("profile-dossier");
  const closeButton=$("profile-close");
  if(!portrait||!photoFrame||!overlay||!panel||!closeButton)return;
  const statNames={health:"Здоровье",stamina:"Выносливость",stress:"Стресс",hunger:"Голод",thirst:"Жажда"};
  const statGlyphs={health:"♥",stamina:"⚡",stress:"◉",hunger:"◴",thirst:"💧"};
  const statMaximum={health:3,stamina:3,stress:5,hunger:4,thirst:4};
  const keys=Object.keys(statNames);
  const getObj=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const getArray=value=>Array.isArray(value)?value:[];
  const pickText=(...args)=>args.find(x=>typeof x==="string"&&x.trim())?.trim()||"";
  let latestHero={},latestScene={},latestObservable={},wasOpen=false,previousFocus=null;

  // Use the stat values exactly as returned by RPG6. Descriptive text is
  // server-sourced when available; neutral numeric language otherwise.
  function describeStat(key,value){
    const v=getObj(value),current=Number(v.current),maximum=Number(v.max);
    const explicit=pickText(v.status_text,v.status_description,v.condition_text,v.description,v.condition,v.status);
    if(explicit)return explicit;
    if(!Number.isFinite(current)||!Number.isFinite(maximum)||maximum<=0)return "Нет подтверждённых данных о состоянии.";
    const ratio=Math.max(0,Math.min(1,current/maximum));
    const level=ratio<=1/3?"низкий":ratio<2/3?"средний":"высокий";
    return "Показатель "+level+". Точное описание состояния уточняется правилами RPG6.";
  }
  function statValue(value){
    const v=getObj(value);
    return (v.current??"—")+"/"+(v.max??"—");
  }
  function chooseStat(button){
    if(!button)return;
    for(const el of $("profile-stats").querySelectorAll(".profile-stat"))el.classList.toggle("selected",el===button);
    $("profile-condition-detail").textContent=button.dataset.label||"Нет сведений";
    $("profile-condition-value").textContent=button.dataset.value||"—";
    const description=$("profile-status-description");if(description)description.textContent=button.dataset.status||"Подробности не указаны.";
  }
  function drawStats(stats){
    const target=$("profile-stats");target.replaceChildren();
    const sources=getObj(stats);
    keys.forEach((key,index)=>{
      const value=getObj(sources[key]),number=Number(value.current),max=Number(value.max);
      const block=document.createElement("button");block.type="button";
      block.className="profile-stat profile-stat-"+key;
      const valid=Number.isInteger(number)&&Number.isFinite(max)&&max>0&&number>=0&&number<=statMaximum[key];
      const icon=document.createElement(valid?"img":"span");
      icon.className="profile-stat-icon";
      if(valid){icon.src="assets/status/"+key+"/"+key+"_"+number+".webp";icon.alt="";icon.addEventListener("error",()=>{
        const fallback=document.createElement("span");fallback.className="profile-stat-icon profile-stat-fallback";
        fallback.textContent=statGlyphs[key];icon.replaceWith(fallback);
      },{once:true});} else icon.textContent=statGlyphs[key];
      const fraction=document.createElement("strong");fraction.textContent=statValue(value);
      const label=statNames[key],status=describeStat(key,value);
      block.dataset.label=label;block.dataset.value=statValue(value);block.dataset.status=status;
      block.setAttribute("aria-label",label+": "+statValue(value)+". "+status);
      block.append(icon,fraction);
      const angle=(-90+index*72)*Math.PI/180;
      block.style.setProperty("--ring-x",(50+35*Math.cos(angle)).toFixed(2)+"%");
      block.style.setProperty("--ring-y",(50+35*Math.sin(angle)).toFixed(2)+"%");
      const selectAndPlay=()=>{chooseStat(block);window.RPG6_SFX?.playStat(key);};
      block.addEventListener("mouseenter",selectAndPlay);
      block.addEventListener("focus",selectAndPlay);
      block.addEventListener("click",()=>chooseStat(block));
      target.append(block);
    });
    chooseStat(target.querySelector(".profile-stat"));
  }

  // Do not expose database IDs or invent missing skills/conditions.
  function entriesFrom(...sources){
    const result=[],seen=new Set();
    for(const source of sources){
      const items=Array.isArray(source)?source:
        (source&&typeof source==="object"?Object.entries(source).map(([key,val])=>{
          if(val&&typeof val==="object")return {name:val.name||val.label||val.title||val.display_name,value:val.level??val.value??val.rank,description:val.description||val.status_text};
          // A database key is not automatically a human-readable display name.
          return {name:/[А-Яа-яЁё ]/.test(key)?key:"",value:val};
        }):[]);
      for(const item of items){
        if(result.length>=14)break;
        let name="",detail="";
        if(typeof item==="string")name=item;
        else if(item&&typeof item==="object"){
          name=pickText(item.display_name,item.name,item.title,item.label,item.text,item.status_text);
          const value=item.level??item.rank??item.value;
          detail=pickText(item.description,item.details,item.effect_text,
            value!==undefined&&value!==null?"Уровень: "+String(value):"");
        }
        if(!name)continue;
        const signature=name.toLowerCase();
        if(seen.has(signature))continue;
        seen.add(signature);result.push({name,detail});
      }
    }
    return result;
  }
  function renderItems(id,items,empty){
    const dest=$(id);dest.replaceChildren();
    if(!items.length){const note=document.createElement("p");note.className="profile-unavailable";note.textContent=empty;dest.append(note);return;}
    for(const entry of items){
      const row=document.createElement("div");row.className="profile-data-row";
      const title=document.createElement("strong");title.textContent=entry.name;row.append(title);
      if(entry.detail){const sub=document.createElement("small");sub.textContent=entry.detail;row.append(sub)}
      dest.append(row);
    }
  }
  function updateProfile(payload){
    const data=getObj(payload);latestHero=getObj(data.hero);latestScene=getObj(data.scene);latestObservable=getObj(data.observable);
    const hero=latestHero,observable=latestObservable;
    const name=$("hero-name").textContent.trim()||"Оливер Хейз";
    $("profile-name").textContent=name;
    $("profile-photo").src=$("hero-portrait").currentSrc||$("hero-portrait").src;
    $("profile-photo").alt=name;
    drawStats(hero.stats);
    renderItems("profile-effects",entriesFrom(hero.conditions,hero.statuses,hero.status_effects,hero.effects,
      observable.conditions,observable.statuses,observable.effects),
      "Состояния и эффекты не описаны в доступных данных.");
    renderItems("profile-skills",entriesFrom(hero.skills,observable.skills),
      "Подтверждённых сведений о навыках пока нет.");
  }
  window.addEventListener("rpg6:render",event=>updateProfile(event.detail));
  drawStats(null);

  // Cinematic dossier timeline. Uses the original photograph as the source of a
  // flying, temporary visual clone (FLIP), then unfolds the real HTML panel.
  // All animated clones are inert and stripped of IDs.
  const dossierPhoto=panel.querySelector(".profile-polaroid");
  const prefersReducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const canAnimate=typeof panel.animate==="function";
  let phase="closed",sequence=0,animations=[],flyingPhoto=null,finishTimer=null,soundTimers=[];
  function stopMotion(){
    if(finishTimer!==null){clearTimeout(finishTimer);finishTimer=null;}
    for(const timer of soundTimers)clearTimeout(timer);
    soundTimers=[];
    for(const animation of animations){try{animation.cancel()}catch(error){}}
    animations=[];
    if(flyingPhoto){flyingPhoto.remove();flyingPhoto=null;}
  }
  function cue(name,delay=0,gain=1){
    const trigger=()=>window.RPG6_SFX?.play(name,{gain});
    if(delay<=0){trigger();return;}
    soundTimers.push(setTimeout(trigger,delay));
  }
  function animatePart(node,frames,options){
    if(!canAnimate||!node)return null;
    try{
      const effect=node.animate(frames,{...options,fill:"both"});
      animations.push(effect);
      return effect;
    }catch(error){console.warn("Profile animation fallback:",error);return null;}
  }
  function geometry(element){
    const box=element.getBoundingClientRect();
    return {x:box.left,y:box.top,width:box.width,height:box.height,
      centerX:box.left+box.width/2,centerY:box.top+box.height/2};
  }
  function createFlightClone(source,rect){
    const clone=source.cloneNode(true);
    clone.classList.remove("hold-progress","dossier-source-hidden","dossier-source-lift");
    clone.classList.add("profile-flight-ghost");
    if(clone.id)clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(child=>child.removeAttribute("id"));
    clone.setAttribute("aria-hidden","true");
    clone.setAttribute("inert","");
    clone.style.position="fixed";
    clone.style.left=rect.x+"px";clone.style.top=rect.y+"px";
    clone.style.width=rect.width+"px";clone.style.height=rect.height+"px";
    clone.style.transform="none";
    clone.style.margin="0";
    document.body.append(clone);
    flyingPhoto=clone;
    return clone;
  }
  function flightFrames(from,to,closing=false){
    const dx=to.x-from.x,dy=to.y-from.y;
    const scaleX=to.width/Math.max(1,from.width);
    const scaleY=to.height/Math.max(1,from.height);
    const final="translate("+dx+"px,"+dy+"px) scale("+scaleX+","+scaleY+") rotate(-1deg)";
    if(closing)return [
      {offset:0,opacity:1,transform:"translate(0px,0px) scale(1) rotate(-2deg)",filter:"drop-shadow(2px 8px 10px #000a)"},
      {offset:.45,opacity:1,transform:"translate("+(dx*.47)+"px,"+(dy*.43-12)+"px) scale("+((1+scaleX)/2)+","+((1+scaleY)/2)+") rotate(3deg)",filter:"drop-shadow(6px 19px 14px #000c)"},
      {offset:1,opacity:1,transform:final,filter:"drop-shadow(2px 5px 5px #0008)"}
    ];
    return [
      {offset:0,opacity:1,transform:"translate(0px,0px) scale(1) rotate(-2deg)",filter:"drop-shadow(2px 7px 9px #000b)"},
      {offset:.42,opacity:1,transform:"translate("+(dx*.48)+"px,"+(dy*.4-22)+"px) scale("+((1+scaleX)/2)+","+((1+scaleY)/2)+") rotate(4deg)",filter:"drop-shadow(7px 22px 17px #000d)"},
      {offset:.81,opacity:1,transform:"translate("+(dx*.91)+"px,"+(dy*.88)+"px) scale("+(scaleX*1.055)+","+(scaleY*1.055)+") rotate(-3deg)",filter:"drop-shadow(4px 12px 12px #000b)"},
      {offset:1,opacity:1,transform:final,filter:"drop-shadow(2px 7px 8px #000a)"}
    ];
  }
  function animateIcons(outward,photoCenter){
    panel.querySelectorAll(".profile-stat").forEach((icon,index)=>{
      const box=geometry(icon);
      const dx=photoCenter.centerX-box.centerX,dy=photoCenter.centerY-box.centerY;
      const start="translate("+dx+"px,"+dy+"px) scale(.20) rotate(-25deg)";
      const middle="translate("+(dx*.12-10)+"px,"+(dy*.16-7)+"px) scale(1.12) rotate(7deg)";
      const finish="translate(0px,0px) scale(1) rotate(0deg)";
      const frames=outward?[
        {offset:0,opacity:0,transform:start,filter:"brightness(1.55)"},
        {offset:.73,opacity:1,transform:middle,filter:"brightness(1.2)"},
        {offset:1,opacity:1,transform:finish,filter:"brightness(1)"}
      ]:[
        {offset:0,opacity:1,transform:finish,filter:"brightness(1)"},
        {offset:.42,opacity:1,transform:middle,filter:"brightness(1.3)"},
        {offset:1,opacity:0,transform:start,filter:"brightness(1.65)"}
      ];
      animatePart(icon,frames,{
        delay:outward?650+index*105:index*52,
        duration:outward?620:440,
        easing:"cubic-bezier(.18,.72,.24,1)"
      });
    });
  }
  function animateSections(opening){
    const elements=[
      panel.querySelector(".profile-topbar"),
      panel.querySelector(".book-left-note"),
      panel.querySelector(".profile-book-tabs"),
      panel.querySelector(".profile-page-heading"),
      panel.querySelector(".profile-status-description"),
      panel.querySelector(".profile-book-footer")
    ];
    elements.forEach((node,index)=>{
      if(!node)return;
      const frames=opening?[
        {opacity:0,transform:"translateY(20px) scale(.98)",filter:"blur(4px)"},
        {opacity:1,transform:"translateY(0px) scale(1)",filter:"blur(0px)"}
      ]:[
        {opacity:1,transform:"translateY(0px)",filter:"blur(0px)"},
        {opacity:0,transform:"translateY(12px)",filter:"blur(3px)"}
      ];
      animatePart(node,frames,{
        delay:opening?510+index*125:index*52,
        duration:opening?460:270,
        easing:"cubic-bezier(.16,.8,.22,1)"
      });
    });
  }
  function setProfileValues(){
    $("profile-name").textContent=$("hero-name").textContent||"Оливер Хейз";
    $("profile-photo").src=$("hero-portrait").currentSrc||$("hero-portrait").src;
  }
  function finishOpening(serial){
    if(serial!==sequence||phase!=="opening")return;
    stopMotion();
    dossierPhoto.style.opacity="";
    overlay.classList.remove("is-entering");
    photoFrame.classList.remove("dossier-source-lift");
    phase="open";
    closeButton.focus({preventScroll:true});
  }
  function finishClosing(serial){
    if(serial!==sequence||phase!=="closing")return;
    // Freeze the panel invisible before removing WAAPI fill, avoiding a one-frame flash.
    panel.style.opacity="0";
    stopMotion();
    dossierPhoto.style.opacity="";
    photoFrame.classList.remove("dossier-source-hidden","dossier-source-lift");
    overlay.classList.remove("is-entering","is-exiting","is-open");
    overlay.setAttribute("aria-hidden","true");
    document.body.classList.remove("dossier-visible","dossier-cinematic");
    phase="closed";wasOpen=false;
    if(previousFocus&&typeof previousFocus.focus==="function")previousFocus.focus({preventScroll:true});
    else portrait.focus({preventScroll:true});
  }
  function openProfile(){
    if(wasOpen||phase!=="closed")return;
    wasOpen=true;phase="opening";
    const serial=++sequence;
    previousFocus=document.activeElement;
    panel.style.opacity="";
    setProfileValues();
    stopMotion();
    const sourceBounds=geometry(photoFrame);
    document.body.classList.add("dossier-visible","dossier-cinematic");
    overlay.setAttribute("aria-hidden","false");
    overlay.classList.remove("is-exiting");
    overlay.classList.add("is-open","is-entering");
    // Keep Escape and keyboard focus available throughout the cinematic transition.
    closeButton.focus({preventScroll:true});
    // The real panel is now in its final geometry, initially concealed by animation.
    void panel.offsetWidth;
    const destinationBounds=geometry(dossierPhoto);
    if(prefersReducedMotion.matches||!canAnimate){
      photoFrame.classList.add("dossier-source-hidden");
      overlay.classList.remove("is-entering");
      phase="open";
      closeButton.focus({preventScroll:true});
      cue("book_open",0,.8);
      return;
    }
    cue("paper_rustle",0,.55);
    cue("book_open",210,.75);
    const ghost=createFlightClone(photoFrame,sourceBounds);
    photoFrame.classList.add("dossier-source-hidden","dossier-source-lift");
    dossierPhoto.style.opacity="0";
    animatePart(ghost,flightFrames(sourceBounds,destinationBounds),{
      delay:50,duration:795,easing:"cubic-bezier(.16,.72,.18,1)"
    });
    animatePart(panel,[
      {offset:0,opacity:.62,clipPath:"inset(0 97% 0 0 round 5px)",transform:"translateX(-20px) scale(.965) rotate(-1.2deg)"},
      {offset:.31,opacity:1,clipPath:"inset(0 64% 0 0 round 5px)",transform:"translateX(-10px) scale(.98) rotate(-.7deg)"},
      {offset:.79,opacity:1,clipPath:"inset(0 0 0 0 round 5px)",transform:"translateX(3px) scale(1.012) rotate(.3deg)"},
      {offset:1,opacity:1,clipPath:"inset(0 0 0 0 round 4px)",transform:"translate(0px,0px) scale(1) rotate(0deg)"}
    ],{delay:250,duration:665,easing:"cubic-bezier(.2,.8,.22,1)"});
    animatePart(dossierPhoto,[{opacity:0},{opacity:1}],{delay:785,duration:185,easing:"ease-out"});
    animateIcons(true,destinationBounds);
    animateSections(true);
    // Opening reaches its final resting state after the last radial icon.
    finishTimer=setTimeout(()=>finishOpening(serial),1780);
  }
  function closeProfile(){
    window.RPG6_SFX?.stopStat();
    if(!wasOpen||phase==="closed"||phase==="closing")return;
    if(phase==="opening"){
      // Allow Escape even during the reveal; settle at the correct geometry.
      stopMotion();dossierPhoto.style.opacity="";overlay.classList.remove("is-entering");phase="open";
    }
    phase="closing";
    const serial=++sequence;
    stopMotion();
    overlay.classList.add("is-exiting");
    overlay.classList.remove("is-entering");
    if(prefersReducedMotion.matches||!canAnimate){
      cue("book_close",0,.75);
      finishClosing(serial);
      return;
    }
    cue("book_close",160,.82);
    cue("paper_rustle",425,.28);
    const startingBounds=geometry(dossierPhoto),endBounds=geometry(photoFrame);
    const ghost=createFlightClone(dossierPhoto,startingBounds);
    dossierPhoto.style.opacity="0";
    animateSections(false);
    animateIcons(false,startingBounds);
    animatePart(panel,[
      {offset:0,opacity:1,clipPath:"inset(0 0 0 0 round 4px)",transform:"translateX(0px) scale(1)"},
      {offset:.4,opacity:1,clipPath:"inset(0 40% 0 0 round 4px)",transform:"translateX(-8px) scale(.99) rotate(-.5deg)"},
      {offset:1,opacity:.42,clipPath:"inset(0 97% 0 0 round 4px)",transform:"translateX(-15px) scale(.965) rotate(-1deg)"}
    ],{delay:170,duration:530,easing:"cubic-bezier(.42,0,.85,.25)"});
    animatePart(ghost,flightFrames(startingBounds,endBounds,true),{
      delay:200,duration:680,easing:"cubic-bezier(.2,.7,.35,1)"
    });
    finishTimer=setTimeout(()=>finishClosing(serial),950);
  }
  closeButton.addEventListener("click",closeProfile);
  $("profile-backdrop").addEventListener("click",closeProfile);
  overlay.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();closeProfile();return;}
    if(event.key!=="Tab")return;
    const focusable=[closeButton,...panel.querySelectorAll('button:not([disabled]),[tabindex="0"]')]
      .filter(element=>!element.closest("[hidden]")&&element.getClientRects().length>0);
    if(focusable.length<2)return;
    if(event.shiftKey&&document.activeElement===focusable[0]){event.preventDefault();focusable[focusable.length-1].focus()}
    else if(!event.shiftKey&&document.activeElement===focusable[focusable.length-1]){event.preventDefault();focusable[0].focus()}
  });

  const holdDuration=500,moveTolerance=15;
  let holdTimer=null,originX=0,originY=0;
  function cancelHold(){
    if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null;}
    photoFrame.classList.remove("hold-progress");
  }
  portrait.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"&&event.button!==0)return;
    if(wasOpen)return;
    originX=event.clientX;originY=event.clientY;
    cancelHold();
    photoFrame.classList.add("hold-progress");
    holdTimer=setTimeout(()=>{holdTimer=null;photoFrame.classList.remove("hold-progress");openProfile()},holdDuration);
  });
  portrait.addEventListener("pointermove",event=>{
    if(Math.abs(event.clientX-originX)>moveTolerance||Math.abs(event.clientY-originY)>moveTolerance)cancelHold();
  });
  portrait.addEventListener("pointerup",cancelHold);
  portrait.addEventListener("pointerleave",cancelHold);
  portrait.addEventListener("pointercancel",cancelHold);
  portrait.addEventListener("contextmenu",event=>event.preventDefault());
  portrait.addEventListener("click",event=>event.preventDefault());
  portrait.addEventListener("keydown",event=>{
    if(event.key!==" "&&event.key!=="Enter")return;
    if(event.repeat)return;
    event.preventDefault();
    cancelHold();photoFrame.classList.add("hold-progress");
    holdTimer=setTimeout(()=>{holdTimer=null;photoFrame.classList.remove("hold-progress");openProfile()},holdDuration);
  });
  portrait.addEventListener("keyup",event=>{
    if(event.key===" "||event.key==="Enter"){event.preventDefault();cancelHold()}
  });
})();