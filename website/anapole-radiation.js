/*
 * Electric-anapole far-field illustration, not a particle simulation.
 * Poeta et al., Opt. Lett. 49, 7198 (2024), Eq. (1):
 * D = p + (i k0/c) T, k0 = 2 pi/lambda0.
 * Define q = (i k0/c) T, p/p0 = 1 and q/p0 = -a exp(i delta).
 * For these collinear moments in homogeneous free space,
 * dP/dOmega is proportional to |D|^2 sin(theta)^2.
 * All three intensity plots use the SAME fixed scale, divided by 4|p0|^2,
 * the peak of equal-amplitude constructive addition. No frame is normalized.
 * The rotating phasors show complex-vector addition; they do not trace
 * physical dipole trajectories or reconstruct internal fields.
 */
(function(root){
  'use strict';
  const TAU=2*Math.PI;
  function state(ratio=1,delta=0){
    if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw new RangeError('ratio must be between 0 and 1');
    if(!Number.isFinite(delta)||delta<0||delta>Math.PI)throw new RangeError('phase must be between 0 and pi');
    const p={re:1,im:0},q={re:-ratio*Math.cos(delta),im:-ratio*Math.sin(delta)};
    const D={re:p.re+q.re,im:q.im};
    // Stable at equal amplitudes and a small offset from cancellation.
    const power=(1-ratio)**2+4*ratio*Math.sin(delta/2)**2;
    return {p,q,D,power,relativePower:power/4,ratio,delta};
  }
  function intensity(moment,theta){
    if(!moment||!Number.isFinite(moment.re)||!Number.isFinite(moment.im)||!Number.isFinite(theta))throw new TypeError('finite complex moment and angle required');
    return (moment.re**2+moment.im**2)*Math.sin(theta)**2/4;
  }
  const api=Object.freeze({state,intensity});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(!root.document)return;
  root.AnapoleRadiation=api;
  const figure=document.querySelector('#anapole-radiation');
  if(!figure)return;
  const get=id=>figure.querySelector('#anr-'+id);
  const phase=get('phase'),ratio=get('ratio'),toggle=get('toggle'),svg=get('phasors');
  if(!phase||!ratio||!toggle||!svg)return;
  const paths={p:get('p-pattern'),q:get('q-pattern'),D:get('D-pattern')};
  const lines={p:get('p-vector'),q:get('q-vector'),D:get('D-vector')};
  const tips={p:get('p-tip'),q:get('q-tip'),D:get('D-tip')};
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let running=!reduced.matches,visible=true,rotation=.55,frame=0,last=0,lastDraw=0;
  function polar(moment){
    const points=[];
    for(let j=0;j<=240;j++){
      const theta=TAU*j/240,r=94*intensity(moment,theta);
      // theta is measured from the common horizontal dipole axis.
      points.push(`${j?'L':'M'}${(140+r*Math.cos(theta)).toFixed(3)},${(145-r*Math.sin(theta)).toFixed(3)}`);
    }
    return points.join(' ')+'Z';
  }
  function vector(key,x1,y1,x2,y2){
    const line=lines[key],tip=tips[key];
    line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);
    const length=Math.hypot(x2-x1,y2-y1);
    line.setAttribute('visibility',length<.05?'hidden':'visible');
    tip.setAttribute('cx',x2);tip.setAttribute('cy',y2);
    tip.setAttribute('visibility',length<.05?'hidden':'visible');
  }
  function draw(){
    const current=state(Number(ratio.value),Number(phase.value)*Math.PI/180);
    for(const key of ['p','q','D'])paths[key].setAttribute('d',polar(current[key]));
    const cx=240,cy=130,scale=73,c=Math.cos(rotation),s=Math.sin(rotation);
    const project=m=>({x:scale*(m.re*c-m.im*s),y:-scale*(m.re*s+m.im*c)});
    const p=project(current.p),D=project(current.D);
    vector('p',cx,cy,cx+p.x,cy+p.y);
    vector('q',cx+p.x,cy+p.y,cx+D.x,cy+D.y);
    vector('D',cx,cy,cx+D.x,cy+D.y);
    get('phase-value').textContent=`${Number(phase.value).toFixed(0)}°`;
    get('ratio-value').textContent=Number(ratio.value).toFixed(2);
    get('power').textContent=`${(100*current.relativePower).toFixed(1)}%`;
    get('D-value').textContent=Math.sqrt(current.power).toFixed(3);
    const cancelled=current.power<1e-12;
    get('condition').textContent=cancelled?'Electric anapole: D = 0':Number(phase.value)===0?'Amplitudes do not cancel':'Away from the anapole condition';
    get('zero').setAttribute('visibility',cancelled?'visible':'hidden');
  }
  function sync(){
    toggle.textContent=running?'Pause phasors':'Play phasors';
    toggle.setAttribute('aria-pressed',String(running));
    if(frame)cancelAnimationFrame(frame);
    frame=0;last=0;
    if(running&&visible&&!document.hidden)frame=requestAnimationFrame(tick);
  }
  function tick(now){
    if(last)rotation=(rotation+Math.min((now-last)/1000,.08)*1.1)%TAU;
    last=now;
    if(now-lastDraw>1000/30){draw();lastDraw=now;}
    if(running&&visible&&!document.hidden)frame=requestAnimationFrame(tick);
  }
  for(const control of [phase,ratio])control.addEventListener('input',draw);
  toggle.addEventListener('click',()=>{running=!running;sync();});
  get('reset').addEventListener('click',()=>{phase.value='0';ratio.value='1';draw();});
  reduced.addEventListener('change',event=>{if(event.matches){running=false;sync();}});
  document.addEventListener('visibilitychange',sync);
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'100px'}).observe(figure);
  draw();sync();
})(typeof globalThis!=='undefined'?globalThis:this);
