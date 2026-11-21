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
    $("profile-condition-detail").textContent=button.dataset.status||button.dataset.label||"Нет сведений";
    $("profile-condition-value").textContent=button.dataset.label+" · "+button.dataset.value;
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
      const tooltip=document.createElement("span");tooltip.className="profile-stat-tooltip";
      const label=statNames[key],status=describeStat(key,value);
      tooltip.textContent=label+" — "+status;
      block.dataset.label=label;block.dataset.value=statValue(value);block.dataset.status=status;
      block.setAttribute("aria-label",label+": "+statValue(value)+". "+status);
      block.append(icon,fraction,tooltip);
      const angle=(-90+index*72)*Math.PI/180;
      block.style.setProperty("--ring-x",(50+35*Math.cos(angle)).toFixed(2)+"%");
      block.style.setProperty("--ring-y",(50+35*Math.sin(angle)).toFixed(2)+"%");
      block.addEventListener("mouseenter",()=>chooseStat(block));
      block.addEventListener("focus",()=>chooseStat(block));
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

  function openProfile(){
    if(wasOpen)return;
    wasOpen=true;
    previousFocus=document.activeElement;
    $("profile-name").textContent=$("hero-name").textContent||"Оливер Хейз";
    $("profile-photo").src=$("hero-portrait").currentSrc||$("hero-portrait").src;
    const from=photoFrame.getBoundingClientRect(),to=panel.getBoundingClientRect();
    const x=(from.left+from.width/2)-(to.left+to.width/2);
    const y=(from.top+from.height/2)-(to.top+to.height/2);
    const scale=Math.max(.14,Math.min(.44,from.width/Math.max(1,to.width)));
    panel.style.setProperty("--profile-from-x",x+"px");
    panel.style.setProperty("--profile-from-y",y+"px");
    panel.style.setProperty("--profile-from-scale",String(scale));
    overlay.setAttribute("aria-hidden","false");
    document.body.classList.add("dossier-visible");
    // Style is committed before activation to animate from the source Polaroid.
    void panel.offsetWidth;
    requestAnimationFrame(()=>{
      overlay.classList.add("is-open");
      closeButton.focus({preventScroll:true});
    });
  }
  function closeProfile(){
    if(!wasOpen)return;
    wasOpen=false;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden","true");
    document.body.classList.remove("dossier-visible");
    if(previousFocus&&typeof previousFocus.focus==="function")previousFocus.focus({preventScroll:true});
    else portrait.focus({preventScroll:true});
  }
  closeButton.addEventListener("click",closeProfile);
  $("profile-backdrop").addEventListener("click",closeProfile);
  overlay.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();closeProfile();return;}
    if(event.key!=="Tab")return;
    const focusable=[closeButton,...panel.querySelectorAll('button:not([disabled]),[tabindex="0"]')];
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