/* Small standalone PDF image writer. All page content is drawn locally; no fonts or remote assets are loaded. */
(function(root){
  'use strict';
  function imagePDF(jpeg,width,height){
    if(!(jpeg instanceof Uint8Array)||jpeg.length<4||jpeg[0]!==255||jpeg[1]!==216||jpeg[jpeg.length-2]!==255||jpeg[jpeg.length-1]!==217)throw Error('La imagen del PDF no es válida.');
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>10000||height>10000)throw Error('El tamaño del PDF no es válido.');
    const encoder=new TextEncoder(),parts=[],offsets=[0];let size=0;
    const add=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);size+=bytes.length;};
    const object=(number,head,body)=>{offsets[number]=size;add(number+' 0 obj\n'+head);if(body){add('\nstream\n');add(body);add('\nendstream');}add('\nendobj\n');};
    add('%PDF-1.4\n% Local proposal demo\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    const pageWidth=595.28,pageHeight=Number((pageWidth*height/width).toFixed(2));
    object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageWidth+' '+pageHeight+'] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    object(4,'<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>',jpeg);
    const drawing='q\n'+pageWidth+' 0 0 '+pageHeight+' 0 0 cm\n/Im0 Do\nQ';
    object(5,'<< /Length '+encoder.encode(drawing).length+' >>',encoder.encode(drawing));
    const start=size;add('xref\n0 6\n0000000000 65535 f \n');for(let number=1;number<=5;number++)add(String(offsets[number]).padStart(10,'0')+' 00000 n \n');
    add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
    const result=new Uint8Array(size);let at=0;for(const bytes of parts){result.set(bytes,at);at+=bytes.length;}return result;
  }
  root.PublicDemoPDF=Object.freeze({imagePDF});
})(typeof window==='object'?window:globalThis);
