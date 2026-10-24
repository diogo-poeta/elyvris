/*
 * Anapole channel cancellation: an explanatory continuum schematic.
 *
 * A_p = 1, A_T = -exp(i*pi*d), d in [0,1]. A_T already includes the
 * frequency-dependent prefactor converting a toroidal moment to its electric
 * far-field channel. It is NOT the bare toroidal moment T. Both terms have
 * the same dipolar angular radiation pattern; their coherent sum gives
 * I(theta)/I_constructive,max = sin(theta)^2 |A_p + A_T|^2 / 4.
 *
 * At d=0 this isolated channel vanishes while |A_p|=|A_T|=1. Real dielectric
 * structures can retain radiation in other multipoles. The small arrows and
 * bound-charge pairs are schematic polarization/displacement-current motifs,
 * not particle trajectories, atomistic dynamics or an FDTD field map.
 *
 * Primary source: Miroshnichenko et al., Nature Communications 6, 8069 (2015),
 * https://doi.org/10.1038/ncomms9069 . Supplied Poeta thesis, Chapter 7,
 * especially Eq.7.1 and PDF pp.95–100, supplies the local research connection.
 */
(function(root){
  'use strict';
  const TAU=2*Math.PI;
  function channel(detuning,theta=Math.PI/2){
    if(!Number.isFinite(detuning)||detuning<0||detuning>1)throw new RangeError('detuning must be between 0 and 1');
    if(!Number.isFinite(theta))throw new RangeError('theta must be finite');
    const phase=Math.PI*detuning;
    const p={re:1,im:0};
    const toroidal={re:-Math.cos(phase),im:-Math.sin(phase)};
    const sum={re:p.re+toroidal.re,im:toroidal.im};
    // This form is non-negative and numerically stable near cancellation.
    const relativePeak=Math.sin(phase/2)**2;
    return {p,toroidal,sum,relativePeak,intensity:relativePeak*Math.sin(theta)**2,internalAmplitudeSquared:2};
  }
  const model=Object.freeze({channel});
  if(typeof module==='object'&&module.exports)module.exports=model;
  if(!root.document)return;
  root.AnapoleIllustration=model;

  const canvas=document.querySelector('#anapole-canvas');
  const toggle=document.querySelector('#anapole-toggle');
  const slider=document.querySelector('#anapole-detuning');
  if(!canvas||!toggle)return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const readout=document.querySelector('#anapole-radiation-value');
  const mode=document.querySelector('#anapole-mode');
  const colour={ink:'#19372f',green:'#557b39',lime:'#b3cb78',muted:'#66735f',line:'#c7cdbb',pale:'#e9eddf',paper:'#f4f3ed',toroidal:'#a46e47'};
  let width=1000,height=600,time=.6,detuning=slider?Number(slider.value)||0:0;
  let running=!reduced.matches,visible=true,raf=0,last=0,lastDraw=0;

  function line(points,stroke,width=1,fill){
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function arrow(x,y,dx,dy,colourValue,lineWidth=1.6){
    const length=Math.hypot(dx,dy);if(length<1.4)return;
    const angle=Math.atan2(dy,dx),head=Math.min(5.5,length*.42);
    line([{x,y},{x:x+dx,y:y+dy}],colourValue,lineWidth);
    line([{x:x+dx-head*Math.cos(angle-.52),y:y+dy-head*Math.sin(angle-.52)},{x:x+dx,y:y+dy},{x:x+dx-head*Math.cos(angle+.52),y:y+dy-head*Math.sin(angle+.52)}],colourValue,lineWidth);
  }
  function text(value,x,y,size=12,fill=colour.muted,align='center'){
    ctx.fillStyle=fill;ctx.font=`${size}px Arial, Helvetica, sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);
  }
  function label(value,x,y,size=11){ctx.save();ctx.font=`600 ${size}px Arial, Helvetica, sans-serif`;ctx.letterSpacing='.7px';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=colour.ink;ctx.fillText(value,x,y);ctx.restore();}
  function circle(x,y,r,fill,stroke){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}

  function currentPanel(box,state){
    const cx=box.x+box.w/2,cy=box.y+box.h*.47;
    const scale=Math.min(box.w*.34,box.h*.31);
    const size=Math.max(9,Math.min(12,box.w*.029));
    label('INSIDE THE DIELECTRIC',cx,box.y+15,size);
    // Rounded rectangular outline represents a continuum dielectric body.
    ctx.fillStyle=colour.pale;ctx.strokeStyle='#9eaf8a';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.roundRect(cx-scale*.94,cy-scale*.76,scale*1.88,scale*1.52,scale*.16);ctx.fill();ctx.stroke();
    const current=Math.sin(time+Math.PI*detuning);
    const electricCurrent=-Math.sin(time);

    // Two anti-parallel meridional current loops are a standard 2D motif for
    // poloidal displacement currents. Arrows reverse on the optical cycle;
    // no dot moves along a loop and no orbital electron track is implied.
    for(const side of [-1,1]){
      const loopX=cx+side*scale*.43,rx=scale*.31,ry=scale*.56;
      ctx.save();ctx.strokeStyle='rgba(164,110,71,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(loopX,cy,rx,ry,0,0,TAU);ctx.stroke();ctx.restore();
      for(let j=0;j<8;j++){
        const a=j*TAU/8+.13;
        const x=loopX+rx*Math.cos(a),y=cy+ry*Math.sin(a);
        const direction=side*current;
        const tangentX=-rx*Math.sin(a),tangentY=ry*Math.cos(a);
        const normalisation=Math.hypot(tangentX,tangentY);
        const length=scale*.17*direction;
        arrow(x-tangentX/normalisation*length/2,y-tangentY/normalisation*length/2,tangentX/normalisation*length,tangentY/normalisation*length,colour.toroidal,1.4);
      }
    }
    // Small bound-charge pairs indicate local induced polarization. The
    // positive sites stay fixed; the negative charge displacement is linear.
    for(const column of [-.2,.2])for(const row of [-.37,0,.37]){
      const x=cx+column*scale,y=cy+row*scale;
      const displacement=scale*.105*Math.cos(time);
      ctx.strokeStyle='rgba(25,55,47,.18)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+displacement);ctx.stroke();
      circle(x,y,3.1,colour.paper,'#738468');
      ctx.strokeStyle=colour.ink;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x-1.4,y);ctx.lineTo(x+1.4,y);ctx.moveTo(x,y-1.4);ctx.lineTo(x,y+1.4);ctx.stroke();
      circle(x,y+displacement,2.4,colour.green);
    }
    arrow(cx,cy+scale*.7*electricCurrent,0,-scale*1.4*electricCurrent,colour.green,2.4);

    // An incident driving field remains present in both slider settings.
    const incidentX=cx-scale*1.2;
    for(let row=-1;row<=1;row++){
      const y=cy+row*scale*.31;
      const amplitude=.55+.45*Math.abs(Math.cos(time-row*.3));
      arrow(incidentX-scale*.34,y,scale*.24*amplitude,0,'rgba(85,123,57,.6)',1.2);
    }
    text('Driven polarization remains active',cx,box.y+box.h-30,size,colour.ink);
    text('Arrows reverse; bound charges shift locally',cx,box.y+box.h-11,Math.max(8,size-1));
  }

  function radiationPanel(box,state){
    const cx=box.x+box.w/2,cy=box.y+box.h*.47;
    const radius=Math.min(box.w*.32,box.h*.31);
    const size=Math.max(9,Math.min(12,box.w*.029));
    label('ELECTRIC-DIPOLE RADIATION CHANNEL',cx,box.y+15,Math.max(8,size-.5));
    // Fixed-scale dashed reference is the constructive maximum. The actual
    // filled polar shape has radius proportional to cycle-averaged intensity,
    // not amplitude and never a negative value.
    for(let ring=1;ring<=3;ring++){
      ctx.save();ctx.strokeStyle='rgba(102,115,95,.14)';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(cx,cy,radius*ring/3,0,TAU);ctx.stroke();ctx.restore();
    }
    line([{x:cx-radius*1.06,y:cy},{x:cx+radius*1.06,y:cy}],'rgba(102,115,95,.18)',.7);
    line([{x:cx,y:cy-radius*1.06},{x:cx,y:cy+radius*1.06}],'rgba(102,115,95,.18)',.7);
    const reference=[],actual=[];
    for(let j=0;j<=200;j++){
      const a=TAU*j/200;
      const dipole=Math.sin(a)**2;
      reference.push({x:cx+Math.sin(a)*radius*dipole,y:cy-Math.cos(a)*radius*dipole});
      const r=radius*dipole*state.relativePeak;
      actual.push({x:cx+Math.sin(a)*r,y:cy-Math.cos(a)*r});
    }
    ctx.setLineDash([4,5]);line(reference,'rgba(102,115,95,.42)',1);ctx.setLineDash([]);
    if(state.relativePeak>1e-7)line(actual,colour.green,1.6,'rgba(149,181,100,.3)');
    circle(cx,cy,3.8,colour.ink);

    // Outgoing ring segments communicate emission only when this channel
    // carries nonzero power. They disappear exactly at cancellation.
    if(state.relativePeak>.0002){
      for(let ring=0;ring<3;ring++){
        const progress=(time/TAU*.65+ring/3)%1;
        const r=radius*(.22+.93*progress);
        const opacity=(1-progress)*Math.sqrt(state.relativePeak)*.4;
        ctx.save();ctx.strokeStyle=`rgba(85,123,57,${opacity})`;ctx.lineWidth=1;
        for(const center of [0,Math.PI]){ctx.beginPath();ctx.arc(cx,cy,r,center-.38,center+.38);ctx.stroke();}
        ctx.restore();
      }
    }
    const percent=Math.round(state.relativePeak*100);
    text(`${percent}% of the constructive maximum`,cx,box.y+box.h-30,size,colour.ink);
    text(state.relativePeak<1e-7?'This channel cancels; internal motion does not.':'Same angular pattern, different coherent sum.',cx,box.y+box.h-11,Math.max(8,size-1));
  }

  function draw(){
    const state=channel(detuning);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle=colour.paper;ctx.fillRect(0,0,width,height);
    const stack=width<600;
    const inset=stack?7:15;
    if(stack){
      const panelHeight=(height-16)/2;
      currentPanel({x:inset,y:3,w:width-2*inset,h:panelHeight},state);
      line([{x:width*.1,y:height/2},{x:width*.9,y:height/2}],colour.line,.75);
      radiationPanel({x:inset,y:height/2+6,w:width-2*inset,h:panelHeight},state);
    }else{
      currentPanel({x:inset,y:10,w:width/2-2*inset,h:height-20},state);
      line([{x:width/2,y:height*.12},{x:width/2,y:height*.88}],colour.line,.75);
      radiationPanel({x:width/2+inset,y:10,w:width/2-2*inset,h:height-20},state);
    }
  }
  function updateReadouts(){
    const state=channel(detuning);
    if(readout)readout.textContent=`${Math.round(state.relativePeak*100)}%`;
    if(mode)mode.textContent=detuning<.015?'Anapole-like cancellation':detuning>.985?'Constructive addition':'Partial cancellation';
    if(slider)slider.setAttribute('aria-valuetext',`${Math.round(state.relativePeak*100)} percent of constructive-maximum radiation in this channel`);
  }
  function toggleText(){toggle.setAttribute('aria-pressed',String(running));toggle.setAttribute('aria-label',running?'Pause the anapole animation':'Play the anapole animation');toggle.innerHTML=running?'Pause <span aria-hidden="true">Ⅱ</span>':'Play <span aria-hidden="true">▷</span>';}
  function frame(now){
    raf=0;if(!running||!visible||document.hidden){last=0;return;}
    if(!last)last=now;time+=Math.min(.1,(now-last)/1000)*1.45;last=now;
    if(!lastDraw||now-lastDraw>=1000/30){draw();lastDraw=now;}
    raf=requestAnimationFrame(frame);
  }
  function sync(){if(running&&visible&&!document.hidden){if(!raf)raf=requestAnimationFrame(frame);}else{cancelAnimationFrame(raf);raf=0;last=0;}}
  function resize(){
    const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);
    const dpr=Math.min(window.devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();
  }
  toggle.addEventListener('click',()=>{running=!running;toggleText();sync();});
  slider?.addEventListener('input',()=>{detuning=Math.max(0,Math.min(1,Number(slider.value)||0));updateReadouts();draw();});
  reduced.addEventListener?.('change',()=>{if(reduced.matches){running=false;toggleText();sync();}});
  document.addEventListener('visibilitychange',sync);
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'80px'}).observe(canvas);
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  updateReadouts();toggleText();resize();sync();
})(typeof globalThis!=='undefined'?globalThis:window);
