/*
 * Coherent single-film Fresnel model for isotropic, passive, nonmagnetic media.
 * Convention: N = n + i k (k >= 0), exp(i k_z z - i omega t).
 * Incident medium is lossless air, n0 = 1. Substrate is semi-infinite.
 * Interfaces are flat; film is uniform; roughness, scattering, coherence loss,
 * anisotropy, nonlinear response and finite-substrate backside effects are absent.
 * This analytical calculation is not FDTD and does not fit experimental data.
 *
 * delta = (2 pi / lambda) sqrt(N1^2 - sin(theta0)^2) d
 * r = (r01 + r12 exp(2i delta)) / (1 + r01 r12 exp(2i delta))
 * t = t01 t12 exp(i delta) / (1 + r01 r12 exp(2i delta))
 * Passive square-root branch: Im(k_z) >= 0, and Re(k_z) >= 0 if real.
 * Transmitted power uses the real normal Poynting flux, including an absorbing
 * substrate. T is flux crossing into that substrate, not light leaving its back.
 * A = 1 - R - T is absorption in the finite film only.
 *
 * Reference: S. J. Byrnes, Multilayer optical calculations,
 * https://arxiv.org/abs/1603.02720 (2016).
 */
(function (root) {
  'use strict';
  var DEFAULTS = Object.freeze({ incidentIndex: 1, substrateIndex: 1.5, angleDeg: 0, polarization: 's' });
  function c(re, im) { return { re: re, im: im || 0 }; }
  function add(a, b) { return c(a.re + b.re, a.im + b.im); }
  function sub(a, b) { return c(a.re - b.re, a.im - b.im); }
  function mul(a, b) { return c(a.re*b.re-a.im*b.im, a.re*b.im+a.im*b.re); }
  function scale(a, b) { return c(a.re*b, a.im*b); }
  function div(a, b) {
    var d=b.re*b.re+b.im*b.im;
    if (!Number.isFinite(d) || d===0) throw new RangeError('Singular optical configuration.');
    return c((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d);
  }
  function abs2(a) { return a.re*a.re+a.im*a.im; }
  function conj(a) { return c(a.re,-a.im); }
  function sqrt(a) {
    var m=Math.hypot(a.re,a.im);
    var re,im;
    if(a.re>=0){re=Math.sqrt(Math.max(0,(m+a.re)/2));im=re===0?0:a.im/(2*re);}
    else{im=Math.sqrt(Math.max(0,(m-a.re)/2));if(a.im<0)im=-im;re=im===0?0:a.im/(2*im);}
    // Passive forward wave decays into the medium. In an evanescent lossless
    // medium the positive imaginary root is selected, with zero forward flux.
    if (im < 0 || (Math.abs(im) < 1e-14 && re < 0)) { re=-re; im=-im; }
    return c(re,im);
  }
  function finite(value,name,min,max) {
    if(!Number.isFinite(value)||value<min||value>max) throw new RangeError(name+' must be a finite number between '+min+' and '+max+'.');
    return value;
  }
  function index(value, k, wavelengthNm, name) {
    if(typeof value==='function') value=value(wavelengthNm);
    if(typeof value==='number') value={n:value,k:k===undefined?0:k};
    if(!value || typeof value!=='object') throw new TypeError(name+' must be a number, {n,k}, or wavelength function.');
    var n=value.n===undefined?value.re:value.n;
    var extinction=value.k===undefined?(value.im===undefined?0:value.im):value.k;
    return c(finite(n,name+' n',0.000001,1000),finite(extinction,name+' k',0,1000));
  }
  function fresnel(pol,ni,nj,ci,cj) {
    var a,b;
    if(pol==='s') { a=mul(ni,ci); b=mul(nj,cj); }
    else { a=mul(nj,ci); b=mul(ni,cj); }
    var denominator=add(a,b);
    return {r:div(sub(a,b),denominator),t:div(scale(mul(ni,ci),2),denominator)};
  }
  function tidyPower(value) { return Math.abs(value)<1e-14?0:(Math.abs(value-1)<1e-14?1:value); }
  function calculatePolarized(pol, n1, ns, cos0, q1, qs, d, wavelength) {
    var n0=c(1,0),ci=c(cos0,0),c1=div(q1,n1),cs=div(qs,ns);
    var phase=scale(q1,2*Math.PI*d/wavelength);
    // exp(i delta) decays rather than grows in an absorbing layer, so this
    // scattering expression stays finite even when the layer is very opaque.
    var attenuation=Math.exp(-phase.im);
    var propagation=c(attenuation*Math.cos(phase.re),attenuation*Math.sin(phase.re));
    var roundTrip=mul(propagation,propagation);
    var r,t;
    if(d===0){var bare=fresnel(pol,n0,ns,ci,cs);r=bare.r;t=bare.t;}
    else if(abs2(q1)<1e-16){
      // A small longitudinal wavevector is not necessarily a zero phase:
      // an extremely thick film can still accumulate finite delta. Use the
      // characteristic expression with sin(delta)/q1, evaluated by its sinc
      // limit at q1=0, instead of replacing the entire layer by zero phase.
      var length=2*Math.PI*d/wavelength;
      var cosine=c(Math.cos(phase.re)*Math.cosh(phase.im),-Math.sin(phase.re)*Math.sinh(phase.im));
      var sine=c(Math.sin(phase.re)*Math.cosh(phase.im),Math.cos(phase.re)*Math.sinh(phase.im));
      var sineOverQ;
      if(abs2(phase)<1e-8){
        var phase2=mul(phase,phase),phase4=mul(phase2,phase2),phase6=mul(phase4,phase2);
        sineOverQ=scale(add(sub(add(c(1),scale(phase4,1/120)),scale(phase2,1/6)),scale(phase6,-1/5040)),length);
      }else sineOverQ=div(sine,q1);
      var qSine=mul(q1,sine),den,num;
      if(pol==='s'){
        var coupling=mul(scale(qs,cos0),sineOverQ);
        den=add(mul(add(c(cos0),qs),cosine),mul(c(0,-1),add(coupling,qSine)));
        num=add(mul(sub(c(cos0),qs),cosine),mul(c(0,1),sub(qSine,coupling)));
        r=div(num,den);t=div(c(2*cos0),den);
      }else{
        var n12=mul(n1,n1),ns2=mul(ns,ns),qOverCos=scale(qs,1/cos0);
        var first=mul(mul(qs,n12),sineOverQ);
        var second=mul(div(ns2,scale(n12,cos0)),qSine);
        den=add(mul(add(qOverCos,ns2),cosine),mul(c(0,-1),add(first,second)));
        num=add(mul(sub(ns2,qOverCos),cosine),mul(c(0,-1),sub(first,second)));
        r=div(num,den);t=div(scale(ns,2),den);
      }
    }else{
      var a=fresnel(pol,n0,n1,ci,c1),b=fresnel(pol,n1,ns,c1,cs);
      var denominator=add(c(1),mul(mul(a.r,b.r),roundTrip));
      r=div(add(a.r,mul(b.r,roundTrip)),denominator);
      t=div(mul(mul(a.t,b.t),propagation),denominator);
    }
    var flux=pol==='s'?mul(ns,cs).re:mul(ns,conj(cs)).re;
    var R=tidyPower(abs2(r));
    var T=tidyPower(abs2(t)*flux/cos0);
    var A=tidyPower(1-R-T);
    return {polarization:pol,R:R,T:T,A:A,r:r,t:t,phaseRadians:phase.re,phase:phase,energyResidual:1-R-T-A};
  }
  function calculate(options) {
    options=options||{};
    var wavelength=finite(options.wavelengthNm,'wavelengthNm',1,1e7);
    var d=finite(options.thicknessNm,'thicknessNm',0,1e7);
    var angle=finite(options.angleDeg===undefined?0:options.angleDeg,'angleDeg',0,89.9);
    var pol=options.polarization||'s';
    if(['s','p','unpolarized'].indexOf(pol)<0) throw new RangeError('polarization must be s, p, or unpolarized.');
    var n1=index(options.filmIndex,options.filmK,wavelength,'filmIndex');
    var ns=index(options.substrateIndex===undefined?1.5:options.substrateIndex,options.substrateK,wavelength,'substrateIndex');
    var theta=angle*Math.PI/180, sin2=Math.sin(theta)*Math.sin(theta),cos0=Math.cos(theta);
    var q1=sqrt(sub(mul(n1,n1),c(sin2))),qs=sqrt(sub(mul(ns,ns),c(sin2)));
    var s=calculatePolarized('s',n1,ns,cos0,q1,qs,d,wavelength);
    var p=calculatePolarized('p',n1,ns,cos0,q1,qs,d,wavelength);
    var selected=pol==='s'?s:(pol==='p'?p:{R:(s.R+p.R)/2,T:(s.T+p.T)/2,A:(s.A+p.A)/2,r:null,t:null,phaseRadians:s.phaseRadians,phase:s.phase,energyResidual:(s.energyResidual+p.energyResidual)/2});
    return { wavelengthNm:wavelength, thicknessNm:d, filmIndex:n1.re, filmK:n1.im,
      substrateIndex:ns.re, substrateK:ns.im,incidentIndex:1,angleDeg:angle,polarization:pol,
      R:selected.R,T:selected.T,A:selected.A,r:selected.r,t:selected.t,
      phaseRadians:selected.phaseRadians,phase:selected.phase,energyResidual:selected.energyResidual,
      s:s,p:p,
      interpretation:'T is power entering the semi-infinite substrate; A is absorption in the film.' };
  }
  function spectrum(options) {
    options=options||{};
    var start=options.startNm===undefined?350:options.startNm;
    var end=options.endNm===undefined?800:options.endNm;
    var step=options.stepNm===undefined?2:options.stepNm;
    finite(start,'startNm',1,1e7); finite(end,'endNm',start,1e7); finite(step,'stepNm',0.01,1e7);
    if((end-start)/step>20000) throw new RangeError('Spectrum is limited to 20,001 samples.');
    var points=[],count=Math.floor((end-start)/step+1e-9);
    for(var i=0;i<=count;i++) points.push(calculate(Object.assign({},options,{wavelengthNm:start+i*step})));
    if(points[points.length-1].wavelengthNm<end-1e-9) points.push(calculate(Object.assign({},options,{wavelengthNm:end})));
    return points;
  }
  function toCSV(points) {
    if(!Array.isArray(points)) throw new TypeError('points must be an array returned by spectrum.');
    return 'wavelength_nm,reflectance,transmittance,film_absorptance,R_s,R_p,T_s,T_p,A_s,A_p,film_n,film_k,substrate_n,substrate_k,thickness_nm,angle_deg,polarization\n'+points.map(function(p){return [p.wavelengthNm,p.R,p.T,p.A,p.s.R,p.p.R,p.s.T,p.p.T,p.s.A,p.p.A,p.filmIndex,p.filmK,p.substrateIndex,p.substrateK,p.thicknessNm,p.angleDeg,p.polarization].join(',');}).join('\n')+'\n';
  }
  root.ThinFilmModel=Object.freeze({calculate:calculate,spectrum:spectrum,toCSV:toCSV,defaults:DEFAULTS});
}(typeof globalThis!=='undefined'?globalThis:window));
