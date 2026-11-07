/* A single adviser-owned Mercado Pago table. No operational rates are bundled. */
(function(root){
  'use strict';
  const KEY='meli-propuestas-local-rates-v1',MAX_BYTES=32768;
  const CATEGORIES=Object.freeze(['c1','c2','c3','c4','c5','c6']);
  const METHODS=Object.freeze({debit:'Débito',prepaid:'Tarjeta prepaga',credit:'Crédito en un pago',qr:'QR'});
  const LEGACY_METHODS=Object.freeze(['debit','credit','prepaid']);
  const SCOPES=Object.freeze({base:'No incluye IVA ni IIBB',iva:'Incluye IVA; no incluye IIBB',total:'Incluye IVA e IIBB'});
  const clean=value=>String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
  function parseRate(value){const text=String(value??'').trim();if(!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(text))return null;const number=Number(text.replace(',','.'));return number>=0&&number<=100?number:null;}
  function blank(){return {version:2,provider:'mercado-pago',taxScope:'',categories:Object.fromEntries(CATEGORIES.map(category=>[category,Object.fromEntries(Object.keys(METHODS).map(method=>[method,{rate:null,term:''}]))]))};}
  function validate(input,{requireAny=true}={}){
    if(!keys(input,['version','provider','taxScope','categories'])||![1,2].includes(input.version)||input.provider!=='mercado-pago'||!keys(input.categories,CATEGORIES))throw Error('El archivo no tiene el formato de la tabla de Mercado Pago.');
    if(typeof input.taxScope!=='string'||input.taxScope!==''&&!Object.hasOwn(SCOPES,input.taxScope))throw Error('Revisá qué impuestos incluyen las tasas de la tabla.');
    // Recover existing three-medium tables in memory; only an explicit save writes v2.
    const methods=input.version===1?LEGACY_METHODS:Object.keys(METHODS);
    const result=blank();result.taxScope=input.taxScope;let count=0;
    for(const category of CATEGORIES){
      if(!keys(input.categories[category],methods))throw Error('La tabla debe contener las seis categorías y sus medios de cobro.');
      for(const method of methods){
        const cell=input.categories[category][method],label='Cat. '+category.slice(1)+' · '+METHODS[method];
        if(!keys(cell,['rate','term'])||typeof cell.term!=='string')throw Error('Revisá la condición de '+label+'.');
        const term=clean(cell.term);if(term.length>40)throw Error('El plazo de '+label+' admite hasta 40 caracteres.');
        if(cell.rate===null){if(term)throw Error('Completá la tasa de '+label+' o dejá ambos campos vacíos.');continue;}
        if(typeof cell.rate!=='number'||!Number.isFinite(cell.rate)||cell.rate<0||cell.rate>100||Math.abs(cell.rate*100-Math.round(cell.rate*100))>1e-7)throw Error('La tasa de '+label+' debe estar entre 0 y 100, con hasta dos decimales.');
        if(!term)throw Error('Completá el plazo de acreditación de '+label+'.');
        result.categories[category][method]={rate:cell.rate,term};count++;
      }
    }
    if(requireAny&&!count)throw Error('Completá al menos una tasa y su plazo para guardar la tabla.');
    if(count&&!Object.hasOwn(SCOPES,input.taxScope))throw Error('Indicá qué impuestos incluyen las tasas de la tabla.');
    return result;
  }
  function getCondition(table,category,method){
    if(!CATEGORIES.includes(category)||typeof method!=='string'||!Object.hasOwn(METHODS,method)||typeof table?.taxScope!=='string'||!Object.hasOwn(SCOPES,table.taxScope))return null;
    const cell=table?.categories?.[category]?.[method];
    return cell&&typeof cell.rate==='number'&&Number.isFinite(cell.rate)&&typeof cell.term==='string'&&cell.term?{rate:cell.rate,term:cell.term,taxScope:table.taxScope}:null;
  }
  function load(storage){
    let raw;try{raw=storage.getItem(KEY);}catch(_){return {table:blank(),status:'unavailable'};}
    if(raw===null)return {table:blank(),status:'empty'};
    if(typeof raw!=='string'||raw.length>MAX_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BYTES)return {table:blank(),status:'invalid'};
    try{return {table:validate(JSON.parse(raw)),status:'saved'};}catch(_){return {table:blank(),status:'invalid'};}
  }
  function serialize(input){return JSON.stringify(validate(input),null,2);}
  function parseFile(text){if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_BYTES)throw Error('El archivo debe ser un respaldo de tabla de hasta 32 KB.');let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch(_){throw Error('No pudimos leer el archivo JSON. Elegí un respaldo exportado por esta herramienta.');}return validate(input);}
  function save(storage,input){const table=validate(input);try{storage.setItem(KEY,JSON.stringify(table));}catch(_){throw Error('El navegador no permitió guardar la tabla. Podés descargar un respaldo y seguir armando tu propuesta.');}return table;}
  root.PublicRateTable=Object.freeze({KEY,MAX_BYTES,CATEGORIES,METHODS,SCOPES,clean,parseRate,blank,validate,getCondition,load,serialize,parseFile,save});
})(window);
