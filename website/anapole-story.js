/*
 * Anapole formation in three panels, from published data only.
 *  (a) Supplement Fig. S3 (radiated power), unchanged, with the time window of
 *      the S2 timing events shaded on top.
 *  (b) Each published electric-to-magnetic offset drawn as an angle on one
 *      optical cycle (360 degrees = T = lambda/c). The Meep marker comes from
 *      anapole-field-cycle.js (energy inside the particle), when it has loaded.
 *  (c) One row per published instance, each aligned to its own first electric
 *      event, so the repeating electric-then-magnetic pattern can be compared.
 * Source: https://doi.org/10.6084/m9.figshare.27648525.v5 (CC BY 4.0).
 * Nothing is interpolated between the published samples.
 */
(function(root){
'use strict';
const NS='http://www.w3.org/2000/svg',C_NM_FS=299.792458,WAVELENGTH_NM=366.5,PERIOD=WAVELENGTH_NM/C_NM_FS;
// Pixel geometry of the published S3 raster (3408 x 2379): frame from t = 0 to 45 fs and P = 0 to 3e-16 W.
const S3=Object.freeze({x0:610,x1:2934,tMax:45,yTop:279,yBottom:1981});
function normalize(value){
 if(!value||value.schemaVersion!==1||!Array.isArray(value.samples)||value.samples.length<1||value.samples.length>48)throw new TypeError('Invalid samples');
 return Object.freeze(value.samples.map(s=>{
  if(!s||!Number.isInteger(s.instance)||![s.electricTimeFs,s.magneticTimeFs,s.electricIntensity].every(Number.isFinite))throw new TypeError('Invalid sample');
  const delayFs=Number((s.magneticTimeFs-s.electricTimeFs).toFixed(2));
  if(delayFs<0||delayFs>.5)throw new TypeError('Offset outside the plotted range');
  return Object.freeze({instance:s.instance,tE:s.electricTimeFs,tH:s.magneticTimeFs,intensity:s.electricIntensity,delay:delayFs,degrees:360*delayFs/PERIOD});
 }));
}
const api=Object.freeze({normalize,PERIOD});
if(typeof module==='object'&&module.exports)module.exports=api;
if(!root.document)return;root.AnapoleStory=api;
const fig=document.querySelector('#anapole-temporal');if(!fig)return;
const $=id=>fig.querySelector('#as-'+id);
function el(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
const fs=v=>v.toFixed(2)+' fs';
let data=null,current=0;
const marks=[];

/* (a) radiated power with the event window */
function buildPower(){
 const svg=$('power'),X=t=>S3.x0+(S3.x1-S3.x0)*t/S3.tMax;
 const first=Math.min(...data.map(s=>s.tE)),last=Math.max(...data.map(s=>s.tH)),a=X(first),b=X(last);
 svg.append(el('rect',{x:a,y:S3.yTop,width:b-a,height:S3.yBottom-S3.yTop,class:'as-window'}));
 svg.append(el('line',{x1:b,y1:1260,x2:1380,y2:900,class:'as-leader'}));
 const label=el('text',{x:1400,y:850,class:'as-svg-note'});
 label.append(el('tspan',{x:1400,dy:0},'Timing events in (b) and (c)'),el('tspan',{x:1400,dy:105},fs(first)+' to '+fs(last)),el('tspan',{x:1400,dy:105,class:'as-svg-note-soft'},'radiated power here is at most'),el('tspan',{x:1400,dy:95,class:'as-svg-note-soft'},'about a tenth of its peak'));
 svg.append(label);
}

/* (b) dial: offsets as angles on one optical cycle */
const D=Object.freeze({cx:160,cy:158,r:104});
function polar(deg,r){const a=(deg-90)*Math.PI/180;return [D.cx+r*Math.cos(a),D.cy+r*Math.sin(a)];}
function arc(d0,d1,r){const [x0,y0]=polar(d0,r),[x1,y1]=polar(d1,r);return 'M'+D.cx+','+D.cy+'L'+x0+','+y0+'A'+r+','+r+' 0 0 1 '+x1+','+y1+'Z';}
function buildDial(){
 const svg=$('dial'),lo=Math.min(...data.map(s=>s.degrees)),hi=Math.max(...data.map(s=>s.degrees));
 svg.append(el('circle',{cx:D.cx,cy:D.cy,r:D.r,class:'as-dial-face'}));
 svg.append(el('path',{d:arc(lo,hi,D.r),class:'as-dial-range'}));
 for(let deg=0;deg<360;deg+=15){const major=deg%90===0,[x0,y0]=polar(deg,D.r),[x1,y1]=polar(deg,D.r-(major?11:5));svg.append(el('line',{x1:x0,y1:y0,x2:x1,y2:y1,class:'as-dial-tick'}));}
 const labels=[[0,'0'],[90,'T/4'],[180,'T/2'],[270,'3T/4']];
 for(const [deg,text]of labels){const [x,y]=polar(deg,D.r+17);svg.append(el('text',{x,y:y+4,'text-anchor':deg===90?'start':deg===270?'end':'middle',class:'as-dial-label'+(deg===90?' as-dial-label-key':'')},text));}
 const [ex,ey]=polar(0,D.r);svg.append(el('circle',{cx:ex,cy:ey,r:6,class:'as-dot-E'}));
 const group=el('g');svg.append(group);
 data.forEach((s,i)=>{const [x,y]=polar(s.degrees,D.r-3),line=el('line',{x1:D.cx,y1:D.cy,x2:x,y2:y,class:'as-needle'});group.append(line);marks[i]={needle:line};});
 const meep=el('g',{id:'as-meep',class:'as-meep',visibility:'hidden'});
 meep.append(el('line',{x1:D.cx,y1:D.cy,x2:D.cx,y2:D.cy-D.r+2,class:'as-meep-line'}),el('text',{class:'as-meep-text'}));svg.append(meep);
 const sel=el('g',{id:'as-dial-selected'});sel.append(el('line',{class:'as-needle-selected'}),el('path',{class:'as-dot-H'}));svg.append(sel);
 svg.append(el('circle',{cx:D.cx,cy:D.cy,r:3,class:'as-dial-hub'}));
 svg.append(el('text',{x:D.cx,y:D.cy+44,'text-anchor':'middle',class:'as-dial-centre'},'one optical cycle'),el('text',{x:D.cx,y:D.cy+59,'text-anchor':'middle',class:'as-dial-centre'},'T = '+PERIOD.toFixed(2)+' fs'));
 $('range').textContent=Math.round(lo)+'° and '+Math.round(hi)+'°';
}
function showMeep(lagDeg){
 const g=fig.querySelector('#as-meep');if(!g||!Number.isFinite(lagDeg))return;
 const [x,y]=polar(lagDeg,D.r+2),[tx,ty]=polar(lagDeg+33,D.r-34),line=g.querySelector('line'),text=g.querySelector('text');
 line.setAttribute('x2',x);line.setAttribute('y2',y);text.setAttribute('x',tx);text.setAttribute('y',ty);text.textContent='Meep '+lagDeg.toFixed(1)+'°';
 g.setAttribute('visibility','visible');$('meep-note').hidden=false;$('meep-value').textContent=lagDeg.toFixed(1)+'° ('+(lagDeg/360*PERIOD).toFixed(3)+' fs)';
}

/* (c) stacked half-cycles: one row per instance, aligned to its own first electric event.
   Wide layout: labels to the left of each row. Compact layout (phones): labels above each row. */
const LAYOUTS=Object.freeze({
 wide:Object.freeze({w:712,left:236,right:700,top:62,step:58,band:22,axisGap:30,compact:false}),
 compact:Object.freeze({w:400,left:16,right:384,top:74,step:76,band:18,axisGap:28,compact:true})
});
const R_MIN=-.03,R_MAX=.5;
let L=LAYOUTS.wide,rowOf=[],startOf={};
const rx=r=>L.left+(L.right-L.left)*(r-R_MIN)/(R_MAX-R_MIN);
const rowY=k=>L.top+k*L.step;
function buildTimeline(){
 const svg=$('timeline'),instances=[...new Set(data.map(s=>s.instance))],quarter=PERIOD/4,axisY=rowY(instances.length-1)+L.axisGap;
 for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='title')child.remove();
 svg.setAttribute('viewBox','0 0 '+L.w+' '+(axisY+46));svg.classList.toggle('as-compact',L.compact);
 instances.forEach(n=>{startOf[n]=Math.min(...data.filter(s=>s.instance===n).map(s=>s.tE));});
 rowOf=data.map(s=>instances.indexOf(s.instance));
 if(!L.compact)svg.append(el('text',{x:0,y:16,class:'as-col-head'},'Instance and start time'),el('text',{x:L.left,y:16,class:'as-col-head'},'Events, measured from the first electric event of each instance'));
 instances.forEach((n,k)=>{
  const y=rowY(k),start=startOf[n],prev=k?startOf[instances[k-1]]:null,gap=prev===null?'':'  +'+(start-prev).toFixed(2)+' fs';
  svg.append(el('rect',{x:L.left-10,y:y-L.band,width:L.right-L.left+20,height:2*L.band,rx:4,class:'as-row-band'}));
  if(L.compact){
   const t=el('text',{x:L.left-10,y:y-L.band-8,class:'as-row-start'});
   t.append(el('tspan',{class:'as-row-name-inline'},'Instance '+n),el('tspan',{},'  starts '+fs(start)));
   if(gap)t.append(el('tspan',{class:'as-row-gap'},gap));
   svg.append(t);
  }else{
   svg.append(el('text',{x:0,y:y-3,class:'as-row-name'},'Instance '+n));
   const sub=el('text',{x:0,y:y+15,class:'as-row-start'},'starts '+fs(start));
   if(gap)sub.append(el('tspan',{class:'as-row-gap'},gap));
   svg.append(sub);
  }
 });
 const refTop=L.compact?L.top-L.band-2:L.top-24;
 svg.append(el('line',{x1:rx(0),x2:rx(0),y1:refTop,y2:axisY,class:'as-ref as-ref-E'}),el('line',{x1:rx(quarter),x2:rx(quarter),y1:L.compact?20:L.top-40,y2:axisY,class:'as-ref as-ref-H'}));
 svg.append(el('text',{x:rx(quarter)+6,y:L.compact?30:L.top-28,class:'as-ref-text'},'T/4 = '+quarter.toFixed(2)+' fs'));
 data.forEach((s,i)=>{
  const y=rowY(rowOf[i]),xe=rx(s.tE-startOf[s.instance]),xh=rx(s.tH-startOf[s.instance]);
  const e=el('circle',{cx:xe,cy:y,r:5,class:'as-point-E'}),h=el('path',{d:'M'+xh+','+(y-6.5)+'l6.5,6.5l-6.5,6.5l-6.5,-6.5z',class:'as-point-H'});
  for(const m of [e,h]){m.addEventListener('click',()=>select(i));m.style.cursor='pointer';}
  svg.append(e,h);Object.assign(marks[i],{e,h});
 });
 svg.append(el('line',{x1:L.left,x2:L.right,y1:axisY,y2:axisY,class:'as-axis'}));
 for(let k=0;k<=5;k++){const r=k/10;svg.append(el('line',{x1:rx(r),x2:rx(r),y1:axisY,y2:axisY+6,class:'as-axis'}),el('text',{x:rx(r),y:axisY+20,'text-anchor':'middle',class:'as-axis-text'},r.toFixed(1)));}
 svg.append(el('text',{x:L.right,y:axisY+40,'text-anchor':'end',class:'as-axis-text'},L.compact?'Time since the instance’s first electric event (fs)':'Time since the first electric event of the instance (fs)'));
 const sel=el('g',{id:'as-tl-selected'});sel.append(el('path',{class:'as-span'}),el('text',{'text-anchor':'middle',class:'as-span-text'}),el('circle',{r:7,class:'as-dot-E'}),el('path',{class:'as-dot-H'}));svg.append(sel);
}
function selectRow(s,i){
 const tl=fig.querySelector('#as-tl-selected'),y=rowY(rowOf[i]),ex=rx(s.tE-startOf[s.instance]),hx=rx(s.tH-startOf[s.instance]),[span,text,dot,dia]=tl.children,yb=y-12;
 span.setAttribute('d','M'+ex+','+(yb+4)+'V'+yb+'H'+hx+'V'+(yb+4));text.setAttribute('x',(ex+hx)/2);text.setAttribute('y',yb-3);text.textContent='Δt = '+fs(s.delay);
 dot.setAttribute('cx',ex);dot.setAttribute('cy',y);dia.setAttribute('d','M'+hx+','+(y-8)+'l8,8l-8,8l-8,-8z');
}
function fitTimeline(){
 if(!data)return;const box=$('timeline').parentElement,next=box.clientWidth<540?LAYOUTS.compact:LAYOUTS.wide;
 if(next===L&&$('timeline').childElementCount>1)return;L=next;buildTimeline();selectRow(data[current],current);
}
if('ResizeObserver'in window)new ResizeObserver(fitTimeline).observe(fig);else window.addEventListener('resize',fitTimeline);

/* shared selection */
function select(index){
 current=Math.max(0,Math.min(data.length-1,index));const s=data[current],first=data.findIndex(v=>v.instance===s.instance);
 const [x,y]=polar(s.degrees,D.r-3),dial=fig.querySelector('#as-dial-selected');
 dial.querySelector('line').setAttribute('x1',D.cx);dial.querySelector('line').setAttribute('y1',D.cy);dial.querySelector('line').setAttribute('x2',x);dial.querySelector('line').setAttribute('y2',y);
 dial.querySelector('path').setAttribute('d','M'+x+','+(y-7)+'l7,7l-7,7l-7,-7z');
 selectRow(s,current);
 $('label').textContent='Instance '+s.instance+', sample '+(current-first+1)+' (pair '+(current+1)+' of '+data.length+')';
 $('tE').textContent=fs(s.tE);$('tH').textContent=fs(s.tH);$('dt').textContent=fs(s.delay);$('deg').textContent=Math.round(s.degrees)+'°';$('frac').textContent=(s.delay/PERIOD).toFixed(2)+' T';$('int').textContent=s.intensity.toFixed(3);
 $('prev').disabled=current===0;$('next').disabled=current===data.length-1;
 for(const b of fig.querySelectorAll('[data-instance]'))b.setAttribute('aria-pressed',String(Number(b.dataset.instance)===s.instance));
 $('status').textContent='Instance '+s.instance+'. Electric '+fs(s.tE)+', magnetic '+fs(s.tH)+', offset '+fs(s.delay)+', '+Math.round(s.degrees)+' degrees of the optical cycle.';
}
function buildControls(){
 const groups=$('groups');
 for(const n of [...new Set(data.map(s=>s.instance))]){const b=document.createElement('button');b.type='button';b.dataset.instance=n;b.textContent='Instance '+n;b.addEventListener('click',()=>select(data.findIndex(s=>s.instance===n)));groups.insertBefore(b,$('next'));}
 $('prev').addEventListener('click',()=>select(current-1));$('next').addEventListener('click',()=>select(current+1));
 const body=$('table-body');
 data.forEach((s,i)=>{const first=data.findIndex(v=>v.instance===s.instance),row=document.createElement('tr');[s.instance+' / '+(i-first+1),s.tE.toFixed(2),s.tH.toFixed(2),s.delay.toFixed(2),Math.round(s.degrees)+'°',s.intensity.toFixed(3)].forEach((t,c)=>{const cell=document.createElement(c?'td':'th');if(!c)cell.scope='row';cell.textContent=t;row.append(cell);});body.append(row);});
}
function onEnergy(detail){if(detail&&Number.isFinite(detail.lagDeg))showMeep(detail.lagDeg);}
document.addEventListener('anapole-field-cycle:energy',e=>{if(data)onEnergy(e.detail);});
fetch('anapole-temporal-samples.json',{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('Samples unavailable');return r.json();}).then(value=>{
 data=normalize(value);buildPower();buildDial();L=$('timeline').parentElement.clientWidth<540?LAYOUTS.compact:LAYOUTS.wide;buildTimeline();buildControls();select(0);
 onEnergy(root.AnapoleFieldCycleEnergy);
 fig.setAttribute('aria-busy','false');fig.classList.add('as-ready');
}).catch(()=>{fig.setAttribute('aria-busy','false');const e=$('error');e.hidden=false;e.textContent='The published timing samples could not be loaded. The original S2 table is linked below.';});
})(typeof globalThis!=='undefined'?globalThis:window);
