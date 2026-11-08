(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const cinema=$('cinema'),stage=$('stage'),canvas=$('scene-canvas');
  const copies=[...document.querySelectorAll('[data-copy]')];
  const seekButtons=[...document.querySelectorAll('[data-seek]')];
  const modeButtons=[...document.querySelectorAll('.material-controls [data-mode]')];
  const play=$('play-tour'),playLabel=$('play-label'),pause=$('pause-effects');
  const dialog=$('settings-dialog'),form=$('settings-form'),audio=$('payment-audio');
  const comparisonPanel=$('comparison-panel'),paymentPanel=$('payment-status');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const example=window.AgreementExample;
  const defaults={amount:example.amount,currentRate:example.currentRate,proposalRate:example.proposalRate};
  let comparison={...defaults};
  let renderer=null,frame=0,visible=true,paused=false,playing=false;
  let mode='flow',current=0,target=0,lastTime=0,startTime=0,startProgress=0;
  let lastPhase=-1,lastPercent=-1,lastPaymentStatus='';
  let audioEnabled=true,playedThisRun=false,customAudioUrl='',previousFocus=null;
  const audioConfig=window.AgreementAudio;
  const builtInAudioSource=audioConfig.source;
  let audioContext=null,decodedAudio=null,decodePromise=null,activeSound=null,activeGain=null,customAudioBytes=null,audioRevision=0,audioBlocked=false;
  let autoStartPending=!reduce.matches,visualReady=false;
  function stopSound(){
    audio.pause();
    if(activeSound){const previous=activeSound;activeSound=null;try{previous.stop();}catch(error){}}
    stage.dataset.audioPlayback='stopped';
  }
  function ensureAudioContext(){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return null;
    if(!audioContext||audioContext.state==='closed')audioContext=new Context();
    return audioContext;
  }
  function audioBytes(){
    if($('audio-source').value==='custom')return customAudioBytes?.slice(0)||null;
    if(!audioConfig.dataBase64)return null;
    const binary=atob(audioConfig.dataBase64),bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    return bytes.buffer;
  }
  function prepareDecodedAudio(){
    const context=ensureAudioContext();if(!context)return Promise.resolve(null);
    if(decodedAudio)return Promise.resolve(decodedAudio);
    if(decodePromise)return decodePromise;
    const bytes=audioBytes();if(!bytes)return Promise.resolve(null);
    const revision=audioRevision;
    decodePromise=context.decodeAudioData(bytes).then(buffer=>{if(revision===audioRevision)decodedAudio=buffer;return revision===audioRevision?buffer:null;}).catch(()=>null);
    return decodePromise;
  }
  function unlockAudio(){
    if(!audioEnabled)return;
    const context=ensureAudioContext();if(!context)return;
    const ready=()=>{stage.dataset.audioUnlock=context.state;if(audioBlocked&&context.state==='running'){audioBlocked=false;playedThisRun=false;schedule();}};
    if(context.state!=='running')context.resume().then(ready).catch(()=>{});
    else ready();
    prepareDecodedAudio();
  }
  function invalidateAudio(){stopSound();audioRevision++;decodedAudio=null;decodePromise=null;}
  const clamp=n=>Math.min(1,Math.max(0,n));
  const smooth=(a,b,n)=>{const v=clamp((n-a)/(b-a));return v*v*(3-2*v);};
  const visualProgress=progress=>progress<.32?progress/.32*.12:.13+(progress-.32)/.68*.87;
  const fromVisual=progress=>.32+(progress-.13)/.87*.68;
  const currency=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2});
  const decimal=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
  function text(id,value){const element=$(id);if(element.textContent!==value)element.textContent=value;}
  function lines(element,values){element.replaceChildren();values.forEach((value,index)=>{if(index)element.append(document.createElement('br'));element.append(typeof value==='string'?document.createTextNode(value):value);});}
  function headline(id,first,emphasis){const em=document.createElement('em');em.textContent=emphasis;lines($(id),[first,em]);}
  function rate(element,value){element.replaceChildren(document.createTextNode(decimal.format(value)));const unit=document.createElement('span');unit.textContent='%';element.append(unit);}
  function distance(){return Math.max(1,cinema.offsetHeight-stage.offsetHeight);}
  function readScroll(){target=clamp((scrollY-cinema.offsetTop)/distance());}
  function resize(){if(renderer)renderer.resize(stage.clientWidth,stage.clientHeight,Math.min(devicePixelRatio||1,stage.clientWidth<=700?1.5:2));readScroll();schedule();}
  function stopTour(){autoStartPending=false;if(!playing)return;playing=false;play.setAttribute('aria-pressed','false');playLabel.textContent='Ver recorrido';play.firstElementChild.textContent='▷';}
  function startTour(){
    autoStartPending=false;
    stopSound();scrollTo({top:cinema.offsetTop,behavior:'instant'});current=target=0;
    playedThisRun=false;startProgress=0;startTime=performance.now();playing=true;
    play.setAttribute('aria-pressed','true');playLabel.textContent='Detener';play.firstElementChild.textContent='Ⅱ';schedule();
  }
  function maybeAutoStart(){
    if(!autoStartPending||!visualReady||reduce.matches||document.hidden||!visible||paused||dialog.open)return;
    readScroll();
    if(target>.002){autoStartPending=false;return;}
    startTour();
  }
  function seek(progress){stopTour();scrollTo({top:cinema.offsetTop+clamp(progress)*distance(),behavior:paused||reduce.matches?'instant':'smooth'});readScroll();schedule();}
  function show(element,shown,inert=false){element.classList.toggle('is-visible',shown);element.setAttribute('aria-hidden',String(!shown));if(inert)element.inert=!shown;}
  function updateComparison(){
    const difference=comparison.proposalRate-comparison.currentRate;
    const change=comparison.amount*difference/100;
    const relation=difference<-.000001?'lower':difference>.000001?'higher':'equal';
    comparisonPanel.dataset.relation=relation;
    const sameBasis=comparison.currentRate===defaults.currentRate&&comparison.proposalRate===defaults.proposalRate;
    text('comparison-context',sameBasis?'Débito inmediato · Buenos Aires · sin IVA. Ejemplo, no oferta vigente.':'Valores personalizados sin IVA. Ejemplo, no oferta vigente.');
    rate($('current-rate'),comparison.currentRate);
    rate($('proposal-rate'),comparison.proposalRate);
    text('current-cost',currency.format(comparison.amount*comparison.currentRate/100));
    text('proposal-cost',currency.format(comparison.amount*comparison.proposalRate/100));
    text('comparison-amount',currency.format(comparison.amount));text('payment-amount',currency.format(comparison.amount));
    const prefix=difference<0?'−':difference>0?'+':'';
    text('rate-difference',`${prefix}${decimal.format(Math.abs(difference))} p.p.`);
    text('cost-difference',relation==='equal'?'El mismo costo en este ejemplo':`${currency.format(Math.abs(change))} ${relation==='lower'?'menos':'más'} en este ejemplo`);
    if(relation==='lower'){
      headline('difference-title','Un costo','más bajo.');
      text('difference-description',`En este ejemplo, ${currency.format(Math.abs(change))} menos para el mismo cobro de ${currency.format(comparison.amount)}.`);
    }else if(relation==='higher'){
      headline('difference-title','Comparar para','decidir.');
      text('difference-description',`En este ejemplo, la condición propuesta cuesta ${currency.format(change)} más para el mismo cobro.`);
    }else{
      headline('difference-title','Las condiciones,','en equilibrio.');
      text('difference-description','En este ejemplo, ambas condiciones tienen el mismo costo para el mismo cobro.');
    }
    schedule();
  }
  function renderUI(progress){
    const visual=visualProgress(progress);
    const phase=progress<.32?Math.min(3,Math.floor(progress/.08)):visual<.27?4:visual<.4?5:visual<.53?6:visual<.67?7:visual<.81?8:visual<.94?9:10;
    if(phase!==lastPhase){
      stage.dataset.scene=String(phase);
      copies.forEach((copy,index)=>{const active=index===phase;copy.classList.toggle('is-active',active);copy.inert=!active;if(active)copy.removeAttribute('aria-hidden');else copy.setAttribute('aria-hidden','true');});
      const activeNav=phase<2?phase:phase<4?2:phase-1;
      seekButtons.forEach((button,index)=>{if(index===activeNav)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      show($('origin-message'),phase===1);
      show(comparisonPanel,phase===5||phase===6,true);
      show($('device-label'),phase>=7);
      show(paymentPanel,phase===8||phase===9,true);
      lastPhase=phase;
    }
    const position=progress.toFixed(4);if(stage.dataset.progress!==position)stage.dataset.progress=position;
    $('timeline-fill').style.transform=`scaleX(${progress})`;
    const percent=Math.round(progress*100);if(lastPercent!==percent){$('progress-value').value=`${percent}%`;lastPercent=percent;}
    const reveal=smooth(.38,.5,visual);
    const rateValue=comparison.currentRate+(comparison.proposalRate-comparison.currentRate)*reveal;
    const maximum=Math.max(comparison.currentRate,comparison.proposalRate,.001);
    $('current-bar').style.transform=`scaleX(${comparison.currentRate/maximum})`;
    $('proposal-bar').style.transform=`scaleX(${rateValue/maximum})`;
    comparisonPanel.style.setProperty('--strike',comparison.proposalRate<comparison.currentRate?reveal:0);
    comparisonPanel.style.setProperty('--reduction',comparison.proposalRate<comparison.currentRate?reveal:0);
    const paymentStatus=visual>=.815?'complete':visual>=.735?'processing':'approach';
    if(lastPaymentStatus!==paymentStatus){
      paymentPanel.dataset.status=paymentStatus;
      text('payment-symbol',paymentStatus==='complete'?'✓':paymentStatus==='processing'?'⋯':'≈');
      text('payment-label',paymentStatus==='complete'?'Cobro aprobado':paymentStatus==='processing'?'Procesando el cobro':'Acercá tu tarjeta');
      text('payment-note',paymentStatus==='complete'?'La propuesta empieza a cobrar sentido.':'Un gesto simple para seguir.');
      lastPaymentStatus=paymentStatus;
    }
    const destination=visualProgress(target);
    if(audioEnabled&&!playedThisRun&&visual>=.825&&visual<.94&&destination>=.825&&destination<.94){playedThisRun=true;playAudio();}
  }
  function tick(now){
    frame=0;const dt=lastTime?Math.min((now-lastTime)/1000,.06):1/60;lastTime=now;
    if(playing){const progress=clamp(startProgress+(now-startTime)/36000*(1-startProgress));scrollTo({top:cinema.offsetTop+progress*distance(),behavior:'instant'});target=progress;if(progress>=1)stopTour();}
    const still=paused||reduce.matches;
    current=still?target:current+(target-current)*(1-Math.exp(-dt*9));if(Math.abs(current-target)<.00005)current=target;
    renderUI(current);
    if(renderer)renderer.render(visualProgress(current),still?0:now/1000,{mode,still,comparison,origin:current<.32?Math.min(3,Math.floor(current/.08)):null,originProgress:clamp(current/.32)});
    if(visible&&!document.hidden&&(!still||playing||Math.abs(target-current)>.0001))schedule();
  }
  function schedule(){if(!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
  function onScroll(){readScroll();schedule();}
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',resize);
  addEventListener('wheel',stopTour,{passive:true});
  addEventListener('touchstart',event=>{if(!event.target.closest?.('#play-tour'))stopTour();},{passive:true});
  addEventListener('keydown',event=>{if(event.key===' '&&event.target.closest?.('#play-tour'))return;if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))stopTour();});
  document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;stopTour();stopSound();}else{schedule();maybeAutoStart();}});
  document.addEventListener('pointerdown',unlockAudio,{capture:true});
  document.addEventListener('click',unlockAudio,{capture:true});
  document.addEventListener('touchend',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')unlockAudio();},{capture:true});
  reduce.addEventListener('change',()=>{stopTour();schedule();});
  seekButtons.forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.seek))));
  $('skip-animation').addEventListener('click',()=>seek(1));
  document.querySelector('.wordmark').addEventListener('click',event=>{event.preventDefault();seek(0);});
  modeButtons.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;stage.dataset.mode=mode;modeButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));schedule();}));
  play.addEventListener('click',()=>{
    if(playing){stopTour();return;}
    startTour();
  });
  pause.addEventListener('click',()=>{paused=!paused;if(paused)stopTour();document.documentElement.classList.toggle('motion-paused',paused);pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Activar efectos ambientales':'Pausar efectos ambientales');pause.title=pause.getAttribute('aria-label');pause.textContent=paused?'▷':'Ⅱ';schedule();});
  $('repeat-payment').addEventListener('click',()=>{stopSound();audio.currentTime=0;playedThisRun=false;seek(fromVisual(.66));});
  function openSettings(sound=false){stopTour();previousFocus=document.activeElement;dialog.showModal();if(sound)$('audio-enabled').focus();}
  $('customize').addEventListener('click',()=>openSettings());
  $('sound-settings').addEventListener('click',()=>openSettings(true));
  document.querySelectorAll('[data-open-settings]').forEach(button=>button.addEventListener('click',()=>openSettings()));
  function closeSettings(){dialog.close();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  $('close-settings').addEventListener('click',closeSettings);
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    comparison={amount:Number($('amount-input').value),currentRate:Number($('current-rate-input').value),proposalRate:Number($('proposal-rate-input').value)};
    updateComparison();closeSettings();
  });
  function setAudioEnabled(enabled){
    audioEnabled=enabled;$('audio-enabled').checked=enabled;
    const ready=Boolean(audio.getAttribute('src'));
    $('sound-indicator').classList.toggle('is-on',enabled&&ready);
    $('sound-indicator').classList.toggle('is-pending',enabled&&!ready);
    if(!enabled){stopSound();text('audio-feedback','El sonido está apagado.');}
    else{playedThisRun=false;text('audio-feedback',ready?'Sonará una vez al completar la escena del cobro. El navegador puede requerir un primer toque.':'La reproducción al completar está activada; falta seleccionar el audio correcto.');}
    schedule();
  }
  $('audio-enabled').addEventListener('change',()=>{
    if($('audio-enabled').checked&&$('audio-source').value==='custom'&&!customAudioUrl){$('audio-enabled').checked=false;text('audio-feedback','Primero elegí tu archivo de audio.');return;}
    setAudioEnabled($('audio-enabled').checked);
  });
  $('audio-source').addEventListener('change',()=>{
    invalidateAudio();$('custom-audio-control').hidden=$('audio-source').value!=='custom';
    if($('audio-source').value==='builtin'){if(builtInAudioSource)audio.src=builtInAudioSource;else audio.removeAttribute('src');audio.load();setAudioEnabled(audioEnabled);}
    else if(customAudioUrl){audio.src=customAudioUrl;audio.load();text('audio-feedback','Archivo local listo.');}
    else{audio.removeAttribute('src');audio.load();setAudioEnabled(false);text('audio-feedback','Elegí un archivo desde tu dispositivo.');}
  });
  $('custom-audio-file').addEventListener('change',async()=>{
    const file=$('custom-audio-file').files[0];if(!file)return;
    if(file.size>10*1024*1024){text('audio-feedback','Elegí un audio de hasta 10 MB.');return;}
    invalidateAudio();if(customAudioUrl)URL.revokeObjectURL(customAudioUrl);customAudioUrl=URL.createObjectURL(file);audio.src=customAudioUrl;audio.load();customAudioBytes=await file.arrayBuffer();text('audio-feedback',`Archivo local seleccionado: ${file.name}`);setAudioEnabled(true);unlockAudio();
  });
  async function playAudio(){
    if(!audioEnabled)return;
    if(!audio.getAttribute('src')){text('audio-feedback','Falta seleccionar el sonido de cobro correcto.');return;}
    try{
      const buffer=await prepareDecodedAudio();
      if(buffer&&audioContext?.state==='running'){
        if(activeSound){try{activeSound.stop();}catch(error){}}
        const source=audioContext.createBufferSource(),gain=audioContext.createGain();
        source.buffer=buffer;gain.gain.value=audio.muted?0:audio.volume;
        source.connect(gain);gain.connect(audioContext.destination);activeSound=source;activeGain=gain;
        source.onended=()=>{if(activeSound===source){activeSound=null;activeGain=null;stage.dataset.audioPlayback='ended';}source.disconnect();gain.disconnect();};
        source.start();stage.dataset.audioPlayback='playing';
      }else{audio.currentTime=0;await audio.play();stage.dataset.audioPlayback='playing';}
      audioBlocked=false;$('play-sound-again').hidden=true;text('audio-feedback','Sonido activado para este recorrido.');
    }
    catch(error){audioBlocked=true;$('play-sound-again').hidden=false;text('audio-feedback','El navegador requiere un primer toque para habilitar el sonido.');}
  }
  $('play-sound-again').addEventListener('click',playAudio);
  audio.addEventListener('ended',()=>{stage.dataset.audioPlayback='ended';});
  audio.addEventListener('volumechange',()=>{if(activeGain)activeGain.gain.value=audio.muted?0:audio.volume;});
  $('reset-example').addEventListener('click',()=>{
    comparison={...defaults};$('amount-input').value=String(defaults.amount);$('current-rate-input').value=String(defaults.currentRate);$('proposal-rate-input').value=String(defaults.proposalRate);invalidateAudio();$('audio-source').value='builtin';$('custom-audio-control').hidden=true;if(builtInAudioSource)audio.src=builtInAudioSource;else audio.removeAttribute('src');audio.load();playedThisRun=false;setAudioEnabled(true);updateComparison();
  });
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){lastTime=0;schedule();maybeAutoStart();}else{stopTour();stopSound();}},{threshold:0}).observe(cinema);
  const loadImage=url=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=()=>resolve(image);image.src=url;});
  const autoStartFallback=setTimeout(()=>{visualReady=true;maybeAutoStart();},2500);
  Promise.all([loadImage('historia/assets/mercado-pago.png'),loadImage('historia/assets/point-smart-2-cutout.png')]).then(([logo,point])=>{
    try{if(typeof window.AcuerdoRenderer!=='function')throw new Error('Renderer unavailable');renderer=new window.AcuerdoRenderer(canvas,logo,point);resize();}
    catch(error){canvas.hidden=true;$('canvas-fallback').hidden=false;resize();}
    visualReady=true;clearTimeout(autoStartFallback);maybeAutoStart();
  });
  text('example-source-context',example.sourceContext);
  document.querySelector('#audio-source option[value="builtin"]').textContent=audioConfig.label;
  text('audio-source-note',audioConfig.note);
  audio.volume=.6;
  if(builtInAudioSource)audio.src=builtInAudioSource;
  setAudioEnabled(true);
  readScroll();updateComparison();renderUI(target);
})();
