/*
 * Energy transport through an ideal nondispersive dielectric slab.
 *
 * Exact 1D normal-incidence pulse solution for a uniform, nonmagnetic,
 * lossless air / slab / air stack, including 20 internal round-trip terms.
 * N = n is constant in frequency. The user-selected n is illustrative:
 * n = 2.6 is NOT a fit to dispersive TiO2, nor a thesis-result reproduction.
 *
 * z and ct use the free-space carrier wavelength lambda0 = 400 nm.
 * Slab thickness d = 1.2 lambda0 = 480 nm. h = Z0 H.
 * For real fields: u/(epsilon0 E0^2) = (n^2 e^2+h^2)/2,
 * S/(epsilon0 c E0^2) = e h. Thus vE/c = (e h)/u.
 * Curves use quadrature-averaged densities/fluxes of the modulated carrier,
 * i.e. 1/4(n^2 |e|^2+|h|^2) and 1/2 Re(e h*). This removes rapid carrier
 * oscillations; it is not a claim that local flow is always c/n.
 * Only a single forward plane-wave pulse in the homogeneous bulk has
 * energy velocity = group velocity = phase velocity = c/n in this model.
 *
 * General Maxwell and energy-flux background: Peatross & Ware,
 * Physics of Light and Optics, Chapters 2 and 4, https://optics.byu.edu/.
 */
