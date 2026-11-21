(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const overlay=$("profile-overlay"),panel=$("profile-dossier"),body=panel?.querySelector(".profile-body");
  const bookTabs=[...document.querySelectorAll(".profile-book-tab")];
  const bookPages=[...document.querySelectorAll(".profile-book-page")];
  const sheet=$("profile-page-turn");
  if(!overlay||!panel||!body||!sheet||bookTabs.length!==4||bookPages.length!==4)return;

  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const names=bookTabs.map(button=>button.dataset.profileTab);
  let current="condition",turning=false,flipTimers=[];
  let pointerFrame=null,pointerX=50,pointerY=42;
  function clearFlipTimers(){
    for(const timer of flipTimers)clearTimeout(timer);
    flipTimers=[];
  }
  function applyTab(name,focus=false){
    if(!names.includes(name))return;
    current=name;
    bookTabs.forEach(tab=>{
      const active=tab.dataset.profileTab===name;
      tab.classList.toggle("active",active);
      tab.setAttribute("aria-selected",String(active));
      tab.tabIndex=active?0:-1;
      if(active&&focus)tab.focus({preventScroll:true});
    });
    bookPages.forEach(page=>{
      const active=page.dataset.profilePage===name;
      page.hidden=!active;
      page.classList.toggle("is-active",active);
      if(active)page.scrollTop=0;
    });
  }
  function finishTurn(){
    clearFlipTimers();
    sheet.classList.remove("turning","reverse");
    turning=false;
  }
  function selectPage(name,{focus=false,animate=true}={}){
    if(!names.includes(name))return;
    if(turning)finishTurn();
    if(name===current){if(focus)applyTab(name,true);return;}
    window.RPG6_SFX?.play(name==="condition"?"page_turn_alt":"page_turn",{gain:.7});
    const from=names.indexOf(current),to=names.indexOf(name);
    const play=animate&&!reducedMotion.matches&&overlay.classList.contains("is-open")&&
      !overlay.classList.contains("is-entering")&&!overlay.classList.contains("is-exiting");
    if(!play){applyTab(name,focus);return;}
    turning=true;
    sheet.classList.toggle("reverse",to<from);
    sheet.classList.add("turning");
    // Hide the old leaf exactly as the paper passes through its edge-on position.
    flipTimers.push(setTimeout(()=>{
      applyTab(name,focus);
    },295));
    flipTimers.push(setTimeout(finishTurn,650));
  }
  for(const tab of bookTabs){
    tab.addEventListener("click",()=>selectPage(tab.dataset.profileTab,{focus:true}));
    tab.addEventListener("keydown",event=>{
      const index=names.indexOf(tab.dataset.profileTab);
      let next=null;
      if(event.key==="ArrowRight")next=(index+1)%names.length;
      if(event.key==="ArrowLeft")next=(index+names.length-1)%names.length;
      if(event.key==="Home")next=0;
      if(event.key==="End")next=names.length-1;
      if(next===null)return;
      event.preventDefault();
      selectPage(names[next],{focus:true});
    });
  }
  applyTab(current);

  // A tiny perspective shift gives the paper and the Polaroid independent light.
  // Effects only respond to pointer movement while the journal is fully open.
  function updateParallax(){
    pointerFrame=null;
    const vx=(pointerX-50)/50,vy=(pointerY-50)/50;
    body.style.setProperty("--book-tilt-y",(vx*1.08).toFixed(3)+"deg");
    body.style.setProperty("--book-tilt-x",(-vy*.7).toFixed(3)+"deg");
    body.style.setProperty("--book-light-x",pointerX.toFixed(1)+"%");
    body.style.setProperty("--book-light-y",pointerY.toFixed(1)+"%");
  }
  function resetParallax(){
    if(pointerFrame!==null)cancelAnimationFrame(pointerFrame);
    pointerFrame=null;
    pointerX=50;pointerY=42;
    body.style.setProperty("--book-tilt-x","0deg");
    body.style.setProperty("--book-tilt-y","0deg");
    body.style.setProperty("--book-light-x","50%");
    body.style.setProperty("--book-light-y","42%");
  }
  panel.addEventListener("pointermove",event=>{
    if(reducedMotion.matches||event.pointerType==="touch"||
       !overlay.classList.contains("is-open")||
       overlay.classList.contains("is-entering")||
       overlay.classList.contains("is-exiting"))return;
    const bounds=panel.getBoundingClientRect();
    pointerX=Math.max(0,Math.min(100,(event.clientX-bounds.left)/Math.max(bounds.width,1)*100));
    pointerY=Math.max(0,Math.min(100,(event.clientY-bounds.top)/Math.max(bounds.height,1)*100));
    if(pointerFrame===null)pointerFrame=requestAnimationFrame(updateParallax);
  },{passive:true});
  panel.addEventListener("pointerleave",resetParallax);
  const watcher=new MutationObserver(()=>{
    if(overlay.classList.contains("is-exiting")||!overlay.classList.contains("is-open")){
      finishTurn();
      resetParallax();
    }
  });
  watcher.observe(overlay,{attributes:true,attributeFilter:["class"]});
})();
