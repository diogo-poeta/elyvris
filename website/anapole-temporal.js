/*
 * Published Fig. S2 timing samples, not simulated fields.
 * https://doi.org/10.6084/m9.figshare.27648525.v5 (CC BY 4.0).
 * The moving cursor scans time only; no field interpolation, spatial field
 * reconstruction, magnetic amplitude or claim that every row is a maximum.
 */
(function(root){
'use strict';
const AXIS=Object.freeze({min:8.3,max:10.6,left:78,right:884,eY:100,hY:184}),SECONDS=14,NS='http://www.w3.org/2000/svg';
function normalize(value){
 if(!value||value.schemaVersion!==1||!Array.isArray(value.samples)||!value.samples.length||value.samples.length>48)throw new TypeError('Invalid samples');
 const ids=new Set();let lastE=-Infinity,lastH=-Infinity;
 const samples=value.samples.map((s,i)=>{
  if(!s||!Number.isInteger(s.instance)||s.instance<1||s.instance>4||![s.electricTimeFs,s.magneticTimeFs,s.electricIntensity,s.delayFs].every(Number.isFinite)||s.electricIntensity<0)throw new TypeError('Invalid sample');
  const delayFs=Number((s.magneticTimeFs-s.electricTimeFs).toFixed(2)),id=String(s.id||i);
  if(ids.has(id)||Math.abs(delayFs-s.delayFs)>.005||delayFs<0||s.electricTimeFs<lastE||s.magneticTimeFs<lastH||s.electricTimeFs<AXIS.min||s.magneticTimeFs>AXIS.max)throw new TypeError('Inconsistent sample');
  ids.add(id);lastE=s.electricTimeFs;lastH=s.magneticTimeFs;
  return Object.freeze({id,instance:s.instance,electricTimeFs:s.electricTimeFs,magneticTimeFs:s.magneticTimeFs,electricIntensity:s.electricIntensity,delayFs});
 });
 const events=samples.flatMap((s,index)=>[{time:s.electricTimeFs,field:'E',index},{time:s.magneticTimeFs,field:'H',index}]).sort((a,b)=>a.time-b.time);
 return Object.freeze({samples:Object.freeze(samples),events:Object.freeze(events.map(Object.freeze))});
}
function x(t){return AXIS.left+(AXIS.right-AXIS.left)*(t-AXIS.min)/(AXIS.max-AXIS.min);}
function eventAt(data,t){let result=-1;for(let i=0;i<data.events.length;i++){if(data.events[i].time>t+1e-9)break;result=i;}return result;}
function formatTime(t){return t.toFixed(2)+' fs';}
const api=Object.freeze({normalize,x,eventAt,formatTime,AXIS,SECONDS});
if(typeof module==='object'&&module.exports)module.exports=api;
if(!root.document)return;root.AnapoleTemporal=api;
const viewer=document.querySelector('#anapole-temporal');if(!viewer)return;
const ids=['toggle','replay','previous','next','sample','electric-time','magnetic-time','delay','intensity','sample-label','scan-time','event-label','plot','table-body','groups','status','error'];
const ui={};for(const id of ids){ui[id]=viewer.querySelector('#at-'+id);if(!ui[id])return;}
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let data=null,current=0,time=AXIS.min,playing=!reduced.matches,visible=true,raf=0,last=0,lastDraw=0,eventIndex=-2,cursor,connection,ePoint,hPoint;
const points=[],groupButtons=[];
function node(tag,attrs={},text){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;return el;}
function build(){
 for(let group=1;group<=4;group++){
  const items=data.samples.filter(s=>s.instance===group);if(!items.length)continue;
  const start=x(items[0].electricTimeFs)-14,end=x(items.at(-1).magneticTimeFs)+14;
  ui.plot.append(node('rect',{x:start,y:42,width:end-start,height:174,rx:5,class:group%2?'at-band':'at-band at-band-even'}),node('text',{x:(start+end)/2,y:25,'text-anchor':'middle',class:'at-instance-text'},'Instance '+group));
  const b=document.createElement('button');b.type='button';b.textContent='Instance '+group;b.addEventListener('click',()=>inspect(data.samples.indexOf(items[0])));b.setAttribute('aria-label','Inspect first reported sample in instance '+group);ui.groups.append(b);groupButtons.push({group,b});
 }
 for(const [y,label]of [[AXIS.eY,'E'],[AXIS.hY,'H']])ui.plot.append(node('line',{x1:AXIS.left,x2:AXIS.right,y1:y,y2:y,class:'at-lane at-lane-'+label}),node('text',{x:35,y:y+5,class:'at-lane-label at-lane-label-'+label},label));
 for(let tick=83;tick<=106;tick++){
  const t=tick/10,major=tick%2===0;
  ui.plot.append(node('line',{x1:x(t),x2:x(t),y1:232,y2:major?241:237,class:'at-axis-tick'}));
  if(major||tick===83)ui.plot.append(node('text',{x:x(t),y:261,'text-anchor':'middle',class:'at-axis-text'},t.toFixed(1)));
 }
 ui.plot.append(node('line',{x1:AXIS.left,x2:AXIS.right,y1:232,y2:232,class:'at-axis-tick'}),node('text',{x:AXIS.right,y:289,'text-anchor':'end',class:'at-axis-label'},'Time (fs)'));
 for(const s of data.samples)ui.plot.append(node('line',{x1:x(s.electricTimeFs),y1:AXIS.eY,x2:x(s.magneticTimeFs),y2:AXIS.hY,class:'at-pair-line'}));
 for(const s of data.samples){
  const e=node('circle',{cx:x(s.electricTimeFs),cy:AXIS.eY,r:4,class:'at-point at-point-E'});
  const h=node('path',{d:'M'+x(s.magneticTimeFs)+','+(AXIS.hY-5)+'l5,5l-5,5l-5,-5z',class:'at-point at-point-H'});
  ui.plot.append(e,h);points.push({e,h});
 }
 connection=node('line',{class:'at-selected-pair'});ePoint=node('circle',{cy:AXIS.eY,r:7,class:'at-selected-E'});hPoint=node('path',{class:'at-selected-H'});
 cursor=node('g',{class:'at-cursor'});cursor.append(node('line',{x1:0,x2:0,y1:48,y2:228}),node('path',{d:'M-5,226L0,233L5,226Z'}));ui.plot.append(connection,ePoint,hPoint,cursor);
 for(let i=0;i<data.samples.length;i++){
  const s=data.samples[i],start=data.samples.findIndex(v=>v.instance===s.instance),row=document.createElement('tr');
  [s.instance+' / '+(i-start+1),s.electricTimeFs.toFixed(2),s.magneticTimeFs.toFixed(2),s.delayFs.toFixed(2),s.electricIntensity.toFixed(3)].forEach((text,col)=>{const cell=document.createElement(col?'td':'th');if(!col)cell.scope='row';cell.textContent=text;row.append(cell);});ui['table-body'].append(row);
 }
}
function controls(){
 const ready=!!data;ui.toggle.disabled=ui.replay.disabled=ui.sample.disabled=!ready;ui.previous.disabled=!ready||current<=0;ui.next.disabled=!ready||current>=data.samples.length-1;
 ui.toggle.textContent=playing?'Pause scan':time>=AXIS.max?'Replay scan':'Play scan';ui.toggle.setAttribute('aria-pressed',String(playing));
 if(ready)for(const {group,b}of groupButtons)b.setAttribute('aria-pressed',String(group===data.samples[current].instance));
}
function select(index){
 current=Math.max(0,Math.min(data.samples.length-1,Math.round(index)));
 const s=data.samples[current],start=data.samples.findIndex(v=>v.instance===s.instance);
 ui['electric-time'].textContent=formatTime(s.electricTimeFs);ui['magnetic-time'].textContent=formatTime(s.magneticTimeFs);ui.delay.textContent=formatTime(s.delayFs);ui.intensity.textContent=s.electricIntensity.toFixed(3);
 ui['sample-label'].textContent='Instance '+s.instance+' · sample '+(current-start+1)+' · pair '+(current+1)+' / '+data.samples.length;
 ui.sample.value=String(current);ui.sample.setAttribute('aria-valuetext','Instance '+s.instance+', sample '+(current-start+1)+'. Electric time '+formatTime(s.electricTimeFs)+'. Magnetic time '+formatTime(s.magneticTimeFs)+'. Offset '+formatTime(s.delayFs)+'. Normalized electric field squared '+s.electricIntensity.toFixed(3)+'.');
 const ex=x(s.electricTimeFs),hx=x(s.magneticTimeFs);connection.setAttribute('x1',ex);connection.setAttribute('x2',hx);connection.setAttribute('y1',AXIS.eY);connection.setAttribute('y2',AXIS.hY);ePoint.setAttribute('cx',ex);hPoint.setAttribute('d','M'+hx+','+(AXIS.hY-8)+'l8,8l-8,8l-8,-8z');controls();
}
function scan(){
 cursor.setAttribute('transform','translate('+x(time)+' 0)');ui['scan-time'].textContent=formatTime(time);
 const found=eventAt(data,time);if(found===eventIndex)return;eventIndex=found;
 if(found<0)ui['event-label'].textContent='Before the first reported sample';
 else{const e=data.events[found];select(e.index);ui['event-label'].textContent=(e.field==='E'?'E sample':'H matching sample')+' at '+formatTime(e.time);}
 for(let i=0;i<points.length;i++){points[i].e.classList.toggle('at-reached',data.samples[i].electricTimeFs<=time);points[i].h.classList.toggle('at-reached',data.samples[i].magneticTimeFs<=time);}
}
function announce(text){ui.status.textContent=text;}
function frame(now){
 raf=0;if(!data||!playing||!visible||document.hidden){last=0;return;}if(!last)last=now;
 time=Math.min(AXIS.max,time+Math.min(.1,(now-last)/1000)*(AXIS.max-AXIS.min)/SECONDS);last=now;
 if(!lastDraw||now-lastDraw>=1000/30||time===AXIS.max){scan();lastDraw=now;}
 if(time>=AXIS.max){playing=false;controls();announce('End of the reported interval.');}else raf=requestAnimationFrame(frame);
}
function sync(){if(data&&playing&&visible&&!document.hidden){if(!raf)raf=requestAnimationFrame(frame);}else{cancelAnimationFrame(raf);raf=0;last=0;}}
function inspect(index){if(!data)return;playing=false;select(index);time=data.samples[current].electricTimeFs;eventIndex=-2;scan();controls();sync();const s=data.samples[current];announce('Instance '+s.instance+', pair '+(current+1)+'. Electric time '+formatTime(s.electricTimeFs)+'; magnetic time '+formatTime(s.magneticTimeFs)+'; offset '+formatTime(s.delayFs)+'.');}
function restart(){if(!data)return;time=AXIS.min;eventIndex=-2;select(0);scan();playing=true;controls();sync();announce('Scanning the reported time interval.');}
ui.toggle.addEventListener('click',()=>{if(!data)return;if(time>=AXIS.max)return restart();playing=!playing;controls();sync();announce(playing?'Scanning the reported time interval.':'Scan paused at '+formatTime(time)+'.');});
ui.replay.addEventListener('click',restart);ui.previous.addEventListener('click',()=>inspect(current-1));ui.next.addEventListener('click',()=>inspect(current+1));ui.sample.addEventListener('input',()=>inspect(Number(ui.sample.value)));
document.addEventListener('visibilitychange',sync);reduced.addEventListener?.('change',()=>{if(reduced.matches){playing=false;controls();sync();}});
if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'40px'}).observe(viewer);
// The legacy canvas has ResizeObserver support; this also covers its window-resize fallback when a closed details element is opened.
const channelDetails=document.querySelector('.anapole-channel-details');
channelDetails?.addEventListener('toggle',()=>{if(channelDetails.open)window.dispatchEvent(new Event('resize'));});
controls();fetch('anapole-temporal-samples.json',{credentials:'same-origin'}).then(response=>{if(!response.ok)throw new Error('Samples unavailable');return response.json();}).then(value=>{data=normalize(value);build();ui.sample.min='0';ui.sample.max=String(data.samples.length-1);ui.sample.step='1';select(0);scan();ui.error.hidden=true;viewer.classList.add('at-ready');viewer.setAttribute('aria-busy','false');sync();}).catch(()=>{playing=false;controls();viewer.setAttribute('aria-busy','false');ui.error.textContent='The temporal samples could not be loaded. Open the published S2 table below.';ui.error.hidden=false;announce('Temporal sample loading failed.');});
})(typeof globalThis!=='undefined'?globalThis:window);

