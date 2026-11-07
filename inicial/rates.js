/* Adviser-owned base conditions and additional financing. No operational defaults are stored here. */
(function(root){
  'use strict';
  const KEY='meli-propuestas-local-rates-v1',MAX_BYTES=32768;
  const CATEGORIES=Object.freeze(['c1','c2','c3','c4','c5','c6']);
  const METHODS=Object.freeze({debit:'Débito',prepaid:'Tarjeta prepaga',credit:'Crédito en un pago',qr:'QR'});
  const ROUNDS=Object.freeze(['lt','r1','r2','r3','r4','r5']);
  const INSTALLMENTS=Object.freeze([2,3,6,9,12,18]);
  const LEGACY_METHODS=Object.freeze(['debit','credit','prepaid']);
  const LEGACY_SCOPES=Object.freeze(['','base','iva','total']);
  const clean=value=>String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
  const fixed=value=>Number(value.toFixed(8));
  const validRate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100&&fixed(value)===value;
  const legacyRate=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100&&Math.abs(value*100-Math.round(value*100))<=1e-7;
  function parseRate(value){const text=String(value??'').trim();if(!/^\d{1,3}(?:[.,]\d{1,8})?$/.test(text))return null;const number=Number(text.replace(',','.'));return number>=0&&number<=100?number:null;}
  function blank(){
    return {version:3,provider:'mercado-pago',basis:'base',categories:Object.fromEntries(CATEGORIES.map(category=>[category,Object.fromEntries(Object.keys(METHODS).map(method=>[method,{rate:null,term:''}]))])),financing:Object.fromEntries(ROUNDS.map(round=>[round,Object.fromEntries(INSTALLMENTS.map(count=>[String(count),null]))]))};
  }
  function reviewError(){
    const error=Error('Ese respaldo incluye IVA e IIBB sin separar sus importes. Conservá el original y revisá o reemplazá sus tasas base antes de usarlo en la nueva propuesta.');
    error.code='LEGACY_IIBB_REVIEW';return error;
  }
  function validate(input,{requireAny=true}={}){
    if(!object(input)||![1,2,3].includes(input.version))throw Error('El archivo no tiene el formato de una tabla de Mercado Pago compatible.');
    const legacy=input.version<3,top=legacy?['version','provider','taxScope','categories']:['version','provider','basis','categories','financing'];
    if(!keys(input,top)||input.provider!=='mercado-pago'||!keys(input.categories,CATEGORIES))throw Error('El archivo no tiene el formato de la tabla de Mercado Pago.');
    if(legacy?(typeof input.taxScope!=='string'||!LEGACY_SCOPES.includes(input.taxScope)):input.basis!=='base')throw Error('Las tasas de la tabla deben estar identificadas como base sin IVA.');
    const methods=input.version===1?LEGACY_METHODS:Object.keys(METHODS),result=blank();let count=0;
    for(const category of CATEGORIES){
      if(!keys(input.categories[category],methods))throw Error('La tabla debe contener sus categorías y medios de cobro completos.');
      for(const method of methods){
        const cell=input.categories[category][method],label='Cat. '+category.slice(1)+' · '+METHODS[method];
        if(!keys(cell,['rate','term'])||typeof cell.term!=='string')throw Error('Revisá la condición de '+label+'.');
        const term=clean(cell.term);if(term.length>40)throw Error('El plazo de '+label+' admite hasta 40 caracteres.');
        if(cell.rate===null){if(term)throw Error('Completá la tasa de '+label+' o dejá ambos campos vacíos.');continue;}
        if(!(legacy?legacyRate(cell.rate):validRate(cell.rate)))throw Error('La tasa de '+label+' debe estar entre 0 y 100 con una precisión válida.');
        if(!term)throw Error('Completá el plazo de acreditación de '+label+'.');
        const rate=legacy?fixed(input.taxScope==='iva'?cell.rate/1.21:cell.rate):cell.rate;
        result.categories[category][method]={rate,term};count++;
      }
    }
    if(legacy){
      if(count&&input.taxScope==='')throw Error('El respaldo anterior no indica qué impuestos incluyen sus tasas.');
      if(count&&input.taxScope==='total')throw reviewError();
    }else{
      if(!keys(input.financing,ROUNDS))throw Error('La tabla debe contener los seis rounds de financiación.');
      for(const round of ROUNDS){
        if(!keys(input.financing[round],INSTALLMENTS.map(String)))throw Error('Cada round debe contener las seis opciones de cuotas.');
        for(const installment of INSTALLMENTS){
          const value=input.financing[round][String(installment)];
          if(value===null)continue;
          if(!validRate(value))throw Error('La financiación adicional debe estar entre 0 y 100 con una precisión válida.');
          result.financing[round][String(installment)]=value;count++;
        }
      }
    }
    if(requireAny&&!count)throw Error('Completá al menos una condición o una tasa de financiación para guardar tu tabla.');
    return result;
  }
  function getCondition(table,category,method){
    if(table?.version!==3||table.basis!=='base'||!CATEGORIES.includes(category)||typeof method!=='string'||!Object.hasOwn(METHODS,method))return null;
    const cell=table.categories?.[category]?.[method];
    return cell&&validRate(cell.rate)&&typeof cell.term==='string'&&cell.term&&cell.term.length<=40?{rate:cell.rate,term:cell.term,basis:'base'}:null;
  }
  function getFinancing(table,round){
    if(table?.version!==3||table.basis!=='base'||typeof round!=='string'||!ROUNDS.includes(round))return [];
    return INSTALLMENTS.map(count=>{const value=table.financing?.[round]?.[String(count)];return {count,additional:validRate(value)?value:null};});
  }
  function load(storage){
    let raw;try{raw=storage.getItem(KEY);}catch(_){return {table:blank(),status:'unavailable'};}
    if(raw===null)return {table:blank(),status:'empty'};
    if(typeof raw!=='string'||raw.length>MAX_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BYTES)return {table:blank(),status:'invalid'};
    try{return {table:validate(JSON.parse(raw)),status:'saved'};}
    catch(error){return {table:blank(),status:error?.code==='LEGACY_IIBB_REVIEW'?'needsReview':'invalid'};}
  }
  function serialize(input){return JSON.stringify(validate(input),null,2);}
  function parseFile(text){
    if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES)throw Error('El archivo debe ser un respaldo de tabla de hasta 32 KB.');
    let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch(_){throw Error('No pudimos leer el archivo JSON. Elegí un respaldo exportado por esta herramienta.');}
    return validate(input);
  }
  function save(storage,input){
    const table=validate(input);
    try{storage.setItem(KEY,JSON.stringify(table));}catch(_){throw Error('El navegador no permitió guardar la tabla. Podés descargar un respaldo y seguir armando tu propuesta.');}
    return table;
  }
  root.PublicRateTable=Object.freeze({KEY,MAX_BYTES,CATEGORIES,METHODS,ROUNDS,INSTALLMENTS,BASIS:'base',clean,parseRate,blank,validate,getCondition,getFinancing,load,serialize,parseFile,save});
})(window);