(function(root){
  'use strict';
  const SLAB=1.2, LAMBDA_NM=400, WIDTH=.55, TERMS=20, C_NM_PER_FS=299.792458;
  function pulse(q){const envelope=Math.exp(-q*q/(2*WIDTH*WIDTH));return {re:envelope*Math.cos(2*Math.PI*q),im:envelope*Math.sin(2*Math.PI*q)};}
  function addWeighted(target,value,weight){target.re+=weight*value.re;target.im+=weight*value.im;}
  function fieldAt(z,time,n=2.6){
    if(!Number.isFinite(z)||!Number.isFinite(time)||!Number.isFinite(n)||n<1||n>3)throw new RangeError('Finite z/time and refractive index 1–3 are required.');
    const front=(1-n)/(1+n),inside=-front,tIn=2/(1+n),tOut=2*n/(1+n),roundTrip=inside*inside;
    const f={re:0,im:0},b={re:0,im:0};
    let index=1;
    if(z<0){
      addWeighted(f,pulse(z-time),1);addWeighted(b,pulse(-z-time),front);
      for(let m=0,w=1;m<TERMS;m++,w*=roundTrip)addWeighted(b,pulse(-z+2*(m+1)*n*SLAB-time),tIn*tOut*inside*w);
    }else if(z<=SLAB){
      index=n;
      for(let m=0,w=1;m<TERMS;m++,w*=roundTrip){
        addWeighted(f,pulse(n*z+2*m*n*SLAB-time),tIn*w);
        addWeighted(b,pulse(n*(2*SLAB-z)+2*m*n*SLAB-time),tIn*inside*w);
      }
    }else{
      for(let m=0,w=1;m<TERMS;m++,w*=roundTrip)addWeighted(f,pulse(z-SLAB+(2*m+1)*n*SLAB-time),tIn*tOut*w);
    }
    const e={re:f.re+b.re,im:f.im+b.im},h={re:index*(f.re-b.re),im:index*(f.im-b.im)};
    const e2=e.re*e.re+e.im*e.im,h2=h.re*h.re+h.im*h.im;
    const energy=(index*index*e.re*e.re+h.re*h.re)/2,flux=e.re*h.re;
    const smoothEnergy=(index*index*e2+h2)/4,smoothFlux=(e.re*h.re+e.im*h.im)/2;
    return {e:e.re,h:h.re,eComplex:e,hComplex:h,index,energy,flux,smoothEnergy,smoothFlux,velocityOverC:smoothEnergy>1e-18?smoothFlux/smoothEnergy:0};
  }
  function vacuumAt(z,time){
    const value=pulse(z-time),density=(value.re*value.re+value.im*value.im)/2;
    return {smoothEnergy:density,smoothFlux:density,velocityOverC:1};
  }
  const model=Object.freeze({fieldAt,vacuumAt,slabThickness:SLAB,thicknessNm:SLAB*LAMBDA_NM,wavelengthNm:LAMBDA_NM,bulkVelocityOverC:n=>1/n,ballisticDelayFs:n=>(n-1)*SLAB*LAMBDA_NM/C_NM_PER_FS});
  if(typeof module==='object'&&module.exports)module.exports=model;
  root.EnergyTransportModel=model;
  if(!root.document)return;
  const canvas=document.querySelector('#energy-canvas'),toggle=document.querySelector('#energy-toggle');
  if(!canvas||!toggle)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const slider=document.querySelector('#energy-index'),numeric=document.querySelector('#energy-index-value');
  const bulk=document.querySelector('#energy-bulk-speed'),delay=document.querySelector('#energy-delay');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let n=2.6,time=.24,width=900,height=470,running=!motion.matches,visible=true,frame=0,lastClock=0,lastDraw=0;
  const Z_MIN=-1.8,Z_MAX=3.8,COUNT=280;
  const palette={background:'#17382e',ink:'#eaf4d9',muted:'#b9cbb3',curve:'#d8f58a',reference:'#c9dbcb'};
  function line(x1,y1,x2,y2,color,weight=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();}
  function text(value,x,y,color,size=11,align='left'){ctx.fillStyle=color;ctx.font=size+'px Arial, sans-serif';ctx.textAlign=align;ctx.fillText(value,x,y);}
  function arrow(x,y,sign,strength){
    const length=8+strength*7,tip=x+sign*length;
    line(x,y,tip,y,palette.curve,1.2);
    line(tip-sign*4,y-3,tip,y,palette.curve,1.2);line(tip-sign*4,y+3,tip,y,palette.curve,1.2);
  }
  function draw(){
    ctx.fillStyle=palette.background;ctx.fillRect(0,0,width,height);
    const compact=width<550,left=compact?22:42,right=compact?22:42,plotWidth=width-left-right;
    const top=Math.max(45,height*.13),gap=height*.36,firstBase=height*.33,secondBase=firstBase+gap;
    const scale=height*.17/3.1;
    const x=z=>left+(z-Z_MIN)/(Z_MAX-Z_MIN)*plotWidth;
    const a=x(0),b=x(SLAB);
    ctx.fillStyle='rgba(201,224,171,.075)';ctx.fillRect(a,secondBase-height*.27,b-a,height*.3);
    line(a,secondBase-height*.27,a,secondBase+height*.03,'rgba(216,245,174,.38)',.8);
    line(b,secondBase-height*.27,b,secondBase+height*.03,'rgba(216,245,174,.38)',.8);
    for(let pos=a+5;pos<b;pos+=10)line(pos,secondBase-height*.27,pos,secondBase+height*.03,'rgba(216,245,174,.035)',.6);
    text('ENERGY IN MOTION',left,26,palette.muted,compact?9:10);
    text('air → ideal slab → air',width-right,26,palette.muted,compact?9:10,'right');
    text('Vacuum reference',left,top-5,palette.ink,compact?12:14);
    text('v = c',width-right,top-5,palette.reference,compact?11:12,'right');
    text('Ideal dielectric',left,top+gap-5,palette.ink,compact?12:14);
    text('n = '+n.toFixed(2),width-right,top+gap-5,palette.curve,compact?11:12,'right');
    function lane(base,sample,color){
      line(left,base,width-right,base,'rgba(216,235,204,.22)',.8);
      ctx.beginPath();ctx.moveTo(left,base);
      const samples=[];
      for(let i=0;i<COUNT;i++){
        const z=Z_MIN+(Z_MAX-Z_MIN)*i/(COUNT-1),value=sample(z,time,n),px=x(z),py=base-value.smoothEnergy/.5*scale;
        samples.push({px,py,value,z});ctx.lineTo(px,py);
      }
      ctx.lineTo(width-right,base);ctx.closePath();ctx.fillStyle=color===palette.curve?'rgba(216,245,138,.19)':'rgba(201,219,203,.13)';ctx.fill();
      ctx.beginPath();samples.forEach((v,i)=>i?ctx.lineTo(v.px,v.py):ctx.moveTo(v.px,v.py));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
      for(let i=12;i<samples.length-12;i+=28){const s=samples[i],power=Math.abs(s.value.smoothFlux)/.5;if(power>.045)arrow(s.px,base+12,Math.sign(s.value.smoothFlux),Math.min(1,power));}
    }
    lane(firstBase,vacuumAt,palette.reference);lane(secondBase,fieldAt,palette.curve);
    text('0',a,secondBase+33,palette.muted,9,'center');text('d',b,secondBase+33,palette.muted,9,'center');
    const sample=fieldAt(SLAB*.5,time,n),local=sample.smoothEnergy>.001?(sample.velocityOverC.toFixed(2)+' c'):'—';
    const foot=height-58;
    text('Bulk forward-wave speed: '+(1/n).toFixed(3)+' c',left,foot,palette.curve,compact?10:12);
    text('Local S/u at slab centre: '+local,left,foot+20,palette.muted,compact?9:11);
    if(!compact)text('Direct-path delay: '+model.ballisticDelayFs(n).toFixed(2)+' fs',width-right,foot,palette.curve,12,'right');
    text(compact?'Area: energy density · arrows: signed flux':'Filled curve: quadrature-averaged energy density · arrows: signed Poynting flux',left,height-13,palette.muted,compact?8:10);
  }
  function resize(){const bounds=canvas.getBoundingClientRect();width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);const ratio=Math.min(window.devicePixelRatio||1,1.75);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);draw();}
  function readouts(){if(slider)slider.value=String(n);if(numeric)numeric.value=String(n);if(bulk)bulk.textContent=(1/n).toFixed(3)+' c';if(delay)delay.textContent=model.ballisticDelayFs(n).toFixed(2)+' fs';}
  function updateToggle(){toggle.setAttribute('aria-pressed',String(running));toggle.setAttribute('aria-label',running?'Pause the energy transport animation':'Play the energy transport animation');toggle.textContent=running?'Pause animation Ⅱ':'Play animation ▷';}
  function animate(now){frame=0;if(!running||!visible||document.hidden){lastClock=0;return;}if(!lastClock)lastClock=now;const elapsed=Math.min(.1,(now-lastClock)/1000);lastClock=now;time+=elapsed*.8;if(time>11.6)time=-1.8;if(!lastDraw||now-lastDraw>=1000/30){draw();lastDraw=now;}frame=requestAnimationFrame(animate);}
  function sync(){if(running&&visible&&!document.hidden){if(!frame)frame=requestAnimationFrame(animate);}else{cancelAnimationFrame(frame);frame=0;lastClock=0;}}
  function change(event){const value=Number(event.target.value);if(!Number.isFinite(value)||value<1||value>3){event.target.setAttribute('aria-invalid','true');return;}event.target.removeAttribute('aria-invalid');n=value;readouts();draw();}
  slider?.addEventListener('input',change);numeric?.addEventListener('input',change);
  toggle.addEventListener('click',()=>{running=!running;updateToggle();sync();});document.addEventListener('visibilitychange',sync);
  motion.addEventListener?.('change',()=>{if(motion.matches){running=false;updateToggle();sync();}});
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'60px'}).observe(canvas);
  if('ResizeObserver'in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  readouts();updateToggle();resize();sync();
})(typeof globalThis!=='undefined'?globalThis:window);

