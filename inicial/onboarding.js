/* Welcome preferences remain in this browser. No form values or events are sent. */
(function(){
  'use strict';
  const KEY='meli-propuestas-welcome-v1',dialog=document.getElementById('starterWelcome'),reopen=document.getElementById('openWelcome');
  if(!dialog||!reopen||typeof dialog.showModal!=='function')return;
  const pause=document.getElementById('welcomePause'),workspacePause=document.getElementById('workspaceMotionPause');
  let reduced=false,motionPreference=null;
  try{motionPreference=window.matchMedia?.('(prefers-reduced-motion: reduce)');reduced=motionPreference?.matches===true;}catch(_){}
  let paused=false;
  function paintPause(){
    const effectivePaused=paused||reduced;
    dialog.dataset.paused=String(effectivePaused);pause.setAttribute('aria-pressed',String(effectivePaused));
    document.documentElement.dataset.uiMotionPaused=String(effectivePaused);
    pause.disabled=reduced;pause.textContent=reduced?'Movimiento reducido':paused?'Reanudar fondo':'Pausar fondo';
    if(workspacePause){workspacePause.setAttribute('aria-pressed',String(effectivePaused));workspacePause.disabled=reduced;workspacePause.textContent=reduced?'Movimiento reducido':paused?'Reanudar animación':'Pausar animación';}
  }
  function cleanup(){
    document.documentElement.classList.remove('starter-welcome-open');
    document.getElementById('hero-title')?.focus({preventScroll:true});
  }
  function open(){
    if(dialog.open)return;
    try{dialog.showModal();document.documentElement.classList.add('starter-welcome-open');}
    catch(_){document.documentElement.classList.remove('starter-welcome-open');}
  }
  function finish(){
    if(!dialog.open)return;
    try{window.localStorage.setItem(KEY,'seen');}catch(_){}
    dialog.close();
  }
  document.getElementById('welcomeStart').addEventListener('click',finish);
  document.getElementById('welcomeSkip').addEventListener('click',finish);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
  dialog.addEventListener('close',cleanup);
  function togglePause(){if(!reduced){paused=!paused;paintPause();}}
  pause.addEventListener('click',togglePause);
  if(workspacePause){workspacePause.addEventListener('click',togglePause);workspacePause.hidden=false;}
  function preferenceChanged(event){reduced=event.matches===true;paintPause();}
  if(typeof motionPreference?.addEventListener==='function')motionPreference.addEventListener('change',preferenceChanged);
  else if(typeof motionPreference?.addListener==='function')motionPreference.addListener(preferenceChanged);
  reopen.addEventListener('click',open);reopen.disabled=false;paintPause();
  let seen=false;try{seen=window.localStorage.getItem(KEY)==='seen';}catch(_){}
  const forceWelcome=new URLSearchParams(window.location.search).get('inicio')==='1';
  if(forceWelcome||!seen)open();
})();
