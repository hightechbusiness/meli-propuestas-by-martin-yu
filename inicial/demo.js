/* Independent public starter. Commercial conditions are entered by the adviser; form values never leave this browser. */
(function(root){
  'use strict';
  const LIMITS={business:60,adviser:48,contact:80,benefit:110,settlement:40};
  const TABLE=root.PublicRateTable,PRESETS=root.PublicRatePresets;
  const $=id=>document.getElementById(id),FORM_FIELDS=['business','adviser','contact','sourceMode','category','province','release','qrCondition','round','validUntil','benefit','proposalLanguage'];
  const METHODS=Object.keys(TABLE.METHODS),ITEM_FIELDS=METHODS.flatMap(method=>['rate-'+method,'settlement-'+method]);
  const COUNTS=PRESETS.INSTALLMENTS,FIN_FIELDS=COUNTS.map(count=>'fin-rate-'+count),LEGACY_KEY=TABLE.KEY+'-legacy-backup-v2';
  const normalize=value=>String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  function parseRate(value){const text=String(value??'').trim();if(!/^\d{1,3}(?:[.,]\d{1,8})?$/.test(text))return null;const number=Number(text.replace(',','.'));return number>=0&&number<=100?number:null;}
  const formatRate=(value,language='es')=>new Intl.NumberFormat(language==='zh-CN'?'zh-CN':'es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  const formatBase=value=>new Intl.NumberFormat('es-AR',{useGrouping:false,maximumFractionDigits:8}).format(value);
  const displayRate=(base,includeIVA)=>typeof base==='number'&&Number.isFinite(base)?base*(includeIVA?1.21:1):null;
  function todayISO(){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=type=>parts.find(item=>item.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
  }
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
  }
  const COPY=Object.freeze({
    es:{type:'PROPUESTA',eyebrow:'PENSADA PARA TU NEGOCIO',business:'Propuesta comercial',datePrefix:'Válida hasta el ',dateMissing:'Completá la fecha de validez',settlement:'Acreditación: ',termMissing:'Plazo a completar',empty:'Elegí al menos un medio para mostrar sus condiciones.',financing:'Cobrá también en cuotas',financingPDF:'COBRÁ EN CUOTAS',cost:'Costo total de cobro',withIVA:' con IVA',total:'Costo total: procesamiento + financiación',taxWith:'Tasas con IVA 21%.',taxWithout:'Tasas sin IVA.',closing:'Una buena conversación',closingStrong:'empieza con una propuesta clara.',footer:'Condiciones informadas por el asesor.',scope:'Alcance y vigencia según el detalle de la propuesta.',methods:{debit:'Débito',prepaid:'Tarjeta prepaga',credit:'Crédito en un pago',qr:'QR'},qr:{money:'Dinero en cuenta',debit:'Tarjeta de débito',credit:'Tarjeta de crédito',consumer:'Crédito de Mercado Pago'}},
    'zh-CN':{type:'收款方案',eyebrow:'为您的生意量身规划',business:'商家收款方案',datePrefix:'有效期至：',dateMissing:'请填写方案有效期',settlement:'到账时间：',termMissing:'请填写到账时间',empty:'请选择至少一种收款方式。',financing:'让顾客轻松分期',financingPDF:'分期收款',cost:'收款总费率',withIVA:'（含IVA）',total:'总费率：收款手续费 + 分期费用',taxWith:'费率已含21% IVA。',taxWithout:'费率不含IVA。',closing:'让每一次沟通更进一步',closingStrong:'用清晰方案开启合作',footer:'商业条件由顾问提供。',scope:'适用范围及有效期以本方案为准。',methods:{debit:'现金卡',prepaid:'预付卡',credit:'信用卡（一次付清）',qr:'扫码支付'},qr:{money:'账户余额',debit:'现金卡',credit:'信用卡',consumer:'Mercado Pago信贷'}}
  });
  const copyFor=language=>COPY[language]||COPY.es;
  const validityLabel=(value,language='es')=>validDate(value)?copyFor(language).datePrefix+new Intl.DateTimeFormat(language==='zh-CN'?'zh-CN':'es-AR',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00Z')):copyFor(language).dateMissing;
  const taxLabel=(includeIVA,language='es')=>copyFor(language)[includeIVA?'taxWith':'taxWithout'];
  const installmentLabel=(count,language)=>language==='zh-CN'?count+'期':count+' cuotas';
  function settlementLabel(value,language){
    if(language!=='zh-CN')return value;
    const term=normalize(value),known={'Al momento':'即时到账','Inmediato':'即时到账','Inmediata':'即时到账'};
    if(known[term])return known[term];
    const days=term.match(/^(\d+) d[ií]as?(?: (corridos|h[aá]biles))?$/i);
    if(days)return days[1]+(days[2]&&/h[aá]biles/i.test(days[2])?'个工作日':'个自然日');
    const hours=term.match(/^(\d+)\s*(?:h|hs|horas?)$/i);return hours?hours[1]+'小时':term;
  }
  function itemLabel(item,data){const copy=copyFor(data.proposalLanguage);return item.method==='qr'&&data.qrCondition?copy.methods.qr+' · '+(copy.qr[data.qrCondition.split('-')[0]]||''):copy.methods[item.method];}

  function validate(values){
    const data={items:[],financing:[],proposalLanguage:values.proposalLanguage==='zh-CN'?'zh-CN':'es'},errors={};
    for(const key of ['business','adviser','contact','benefit']){
      data[key]=normalize(values[key]);if(data[key].length>LIMITS[key])errors[key]='Usá hasta '+LIMITS[key]+' caracteres.';
    }
    data.sourceMode=['presets','custom'].includes(values.sourceMode)?values.sourceMode:'';
    if(!data.sourceMode)errors.sourceMode='Elegí condiciones de referencia o tu tabla.';
    data.category=PRESETS.CATEGORIES.some(item=>item.id===values.category)?values.category:'';
    if(!data.category)errors.category='Elegí una categoría de 1 a 5. Para condiciones especiales, usá el espacio del equipo.';
    data.province=PRESETS.PROVINCES.some(item=>item.id===values.province)?values.province:'';
    data.release=PRESETS.RELEASES.some(item=>item.id===values.release)?values.release:'';
    if(data.sourceMode==='presets'&&!data.province)errors.province='Elegí una provincia.';
    if(data.sourceMode==='presets'&&!data.release)errors.release='Elegí el plazo de acreditación.';
    data.includeIVA=values.includeIVA===true;data.showFinancing=values.showFinancing===true;
    data.validUntil=typeof values.validUntil==='string'?values.validUntil:'';
    if(!validDate(data.validUntil))errors.validUntil='Elegí la fecha límite de esta oferta.';
    else if(data.validUntil<todayISO())errors.validUntil='La oferta debe vencer hoy o en una fecha posterior.';
    let qrChoices=[];if(data.sourceMode==='presets'&&data.category&&data.province)qrChoices=PRESETS.getQRChoices(data.category,data.province);
    const qr=qrChoices.find(item=>item.id===values.qrCondition);
    data.qrCondition=qr?.id||'';
    for(const method of METHODS){
      const item=values.items?.[method];if(item?.show!==true)continue;
      const rate=parseRate(item.rate),settlement=normalize(item.settlement);
      if(rate===null)errors['rate-'+method]='Completá la tasa base, sin IVA, de 0 a 100.';
      if(!settlement)errors['settlement-'+method]='Completá el plazo de acreditación.';
      else if(settlement.length>LIMITS.settlement)errors['settlement-'+method]='Usá hasta '+LIMITS.settlement+' caracteres.';
      if(method==='qr'&&data.sourceMode==='presets'&&!qr)errors.qrCondition='Elegí cómo paga el cliente con QR.';
      data.items.push({method,rate,settlement,label:method==='qr'&&qr?'QR · '+qr.label:TABLE.METHODS[method]});
    }
    data.round=PRESETS.ROUNDS.some(item=>item.id===values.round)?values.round:'';
    if(data.showFinancing){
      if(!data.round)errors.round='Elegí un round de financiación.';
      const selected=Array.isArray(values.installments)?values.installments:[];
      if(!selected.length||new Set(selected).size!==selected.length||selected.some(count=>!COUNTS.includes(count)))errors.financing='Elegí al menos una cantidad de cuotas válida.';
      const processing=parseRate(values.items?.credit?.rate),term=normalize(values.items?.credit?.settlement);
      if(processing===null)errors['rate-credit']='Completá la tasa de crédito para calcular el costo total de las cuotas.';
      if(!term||term.length>LIMITS.settlement)errors['settlement-credit']='Completá el plazo de acreditación de crédito.';
      data.financingTerm=term;
      for(const count of COUNTS){
        if(!selected.includes(count))continue;
        const additional=parseRate(values.financingRates?.[String(count)]);
        if(additional===null)errors['fin-rate-'+count]='Completá el adicional de financiación, sin IVA.';
        data.financing.push({count,additional,processing,total:additional===null||processing===null?null:processing+additional});
      }
    }
    if(!data.items.length&&!data.financing.length)errors.items='Mostrá al menos un medio de cobro o una opción de cuotas.';
    return {data,errors,valid:Object.keys(errors).length===0};
  }
  function read(){
    const values=Object.fromEntries(FORM_FIELDS.map(key=>[key,$(key).value]));
    values.includeIVA=$('includeIVA').checked===true;values.showFinancing=$('showFinancing').checked===true;
    values.installments=COUNTS.filter(count=>$('installment-'+count).checked===true);
    values.financingRates=Object.fromEntries(COUNTS.map(count=>[String(count),$('fin-rate-'+count).value]));
    values.items=Object.fromEntries(METHODS.map(method=>[method,{show:$('show-'+method).checked===true,rate:$('rate-'+method).value,settlement:$('settlement-'+method).value}]));return values;
  }
  function reportErrors(errors){
    for(const key of [...FORM_FIELDS,...ITEM_FIELDS,...FIN_FIELDS]){
      const input=$(key),message=$(key+'Error');if(message)message.textContent=errors[key]||'';
      input.setAttribute('aria-invalid',errors[key]?'true':'false');
      const help=['category','province','release','validUntil','benefit','qrCondition'].includes(key)?key+'Help':ITEM_FIELDS.includes(key)?'itemsHelp':FIN_FIELDS.includes(key)?'financingHelp':'';
      input.setAttribute('aria-describedby',[help,errors[key]?key+'Error':''].filter(Boolean).join(' '));
    }
    $('itemsError').textContent=errors.items||'';$('financingError').textContent=errors.financing||'';
    $('proposalItems').setAttribute('aria-invalid',errors.items?'true':'false');
  }
  function element(tag,className,value){const node=document.createElement(tag);node.className=className;if(value!==undefined)node.textContent=value;return node;}
  function preview(){
    const result=validate(read()),data=result.data,language=data.proposalLanguage,copy=copyFor(language);
    $('proposalPreview').setAttribute('lang',language==='zh-CN'?'zh-CN':'es-AR');
    for(const [id,value] of Object.entries({previewType:copy.type,previewEyebrow:copy.eyebrow,previewEmpty:copy.empty,previewFinancingTitle:copy.financing,previewClosing:copy.closing,previewClosingStrong:copy.closingStrong,previewFooter:copy.footer,previewScope:copy.scope}))$(id).textContent=value;
    $('previewBusiness').textContent=data.business||copy.business;$('previewAdviser').textContent=data.adviser;
    $('previewContact').textContent=data.contact;$('previewBenefit').textContent=data.benefit;
    $('previewValidity').textContent=validityLabel(data.validUntil,language);$('previewTaxScope').textContent=taxLabel(data.includeIVA,language);
    const preset=data.sourceMode==='presets';$('province').disabled=!preset;$('release').disabled=!preset;
    $('qrCondition').disabled=!preset||!$('show-qr').checked;
    $('financingFields').hidden=!data.showFinancing;
    $('round').disabled=!data.showFinancing;
    for(const count of COUNTS){$('installment-'+count).disabled=!data.showFinancing;$('fin-rate-'+count).disabled=!data.showFinancing||!$('installment-'+count).checked;}
    for(const method of METHODS){
      const show=$('show-'+method).checked===true,neededForFinance=method==='credit'&&data.showFinancing,wrapper=$('item-'+method);
      wrapper.dataset.enabled=String(show||neededForFinance);$('rate-'+method).disabled=!show&&!neededForFinance;$('settlement-'+method).disabled=!show&&!neededForFinance;
      $('itemStatus-'+method).textContent=!show?(neededForFinance?'Se usa para calcular cuotas; crédito en un pago no se muestra.':'Oculto en la propuesta.'):wrapper.dataset.custom==='true'?'Personalizado para esta propuesta.':wrapper.dataset.origin==='presets'?'Referencia cargada; podés ajustarla.':wrapper.dataset.origin==='saved'?'Condición de tu tabla guardada.':'Completá esta condición o desactivá el medio.';
    }
    const cards=data.items.map(item=>{
      const card=element('article','rate-card');card.dataset.method=item.method;
      const top=element('div','rate-card-top');top.append(element('span','rate-card-method',itemLabel(item,data)),element('span','rate-spark','✦'));
      const rate=element('div','proposal-rate'),value=displayRate(item.rate,data.includeIVA);rate.append(document.createTextNode(value===null?'—':formatRate(value,language)),element('span','','%'));
      const term=element('p','settlement-preview');term.append(element('span','',item.settlement?copy.settlement+settlementLabel(item.settlement,language):copy.termMissing));
      card.append(top,rate,term);return card;
    });
    $('previewRates').replaceChildren(...cards);$('previewRates').dataset.count=String(cards.length);$('previewEmpty').hidden=cards.length>0||data.showFinancing;
    $('previewFinancing').hidden=!data.showFinancing;
    const rows=data.financing.map(item=>{const row=element('article','installment-row');row.dataset.count=String(item.count);const value=displayRate(item.total,data.includeIVA);row.append(element('strong','',installmentLabel(item.count,language)),element('span','',value===null?'—':formatRate(value,language)+'%'),element('small','',copy.cost+(data.includeIVA?copy.withIVA:'')));return row;});
    $('previewInstallments').replaceChildren(...rows);return result;
  }
  let savedRateTable=TABLE.blank(),importNumber=0,legacyOriginal=null;
  function tableStatus(message,error=false){$('tableStatus').textContent=message;$('tableStatus').dataset.error=String(error);}
  function storage(){try{return root.localStorage;}catch(_){throw Error('El navegador no habilitó el almacenamiento local. Podés seguir preparando y descargando tu propuesta.');}}
  function paintTable(table){
    for(const category of TABLE.CATEGORIES)for(const method of METHODS){const cell=table.categories[category][method];$('table-'+category+'-'+method+'-rate').value=cell.rate===null?'':formatBase(cell.rate);$('table-'+category+'-'+method+'-term').value=cell.term;}
    for(const round of TABLE.ROUNDS)for(const count of COUNTS){const rate=table.financing[round][String(count)];$('table-fin-'+round+'-'+count).value=rate===null?'':formatBase(rate);}
  }
  function readTable(){
    const table=TABLE.blank();
    for(const category of TABLE.CATEGORIES)for(const method of METHODS){const raw=$('table-'+category+'-'+method+'-rate').value.trim(),rate=raw===''?null:parseRate(raw);if(raw!==''&&rate===null)throw Error('Revisá la tasa base de '+category+' · '+TABLE.METHODS[method]+'.');table.categories[category][method]={rate,term:$('table-'+category+'-'+method+'-term').value};}
    for(const round of TABLE.ROUNDS)for(const count of COUNTS){const raw=$('table-fin-'+round+'-'+count).value.trim(),rate=raw===''?null:parseRate(raw);if(raw!==''&&rate===null)throw Error('Revisá el adicional de '+count+' cuotas.');table.financing[round][String(count)]=rate;}
    return TABLE.validate(table);
  }
  function options(select,rows,selected){select.replaceChildren(...rows.map(row=>{const option=element('option','',row.label);option.value=row.id;return option;}));select.value=rows.some(row=>row.id===selected)?selected:(rows[0]?.id||'');}
  function edited(){ closeProposalShare();$('downloadSuccess').hidden=true;$('formStatus').textContent=''; }
  function applyQR(){
    if($('sourceMode').value!=='presets')return;
    const choices=PRESETS.getQRChoices($('category').value,$('province').value),choice=choices.find(item=>item.id===$('qrCondition').value);
    $('rate-qr').value=choice&&choice.rate!==null?formatBase(choice.rate):'';$('settlement-qr').value=choice?.term||'';
    $('item-qr').dataset.origin=choice?'presets':'empty';$('item-qr').dataset.custom='false';
  }
  function applyRound(){
    const rows=$('sourceMode').value==='presets'?PRESETS.getFinancing($('round').value):TABLE.getFinancing(savedRateTable,$('round').value);
    for(const count of COUNTS){const rate=rows.find(row=>row.count===count)?.additional;$('fin-rate-'+count).value=typeof rate==='number'?formatBase(rate):'';}
  }
  function applySavedCondition(){
    const mode=$('sourceMode').value,category=$('category').value;let point=null;
    if(mode==='presets')point=PRESETS.getPoint(category,$('province').value,$('release').value);
    for(const method of METHODS){
      const cell=mode==='presets'?point?.[method]:TABLE.getCondition(savedRateTable,category,method);
      $('rate-'+method).value=cell&&typeof cell.rate==='number'?formatBase(cell.rate):'';$('settlement-'+method).value=cell?.term||'';
      $('item-'+method).dataset.origin=cell?(mode==='presets'?'presets':'saved'):'empty';$('item-'+method).dataset.custom='false';
    }
    if(mode==='presets'){options($('qrCondition'),PRESETS.getQRChoices(category,$('province').value).map(row=>({...row,label:row.label+' · '+row.term})),$('qrCondition').value);applyQR();}
    else options($('qrCondition'),[],'');
    const release=PRESETS.RELEASES.find(item=>item.id===$('release').value);$('releaseDescription').textContent=mode==='presets'?(release?.description||release?.label||''):'Usás los plazos que guardaste para cada medio.';
    $('rateOriginHint').textContent=mode==='presets'?'Condiciones de referencia cargadas. Podés ajustar cada valor para esta propuesta.':'Aplicadas las condiciones de tu tabla; los campos vacíos necesitan completarse o desactivarse.';
    applyRound();edited();reportErrors({});preview();
  }
  function saveTable(){
    try{
      const store=storage(),table=readTable();
      if(legacyOriginal)store.setItem(LEGACY_KEY,legacyOriginal);
      savedRateTable=TABLE.save(store,table);legacyOriginal=null;$('sourceMode').value='custom';paintTable(savedRateTable);applySavedCondition();
      tableStatus('Tabla guardada sólo en este navegador, con tasas base sin IVA.');
    }catch(error){tableStatus(error.message,true);}
  }
  function downloadJSON(content,name){const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.hidden=true;document.body.append(link);try{link.click();}finally{link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),30000);}}
  function exportLegacy(){
    try{const raw=legacyOriginal||storage().getItem(LEGACY_KEY);if(!raw)throw Error('No hay un respaldo anterior para descargar.');downloadJSON(raw,'mis-condiciones-anteriores.json');tableStatus('Respaldo anterior descargado con sus importes y alcance originales.');}
    catch(error){tableStatus(error.message,true);}
  }
  function exportTable(){try{downloadJSON(TABLE.serialize(readTable()),'mis-condiciones-mercado-pago.json');tableStatus('Respaldo descargado: tasas base, plazos y financiación. Sin clientes ni propuestas.');}catch(error){tableStatus(error.message,true);}}
  async function importTable(){
    const current=++importNumber,file=$('rateTableFile').files?.[0];if(!file)return;
    try{if(file.size>TABLE.MAX_BYTES)throw Error('El respaldo debe tener hasta 32 KB.');const table=TABLE.parseFile(await file.text());if(current!==importNumber)return;paintTable(table);tableStatus('Tabla importada para revisar. Guardala expresamente para conservarla y usarla.');}
    catch(error){if(current===importNumber)tableStatus(error.message,true);}finally{if(current===importNumber)$('rateTableFile').value='';}
  }
  function initTable(){
    let loaded,previousBackup=null;
    try{const store=storage();loaded=TABLE.load(store);if(loaded.status==='needsReview')legacyOriginal=store.getItem(TABLE.KEY);previousBackup=store.getItem(LEGACY_KEY);}
    catch(_){loaded={table:TABLE.blank(),status:'unavailable'};}
    savedRateTable=loaded.table;paintTable(savedRateTable);$('exportLegacyTable').hidden=!legacyOriginal&&!previousBackup;
    tableStatus(loaded.status==='needsReview'?'Tu tabla anterior contiene impuestos adicionales que no se pueden separar automáticamente. Conservamos el original: descargalo y revisá las tasas base antes de guardar otra tabla.':loaded.status==='saved'?'Tu tabla anterior está recuperada. Podés elegir Mi tabla guardada para usarla.':loaded.status==='unavailable'?'No se puede guardar en este navegador. Las referencias y el PDF siguen disponibles.':loaded.status==='invalid'?'No pudimos leer tu tabla anterior. No la modificamos. Podés importar un respaldo.':'Podés usar las referencias directamente; guardar una tabla propia es opcional.',loaded.status==='needsReview'||loaded.status==='invalid');
    $('saveRateTable').addEventListener('click',saveTable);$('applyRateTable').addEventListener('click',()=>{$('sourceMode').value='custom';applySavedCondition();});
    $('exportRateTable').addEventListener('click',exportTable);$('exportLegacyTable').addEventListener('click',exportLegacy);
    $('importRateTable').addEventListener('click',()=>$('rateTableFile').click());$('rateTableFile').addEventListener('change',()=>void importTable());
  }
  const font=(ctx,size,weight=400)=>{ctx.font=weight+' '+size+'px Arial, "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';};
  function wrapText(ctx,text,maxWidth,maxLines=10){
    const characters=Array.from(text),lines=[];let line='';for(const character of characters){if(line&&ctx.measureText(line+character).width>maxWidth){lines.push(line.trim());line=character.trimStart();}else line+=character;}if(line)lines.push(line.trim());
    if(lines.length<=maxLines)return lines;const result=lines.slice(0,maxLines);let last=result[maxLines-1];while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);result[maxLines-1]=last+'…';return result;
  }
  function rounded(ctx,x,y,width,height,radius,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.fill();}
  function text(ctx,value,x,y,size,color,weight=400){font(ctx,size,weight);ctx.fillStyle=color;ctx.fillText(value,x,y);}
  function drawProposal(data,height=1100){
    const canvas=document.createElement('canvas'),width=720,scale=2;canvas.width=width*scale;canvas.height=height*scale;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Tu navegador no pudo preparar el PDF.');
    ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#ffe600';ctx.fillRect(0,0,width,12);
    const navy='#082f49',muted='#728c9c',margin=44,right=676,logo=$('proposalLogo'),language=data.proposalLanguage,copy=copyFor(language);
    if(!logo?.complete||!logo.naturalWidth)throw Error('No se pudo cargar el logo de Mercado Pago. Recargá la página e intentá de nuevo.');
    ctx.drawImage(logo,118,101,813,223,44,28,180,180*223/813);
    rounded(ctx,576,42,101,29,7,'#f1f6f8');text(ctx,copy.type,591,62,10,'#8096a3',700);
    ctx.strokeStyle='#e5edf2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,99);ctx.lineTo(right,99);ctx.stroke();
    let headerEnd=112;
    if(data.adviser){font(ctx,14,700);for(const line of wrapText(ctx,data.adviser,632,2)){text(ctx,line,margin,headerEnd+14,14,'#35596e',700);headerEnd+=18;}}
    if(data.contact){font(ctx,12);for(const line of wrapText(ctx,data.contact,632,2)){text(ctx,line,margin,headerEnd+12,12,'#668293');headerEnd+=17;}}
    text(ctx,validityLabel(data.validUntil,language),margin,headerEnd+27,12,'#3d687b',700);headerEnd+=48;
    text(ctx,copy.eyebrow,margin,headerEnd+27,11,'#809caa',700);
    const business=data.business||copy.business;let businessSize=43;font(ctx,businessSize,700);while(wrapText(ctx,business,632).length>3&&businessSize>28)font(ctx,--businessSize,700);
    const businessLines=wrapText(ctx,business,632,3),lineHeight=Math.ceil(businessSize*1.1),businessY=headerEnd+77;
    businessLines.forEach((line,index)=>text(ctx,line,margin,businessY+index*lineHeight,businessSize,navy,700));
    let y=businessY+(businessLines.length-1)*lineHeight+29;
    if(data.benefit){font(ctx,17);const lines=wrapText(ctx,data.benefit,590,4);lines.forEach((line,index)=>text(ctx,line,margin,y+index*26,17,muted));y+=lines.length*26+21;}
    const count=data.items.length,columns=count===1?1:2,gap=18,cardHeight=count===1?258:196,rows=Math.ceil(count/columns);
    data.items.forEach((item,index)=>{
      const wide=count===1||(count===3&&index===2),cardWidth=wide?632:307,x=margin+(index%columns)*(307+gap),top=y+Math.floor(index/columns)*(cardHeight+gap),inset=count===1?31:24;
      rounded(ctx,x,top,cardWidth,cardHeight,count===1?22:17,'#ffe600');font(ctx,count===1?11:10,700);
      const labels=wrapText(ctx,itemLabel(item,data).toUpperCase(),cardWidth-inset*2-22,2);labels.forEach((line,i)=>text(ctx,line,x+inset,top+31+i*13,count===1?11:10,'#496035',700));
      text(ctx,'✦',x+cardWidth-inset-18,top+39,count===1?29:22,'#173f3b',500);
      const value=displayRate(item.rate,data.includeIVA),rate=formatRate(value,language);let size=count===1?110:68;
      font(ctx,size,700);while(ctx.measureText(rate).width+38>cardWidth-inset*2&&size>35)font(ctx,--size,700);
      const rateWidth=ctx.measureText(rate).width,baseline=top+(count===1?151:116);
      text(ctx,rate,x+inset,baseline,size,navy,700);text(ctx,'%',x+inset+rateWidth+8,baseline-2,count===1?45:28,navy,700);
      font(ctx,11);wrapText(ctx,copy.settlement+settlementLabel(item.settlement,language),cardWidth-inset*2,3).forEach((line,i)=>text(ctx,line,x+inset,top+(count===1?200:151)+i*16,11,'#426443'));
    });
    if(count)y+=rows*cardHeight+(rows-1)*gap+31;
    if(data.financing.length){
      text(ctx,copy.financingPDF,margin,y+8,15,navy,700);text(ctx,copy.total+(data.includeIVA?' + IVA.':'.'),margin,y+29,11,muted);
      font(ctx,11);const termLines=wrapText(ctx,copy.settlement+settlementLabel(data.financingTerm,language),632,2);termLines.forEach((line,i)=>text(ctx,line,margin,y+48+i*15,11,muted));y+=65+(termLines.length-1)*15;
      data.financing.forEach((item,index)=>{const x=margin+(index%2)*325,top=y+Math.floor(index/2)*85;rounded(ctx,x,top,307,72,12,'#edf7fb');text(ctx,installmentLabel(item.count,language),x+18,top+24,12,'#517589',700);text(ctx,formatRate(displayRate(item.total,data.includeIVA),language)+'%',x+18,top+55,27,navy,700);});
      y+=Math.ceil(data.financing.length/2)*85+15;
    }
    font(ctx,11);const taxLines=wrapText(ctx,taxLabel(data.includeIVA,language),632,2);taxLines.forEach((line,i)=>text(ctx,line,margin,y+10+i*16,11,'#64818e'));y+=taxLines.length*16+35;
    rounded(ctx,margin,y-1,39,39,20,'#e9f8f8');text(ctx,'✓',margin+12,y+25,20,'#138b92',700);text(ctx,copy.closing,margin+56,y+13,13,muted);text(ctx,copy.closingStrong,margin+56,y+35,14,'#355e75',700);
    const footerY=Math.max(y+74,1010);if(footerY+64>height)return drawProposal(data,Math.ceil(footerY+64));
    ctx.fillStyle='#f8fafb';ctx.fillRect(0,footerY,width,height-footerY);text(ctx,copy.footer,margin,footerY+29,10,'#8b9eaa');text(ctx,validityLabel(data.validUntil,language),margin,footerY+46,10,'#8b9eaa');ctx.textAlign='right';text(ctx,'by Martin Yu',right,footerY+45,11,'#8fa3af');ctx.textAlign='left';return canvas;
  }
  function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar el archivo. Probá otra vez.')),'image/jpeg',0.95));}
  async function createPDF(data){
    if(document.fonts?.ready)await document.fonts.ready;const logo=$('proposalLogo');if(typeof logo?.decode==='function')await logo.decode();const canvas=drawProposal(data),jpeg=new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()),bytes=root.PublicDemoPDF.imagePDF(jpeg,canvas.width,canvas.height);return new Blob([bytes],{type:'application/pdf'});
  }
  const pdfName=data=>data.proposalLanguage==='zh-CN'?'propuesta-comercial-zh.pdf':'propuesta-comercial.pdf';
  function savePDF(blob,data){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=pdfName(data);link.hidden=true;document.body.append(link);try{link.click();}finally{link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),30000);}}
  async function download(data){const blob=await createPDF(data);savePDF(blob,data);return blob;}
  let busy=false,buttonResetTimer=0,shareDraft=null,shareOrigin=null,shareRequest=0,nativeBusy=false;
  function shareMessage(data){
    if(data.proposalLanguage==='zh-CN')return ['您好'+(data.business?'，'+data.business:'')+'！','这是为您整理的 Mercado Pago 收款方案，请查看随附的 PDF。',validityLabel(data.validUntil,'zh-CN')+'。','如有疑问，欢迎随时联系我。'].join('\n\n');
    return ['Hola'+(data.business?' '+data.business:'')+' 👋','Te comparto en PDF una propuesta de Mercado Pago pensada para tu negocio.',validityLabel(data.validUntil,'es')+'.','Si tenés alguna consulta, lo vemos juntos.'].join('\n\n');
  }
  function setShareActions(enabled){for(const id of ['shareNativePDF','shareDownloadPDF','shareCopyMessage'])$(id).disabled=!enabled||nativeBusy;$('shareOpenWhatsApp').setAttribute('aria-disabled',String(!enabled||nativeBusy));}
  function invalidateShare(){shareRequest++;shareDraft=null;setShareActions(false);}
  function closeProposalShare(){const dialog=$('proposalShareDialog');if(dialog?.open)dialog.close();else if(shareDraft)invalidateShare();}
  function refreshShareLink(){$('shareOpenWhatsApp').href='https://wa.me/?text='+encodeURIComponent($('shareProposalMessage').value.trim());}
  function currentShareDraft(){
    const current=validate(read());if(!shareDraft||!current.valid||JSON.stringify(current.data)!==shareDraft.fingerprint){invalidateShare();$('proposalShareStatus').textContent='La propuesta cambió o venció. Cerrá este cuadro y volvé a prepararla para compartir.';return null;}return shareDraft;
  }
  function focusFirstError(errors){const first=[...FORM_FIELDS,...ITEM_FIELDS,...FIN_FIELDS].find(key=>errors[key]);$(first||(errors.financing?'installment-'+COUNTS[0]:'show-debit')).focus();}
  async function prepareProposalShare(origin){
    if(busy||nativeBusy)return;const result=preview();reportErrors(result.errors);
    if(!result.valid){$('formStatus').dataset.error='true';$('formStatus').textContent='Revisá los campos señalados antes de compartir la propuesta.';focusFirstError(result.errors);return;}
    invalidateShare();const request=shareRequest;shareOrigin=origin;nativeBusy=false;busy=true;
    const dialog=$('proposalShareDialog');$('shareProposalMessage').value=shareMessage(result.data);$('shareProposalMessage').setAttribute('lang',result.data.proposalLanguage==='zh-CN'?'zh-CN':'es-AR');refreshShareLink();
    $('shareNativePDF').hidden=true;$('proposalShareStatus').dataset.error='false';$('proposalShareStatus').textContent='Preparando el PDF de esta propuesta…';dialog.setAttribute('aria-busy','true');
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    $('shareProposalClose').focus();
    try{const blob=await createPDF(result.data);if(request!==shareRequest||!dialog.open)return;
      const file=typeof root.File==='function'?new root.File([blob],pdfName(result.data),{type:'application/pdf'}):null;
      shareDraft={blob,file,data:result.data,fingerprint:JSON.stringify(result.data)};
      let native=false;try{native=!!file&&typeof root.navigator?.share==='function'&&root.navigator.canShare?.({files:[file]})===true;}catch(_){}
      $('shareNativePDF').hidden=!native;setShareActions(true);$('proposalShareStatus').textContent=native?'PDF listo. Revisá el mensaje y elegí WhatsApp en el menú de tu dispositivo.':'PDF listo. Descargalo, abrí WhatsApp con tu mensaje y adjuntá el archivo.';$('shareProposalMessage').focus();
    }catch(_){if(request===shareRequest){invalidateShare();$('proposalShareStatus').dataset.error='true';$('proposalShareStatus').textContent='No pudimos preparar el PDF. Cerrá este cuadro y probá otra vez.';}}
    finally{busy=false;dialog.setAttribute('aria-busy','false');}
  }
  async function shareNativePDF(){
    if(nativeBusy)return;const draft=currentShareDraft();if(!draft?.file)return;nativeBusy=true;setShareActions(true);
    try{await root.navigator.share({files:[draft.file],title:draft.data.proposalLanguage==='zh-CN'?'Mercado Pago 收款方案':'Propuesta de Mercado Pago',text:$('shareProposalMessage').value.trim()});$('proposalShareStatus').textContent='Volviste del menú de compartir. Podés cerrar este cuadro o compartir de nuevo.';}
    catch(error){$('proposalShareStatus').textContent=error?.name==='AbortError'?'Compartir cancelado. Tu PDF sigue listo.':'Tu dispositivo no pudo compartir el archivo. Podés descargar el PDF y adjuntarlo en WhatsApp.';}
    finally{nativeBusy=false;setShareActions(!!shareDraft);}
  }
  async function copyShareMessage(){if(!currentShareDraft())return;try{if(typeof root.navigator?.clipboard?.writeText!=='function')throw Error('Clipboard unavailable');await root.navigator.clipboard.writeText($('shareProposalMessage').value);$('proposalShareStatus').textContent='Mensaje copiado. Podés pegarlo junto al PDF.';}catch(_){$('shareProposalMessage').focus();$('shareProposalMessage').select();$('proposalShareStatus').textContent='Seleccionamos el mensaje. Copialo desde el menú o con Ctrl+C.';}}
  function resetDownloadFeedback(){
    root.clearTimeout(buttonResetTimer);const button=$('downloadButton');button.classList.remove('is-generated');button.querySelector('.button-label').textContent='Crear propuesta PDF';button.querySelector('.button-finish').textContent='↗';
  }
  async function submit(event){
    event.preventDefault();if(busy)return;const result=preview();reportErrors(result.errors);const status=$('formStatus');status.dataset.error='false';if(!result.valid){status.dataset.error='true';status.textContent='Revisá los campos señalados para crear tu PDF.';const first=[...FORM_FIELDS,...ITEM_FIELDS,...FIN_FIELDS].find(key=>result.errors[key]);$(first||(result.errors.financing?'installment-'+COUNTS[0]:'show-debit')).focus();return;}
    busy=true;resetDownloadFeedback();const button=$('downloadButton');button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('.button-label').textContent='Preparando tu propuesta…';status.textContent='Preparando tu propuesta…';
    try{await download(result.data);status.textContent='Tu propuesta está lista para compartir.';$('downloadSuccess').hidden=false;button.classList.add('is-generated');button.querySelector('.button-label').textContent='Propuesta lista';button.querySelector('.button-finish').textContent='✓';buttonResetTimer=root.setTimeout(resetDownloadFeedback,2800);}
    catch(_){resetDownloadFeedback();status.dataset.error='true';status.textContent='No pudimos generar el PDF. Probá otra vez o usá un navegador actualizado.';}
    finally{busy=false;button.disabled=false;button.setAttribute('aria-busy','false');}
  }
  function init(){
    options($('province'),PRESETS.PROVINCES,PRESETS.PROVINCES.find(item=>item.id==='CABA')?.id||PRESETS.PROVINCES[0].id);
    options($('release'),PRESETS.RELEASES,PRESETS.RELEASES[0].id);options($('round'),PRESETS.ROUNDS,PRESETS.ROUNDS[0].id);
    $('validUntil').min=todayISO();initTable();applySavedCondition();
    for(const key of ['sourceMode','category','province','release'])$(key).addEventListener('change',applySavedCondition);
    $('proposalLanguage').addEventListener('change',()=>{edited();reportErrors({});preview();});
    $('qrCondition').addEventListener('change',()=>{applyQR();edited();reportErrors({});preview();});
    $('round').addEventListener('change',()=>{applyRound();edited();reportErrors({});preview();});
    for(const key of ['includeIVA','showFinancing',...COUNTS.map(count=>'installment-'+count)])$(key).addEventListener('change',()=>{edited();reportErrors({});preview();});
    for(const key of ['business','adviser','contact','benefit','validUntil',...FIN_FIELDS])$(key).addEventListener('input',()=>{edited();preview();if($(key).getAttribute('aria-invalid')==='true')reportErrors(validate(read()).errors);});
    for(const method of METHODS){
      $('show-'+method).addEventListener('change',()=>{edited();reportErrors({});preview();});
      for(const field of ['rate','settlement']){const key=field+'-'+method;$(key).addEventListener('input',()=>{$('item-'+method).dataset.custom='true';edited();preview();if($(key).getAttribute('aria-invalid')==='true')reportErrors(validate(read()).errors);});}
    }
    $('demoForm').addEventListener('submit',submit);
    for(const id of ['shareProposalButton','shareSuccessButton'])$(id).addEventListener('click',()=>prepareProposalShare($(id)));
    $('shareNativePDF').addEventListener('click',shareNativePDF);
    $('shareDownloadPDF').addEventListener('click',()=>{if(nativeBusy)return;const draft=currentShareDraft();if(!draft)return;savePDF(draft.blob,draft.data);$('proposalShareStatus').textContent='PDF descargado. Abrí WhatsApp y adjuntá este archivo al mensaje.';});
    $('shareCopyMessage').addEventListener('click',copyShareMessage);$('shareProposalMessage').addEventListener('input',refreshShareLink);
    $('shareOpenWhatsApp').addEventListener('click',event=>{if(nativeBusy||busy||!shareDraft){event.preventDefault();return;}if(!currentShareDraft()){event.preventDefault();return;}refreshShareLink();$('proposalShareStatus').textContent='Adjuntá el PDF en WhatsApp antes de enviar tu propuesta.';});
    $('shareProposalClose').addEventListener('click',()=>closeProposalShare());
    $('proposalShareDialog').addEventListener('close',()=>{invalidateShare();const origin=shareOrigin;shareOrigin=null;if(origin)origin.focus();});
    preview();$('downloadButton').disabled=false;$('shareProposalButton').disabled=false;
  }
  root.PublicDemo=Object.freeze({parseRate,formatRate,validate,wrapText,displayRate,todayISO,validDate});init();
})(window);
