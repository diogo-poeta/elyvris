/*
 * Simultaneous reconstruction of genuine complex E/H exports under exp(-iωt).
 * For each vector sample, |Re[F exp(-iφ)]|² = A cos²φ+B sin²φ+2C sinφ cosφ,
 * where A=Σre², B=Σim², C=Σre·im. The exact maximum over a full cycle is
 * (A+B)/2+hypot((A-B)/2,C). Each panel uses its own fixed global maximum.
 * No independent phase shift, per-frame normalization, time-averaged energy,
 * flow trajectory or formation transient is inferred.
 */
(function(root){
'use strict';
const TAU=2*Math.PI,C_NM_FS=299.792458,MAX_CELLS=250000;
function axis(values,count,name){
 if(!Array.isArray(values)||values.length!==count||count<2||!values.every(Number.isFinite))throw new TypeError(name+' axis is invalid');
 const step=values[1]-values[0];if(!(step>0)||values.some((v,i)=>i&&Math.abs(v-values[i-1]-step)>Math.max(1,step)*1e-6))throw new TypeError('Viewer requires a uniform increasing '+name+' grid');
 return Object.freeze({values:Float64Array.from(values),step,min:values[0]-step/2,max:values.at(-1)+step/2});
}
function coefficients(field,prefix,count){
 if(!field||field.unit!==prefix+'/'+prefix+'0'||!Number.isFinite(field.referenceAmplitudeSI)||field.referenceAmplitudeSI<=0)throw new TypeError(prefix+' reference amplitude is invalid');
 const A=new Float64Array(count),B=new Float64Array(count),C=new Float64Array(count);
 for(const component of ['x','y','z']){
  const value=field.components?.[prefix+component];
  if(!value||!Array.isArray(value.re)||!Array.isArray(value.im)||value.re.length!==count||value.im.length!==count)throw new TypeError('Missing complex '+prefix+component+' component');
  for(let i=0;i<count;i++){
   const re=value.re[i],im=value.im[i];if(!Number.isFinite(re)||!Number.isFinite(im))throw new TypeError('Non-finite complex field');
   A[i]+=re*re;B[i]+=im*im;C[i]+=re*im;
  }
 }
 let maximum=0;
 for(let i=0;i<count;i++){const value=(A[i]+B[i])/2+Math.hypot((A[i]-B[i])/2,C[i]);if(!Number.isFinite(value))throw new TypeError('Field exceeds finite numerical range');maximum=Math.max(maximum,value);}
 if(!(maximum>0))throw new TypeError(prefix+' field is identically zero');
 return Object.freeze({A,B,C,maximum,referenceAmplitudeSI:field.referenceAmplitudeSI});
}
function normalize(value){
 if(!value||value.schemaVersion!==1||value.kind!=='complex-field-export'||value.phaseConvention!=='realField = re*cos(phase) + im*sin(phase)'||value.metadata?.phaseConvention!=='exp(-i omega t)')throw new TypeError('Export must declare the shared exp(-i omega t) convention');
 const grid=value.grid,metadata=value.metadata;
 if(!grid||!Number.isInteger(grid.width)||!Number.isInteger(grid.height)||grid.width*grid.height>MAX_CELLS||grid.rowOrder!=='y then x'||!Number.isFinite(grid.zNm))throw new TypeError('Invalid exported grid');
 if(!Number.isFinite(metadata.wavelengthNm)||metadata.wavelengthNm<=0||!metadata.source||!Array.isArray(metadata.geometry?.sizeNm)||metadata.geometry.sizeNm.length!==3||!metadata.geometry.sizeNm.every(v=>Number.isFinite(v)&&v>0))throw new TypeError('Missing wavelength, geometry or provenance');
 const x=axis(grid.xNm,grid.width,'x'),y=axis(grid.yNm,grid.height,'y'),count=grid.width*grid.height;
 return Object.freeze({width:grid.width,height:grid.height,x,y,zNm:grid.zNm,metadata,periodFs:metadata.wavelengthNm/C_NM_FS,electric:coefficients(value.electric,'E',count),magnetic:coefficients(value.magnetic,'H',count)});
}
function intensity(field,phase,output=new Float64Array(field.A.length)){
 if(!Number.isFinite(phase)||output.length!==field.A.length)throw new TypeError('Invalid optical phase or output size');
 const c=Math.cos(phase),s=Math.sin(phase),cc=c*c,ss=s*s,cs=2*c*s;let peak=0;
 for(let i=0;i<output.length;i++){const value=Math.max(0,field.A[i]*cc+field.B[i]*ss+field.C[i]*cs);output[i]=value;peak=Math.max(peak,value);}
 return {values:output,peak};
}
function wrap(phase){return ((phase%TAU)+TAU)%TAU;}
const api=Object.freeze({normalize,coefficients,intensity,wrap,TAU,C_NM_FS});if(typeof module==='object'&&module.exports)module.exports=api;
if(!root.document)return;root.AnapoleFieldCycle=api;
const viewer=document.querySelector('#anapole-field-cycle');if(!viewer)return;
let mount=viewer.querySelector('[data-afc-mount]');
if(!mount){mount=document.createElement('div');mount.setAttribute('data-afc-mount','');viewer.insertBefore(mount,viewer.querySelector('figcaption'));}
const panel=field=>'<section class="afc-panel afc-panel-'+field+'"><div class="afc-panel-heading"><h4>'+ (field==='E'?'Electric field':'Magnetic field') +'</h4><span>|'+field+'(t)|² / |'+field+'₀|²</span></div><canvas id="afc-'+field+'-canvas" width="600" height="480" role="img" aria-label="Instantaneous normalized '+(field==='E'?'electric':'magnetic')+' vector-field squared in the exported x–y plane.">A genuine complex-field export is required.</canvas><div class="afc-scale"><span>0</span><span class="afc-gradient"></span><span id="afc-'+field+'-maximum">—</span></div><p class="afc-peak">Current sampled maximum <span id="afc-'+field+'-peak" aria-live="off">—</span></p></section>';
mount.innerHTML='<div class="afc-heading"><div><h3>Independent FDTD reference at <span id="afc-wavelength">366.5</span> nm</h3><p>Electric and magnetic fields at a common optical phase.</p></div><button id="afc-toggle" type="button" aria-pressed="false" disabled>Play cycle</button></div><div class="afc-panels">'+panel('E')+panel('H')+'</div><div class="afc-controls"><div class="afc-phase-control"><label for="afc-phase">Shared optical phase</label><input id="afc-phase" type="range" min="0" max="359.9" step="0.1" value="0" disabled><div id="afc-quarters" class="afc-quarters" role="group" aria-label="Inspect quarter-cycle phases"><button type="button" data-phase="0" disabled>0</button><button type="button" data-phase="90" disabled>π/2</button><button type="button" data-phase="180" disabled>π</button><button type="button" data-phase="270" disabled>3π/2</button></div></div><div class="afc-time"><span>t mod T</span><span id="afc-time" aria-live="off">— fs</span><small>T = <span id="afc-period">—</span> fs</small></div><div class="afc-phase-value"><span>Common phase</span><span id="afc-phase-value" aria-live="off">0°</span></div></div><p id="afc-plane" class="afc-plane"></p><p id="afc-error" class="afc-error" role="alert">Loading the complex-field export…</p><p id="afc-status" class="afc-status" role="status"></p>';
const get=id=>viewer.querySelector('#afc-'+id),toggle=get('toggle'),slider=get('phase'),status=get('status'),error=get('error'),quarters=[...viewer.querySelectorAll('[data-phase]')];
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let data=null,phase=0,playing=!reduced.matches,visible=true,raf=0,last=0,lastDraw=0;
const panels={};
for(const name of ['E','H']){
 const canvas=get(name+'-canvas'),ctx=canvas.getContext('2d'),buffer=document.createElement('canvas');
 if(!ctx||!buffer.getContext('2d'))return;
 panels[name]={canvas,ctx,buffer,bctx:buffer.getContext('2d'),maximum:get(name+'-maximum'),peak:get(name+'-peak'),width:600,height:480};
}
function number(v){const a=Math.abs(v);return v===0?'0':a>=.01&&a<1000?Number(v.toPrecision(3)).toString():v.toExponential(2);}
function palette(name){
 const stops=name==='E'?[[245,246,237],[178,201,147],[25,55,47]]:[[245,246,237],[207,176,140],[112,76,53]],table=new Uint8ClampedArray(1024);
 for(let i=0;i<256;i++){const segment=i<128?0:1,t=segment?((i-128)/127):(i/128);for(let c=0;c<3;c++)table[4*i+c]=Math.round(stops[segment][c]*(1-t)+stops[segment+1][c]*t);table[4*i+3]=255;}return table;
}
function niceStep(span){const order=10**Math.floor(Math.log10(span/4)),n=span/4/order;return(n<=1?1:n<=2?2:n<=5?5:10)*order;}
function drawPanel(name,state){
 const p=panels[name],field=name==='E'?data.electric:data.magnetic;
 const result=intensity(field,phase,p.values),pixels=p.image.data,lut=p.palette;
 for(let row=0;row<data.height;row++)for(let col=0;col<data.width;col++){
  const source=row*data.width+col,dest=((data.height-1-row)*data.width+col)*4,key=Math.min(255,Math.round(result.values[source]/field.maximum*255))*4;
  pixels[dest]=lut[key];pixels[dest+1]=lut[key+1];pixels[dest+2]=lut[key+2];pixels[dest+3]=255;
 }
 p.bctx.putImageData(p.image,0,0);
 const {ctx,width:w,height:h}=p,compact=w<230,left=compact?28:47,top=compact?8:15,right=compact?7:22,bottom=compact?28:43;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f7f0';ctx.fillRect(0,0,w,h);
 const spanX=data.x.max-data.x.min,spanY=data.y.max-data.y.min,scale=Math.min((w-left-right)/spanX,(h-top-bottom)/spanY),plotW=spanX*scale,plotH=spanY*scale,x0=left+(w-left-right-plotW)/2,y0=top+(h-top-bottom-plotH)/2;
 const px=x=>x0+(x-data.x.min)*scale,py=y=>y0+(data.y.max-y)*scale;
 ctx.imageSmoothingEnabled=false;ctx.drawImage(p.buffer,x0,y0,plotW,plotH);ctx.strokeStyle='#b5bfa9';ctx.lineWidth=1;ctx.strokeRect(x0,y0,plotW,plotH);
 const [length,width]=data.metadata.geometry.sizeNm;
 if(Math.abs(data.zNm)<=data.metadata.geometry.sizeNm[2]/2){
  ctx.save();ctx.beginPath();ctx.rect(x0,y0,plotW,plotH);ctx.clip();ctx.strokeStyle='rgba(255,255,247,.88)';ctx.lineWidth=3;ctx.strokeRect(px(-length/2),py(width/2),length*scale,width*scale);ctx.strokeStyle='#223d30';ctx.lineWidth=1;ctx.setLineDash([5,3]);ctx.strokeRect(px(-length/2),py(width/2),length*scale,width*scale);ctx.restore();
 }
 ctx.font=(compact?'9':'11')+'px Arial,sans-serif';ctx.fillStyle='#5f7055';ctx.strokeStyle='#a2b092';ctx.lineWidth=.8;ctx.textAlign='center';ctx.textBaseline='top';
 const stepX=niceStep(spanX),stepY=niceStep(spanY);
 for(let t=Math.ceil(data.x.min/stepX)*stepX;t<=data.x.max+1e-8;t+=stepX){ctx.beginPath();ctx.moveTo(px(t),y0+plotH);ctx.lineTo(px(t),y0+plotH+5);ctx.stroke();ctx.fillText(String(Math.round(t*1e6)/1e6),px(t),y0+plotH+9);}
 ctx.textAlign='right';ctx.textBaseline='middle';
 for(let t=Math.ceil(data.y.min/stepY)*stepY;t<=data.y.max+1e-8;t+=stepY){ctx.beginPath();ctx.moveTo(x0-5,py(t));ctx.lineTo(x0,py(t));ctx.stroke();ctx.fillText(String(Math.round(t*1e6)/1e6),x0-(compact?6:9),py(t));}
 ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText('x (nm)',x0+plotW/2,h-1);ctx.save();ctx.translate(compact?7:11,y0+plotH/2);ctx.rotate(-Math.PI/2);ctx.fillText('y (nm)',0,0);ctx.restore();
 p.peak.textContent=number(result.peak);
}
function updateControls(){
 toggle.disabled=slider.disabled=!data;for(const button of quarters)button.disabled=!data;
 toggle.setAttribute('aria-pressed',String(playing));toggle.textContent=playing?'Pause cycle':'Play cycle';
}
function draw(){
 if(!data)return;drawPanel('E');drawPanel('H');
 const degrees=wrap(phase)*180/Math.PI;slider.value=degrees.toFixed(1);get('phase-value').textContent=degrees.toFixed(1)+'°';get('time').textContent=(wrap(phase)/TAU*data.periodFs).toFixed(3)+' fs';
 slider.setAttribute('aria-valuetext',degrees.toFixed(1)+' degrees; '+(wrap(phase)/TAU*data.periodFs).toFixed(3)+' femtoseconds within the optical period');
 for(const button of quarters){const delta=Math.abs(degrees-Number(button.dataset.phase));button.setAttribute('aria-pressed',String(Math.min(delta,360-delta)<.05));}
}
function resize(){
 for(const p of Object.values(panels)){
  const rect=p.canvas.getBoundingClientRect();p.width=Math.max(1,rect.width);p.height=Math.max(1,rect.height);const dpr=Math.min(window.devicePixelRatio||1,2);p.canvas.width=Math.round(p.width*dpr);p.canvas.height=Math.round(p.height*dpr);p.ctx.setTransform(dpr,0,0,dpr,0,0);
 }draw();
}
function frame(now){
 raf=0;if(!data||!playing||!visible||document.hidden){last=0;return;}if(!last)last=now;phase=wrap(phase+Math.min(.1,(now-last)/1000)*TAU/5);last=now;
 if(!lastDraw||now-lastDraw>=1000/30){draw();lastDraw=now;}raf=requestAnimationFrame(frame);
}
function sync(){if(data&&playing&&visible&&!document.hidden){if(!raf)raf=requestAnimationFrame(frame);}else{cancelAnimationFrame(raf);raf=0;last=0;}}
function inspect(degrees){playing=false;phase=wrap(degrees*Math.PI/180);updateControls();draw();sync();status.textContent='Paused at common phase '+degrees.toFixed(1)+' degrees, time '+(phase/TAU*data.periodFs).toFixed(3)+' femtoseconds modulo the optical period.';}
toggle.addEventListener('click',()=>{if(!data)return;playing=!playing;updateControls();sync();status.textContent=playing?'Playing a steady-state optical cycle.':'Cycle paused.';});
slider.addEventListener('input',()=>{if(data)inspect(Number(slider.value));});for(const button of quarters)button.addEventListener('click',()=>{if(data)inspect(Number(button.dataset.phase));});
document.addEventListener('visibilitychange',sync);reduced.addEventListener?.('change',()=>{if(reduced.matches){playing=false;updateControls();sync();}});
if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'60px'}).observe(viewer);
if('ResizeObserver'in window)new ResizeObserver(resize).observe(viewer);else window.addEventListener('resize',resize);
updateControls();
let url;
try{url=new URL(viewer.dataset.source||'assets/anapole-temporal/rectangle-xy.json',window.location.href);if(url.origin!==window.location.origin||!url.pathname.match(/\/assets\/anapole-temporal\/[a-z0-9._-]+\.json$/i)||url.hash||url.username||url.password)throw new TypeError('Invalid field-data URL');}
catch(cause){playing=false;updateControls();error.textContent='The field-data location is invalid.';return;}
fetch(url.href,{credentials:'same-origin'}).then(response=>{if(!response.ok)throw new Error('Field export unavailable');return response.json();}).then(value=>{
 data=normalize(value);
 for(const [name,p]of Object.entries(panels)){p.buffer.width=data.width;p.buffer.height=data.height;p.image=p.bctx.createImageData(data.width,data.height);p.values=new Float64Array(data.width*data.height);p.palette=palette(name);p.maximum.textContent=number((name==='E'?data.electric:data.magnetic).maximum);}
 get('wavelength').textContent=String(data.metadata.wavelengthNm);get('period').textContent=data.periodFs.toFixed(3);get('plane').textContent='x–y plane at z = '+Number(data.zNm.toFixed(6))+' nm. Dashed outline: '+data.metadata.geometry.sizeNm.join(' × ')+' nm resonator. Colour limits are fixed across the full optical cycle for each field.';
 error.hidden=true;viewer.setAttribute('aria-busy','false');updateControls();resize();sync();
}).catch(()=>{playing=false;data=null;updateControls();viewer.setAttribute('aria-busy','false');error.textContent='The complex-field export could not be loaded or validated.';error.hidden=false;});
})(typeof globalThis!=='undefined'?globalThis:window);



