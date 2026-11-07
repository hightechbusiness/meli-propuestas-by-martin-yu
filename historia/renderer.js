/* Procedural scene: all geometry, textures and motion are rendered locally. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const smooth = (from, to, value) => {
    const amount = clamp((value - from) / (to - from));
    return amount * amount * (3 - 2 * amount);
  };
  const pointMix = (a, b, amount) => ({x:mix(a.x,b.x,amount),y:mix(a.y,b.y,amount),z:mix(a.z,b.z,amount)});
  const random = index => {
    const value = Math.sin(index * 127.17 + 23.87) * 43758.5453;
    return value - Math.floor(value);
  };

  function roundedPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);ctx.quadraticCurveTo(x+width,y,x+width,y+r);
    ctx.lineTo(x+width,y+height-r);ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
    ctx.lineTo(x+r,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  function polygon(ctx, points) {
    ctx.beginPath();
    points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
    ctx.closePath();
  }

  function rotate(point, pose) {
    let {x,y,z} = point;
    let cosine = Math.cos(pose.rx || 0), sine = Math.sin(pose.rx || 0);
    [y,z]=[y*cosine-z*sine,y*sine+z*cosine];
    cosine=Math.cos(pose.ry||0);sine=Math.sin(pose.ry||0);
    [x,z]=[x*cosine+z*sine,-x*sine+z*cosine];
    cosine=Math.cos(pose.rz||0);sine=Math.sin(pose.rz||0);
    [x,y]=[x*cosine-y*sine,x*sine+y*cosine];
    const scale=pose.scale===undefined?1:pose.scale;
    return {x:x*scale+(pose.x||0),y:y*scale+(pose.y||0),z:z*scale+(pose.z||0)};
  }

  function curve(a,b,c,d,t) {
    const inverse=1-t;
    return {
      x:inverse*inverse*inverse*a.x+3*inverse*inverse*t*b.x+3*inverse*t*t*c.x+t*t*t*d.x,
      y:inverse*inverse*inverse*a.y+3*inverse*inverse*t*b.y+3*inverse*t*t*c.y+t*t*t*d.y,
      z:inverse*inverse*inverse*a.z+3*inverse*inverse*t*b.z+3*inverse*t*t*c.z+t*t*t*d.z
    };
  }

  const WATER_PATH = [
    [{x:2.5,y:3.9,z:-.7},{x:1.1,y:3.8,z:-1.1},{x:-1.8,y:2.8,z:-.4},{x:-1.6,y:2,z:.1}],
    [{x:-1.6,y:2,z:.1},{x:-2.6,y:.7,z:.6},{x:-1.2,y:-2.3,z:1.2},{x:.9,y:-1.5,z:1}],
    [{x:.9,y:-1.5,z:1},{x:2.4,y:-.6,z:.5},{x:1.7,y:1.8,z:-.5},{x:-.6,y:1.5,z:-.5}],
    [{x:-.6,y:1.5,z:-.5},{x:-2,y:1,z:-.1},{x:-1.2,y:.1,z:1.2},{x:0,y:.55,z:.38}]
  ];

  function waterPoint(position, time, still) {
    const normalized=clamp(position);
    const segment=Math.min(3,Math.floor(normalized*4));
    const local=normalized===1?1:normalized*4-segment;
    const points=WATER_PATH[segment];
    const point=curve(points[0],points[1],points[2],points[3],local);
    const envelope=Math.sin(normalized*Math.PI);
    const motion=still?0:Math.sin(normalized*12-time*.52)*.046+Math.sin(normalized*25-time*.31)*.012;
    point.x+=motion*envelope;
    point.y+=(still?0:Math.cos(normalized*10-time*.43)*.023)*envelope;
    point.z+=(still?0:Math.cos(normalized*15-time*.38)*.047)*envelope;
    return point;
  }

  function outline(width,height,radius,z) {
    const corners=[
      {x:width/2-radius,y:height/2-radius,start:Math.PI/2,end:0},
      {x:width/2-radius,y:-height/2+radius,start:0,end:-Math.PI/2},
      {x:-width/2+radius,y:-height/2+radius,start:-Math.PI/2,end:-Math.PI},
      {x:-width/2+radius,y:height/2-radius,start:Math.PI,end:Math.PI/2}
    ];
    const points=[];
    corners.forEach(corner=>{
      for(let index=0;index<=5;index++){
        const angle=mix(corner.start,corner.end,index/5);
        points.push({x:corner.x+Math.cos(angle)*radius,y:corner.y+Math.sin(angle)*radius,z});
      }
    });
    return points;
  }

  class AcuerdoRenderer {
    constructor(canvas, logoImage, pointImage) {
      this.canvas=canvas;
      this.ctx=canvas.getContext('2d',{alpha:true});
      this.logo=logoImage;
      this.pointImage=pointImage;
      this.pointTexture=document.createElement('canvas');
      this.pointTexture.width=1;this.pointTexture.height=1;
      this.pointReady=false;this.pointAspect=.42;
      this.cardTexture=document.createElement('canvas');
      this.cardTexture.width=660;this.cardTexture.height=420;
      this.width=1;this.height=1;this.dpr=1;
      this.deviceTexture=document.createElement('canvas');
      this.deviceTexture.width=480;this.deviceTexture.height=760;
      this.paperTexture=document.createElement('canvas');
      this.paperTexture.width=520;this.paperTexture.height=720;
      this.textureKey='';
      this.logoReady=false;
      this.buildPaperTexture();
      this.buildDeviceTexture(0,0);
      this.buildDemoCard();
    }

    resize(width,height,dpr=1) {
      this.width=Math.max(1,width);this.height=Math.max(1,height);this.dpr=Math.max(1,dpr);
      this.canvas.width=Math.round(this.width*this.dpr);
      this.canvas.height=Math.round(this.height*this.dpr);
      this.canvas.style.width=`${this.width}px`;this.canvas.style.height=`${this.height}px`;
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    }

    logoIsReady() {
      return Boolean(this.logo&&(this.logo.naturalWidth||this.logo.width)&&this.logo.complete!==false);
    }

    drawLogo(ctx,x,y,width,height) {
      if(this.logoIsReady()){
        const ratio=(this.logo.naturalWidth||this.logo.width)/(this.logo.naturalHeight||this.logo.height);
        const drawnWidth=Math.min(width,height*ratio),drawnHeight=drawnWidth/ratio;
        ctx.drawImage(this.logo,x+(width-drawnWidth)/2,y+(height-drawnHeight)/2,drawnWidth,drawnHeight);
      } else {
        ctx.fillStyle='#153a74';ctx.font='700 21px Arial, sans-serif';ctx.textAlign='center';
        ctx.fillText('mercado pago',x+width/2,y+height*.65);ctx.textAlign='left';
      }
    }

    buildDeviceTexture(power, reflection) {
      const ctx=this.deviceTexture.getContext('2d');
      ctx.clearRect(0,0,480,760);
      roundedPath(ctx,0,0,480,760,57);
      const body=ctx.createLinearGradient(0,0,480,760);
      body.addColorStop(0,'#f9fbf8');body.addColorStop(.3,'#dce6e3');body.addColorStop(.58,'#f2f5ef');body.addColorStop(1,'#bccac9');
      ctx.fillStyle=body;ctx.fill();
      ctx.strokeStyle='#ffffffc9';ctx.lineWidth=4;ctx.stroke();
      roundedPath(ctx,23,24,434,560,39);
      const glass=ctx.createLinearGradient(28,30,450,570);
      glass.addColorStop(0,'#112e37');glass.addColorStop(.46,`rgb(${Math.round(8+power*10)},${Math.round(24+power*31)},${Math.round(30+power*27)})`);glass.addColorStop(1,'#071c24');
      ctx.fillStyle=glass;ctx.fill();ctx.strokeStyle='#33545c';ctx.lineWidth=2;ctx.stroke();
      ctx.save();roundedPath(ctx,23,24,434,560,39);ctx.clip();
      const screenGlow=ctx.createRadialGradient(240,305,15,240,305,320);
      screenGlow.addColorStop(0,`rgba(86,219,198,${power*.22})`);screenGlow.addColorStop(1,'rgba(12,37,45,0)');
      ctx.fillStyle=screenGlow;ctx.fillRect(23,24,434,560);
      ctx.globalAlpha=.83+power*.17;
      roundedPath(ctx,126,77,228,86,17);ctx.fillStyle='#fffef8';ctx.fill();
      this.drawLogo(ctx,146,91,188,58);
      ctx.globalAlpha=.28+power*.72;
      ctx.font='500 11px Arial, sans-serif';ctx.fillStyle='#92bec3';ctx.textAlign='center';
      ctx.fillText('IDEAS EN MOVIMIENTO',240,215);
      ctx.fillStyle='#f4f7e9';ctx.font='500 38px Arial, sans-serif';
      ctx.fillText('Todo empieza',240,272);ctx.fillText('con una idea.',240,316);
      ctx.strokeStyle=`rgba(215,245,181,${.3+power*.7})`;ctx.lineWidth=3;ctx.lineCap='round';
      for(let index=0;index<3;index++){
        ctx.beginPath();ctx.arc(240,417,17+index*15,-Math.PI*.79,-Math.PI*.21);ctx.stroke();
      }
      ctx.fillStyle='#cfed80';ctx.beginPath();ctx.arc(240,418,5,0,TAU);ctx.fill();
      ctx.font='500 10px Arial, sans-serif';ctx.fillStyle='#9cbdba';ctx.fillText('CONEXIONES QUE TOMAN FORMA',240,503);
      ctx.globalAlpha=1;
      const sweep=ctx.createLinearGradient(-160+reflection*780,0,80+reflection*780,0);
      sweep.addColorStop(0,'#ffffff00');sweep.addColorStop(.5,`rgba(255,255,255,${.08+power*.07})`);sweep.addColorStop(1,'#ffffff00');
      ctx.translate(0,0);ctx.fillStyle=sweep;ctx.fillRect(23,24,434,560);
      ctx.restore();
      ctx.textAlign='center';
      ctx.fillStyle='#718b8a';ctx.font='500 11px Arial, sans-serif';ctx.fillText('UNA NUEVA CONEXIÓN',240,633);
      roundedPath(ctx,93,662,294,56,26);
      const button=ctx.createLinearGradient(0,662,0,718);button.addColorStop(0,'#f9fbf5');button.addColorStop(1,'#ced9d3');
      ctx.fillStyle=button;ctx.fill();ctx.strokeStyle='#9fb2ae';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='#42625f';ctx.font='500 11px Arial, sans-serif';ctx.fillText('MELI PROPUESTAS',240,696);
      ctx.fillStyle='#8a9e99';for(let index=0;index<7;index++){roundedPath(ctx,192+index*14,739,6,3,1.5);ctx.fill();}
      ctx.textAlign='left';
    }

    buildPaperTexture() {
      const ctx=this.paperTexture.getContext('2d');
      ctx.clearRect(0,0,520,720);
      roundedPath(ctx,0,0,520,720,17);ctx.fillStyle='#f9fbf3';ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=3;ctx.stroke();
      this.drawLogo(ctx,38,31,172,69);
      ctx.font='500 9px Arial, sans-serif';ctx.textAlign='right';ctx.fillStyle='#648383';
      ctx.fillText('PROPUESTA',478,54);ctx.fillText('COMERCIAL',478,69);ctx.textAlign='left';
      ctx.fillStyle='#ffe600';ctx.fillRect(39,121,442,5);
      ctx.fillStyle='#e2ebe1';ctx.beginPath();ctx.arc(61,174,23,0,TAU);ctx.fill();
      ctx.fillStyle='#3d736e';ctx.font='500 24px Arial, sans-serif';ctx.fillText('↗',49,183);
      ctx.fillStyle='#183f42';ctx.font='600 15px Arial, sans-serif';ctx.fillText('Tu nombre',101,170);
      ctx.fillStyle='#7c9290';ctx.font='500 10px Arial, sans-serif';ctx.fillText('Tus datos de contacto',101,189);
      ctx.fillStyle='#558c81';ctx.font='500 9px Arial, sans-serif';ctx.fillText('PENSADA PARA TU NEGOCIO',39,255);
      ctx.fillStyle='#153f42';ctx.font='500 49px Arial, sans-serif';ctx.fillText('Tu próxima',36,318);ctx.fillText('propuesta.',36,370);
      ctx.font='500 13px Arial, sans-serif';ctx.fillStyle='#758f88';ctx.fillText('Una idea que se convierte en posibilidades.',39,405);
      const methods=['Débito','Crédito','QR'];
      methods.forEach((method,index)=>{
        const x=39+index*151;
        roundedPath(ctx,x,443,140,112,9);ctx.fillStyle=index===2?'#e4eed3':'#e8f0e4';ctx.fill();
        ctx.fillStyle='#2a5552';ctx.font='600 12px Arial, sans-serif';ctx.fillText(method,x+13,470);
        ctx.font='500 14px Arial, sans-serif';ctx.fillText('↗',x+111,470);
        ctx.fillStyle='#b8cebc';roundedPath(ctx,x+13,492,86,5,2);ctx.fill();
        ctx.fillStyle='#ccdbca';roundedPath(ctx,x+13,509,62,4,2);ctx.fill();
        roundedPath(ctx,x+13,523,94,4,2);ctx.fill();
      });
      ctx.strokeStyle='#d5e1d3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(39,591);ctx.lineTo(481,591);ctx.stroke();
      ctx.fillStyle='#728e83';ctx.font='500 10px Arial, sans-serif';ctx.fillText('Validez a tu medida',39,615);
      ctx.textAlign='right';ctx.fillStyle='#365f56';ctx.fillText('ES',481,615);ctx.textAlign='left';
      ctx.fillStyle='#39786b';ctx.font='500 11px Arial, sans-serif';ctx.fillText('✓  Lista para compartir',39,662);
      roundedPath(ctx,436,641,45,29,5);ctx.fillStyle='#ffe600';ctx.fill();ctx.fillStyle='#204545';ctx.font='600 9px Arial, sans-serif';ctx.fillText('PDF',449,659);
      ctx.textAlign='center';ctx.font='500 8px Arial, sans-serif';ctx.fillStyle='#a0b1a4';ctx.fillText('Martin Yu',260,699);ctx.textAlign='left';
    }

    buildDemoCard() {
      const ctx=this.cardTexture.getContext('2d');
      roundedPath(ctx,0,0,660,420,33);
      const gradient=ctx.createLinearGradient(0,0,660,420);
      gradient.addColorStop(0,'#154f51');gradient.addColorStop(.45,'#0c353e');gradient.addColorStop(1,'#112d3e');
      ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#8ee4d680';ctx.lineWidth=2;ctx.stroke();
      ctx.save();roundedPath(ctx,0,0,660,420,33);ctx.clip();
      const glow=ctx.createRadialGradient(550,55,5,550,55,450);glow.addColorStop(0,'#75d0ad4d');glow.addColorStop(1,'#76d1ad00');ctx.fillStyle=glow;ctx.fillRect(0,0,660,420);
      ctx.strokeStyle='#90dbca24';ctx.lineWidth=1;
      for(let index=0;index<5;index++){ctx.beginPath();ctx.arc(560,5,120+index*45,0,TAU);ctx.stroke();}ctx.restore();
      ctx.fillStyle='#dcf0cb';ctx.font='500 28px Arial, sans-serif';ctx.fillText('TU NEGOCIO',45,65);
      ctx.font='500 11px Arial, sans-serif';ctx.fillStyle='#9ac2bb';ctx.fillText('MÁS FORMAS DE CONECTAR',45,92);
      roundedPath(ctx,47,143,88,68,10);const chip=ctx.createLinearGradient(47,143,135,211);chip.addColorStop(0,'#e1d2a0');chip.addColorStop(1,'#afac85');ctx.fillStyle=chip;ctx.fill();
      ctx.strokeStyle='#727c5f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(76,143);ctx.lineTo(76,211);ctx.moveTo(106,143);ctx.lineTo(106,211);ctx.moveTo(47,166);ctx.lineTo(135,166);ctx.moveTo(47,188);ctx.lineTo(135,188);ctx.stroke();
      ctx.strokeStyle='#b8d9cb';ctx.lineWidth=3;ctx.lineCap='round';
      for(let index=0;index<3;index++){ctx.beginPath();ctx.arc(170,177,11+index*10,-Math.PI*.33,Math.PI*.33);ctx.stroke();}
      ctx.font='500 28px Arial, sans-serif';ctx.fillStyle='#daeae0';ctx.fillText('••••  ••••  ••••  0000',45,291);
      ctx.font='500 11px Arial, sans-serif';ctx.fillStyle='#9ebeb7';ctx.fillText('VISTA ILUSTRATIVA',45,357);
      ctx.font='500 11px Arial, sans-serif';ctx.textAlign='right';ctx.fillStyle='#dbe8b7';ctx.fillText('MELI PROPUESTAS',615,357);ctx.textAlign='left';
    }

    preparePointTexture() {
      const image=this.pointImage;
      if(!image||(image.complete===false)||!(image.naturalWidth||image.width))return false;
      const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
      const temporary=document.createElement('canvas');temporary.width=width;temporary.height=height;
      const ctx=temporary.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      let left=0,top=0,right=width,bottom=height;
      try{
        const pixels=ctx.getImageData(0,0,width,height).data;
        const rowCounts=new Uint32Array(height),columnCounts=new Uint32Array(width);
        let minX=width,minY=height,maxX=-1,maxY=-1;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          if(pixels[(y*width+x)*4+3]>32){rowCounts[y]++;columnCounts[x]++;}
        }
        const rowMinimum=Math.max(8,Math.round(width*.008)),columnMinimum=Math.max(8,Math.round(height*.008));
        for(let y=0;y<height;y++)if(rowCounts[y]>=rowMinimum){if(y<minY)minY=y;if(y>maxY)maxY=y;}
        for(let x=0;x<width;x++)if(columnCounts[x]>=columnMinimum){if(x<minX)minX=x;if(x>maxX)maxX=x;}
        if(maxX>=minX&&maxY>=minY){left=Math.max(0,minX-2);top=Math.max(0,minY-2);right=Math.min(width,maxX+3);bottom=Math.min(height,maxY+3);}
      }catch(error){/* A cross-origin source remains usable at its original bounds. */}
      this.pointTexture.width=right-left;this.pointTexture.height=bottom-top;
      this.pointTexture.getContext('2d').drawImage(image,left,top,right-left,bottom-top,0,0,right-left,bottom-top);
      this.pointAspect=(right-left)/(bottom-top);this.pointReady=true;
      this.pointBounds={left,top,right,bottom,sourceWidth:width,sourceHeight:height};
      return true;
    }

    drawPointPhoto(pose,alpha=1) {
      if(alpha<.005||!this.pointReady)return;
      const ctx=this.ctx,height=4.08,width=height*this.pointAspect;
      // One affine draw preserves the official photograph and its lettering.
      // The viewpoint is intentionally gentle; this is not a remodelled device.
      const topLeft=this.project(rotate({x:-width/2,y:height/2,z:0},pose));
      const topRight=this.project(rotate({x:width/2,y:height/2,z:0},pose));
      const bottomLeft=this.project(rotate({x:-width/2,y:-height/2,z:0},pose));
      ctx.save();ctx.globalAlpha=alpha;
      ctx.transform((topRight.x-topLeft.x)/this.pointTexture.width,(topRight.y-topLeft.y)/this.pointTexture.width,(bottomLeft.x-topLeft.x)/this.pointTexture.height,(bottomLeft.y-topLeft.y)/this.pointTexture.height,topLeft.x,topLeft.y);
      ctx.drawImage(this.pointTexture,0,0);ctx.restore();
    }

    drawAgreement(progress,pose) {
      const amount=smooth(.13,.2,progress)*(1-smooth(.25,.3,progress));
      if(amount<.01)return;
      const ctx=this.ctx,center=this.project(rotate({x:.66,y:-.92,z:.22},pose));
      const radius=this.scale*.55;
      ctx.save();ctx.translate(center.x,center.y);ctx.rotate(-.12);ctx.globalAlpha=amount;
      ctx.shadowColor='#bde8be';ctx.shadowBlur=this.mobile?4:10;
      ctx.fillStyle='#c9e8a9';ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='#244f48';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(0,0,radius*.87,0,TAU);ctx.stroke();
      ctx.strokeStyle='#244f48';ctx.lineWidth=Math.max(1.5,radius*.06);ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(-radius*.23,-radius*.28);ctx.lineTo(-radius*.04,-radius*.08);ctx.lineTo(radius*.31,-radius*.45);ctx.stroke();
      ctx.fillStyle='#244f48';ctx.font=`600 ${Math.max(4,radius*.16)}px Arial, sans-serif`;ctx.textAlign='center';
      ctx.fillText('PROPUESTA',0,radius*.24);ctx.fillText('ALINEADA',0,radius*.45);ctx.restore();
      const count=this.mobile?18:28;
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let index=0;index<count;index++){
        const seed=random(index+625),phase=smooth(.13+seed*.025,.235,progress);
        const a={x:(random(index+31)-.5)*4,y:(random(index+41)-.5)*4,z:.3+seed};
        const b={x:(random(index+51)-.5)*2.5,y:(random(index+61)-.5)*3.45,z:.08};
        const position=this.project(rotate(pointMix(a,b,phase),pose));
        ctx.globalAlpha=amount*(1-phase)*.8;ctx.fillStyle=index%2?'#f4e5aa':'#9fead7';ctx.beginPath();ctx.arc(position.x,position.y,this.mobile?1:1.4,0,TAU);ctx.fill();
      }ctx.restore();
    }

    drawNfc(progress,devicePose,cardPose,cardAlpha) {
      if(cardAlpha>.005){
        this.drawBody(2.05,1.305,.035,.11,cardPose,cardAlpha,true);
        this.mapTexture(this.cardTexture,2.05,1.305,.021,cardPose,cardAlpha);
      }
      const wave=smooth(.665,.71,progress)*(1-smooth(.81,.845,progress));
      if(wave<.01)return;
      const ctx=this.ctx,center=this.project(rotate({x:.49,y:.95,z:.25},devicePose));
      const phase=clamp((progress-.66)/.17);
      ctx.save();ctx.translate(center.x,center.y);ctx.rotate(-.12);
      const halo=ctx.createRadialGradient(0,0,1,0,0,this.scale*.52);
      halo.addColorStop(0,'#e1f5b94d');halo.addColorStop(1,'#81eadb00');ctx.fillStyle=halo;ctx.globalAlpha=wave;ctx.fillRect(-this.scale*.52,-this.scale*.52,this.scale*1.04,this.scale*1.04);
      for(let index=0;index<3;index++){
        const ripple=(phase*1.35+index/3)%1,radius=this.scale*(.11+ripple*.43);
        ctx.globalAlpha=wave*(1-ripple)*.72;ctx.strokeStyle=index%2?'#f3e6a6':'#9df2dc';ctx.lineWidth=this.mobile?1:1.5;
        ctx.beginPath();ctx.ellipse(0,0,radius*.72,radius,0,0,TAU);ctx.stroke();
      }ctx.restore();
    }

    drawSimulationSuccess(progress,devicePose) {
      const visible=smooth(.815,.855,progress)*(1-smooth(.935,.98,progress));
      if(visible<.01)return;
      const ctx=this.ctx,center=this.project(rotate({x:.02,y:.2,z:.5},devicePose));
      const radius=this.scale*.58;
      ctx.save();ctx.translate(center.x,center.y);ctx.globalAlpha=visible;
      const halo=ctx.createRadialGradient(0,0,radius*.3,0,0,radius*2.15);halo.addColorStop(0,'#bdefbf70');halo.addColorStop(.5,'#89ead530');halo.addColorStop(1,'#7cdecb00');
      ctx.fillStyle=halo;ctx.fillRect(-radius*2.2,-radius*2.2,radius*4.4,radius*4.4);
      ctx.fillStyle='#123f3ced';ctx.strokeStyle='#c7f3b6';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();ctx.stroke();
      const reveal=smooth(.825,.885,progress);
      const check=[{x:-.37*radius,y:0},{x:-.08*radius,y:.28*radius},{x:.4*radius,y:-.3*radius}];
      ctx.strokeStyle='#d8f9b8';ctx.lineWidth=Math.max(2.1,radius*.075);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(check[0].x,check[0].y);
      if(reveal<.38){const point=pointMix({...check[0],z:0},{...check[1],z:0},reveal/.38);ctx.lineTo(point.x,point.y);}else{ctx.lineTo(check[1].x,check[1].y);const point=pointMix({...check[1],z:0},{...check[2],z:0},(reveal-.38)/.62);ctx.lineTo(point.x,point.y);}ctx.stroke();
      ctx.font=`600 ${Math.max(4,radius*.14)}px Arial, sans-serif`;ctx.fillStyle='#cce3c8';ctx.textAlign='center';ctx.fillText('LISTO',0,radius*.65);ctx.restore();
    }

    originPose(progress,base) {
      const keys=[
        {at:0,x:.16,y:.02,z:-.35,rx:.11,ry:-.48,rz:-.09,scale:.88},
        {at:.23,x:.05,y:.02,z:-.08,rx:.025,ry:.2,rz:.035,scale:.96},
        {at:.39,x:.16,y:.015,z:-.12,rx:-.055,ry:1.2,rz:.09,scale:.93},
        {at:.56,x:-.07,y:.04,z:.04,rx:.075,ry:-.34,rz:-.025,scale:.93},
        {at:.78,x:-.08,y:.02,z:.22,rx:-.075,ry:.18,rz:.035,scale:1.015},
        {at:1,...base}
      ];
      let index=0;
      while(index<keys.length-2&&progress>keys[index+1].at)index++;
      const a=keys[index],b=keys[index+1],amount=smooth(a.at,b.at,progress);
      const pose={};
      for(const key of ['x','y','z','rx','ry','rz','scale'])pose[key]=mix(a[key],b[key],amount);
      return pose;
    }

    drawOriginBackdrop(progress,pose,blocked) {
      const ctx=this.ctx;
      const gathering=smooth(.46,.66,progress)*(1-smooth(.72,.86,progress));
      const sharing=smooth(.72,.86,progress)*(1-smooth(.94,1,progress));
      const center=this.project(rotate({x:0,y:.08,z:-.08},pose));
      const count=this.mobile?5:7;
      ctx.save();ctx.lineWidth=this.mobile?.7:1;
      for(let index=0;index<count;index++){
        const angle=index/count*TAU+.3;
        const radius=(1.73+random(index+121)*.4)*(1-gathering*.49+blocked*.28+sharing*.08);
        const float=this.still?0:Math.sin(this.time*.45+index)*.025;
        const local={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.95+float,z:-.3+Math.sin(angle)*.25};
        const projected=this.project(rotate(local,pose));
        const lineEnd={x:mix(center.x,projected.x,blocked*.87),y:mix(center.y,projected.y,blocked*.87)};
        ctx.globalAlpha=(.2+gathering*.2)*(1-blocked*.75)*(1-smooth(.92,1,progress));
        ctx.strokeStyle=index%2?'#c5dab0':'#8ad8ce';
        ctx.beginPath();ctx.moveTo(projected.x,projected.y);
        ctx.quadraticCurveTo(mix(projected.x,lineEnd.x,.5)+this.scale*.16,mix(projected.y,lineEnd.y,.5)-this.scale*.12,lineEnd.x,lineEnd.y);ctx.stroke();
        const nodeRadius=(this.mobile?2.2:3.3)*(1+gathering*.3);
        ctx.globalAlpha=(.55+gathering*.4)*(1-blocked*.66)*(1-smooth(.94,1,progress));
        ctx.fillStyle=index%2?'#e6e3af':'#a0e3d0';ctx.beginPath();ctx.arc(projected.x,projected.y,nodeRadius,0,TAU);ctx.fill();
        ctx.globalAlpha*=.17;ctx.beginPath();ctx.arc(projected.x,projected.y,nodeRadius*3,0,TAU);ctx.fill();
        if(!this.mobile&&index<3){
          ctx.globalAlpha=.48*(1-blocked)*(1-smooth(.7,.9,progress));
          ctx.font='500 8px Arial, sans-serif';ctx.fillStyle='#b1cebd';
          ctx.textAlign=projected.x<center.x?'right':'left';
          ctx.fillText(['Personas','Ideas','Equipo'][index],projected.x+(projected.x<center.x?-9:9),projected.y+3);
        }
      }
      ctx.restore();
      if(sharing>.01){
        const copies=this.mobile?1:2;
        for(let index=copies;index>=1;index--){
          const duplicate={...pose,x:pose.x-index*.2*sharing,y:pose.y+index*.08*sharing,z:pose.z-index*.19,rz:pose.rz-index*.085*sharing,scale:pose.scale*(1-index*.015)};
          this.drawBody(2.65,3.67,.035,.075,duplicate,sharing*.35,true);
          this.mapTexture(this.paperTexture,2.65,3.67,.024,duplicate,sharing*.4);
        }
      }
    }

    drawOriginFront(progress,pose,blocked) {
      const ctx=this.ctx;
      if(blocked>.01){
        const center=this.project(rotate({x:0,y:.15,z:.08},pose));
        const radius=this.scale*.29;
        ctx.save();ctx.translate(center.x,center.y);ctx.globalAlpha=blocked*.9;
        ctx.fillStyle='#0c2731e8';ctx.strokeStyle='#a8c5be';ctx.lineWidth=this.mobile?1:1.5;
        ctx.beginPath();ctx.arc(0,0,radius*1.15,0,TAU);ctx.fill();
        ctx.beginPath();ctx.moveTo(-radius*.37,-radius*.03);ctx.lineTo(-radius*.37,-radius*.39);
        ctx.bezierCurveTo(-radius*.37,-radius*.87,radius*.37,-radius*.87,radius*.37,-radius*.39);ctx.lineTo(radius*.37,-radius*.03);ctx.stroke();
        roundedPath(ctx,-radius*.57,-radius*.07,radius*1.14,radius*.92,radius*.11);ctx.stroke();
        ctx.fillStyle='#d0dfbd';ctx.beginPath();ctx.arc(0,radius*.32,radius*.075,0,TAU);ctx.fill();ctx.restore();
      }
      const traced=smooth(.48,.72,progress),visible=traced*(1-smooth(.83,.96,progress));
      if(visible>.01){
        const points=outline(2.68,3.7,.075,.06).map(point=>this.project(rotate(point,pose)));
        const last=Math.floor(traced*(points.length-1));
        ctx.save();ctx.globalAlpha=visible*.8;ctx.strokeStyle='#e8e9b6';ctx.lineWidth=this.mobile?.8:1.3;
        ctx.shadowColor='#a4e9d1';ctx.shadowBlur=this.mobile?2:5;ctx.beginPath();
        for(let index=0;index<=last;index++)index?ctx.lineTo(points[index].x,points[index].y):ctx.moveTo(points[index].x,points[index].y);
        ctx.stroke();ctx.restore();
      }
    }

    project(point) {
      const perspective=8.8/(8.8-point.z);
      return {x:this.cx+point.x*this.scale*perspective,y:this.cy-point.y*this.scale*perspective,z:point.z,k:perspective};
    }

    planePoint(u,v,width,height,z,pose,curl=0) {
      const depth=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*curl;
      return this.project(rotate({x:(u-.5)*width,y:(.5-v)*height,z:z+depth},pose));
    }

    triangle(texture, source, target, alpha) {
      const ctx=this.ctx;
      const [a,b,c]=source,[p,q,r]=target;
      const denominator=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);
      if(Math.abs(denominator)<.00001)return;
      const transform=(one,two,three)=>[
        (one*(b.y-c.y)+two*(c.y-a.y)+three*(a.y-b.y))/denominator,
        (one*(c.x-b.x)+two*(a.x-c.x)+three*(b.x-a.x))/denominator,
        (one*(b.x*c.y-c.x*b.y)+two*(c.x*a.y-a.x*c.y)+three*(a.x*b.y-b.x*a.y))/denominator
      ];
      const x=transform(p.x,q.x,r.x),y=transform(p.y,q.y,r.y);
      ctx.save();ctx.globalAlpha=alpha;
      const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
      const expanded=[p,q,r].map(vertex=>{
        const dx=vertex.x-center.x,dy=vertex.y-center.y,length=Math.hypot(dx,dy)||1;
        return {x:vertex.x+dx/length*.36,y:vertex.y+dy/length*.36};
      });
      polygon(ctx,expanded);ctx.clip();
      ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(texture,0,0);ctx.restore();
    }

    mapTexture(texture,width,height,z,pose,alpha=1,curl=0) {
      if(alpha<.005)return;
      const columns=this.mobile?4:6,rows=this.mobile?6:9;
      for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
        const u=column/columns,v=row/rows,un=(column+1)/columns,vn=(row+1)/rows;
        const source=[{x:u*texture.width,y:v*texture.height},{x:un*texture.width,y:v*texture.height},{x:un*texture.width,y:vn*texture.height},{x:u*texture.width,y:vn*texture.height}];
        const projected=[this.planePoint(u,v,width,height,z,pose,curl),this.planePoint(un,v,width,height,z,pose,curl),this.planePoint(un,vn,width,height,z,pose,curl),this.planePoint(u,vn,width,height,z,pose,curl)];
        this.triangle(texture,[source[0],source[1],source[2]],[projected[0],projected[1],projected[2]],alpha);
        this.triangle(texture,[source[0],source[2],source[3]],[projected[0],projected[2],projected[3]],alpha);
      }
    }

    drawBody(width,height,depth,radius,pose,alpha=1,paper=false) {
      if(alpha<.005)return;
      const ctx=this.ctx;
      const front=outline(width,height,radius,depth/2),back=outline(width,height,radius,-depth/2);
      const transformedFront=front.map(point=>rotate(point,pose));
      const transformedBack=back.map(point=>rotate(point,pose));
      const faces=[];
      for(let index=0;index<front.length;index++){
        const next=(index+1)%front.length;
        const vertices=[transformedBack[index],transformedBack[next],transformedFront[next],transformedFront[index]];
        const normal=rotate({x:(front[index].x+front[next].x)/2,y:(front[index].y+front[next].y)/2,z:0},{rx:pose.rx,ry:pose.ry,rz:pose.rz});
        const brightness=clamp(.58+normal.x*.11+normal.y*.12+normal.z*.12,.3,1);
        faces.push({vertices,depth:vertices.reduce((sum,point)=>sum+point.z,0)/4,brightness});
      }
      faces.sort((a,b)=>a.depth-b.depth);
      ctx.save();ctx.globalAlpha=alpha;
      const rear=transformedBack.map(point=>this.project(point));
      polygon(ctx,rear);ctx.fillStyle=paper?'#a8b8ad':'#8fa3a7';ctx.fill();
      faces.forEach(face=>{
        const points=face.vertices.map(point=>this.project(point));
        polygon(ctx,points);
        const base=paper?224:198;
        const value=Math.round(base*face.brightness);
        ctx.fillStyle=`rgb(${value},${Math.min(255,value+12)},${Math.min(255,value+13)})`;ctx.fill();
        ctx.strokeStyle=`rgba(221,245,237,${paper?.1:.14})`;ctx.lineWidth=.5;ctx.stroke();
      });
      const projectedFront=transformedFront.map(point=>this.project(point));
      polygon(ctx,projectedFront);
      const gradient=ctx.createLinearGradient(projectedFront[0].x,projectedFront[0].y,projectedFront[12].x,projectedFront[12].y);
      gradient.addColorStop(0,paper?'#fffef4':'#f2f8f1');gradient.addColorStop(1,paper?'#d3e0d0':'#b3c9c8');
      ctx.fillStyle=gradient;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle=paper?'#dce5d6c9':'#effff5c9';ctx.stroke();
      ctx.restore();
    }

    drawRibbon(points,foreground,alpha,mode) {
      if(alpha<.005||points.length<3)return;
      const ctx=this.ctx;
      const runs=[];let run=[];
      points.forEach((point,index)=>{
        const front=point.z>this.deviceCenterZ+.04;
        if(front===foreground){
          if(!run.length&&index>0)run.push(points[index-1]);
          run.push(point);
        }else if(run.length){run.push(point);runs.push(run);run=[];}
      });
      if(run.length)runs.push(run);
      ctx.save();
      runs.forEach(group=>{
        if(group.length<3)return;
        const edgesA=[],edgesB=[];
        group.forEach((point,index)=>{
          const previous=group[Math.max(0,index-1)],next=group[Math.min(group.length-1,index+1)];
          const dx=next.x-previous.x,dy=next.y-previous.y,length=Math.hypot(dx,dy)||1;
          const surfaceWave=.72+.3*Math.sin(point.u*12-this.time*.43)+.13*Math.sin(point.u*28-this.time*.29);
          const neck=.76+.24*Math.sin(point.u*7+1.2);
          const headSwell=Math.exp(-Math.pow((point.u-this.reveal+.022)/.034,2))*.85;
          const width=(this.mobile?2.5:4.6)*point.k*Math.max(.26,surfaceWave*neck+headSwell);
          edgesA.push({x:point.x-dy/length*width,y:point.y+dx/length*width});
          edgesB.push({x:point.x+dy/length*width,y:point.y-dx/length*width});
        });
        const gradient=ctx.createLinearGradient(group[0].x,group[0].y,group[group.length-1].x,group[group.length-1].y);
        gradient.addColorStop(0,'#e8d39a');gradient.addColorStop(.3,'#fff5c7');gradient.addColorStop(.6,'#86e5dc');gradient.addColorStop(.85,'#e5fff1');gradient.addColorStop(1,'#f0d789');
        const opacity=alpha*(mode==='particles'?.18:1);
        ctx.globalAlpha=opacity*.105;ctx.lineWidth=this.mobile?13:25;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#9beedf';
        ctx.shadowColor='#91f6df';ctx.shadowBlur=this.mobile?3:6;
        ctx.beginPath();group.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.stroke();
        ctx.shadowBlur=0;
        ctx.globalAlpha=opacity*.95;
        polygon(ctx,[...edgesA,...edgesB.reverse()]);ctx.fillStyle=gradient;ctx.fill();
        // Broken specular highlights read as a moving surface rather than parallel stripes.
        ctx.globalAlpha=opacity*.72;ctx.lineWidth=this.mobile?.65:1.05;ctx.strokeStyle='#fffce3';
        ctx.beginPath();let drawing=false;
        edgesA.forEach((point,index)=>{
          const visible=Math.sin(group[index].u*17-this.time*.31)>.03;
          if(visible){drawing?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y);drawing=true;}
          else drawing=false;
        });ctx.stroke();
      });ctx.restore();
    }

    drawFlowHead(points,alpha,mode) {
      if(points.length<3||this.reveal>.99||alpha<.01)return;
      const point=points[points.length-1],previous=points[points.length-3];
      const angle=Math.atan2(point.y-previous.y,point.x-previous.x);
      const size=(this.mobile?.72:1.05)*point.k;
      const ctx=this.ctx;ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle);ctx.scale(size,size);
      const halo=ctx.createRadialGradient(1,0,1,1,0,22);
      halo.addColorStop(0,'#e8fff493');halo.addColorStop(.35,'#b5ead33d');halo.addColorStop(1,'#d4efdb00');
      ctx.globalAlpha=alpha*.75;ctx.fillStyle=halo;ctx.fillRect(-22,-22,44,44);
      const liquid=ctx.createLinearGradient(-17,0,10,0);
      liquid.addColorStop(0,'#65d3cf00');liquid.addColorStop(.32,'#9de3d7');liquid.addColorStop(.72,'#e8edb9');liquid.addColorStop(1,'#fff9dc');
      ctx.globalAlpha=alpha*(mode==='particles'?.75:.97);ctx.fillStyle=liquid;
      ctx.beginPath();ctx.moveTo(-18,0);ctx.bezierCurveTo(-8,-1,-2,-6,4,-5);ctx.bezierCurveTo(13,-5,15,4,7,6);ctx.bezierCurveTo(0,7,-8,2,-18,0);ctx.fill();
      ctx.globalAlpha=alpha*.9;ctx.fillStyle='#fffde9';ctx.beginPath();ctx.ellipse(7,-1,2.5,1.3,-.3,0,TAU);ctx.fill();
      // Four light droplets trail the head on slow, continuous arcs.
      for(let index=0;index<4;index++){
        const seed=random(index+312),drift=this.still?0:Math.sin(this.time*.48+index)*1.3;
        const x=-14-index*8-seed*5,y=(index%2?1:-1)*(4+seed*8)+drift;
        const radius=.85+seed*1.35;
        ctx.globalAlpha=alpha*(.6-index*.1);ctx.fillStyle=index%2?'#e8f5be':'#b5eee5';
        ctx.beginPath();ctx.ellipse(x,y,radius*1.35,radius,-.3,0,TAU);ctx.fill();
      }ctx.restore();
    }

    drawInvitationDrop(progress,pose) {
      const opacity=(1-smooth(.05,.16,progress))*.92;
      if(opacity<.01)return;
      const ctx=this.ctx;
      const pulse=this.still?0:Math.sin(this.time*.65)*.025;
      const start=this.project(rotate({x:1.6,y:2.1+pulse,z:.12},pose));
      const middle=this.project(rotate({x:1.28,y:2.13+pulse,z:.3},pose));
      const end=this.project(rotate({x:.97,y:1.78+pulse,z:.38},pose));
      ctx.save();ctx.globalAlpha=opacity;
      const gradient=ctx.createLinearGradient(start.x,start.y,end.x,end.y);
      gradient.addColorStop(0,'#9de9e000');gradient.addColorStop(.52,'#b8ebd4');gradient.addColorStop(1,'#fff5bf');
      ctx.strokeStyle=gradient;ctx.lineWidth=this.mobile?2:3;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(middle.x,middle.y,end.x,end.y);ctx.stroke();
      const radius=this.mobile?3.1:4.2;
      const glow=ctx.createRadialGradient(end.x,end.y,1,end.x,end.y,radius*4);
      glow.addColorStop(0,'#fff5c985');glow.addColorStop(.3,'#dfedbb48');glow.addColorStop(1,'#abecde00');
      ctx.fillStyle=glow;ctx.fillRect(end.x-radius*4,end.y-radius*4,radius*8,radius*8);
      ctx.fillStyle='#f5f4c9';ctx.beginPath();ctx.ellipse(end.x,end.y,radius*.75,radius,pose.rz-.3,0,TAU);ctx.fill();
      ctx.fillStyle='#fffdf0';ctx.globalAlpha=opacity*.9;ctx.beginPath();ctx.arc(end.x-.7,end.y-1.1,radius*.3,0,TAU);ctx.fill();ctx.restore();
    }

    drawFlowParticles(reveal,pose,alpha,mode) {
      const ctx=this.ctx,count=this.mobile?(this.formationActive?20:42):70;
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let index=0;index<count;index++){
        const base=random(index+14);
        const local=(base+(this.still?0:this.time*.032))%1;
        if(local>reveal)continue;
        const point=waterPoint(local,this.time,this.still);
        const offset=(random(index+43)-.5)*(mode==='particles'?.17:.12);
        point.x+=offset;point.y+=(random(index+73)-.5)*.1;point.z+=offset;
        const projected=this.project(rotate(point,pose));
        const radius=(mode==='particles'?1.25:.7)+(random(index+80)*.8);
        ctx.globalAlpha=alpha*(.25+random(index+7)*.65);
        ctx.fillStyle=index%3===0?'#80f2e2':'#fff2b8';
        ctx.beginPath();ctx.arc(projected.x,projected.y,radius*projected.k,0,TAU);ctx.fill();
        if(index%7===0){ctx.globalAlpha=alpha*.1;ctx.beginPath();ctx.arc(projected.x,projected.y,radius*4,0,TAU);ctx.fill();}
      }ctx.restore();
    }

    drawFormation(progress,devicePose,paperPose) {
      const amount=smooth(.64,.94,progress);
      if(amount<=0||amount>=1)return;
      const count=this.mobile?28:74,ctx=this.ctx;
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let index=0;index<count;index++){
        const seed=random(index+3);
        const delay=seed*.19;
        const local=smooth(delay,.83+delay,amount);
        const initial=rotate(waterPoint(.5+seed*.5,this.time,this.still),devicePose);
        const targetLocal={x:(random(index+51)-.5)*2.4,y:(.5-random(index+61))*3.4,z:.04};
        if(index%3===0){targetLocal.x=(index%2?1:-1)*1.23;targetLocal.y=(.5-random(index+71))*3.6;}
        const target=rotate(targetLocal,paperPose);
        const position=pointMix(initial,target,local);
        const arc=Math.sin(local*Math.PI);
        position.z+=arc*(.3+seed*.8);
        position.x+=Math.sin(local*Math.PI*2+seed*TAU)*arc*.22;
        const projected=this.project(position);
        const opacity=Math.sin(Math.PI*clamp(local))*(1-smooth(.91,.96,progress));
        ctx.globalAlpha=opacity*(.4+seed*.5);
        ctx.fillStyle=index%3===0?'#eddf99':'#a9ffe4';
        const radius=(this.mobile?.9:1.2)+seed*1.2;
        ctx.beginPath();ctx.arc(projected.x,projected.y,radius,0,TAU);ctx.fill();
        if(index%4===0){ctx.globalAlpha=opacity*.12;ctx.beginPath();ctx.arc(projected.x,projected.y,radius*3.7,0,TAU);ctx.fill();}
      }ctx.restore();
    }

    drawFloor(progress,alpha) {
      const ctx=this.ctx;
      const bottom=this.cy+this.scale*2.0;
      ctx.save();ctx.translate(this.cx,bottom);ctx.scale(1,.32);
      const glow=ctx.createRadialGradient(0,0,0,0,0,this.scale*2.8);
      glow.addColorStop(0,`rgba(65,161,164,${.17*alpha})`);glow.addColorStop(1,'rgba(20,58,67,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,this.scale*2.8,0,TAU);ctx.fill();ctx.restore();
      ctx.save();
      ctx.translate(this.cx,bottom);ctx.scale(1,.22);
      ctx.strokeStyle='#79b6ad';ctx.lineWidth=.7;ctx.globalAlpha=.1*alpha;
      [1.25,1.65,2.2,2.75].forEach(radius=>{ctx.beginPath();ctx.arc(0,0,this.scale*radius,0,TAU);ctx.stroke();});
      ctx.restore();
      ctx.save();ctx.translate(this.cx,bottom+8);ctx.scale(1,.18);
      const shadow=ctx.createRadialGradient(0,0,5,0,0,this.scale*1.5);
      shadow.addColorStop(0,'#0000009e');shadow.addColorStop(.55,'#00000036');shadow.addColorStop(1,'#00000000');
      ctx.fillStyle=shadow;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,this.scale*1.6,0,TAU);ctx.fill();ctx.restore();
    }

    drawContactWave(progress,pose) {
      const amount=smooth(.35,.49,progress)*(1-smooth(.59,.7,progress));
      if(amount<.01)return;
      const center=this.project(rotate({x:0,y:.55,z:.4},pose));
      const ctx=this.ctx;ctx.save();
      [0,.35,.7].forEach(offset=>{
        const radius=(clamp((progress-.36)*7+offset)%1)*this.scale*.5;
        ctx.globalAlpha=amount*(1-radius/(this.scale*.5))*.45;
        ctx.strokeStyle='#c9f4bd';ctx.lineWidth=this.mobile?1:1.5;
        ctx.beginPath();ctx.ellipse(center.x,center.y,radius*.8,radius,pose.rz,0,TAU);ctx.stroke();
      });ctx.restore();
    }

    render(progress,timeSeconds,{mode='flow',still=false,comparison={},origin=null,originProgress=0}={}) {
      const p=clamp(progress),ctx=this.ctx;
      this.mobile=this.width<=700;this.still=still;this.time=still?0:timeSeconds;
      this.formationActive=p>.13&&p<.27;
      const short=this.mobile&&this.height<=560;
      const closing=smooth(.94,1,p);
      this.cx=this.width*(this.mobile?.5:.705);
      const baseCenter=this.mobile?(short?.64:.65):.53;
      this.cy=this.height*(this.mobile?mix(baseCenter,short?.72:.75,closing):baseCenter);
      const artHeight=this.height*(this.mobile?.36:.65);
      this.scale=Math.min(artHeight,this.mobile?this.width*.83:this.width*.47)/4.3*(this.mobile?mix(1,short?.5:.6,closing):1);
      const comparisonIn=smooth(.25,.31,p),comparisonOut=smooth(.47,.53,p);
      const aside=comparisonIn*(1-comparisonOut),deviceArrival=smooth(.5,.655,p);
      const tap=smooth(.66,.805,p),cardLeaving=smooth(.815,.865,p);
      const deviceAlpha=smooth(.5,.565,p);
      const paperAlpha=(1-smooth(.48,.55,p))*(1-aside*.88)+closing;
      const devicePose={
        x:mix(1.1,-.28,deviceArrival)+closing*1.37,y:mix(-.17,0,deviceArrival)-closing*.03,z:mix(-.65,.1,deviceArrival),
        rx:mix(-.045,.012,deviceArrival),ry:mix(-.15,.025,deviceArrival),rz:mix(-.08,.022,deviceArrival)+closing*.03,
        scale:mix(.69,1,deviceArrival)-closing*.12
      };
      const paperPose={
        x:aside*1.5-closing*.9,y:-aside*.18-closing*.02,z:.22-aside*.9,
        rx:mix(-.025,.025,smooth(0,.25,p)),ry:-.15+aside*1.34+closing*.1,rz:-.065+aside*.16-closing*.055,
        scale:1-aside*.28-closing*.27
      };
      const hasOrigin=origin!==null&&origin!==undefined;
      const originAmount=clamp(originProgress);
      const originBlocked=hasOrigin?smooth(.2,.3,originAmount)*(1-smooth(.42,.53,originAmount)):0;
      if(hasOrigin)Object.assign(paperPose,this.originPose(originAmount,paperPose));
      const cardAlpha=smooth(.655,.69,p)*(1-cardLeaving);
      const cardPose={x:mix(2.25,.38,tap)+cardLeaving*1.2,y:mix(.5,.94,tap)+cardLeaving*.24,z:mix(1.2,.46,tap),rx:mix(-.12,-.04,tap),ry:mix(-.25,.06,tap),rz:mix(-.2,-.06,tap),scale:.87};
      const logoReady=this.logoIsReady();
      if(logoReady!==this.logoReady){this.logoReady=logoReady;this.textureKey='';this.buildPaperTexture();}
      if(!this.pointReady)this.preparePointTexture();
      ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
      ctx.save();
      if(this.mobile){
        const clipTop=mix(short?.43:.4,short?.635:.61,closing);
        const clipBottom=mix(short?.83:.86,short?.81:.86,closing);
        ctx.beginPath();ctx.rect(0,this.height*clipTop,this.width,this.height*(clipBottom-clipTop));ctx.clip();
      }else{
        ctx.beginPath();ctx.rect(this.width*.445,0,this.width*.555,this.height);ctx.clip();
      }
      this.drawFloor(p,1);
      const reveal=mix(.34,1,smooth(0,.24,p));
      this.reveal=reveal;
      const flowAlpha=.58-aside*.36+closing*.11;
      const samples=this.mobile?76:114;
      const water=[];
      const flowPose=p<.5?{...paperPose,scale:paperPose.scale*.93}:{...devicePose,scale:devicePose.scale*.97};
      this.deviceCenterZ=rotate({x:0,y:.25,z:.15},flowPose).z;
      for(let index=0;index<=samples;index++){
        const u=index/samples*reveal;
        const position=this.project(rotate(waterPoint(u,this.time,still),flowPose));
        position.u=u;water.push(position);
      }
      this.drawRibbon(water,false,flowAlpha,mode);
      if(hasOrigin)this.drawOriginBackdrop(originAmount,paperPose,originBlocked);
      if(paperAlpha>.005){
        const opacity=Math.min(1,paperAlpha)*(1-originBlocked*.58);
        this.drawBody(2.65,3.67,.045,.075,paperPose,opacity,true);
        this.mapTexture(this.paperTexture,2.65,3.67,.026,paperPose,opacity,(1-smooth(0,.2,p))*.07);
      }
      this.drawPointPhoto(devicePose,deviceAlpha);
      this.drawRibbon(water,true,flowAlpha,mode);
      this.drawFlowParticles(reveal,flowPose,flowAlpha,mode);
      this.drawFlowHead(water,flowAlpha,mode);
      this.drawInvitationDrop(p,paperPose);
      if(hasOrigin)this.drawOriginFront(originAmount,paperPose,originBlocked);
      this.drawAgreement(p,paperPose);
      this.drawNfc(p,devicePose,cardPose,cardAlpha);
      this.drawSimulationSuccess(p,devicePose);
      if(p>.94){
        const shine=smooth(.94,.975,p)*(1-smooth(.985,1,p));
        if(shine>.001){
          const corner=this.project(rotate({x:1.28,y:1.77,z:.05},paperPose));
          ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=shine*.75;
          ctx.strokeStyle='#fff5c6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(corner.x-10,corner.y);ctx.lineTo(corner.x+10,corner.y);ctx.moveTo(corner.x,corner.y-10);ctx.lineTo(corner.x,corner.y+10);ctx.stroke();ctx.restore();
        }
      }
      ctx.restore();
      this.stats={progress:p,mode,deviceAlpha,paperAlpha,cardAlpha,pointReady:this.pointReady,pointBounds:this.pointBounds,origin:hasOrigin?origin:null,originProgress:hasOrigin?originAmount:null,phase:hasOrigin?'origin':p<.13?'proposal':p<.27?'agreement':p<.5?'comparison':p<.66?'point':p<.82?'nfc':p<.94?'simulation':'closing',comparison:{currentRate:Number(comparison.currentRate)||0,proposalRate:Number(comparison.proposalRate)||0,amount:Number(comparison.amount)||0},particles:this.mobile?(this.formationActive?38:42):74};
    }
  }

  window.AcuerdoRenderer=AcuerdoRenderer;
})();
