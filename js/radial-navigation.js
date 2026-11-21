(() => {
  "use strict";
  // Presentation-only navigation. Existing .game-tab handlers keep all game panes intact.
  const overlay=document.getElementById("radial-nav-overlay");
  const edge=document.getElementById("radial-edge-trigger");
  const scrim=document.getElementById("radial-nav-backdrop");
  const hub=document.getElementById("radial-nav-hub");
  const wheel=overlay?.querySelector(".radial-nav-shell");
  const menuToggle=document.getElementById("service-toggle");
  const tabs=Array.from(overlay?.querySelectorAll(".radial-game-tabs .game-tab")||[]);
  if(!overlay||!edge||!scrim||!hub||!wheel||tabs.length!==4)return;

  let open=false,previousFocus=null,hoverTimer=null;
  const visible=(element)=>element&&element.isConnected&&!element.closest("[hidden],.game-pane[hidden],[aria-hidden='true']");
  const busyOverlay=()=>
    document.querySelector(".profile-overlay.is-open,.service-drawer.open,dialog[open]")!==null;

  function cancelHover(){
    if(hoverTimer!==null){clearTimeout(hoverTimer);hoverTimer=null;}
  }
  function setOpen(next,{restoreFocus=true}={}){
    cancelHover();
    if(next===open)return;
    if(next&&busyOverlay())return;
    open=next;
    wheel.removeAttribute("data-hover");
    if(open){
      previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
      overlay.inert=false;
      overlay.setAttribute("aria-hidden","false");
      overlay.classList.add("is-open");
      edge.setAttribute("aria-expanded","true");
      hub.focus({preventScroll:true});
    }else{
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden","true");
      overlay.inert=true;
      edge.setAttribute("aria-expanded","false");
      if(restoreFocus){
        const target=visible(previousFocus)?previousFocus:menuToggle;
        target?.focus({preventScroll:true});
      }
      previousFocus=null;
    }
  }
  function toggle(){setOpen(!open)}
  function ignoreSpace(target){
    if(!(target instanceof Element))return false;
    // Do not steal typing, range controls, or an open menu item's native Space
    // activation. The hotkey DOES work after clicking ordinary game buttons.
    if(target.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable='false'])," +
      "[role='textbox'],[role='slider'],summary"
    ))return true;
    return open&&Boolean(target.closest("#radial-nav-overlay button"));
  }
  // Hovering the very top reveals the radial overlay, but a tiny dwell
  // avoids surprising accidental opening when crossing the window boundary.
  edge.addEventListener("pointerenter",event=>{
    if(open||busyOverlay()||!(event.pointerType==="mouse"||event.pointerType==="pen"))return;
    cancelHover();
    hoverTimer=setTimeout(()=>{hoverTimer=null;setOpen(true)},140);
  });
  edge.addEventListener("pointerleave",cancelHover);
  edge.addEventListener("click",()=>setOpen(true)); // Also available for touch.
  scrim.addEventListener("click",()=>setOpen(false));
  hub.addEventListener("click",()=>setOpen(false));
  function clearHovered(tab){
    if(wheel.dataset.hover===tab.dataset.tab)wheel.removeAttribute("data-hover");
  }
  // Hit targets are invisible pie slices. Their corresponding full-canvas
  // feathered hover images are OUTSIDE the clipped buttons, so the entire
  // sector changes color without cutting off its soft smoke edges.
  tabs.forEach(tab=>{
    tab.addEventListener("pointerenter",()=>{if(open)wheel.dataset.hover=tab.dataset.tab});
    tab.addEventListener("pointerleave",()=>clearHovered(tab));
    tab.addEventListener("focus",()=>{if(open)wheel.dataset.hover=tab.dataset.tab});
    tab.addEventListener("blur",()=>clearHovered(tab));
    tab.addEventListener("click",()=>setOpen(false));
  });

  const focusable=()=>[...tabs,hub].filter(button=>!button.disabled);
  window.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
      if(open){event.preventDefault();event.stopPropagation();setOpen(false)}
      return;
    }
    if(open&&event.key==="Tab"){
      const items=focusable(),first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){
        event.preventDefault();last.focus();return;
      }
      if(!event.shiftKey&&document.activeElement===last){
        event.preventDefault();first.focus();return;
      }
    }
    if(open&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)){
      event.preventDefault();
      const current=tabs.indexOf(document.activeElement);
      const direction=(event.key==="ArrowLeft"||event.key==="ArrowUp")?-1:1;
      tabs[(current<0?0:current+direction+tabs.length)%tabs.length].focus();
      return;
    }
    if(event.code!=="Space"&&event.key!==" ")return;
    if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
    if(ignoreSpace(event.target))return; // Preserve typing and radial item selection.
    if(!open&&busyOverlay())return;
    event.preventDefault();
    toggle();
  });

  // Opening the service drawer or survivor dossier externally cannot leave
  // an obscuring navigation dialog stranded above another modal.
  document.getElementById("hero-portrait-button")?.addEventListener("pointerdown",()=>{
    if(open)setOpen(false,{restoreFocus:false});
  });
  window.addEventListener("blur",cancelHover);
})();
