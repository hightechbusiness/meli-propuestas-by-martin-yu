/* Welcome preferences remain in this browser. No form values or events are sent. */
(function(){
  'use strict';
  const KEY='meli-propuestas-welcome-v1',dialog=document.getElementById('starterWelcome'),reopen=document.getElementById('openWelcome');
  if(!dialog||!reopen||typeof dialog.showModal!=='function')return;
  const pause=document.getElementById('welcomePause');
  let reduced=false;
  try{reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;}catch(_){}
  let paused=reduced;
  function paintPause(){
    dialog.dataset.paused=String(paused);pause.setAttribute('aria-pressed',String(paused));
    pause.disabled=reduced;pause.textContent=reduced?'Movimiento reducido':paused?'Reanudar fondo':'Pausar fondo';
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
  pause.addEventListener('click',()=>{if(!reduced){paused=!paused;paintPause();}});
  reopen.addEventListener('click',open);reopen.disabled=false;paintPause();
  let seen=false;try{seen=window.localStorage.getItem(KEY)==='seen';}catch(_){}
  const forceWelcome=new URLSearchParams(window.location.search).get('inicio')==='1';
  if(forceWelcome||!seen)open();
})();
