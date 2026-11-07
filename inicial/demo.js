/* Independent public starter. Commercial conditions are entered by the adviser; form values never leave this browser. */
(function(root){
  'use strict';
  const COUNT_KEY='propuestas-demo-pdf-count',LIMITS={business:60,adviser:48,contact:80,benefit:110,settlement:40};
  const TABLE=root.PublicRateTable;
  const $=id=>document.getElementById(id),FORM_FIELDS=['business','adviser','contact','category','paymentMethod','rate','settlement','taxScope','benefit'];
  const TAX_SCOPES=TABLE.SCOPES;
  const normalize=value=>String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  function parseRate(value){const text=String(value??'').trim();if(!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(text))return null;const number=Number(text.replace(',','.'));return number>=0&&number<=100?number:null;}
  const formatRate=value=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
  function validate(values){
    const data={},errors={};for(const key of ['business','adviser','contact','benefit','settlement']){data[key]=normalize(values[key]);if(data[key].length>LIMITS[key])errors[key]='Usá hasta '+LIMITS[key]+' caracteres.';}
    if(!data.business)errors.business='Completá el nombre del comercio.';if(!data.adviser)errors.adviser='Completá el nombre del asesor.';if(!data.benefit)errors.benefit='Escribí un mensaje para tu propuesta.';
    data.rate=parseRate(values.rate);if(data.rate===null)errors.rate='Ingresá un valor de 0 a 100, con hasta dos decimales.';
    data.taxScope=typeof values.taxScope==='string'&&Object.hasOwn(TAX_SCOPES,values.taxScope)?values.taxScope:'';
    if(!data.taxScope)errors.taxScope='Indicá qué impuestos incluye la tasa que ingresaste.';
    data.category=TABLE.CATEGORIES.includes(values.category)?values.category:'';
    data.paymentMethod=typeof values.paymentMethod==='string'&&Object.hasOwn(TABLE.METHODS,values.paymentMethod)?values.paymentMethod:'';
    if(!data.category)errors.category='Elegí una categoría de tu tabla.';
    if(!data.paymentMethod)errors.paymentMethod='Elegí el medio de cobro de esta propuesta.';
    if(!data.settlement)errors.settlement='Indicá el plazo de acreditación acordado.';
    return {data,errors,valid:Object.keys(errors).length===0};
  }
  function read(){return Object.fromEntries(FORM_FIELDS.map(key=>[key,$(key).value]));}
  function reportErrors(errors){for(const key of FORM_FIELDS){const input=$(key),message=$(key+'Error');message.textContent=errors[key]||'';input.setAttribute('aria-invalid',errors[key]?'true':'false');input.setAttribute('aria-describedby',[['rate','taxScope','benefit','category','settlement'].includes(key)?key+'Help':'',errors[key]?key+'Error':''].filter(Boolean).join(' '));}}
  function preview(){const result=validate(read()),data=result.data;$('previewBusiness').textContent=data.business||'Tu comercio';$('previewAdviser').textContent=data.adviser||'Datos del asesor';$('previewContact').textContent=data.contact;$('previewBenefit').textContent=data.benefit||'Detalle de condiciones de la propuesta.';$('previewTaxScope').textContent=TAX_SCOPES[data.taxScope]||'Alcance de impuestos a completar';$('previewMethod').textContent=TABLE.METHODS[data.paymentMethod]||'Medio de cobro';$('previewSettlement').textContent=data.settlement?'Acreditación: '+data.settlement:'Plazo de acreditación a completar';const rate=$('previewRate');rate.replaceChildren(document.createTextNode(data.rate===null?'—':formatRate(data.rate)));const unit=document.createElement('span');unit.textContent='%';rate.append(unit);return result;}
  let savedRateTable=TABLE.blank(),importNumber=0;
  function tableStatus(message,error=false){const node=$('tableStatus');node.textContent=message;node.dataset.error=String(error);}
  function storage(){try{return root.localStorage;}catch(_){throw Error('El navegador no habilitó el almacenamiento local. Podés seguir armando tu propuesta y descargar un respaldo.');}}
  function paintTable(table){
    $('tableTaxScope').value=table.taxScope;
    for(const category of TABLE.CATEGORIES)for(const method of Object.keys(TABLE.METHODS)){const cell=table.categories[category][method];$('table-'+category+'-'+method+'-rate').value=cell.rate===null?'':formatRate(cell.rate);$('table-'+category+'-'+method+'-term').value=cell.term;}
  }
  function readTable(){
    const table=TABLE.blank();table.taxScope=$('tableTaxScope').value;
    for(const category of TABLE.CATEGORIES)for(const method of Object.keys(TABLE.METHODS)){
      const raw=$('table-'+category+'-'+method+'-rate').value.trim(),rate=raw===''?null:TABLE.parseRate(raw);
      if(raw!==''&&rate===null)throw Error('Revisá la tasa de Cat. '+category.slice(1)+' · '+TABLE.METHODS[method]+'. Usá un valor de 0 a 100 con hasta dos decimales.');
      table.categories[category][method]={rate,term:$('table-'+category+'-'+method+'-term').value};
    }
    return TABLE.validate(table);
  }
  function applySavedCondition(){
    const category=$('category').value,method=$('paymentMethod').value,condition=TABLE.getCondition(savedRateTable,category,method);
    $('rate').value=condition?formatRate(condition.rate):'';$('settlement').value=condition?condition.term:'';$('taxScope').value=condition?condition.taxScope:'';
    $('rateOriginHint').textContent=condition?'Aplicadas tus condiciones guardadas de Cat. '+category.slice(1)+' · '+TABLE.METHODS[method]+'. Podés ajustar esta propuesta sin cambiar tu tabla.':'Esta selección no tiene condiciones guardadas. Completalas en la propuesta o guardá esa fila en tu tabla.';
    $('downloadSuccess').hidden=true;$('formStatus').textContent='';reportErrors({});preview();
  }
  function saveTable(){try{savedRateTable=TABLE.save(storage(),readTable());paintTable(savedRateTable);applySavedCondition();tableStatus('Tabla guardada sólo en este navegador. Ya podés elegir categoría y medio para reutilizarla.');}catch(error){tableStatus(error.message,true);}}
  function exportTable(){
    try{const content=TABLE.serialize(readTable()),url=URL.createObjectURL(new Blob([content],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='mis-condiciones-mercado-pago.json';link.hidden=true;document.body.append(link);try{link.click();}finally{link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),30000);}tableStatus('Respaldo descargado. Contiene tu tabla de condiciones; no incluye clientes ni propuestas.');}
    catch(error){tableStatus(error.message,true);}
  }
  async function importTable(){
    const current=++importNumber,file=$('rateTableFile').files?.[0];if(!file)return;
    try{if(file.size>TABLE.MAX_BYTES)throw Error('El respaldo de la tabla debe tener hasta 32 KB.');const table=TABLE.parseFile(await file.text());if(current!==importNumber)return;paintTable(table);tableStatus('Tabla importada para revisar. Tocá Guardar tabla para conservarla y aplicarla.');}
    catch(error){if(current===importNumber)tableStatus(error.message,true);}
    finally{if(current===importNumber)$('rateTableFile').value='';}
  }
  function initTable(){
    let loaded;try{loaded=TABLE.load(storage());}catch(_){loaded={table:TABLE.blank(),status:'unavailable'};}
    savedRateTable=loaded.table;paintTable(savedRateTable);
    tableStatus(loaded.status==='saved'?'Tu tabla de Mercado Pago está guardada en este navegador.':loaded.status==='invalid'?'No pudimos leer la tabla guardada. Revisá los campos o importá un respaldo antes de guardar otra vez.':loaded.status==='unavailable'?'El navegador no permite guardar la tabla. Podés cargar condiciones en la propuesta y descargar respaldos.':'Completá sólo las categorías y medios que uses. Las filas vacías se mantienen sin tasas.');
    $('saveRateTable').addEventListener('click',saveTable);$('applyRateTable').addEventListener('click',applySavedCondition);$('exportRateTable').addEventListener('click',exportTable);$('importRateTable').addEventListener('click',()=>$('rateTableFile').click());$('rateTableFile').addEventListener('change',()=>void importTable());
    for(const key of ['category','paymentMethod'])$(key).addEventListener('change',applySavedCondition);
    applySavedCondition();
  }
  function getCount(){try{const text=root.localStorage.getItem(COUNT_KEY)||'0';return /^\d{1,6}$/.test(text)?Math.min(Number(text),999999):0;}catch(_){return 0;}}
  let localCount=getCount();
  function paintCount(){if(!localCount)return;$('localCount').hidden=false;$('localCount').textContent=localCount+' PDF '+(localCount===1?'creado':'creados')+' en este navegador · contador local';}
  function increaseCount(){localCount=Math.min(localCount+1,999999);try{root.localStorage.setItem(COUNT_KEY,String(localCount));}catch(_){}paintCount();}
  const font=(ctx,size,weight=400)=>{ctx.font=weight+' '+size+'px Arial, "Helvetica Neue", sans-serif';};
  function wrapText(ctx,text,maxWidth,maxLines=10){
    const characters=Array.from(text),lines=[];let line='';for(const character of characters){if(line&&ctx.measureText(line+character).width>maxWidth){lines.push(line.trim());line=character.trimStart();}else line+=character;}if(line)lines.push(line.trim());
    if(lines.length<=maxLines)return lines;const result=lines.slice(0,maxLines);let last=result[maxLines-1];while(last&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);result[maxLines-1]=last+'…';return result;
  }
  function rounded(ctx,x,y,width,height,radius,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,width,height,radius);ctx.fill();}
  function text(ctx,value,x,y,size,color,weight=400){font(ctx,size,weight);ctx.fillStyle=color;ctx.fillText(value,x,y);}
  function drawProposal(data,height=970){
    const canvas=document.createElement('canvas'),width=720,scale=2;canvas.width=width*scale;canvas.height=height*scale;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Tu navegador no pudo crear la imagen del PDF.');ctx.scale(scale,scale);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#ffe600';ctx.fillRect(0,0,width,12);
    const navy='#082f49',muted='#728c9c';ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=navy;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(44,63);ctx.lineTo(54,53);ctx.bezierCurveTo(68,39,83,60,68,73);ctx.lineTo(62,79);ctx.moveTo(79,54);ctx.lineTo(70,64);ctx.bezierCurveTo(56,78,41,57,56,44);ctx.stroke();text(ctx,'Meli',94,54,14,navy);text(ctx,'Propuestas',94,73,17,navy,700);rounded(ctx,576,42,101,29,7,'#f1f6f8');text(ctx,'PROPUESTA',591,62,10,'#8096a3',700);
    const margin=44,right=676;ctx.strokeStyle='#e5edf2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,99);ctx.lineTo(right,99);ctx.stroke();font(ctx,14,700);const adviserLines=wrapText(ctx,data.adviser,632,2);adviserLines.forEach((line,index)=>text(ctx,line,margin,125+index*18,14,'#35596e',700));let headerEnd=125+(adviserLines.length-1)*18+17;if(data.contact){font(ctx,12);const contactLines=wrapText(ctx,data.contact,632,2);contactLines.forEach((line,index)=>text(ctx,line,margin,headerEnd+index*17,12,'#668293'));headerEnd+=contactLines.length*17;}headerEnd+=10;ctx.beginPath();ctx.moveTo(margin,headerEnd);ctx.lineTo(right,headerEnd);ctx.stroke();
    text(ctx,'PENSADA PARA TU NEGOCIO',margin,headerEnd+42,11,'#809caa',700);let businessSize=43;font(ctx,businessSize,700);while(wrapText(ctx,data.business,632).length>3&&businessSize>28)font(ctx,--businessSize,700);const businessLines=wrapText(ctx,data.business,632,3),businessHeight=Math.ceil(businessSize*1.1),businessY=headerEnd+93;businessLines.forEach((line,index)=>text(ctx,line,margin,businessY+index*businessHeight,businessSize,navy,700));let y=businessY+(businessLines.length-1)*businessHeight+32;font(ctx,17);const benefitLines=wrapText(ctx,data.benefit,590,4);benefitLines.forEach((line,index)=>text(ctx,line,margin,y+index*26,17,muted));y+=benefitLines.length*26+28;
    const cardHeight=258;rounded(ctx,margin,y,632,cardHeight,22,'#ffe600');text(ctx,TABLE.METHODS[data.paymentMethod].toUpperCase()+' · MERCADO PAGO',margin+31,y+38,11,'#496035',700);text(ctx,'✦',right-51,y+43,29,'#173f3b',500);
    const rate=formatRate(data.rate);font(ctx,110,700);const rateWidth=ctx.measureText(rate).width;text(ctx,rate,margin+29,y+158,110,navy,700);text(ctx,'%',margin+rateWidth+43,y+156,45,navy,700);text(ctx,TAX_SCOPES[data.taxScope],margin+31,y+211,15,'#426443');
    text(ctx,'Acreditación: '+data.settlement,margin+31,y+237,11,'#426443');
    const bottom=y+cardHeight+37;rounded(ctx,margin,bottom-1,39,39,20,'#e9f8f8');text(ctx,'✓',margin+12,bottom+25,20,'#138b92',700);text(ctx,'Una buena conversación',margin+56,bottom+13,13,muted);text(ctx,'empieza con una propuesta clara.',margin+56,bottom+35,14,'#355e75',700);
    const footerY=Math.max(bottom+74,875);if(footerY+64>height)return drawProposal(data,Math.ceil(footerY+64));ctx.fillStyle='#f8fafb';ctx.fillRect(0,footerY,width,height-footerY);ctx.strokeStyle='#edf2f5';ctx.beginPath();ctx.moveTo(0,footerY);ctx.lineTo(width,footerY);ctx.stroke();text(ctx,'Condiciones informadas por el asesor.',margin,footerY+30,10,'#8b9eaa');text(ctx,'Alcance y vigencia según el detalle de la propuesta.',margin,footerY+47,10,'#8b9eaa');ctx.textAlign='right';text(ctx,'by Martin Yu',right,footerY+45,11,'#8fa3af');ctx.textAlign='left';return canvas;
  }
  function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar el archivo. Probá otra vez.')),'image/jpeg',0.95));}
  async function download(data){
    if(document.fonts?.ready)await document.fonts.ready;const canvas=drawProposal(data),jpeg=new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()),bytes=root.PublicDemoPDF.imagePDF(jpeg,canvas.width,canvas.height),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='propuesta-comercial.pdf';link.hidden=true;document.body.append(link);try{link.click();}finally{link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),30000);}return blob;
  }
  let busy=false;
  async function submit(event){
    event.preventDefault();if(busy)return;const result=preview();reportErrors(result.errors);const status=$('formStatus');status.dataset.error='false';if(!result.valid){status.dataset.error='true';status.textContent='Revisá los campos señalados para crear tu PDF.';$(FORM_FIELDS.find(key=>result.errors[key])).focus();return;}
    busy=true;$('downloadButton').disabled=true;status.textContent='Preparando tu propuesta…';try{await download(result.data);increaseCount();status.textContent='PDF generado. La descarga está lista en tu navegador.';$('downloadSuccess').hidden=false;}catch(_){status.dataset.error='true';status.textContent='No pudimos generar el PDF. Probá otra vez o usá un navegador actualizado.';}finally{busy=false;$('downloadButton').disabled=false;}
  }
  function init(){initTable();for(const key of FORM_FIELDS)$(key).addEventListener('input',()=>{preview();$('downloadSuccess').hidden=true;$('formStatus').textContent='';if(['rate','settlement','taxScope'].includes(key))$('rateOriginHint').textContent='Condiciones cargadas en esta propuesta. Tu tabla guardada se conserva.';if($(key).getAttribute('aria-invalid')==='true')reportErrors(validate(read()).errors);});$('demoForm').addEventListener('submit',submit);preview();paintCount();$('downloadButton').disabled=false;}
  root.PublicDemo=Object.freeze({parseRate,formatRate,validate,wrapText});init();
})(window);
