import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context = {module:{exports:{}}};
runInNewContext(readFileSync(new URL('../anapole-radiation.js', import.meta.url), 'utf8'), context);
const {state, intensity} = context.module.exports;
function close(actual, expected, label, tolerance=1e-12) {
  assert.ok(Number.isFinite(actual), `${label}: finite result`);
  assert.ok(Math.abs(actual-expected)<=tolerance, `${label}: ${actual} != ${expected}`);
}
const cancelled = state(1,0);
close(Math.hypot(cancelled.p.re,cancelled.p.im),1,'nonzero electric contribution');
close(Math.hypot(cancelled.q.re,cancelled.q.im),1,'nonzero weighted toroidal contribution');
close(Math.hypot(cancelled.D.re,cancelled.D.im),0,'equal opposing moments cancel');
close(state(1,Math.PI).relativePower,1,'equal in-phase constructive limit');
close(state(0,0).relativePower,.25,'single electric dipole fixed-scale limit');
close(state(1,Math.PI/2).relativePower,.5,'quadrature power');

let angularSamples=0, maximumIntegralError=0;
for (const amplitude of [0,.2,.7,1]) for (const phase of [0,1e-8,.2,Math.PI/2,Math.PI]) {
  const value=state(amplitude,phase);
  close(value.power,value.D.re**2+value.D.im**2,'stable power equals complex-vector norm');
  close(intensity(value.D,0),0,'dipole-axis null');
  close(intensity(value.D,Math.PI),0,'opposite dipole-axis null');
  close(intensity(value.D,Math.PI/2),value.relativePower,'equatorial peak');
  const intervals=1000, step=Math.PI/intervals;
  let integral=0;
  for(let j=0;j<=intervals;j++) {
    const angle=j*step, power=intensity(value.D,angle);
    assert.ok(power>=0,'nonnegative angular power');
    close(power,intensity(value.D,Math.PI-angle),'dipolar angular symmetry');
    integral+=(j===0||j===intervals?1:j%2?4:2)*power*Math.sin(angle);
    angularSamples++;
  }
  const measured=2*Math.PI*step*integral/3;
  const expected=(8*Math.PI/3)*value.relativePower;
  maximumIntegralError=Math.max(maximumIntegralError,Math.abs(measured-expected));
  close(measured,expected,'solid-angle power integral',5e-10);
}
for(const ratio of [-.1,1.1,NaN]) assert.throws(()=>state(ratio,0));
for(const phase of [-.1,Math.PI+.1,NaN]) assert.throws(()=>state(1,phase));
assert.throws(()=>intensity({re:NaN,im:0},0));
console.log(JSON.stringify({status:'passed',momentConfigurations:20,angularSamples,maximumIntegralError,cancellation:'nonzero moments, zero coherent sum',normalization:'one fixed constructive maximum'}));
