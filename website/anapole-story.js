/*
 * Anapole formation in three panels, from published data only.
 *  (a) Supplement Fig. S3 (radiated power), unchanged, with the time window of
 *      the S2 timing events shaded on top.
 *  (b) Each published electric-to-magnetic offset drawn as an angle on one
 *      optical cycle (360 degrees = T = lambda/c). The Meep marker comes from
 *      anapole-field-cycle.js (energy inside the particle), when it has loaded.
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
 label.append(el('tspan',{x:1400,dy:0},'Timing events in (b)'),el('tspan',{x:1400,dy:105},fs(first)+' to '+fs(last)),el('tspan',{x:1400,dy:105,class:'as-svg-note-soft'},'radiated power here is at most'),el('tspan',{x:1400,dy:95,class:'as-svg-note-soft'},'about a tenth of its peak'));
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

/* shared selection */
function select(index){
 current=Math.max(0,Math.min(data.length-1,index));const s=data[current],first=data.findIndex(v=>v.instance===s.instance);
 const [x,y]=polar(s.degrees,D.r-3),dial=fig.querySelector('#as-dial-selected');
 dial.querySelector('line').setAttribute('x1',D.cx);dial.querySelector('line').setAttribute('y1',D.cy);dial.querySelector('line').setAttribute('x2',x);dial.querySelector('line').setAttribute('y2',y);
 dial.querySelector('path').setAttribute('d','M'+x+','+(y-7)+'l7,7l-7,7l-7,-7z');
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
 data=normalize(value);buildPower();buildDial();buildControls();select(0);
 onEnergy(root.AnapoleFieldCycleEnergy);
 fig.setAttribute('aria-busy','false');fig.classList.add('as-ready');
}).catch(()=>{fig.setAttribute('aria-busy','false');const e=$('error');e.hidden=false;e.textContent='The published timing samples could not be loaded. The original S2 table is linked below.';});
})(typeof globalThis!=='undefined'?globalThis:window);
