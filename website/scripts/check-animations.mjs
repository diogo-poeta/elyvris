import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

function loadModel(filename) {
  const context = { module: { exports: {} } };
  runInNewContext(readFileSync(new URL('../' + filename, import.meta.url), 'utf8'), context, { filename });
  return context.module.exports;
}
const energy = loadModel('energy-animation.js');
const anapole = loadModel('anapole-animation.js');
const hero = loadModel('hero-field.js');
function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: result must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} differs from ${expected} (tolerance ${tolerance})`);
}

// Tangential E and H, and hence normal flux, must be continuous at both
// lossless interfaces. Sample from either side rather than reading an
// interface field twice; the permitted difference includes the 2e-9 spacing.
let maximumFieldJump = 0;
let interfaceCases = 0;
for (const index of [1, 1.3, 2.6, 3]) {
  for (const time of [-1, 0, 0.6, 1.3, 3, 5, 7, 10]) {
    for (const boundary of [0, energy.slabThickness]) {
      const left = energy.fieldAt(boundary - 1e-9, time, index);
      const right = energy.fieldAt(boundary + 1e-9, time, index);
      for (const field of ['eComplex', 'hComplex']) {
        for (const component of ['re', 'im']) {
          maximumFieldJump = Math.max(maximumFieldJump, Math.abs(left[field][component] - right[field][component]));
          close(left[field][component], right[field][component], 1e-7, `${field}.${component} continuity at z=${boundary}`);
        }
      }
      close(left.smoothFlux, right.smoothFlux, 1e-7, 'interface Poynting flux continuity');
      interfaceCases++;
    }
  }
}

// n=1 removes both interfaces: the dielectric solution must become the
// independent vacuum reference at every sampled position and time.
let vacuumCases = 0;
for (const z of [-1.5, -0.1, 0, 0.3, 1.2, 2.8]) {
  for (const time of [-0.5, 0.4, 2, 4]) {
    const actual = energy.fieldAt(z, time, 1);
    const vacuum = energy.vacuumAt(z, time);
    close(actual.smoothEnergy, vacuum.smoothEnergy, 1e-14, 'n=1 vacuum energy');
    close(actual.smoothFlux, vacuum.smoothFlux, 1e-14, 'n=1 vacuum flux');
    vacuumCases++;
  }
}

// The input quadrature energy density is 0.5 exp(-q^2 / sigma^2), with
// sigma=0.55 vacuum wavelengths. Its exact full-space integral is below.
// Integrate on each side of the interfaces separately so the density jumps
// are not mistaken for numerical violations of energy conservation.
const exactIncidentEnergy = 0.5 * Math.sqrt(Math.PI) * 0.55;
let maximumIntegratedEnergyError = 0;
let conservationCases = 0;
for (const index of [1, 2.6, 3]) {
  for (const time of [0, 2, 5, 9]) {
    let total = 0;
    for (const [start, end] of [[-20, 0], [0, energy.slabThickness], [energy.slabThickness, 20]]) {
      const count = Math.ceil((end - start) / 0.002);
      const step = (end - start) / count;
      for (let i = 0; i < count; i++) {
        total += energy.fieldAt(start + (i + 0.5) * step, time, index).smoothEnergy * step;
      }
    }
    maximumIntegratedEnergyError = Math.max(maximumIntegratedEnergyError, Math.abs(total - exactIncidentEnergy));
    close(total, exactIncidentEnergy, 3e-6, `integrated energy at n=${index}, ct=${time}`);
    conservationCases++;
  }
}

// Before the backward pulse reaches a point well within the slab, the
// field is locally forward-only and its flux/density ratio tends to c/n.
for (const index of [1, 1.3, 2.6, 3]) {
  const z = energy.slabThickness * 0.15;
  const forward = energy.fieldAt(z, index * z, index);
  close(forward.velocityOverC, 1 / index, 1e-9, 'forward bulk energy velocity');
  close(energy.bulkVelocityOverC(index), 1 / index, 1e-15, 'bulk velocity readout');
}
close(energy.ballisticDelayFs(1), 0, 1e-15, 'vacuum excess delay');
close(energy.ballisticDelayFs(2.6), (2.6 - 1) * energy.thicknessNm / 299.792458, 1e-14, 'direct-path excess delay');
let localSamples = 0;
for (const index of [1, 1.3, 2.6, 3]) {
  for (let z = -1.5; z <= 3.5; z += 0.08) {
    for (let time = -0.5; time <= 9; time += 0.5) {
      const field = energy.fieldAt(z, time, index);
      assert.ok(Number.isFinite(field.smoothEnergy) && field.smoothEnergy >= 0, 'nonnegative finite energy');
      assert.ok(Number.isFinite(field.smoothFlux), 'finite Poynting flux');
      assert.ok(Number.isFinite(field.velocityOverC) && Math.abs(field.velocityOverC) <= 1 / field.index + 1e-10, 'passive nondispersive local |S/u| <= c/n');
      localSamples++;
    }
  }
}
assert.throws(() => energy.fieldAt(0, 0, 0.9));
assert.throws(() => energy.fieldAt(0, NaN, 2.6));

// The separate homepage field animation has a shorter slab and uses the
// real instantaneous field rather than quadrature-smoothed profiles. Verify
// its Maxwell interface conditions and single-pulse integrated energy too.
let heroMaximumFieldJump=0,heroMaximumIntegratedEnergyError=0,heroContinuityCases=0;
for(const repeat of [false,true])for(const time of [-1,0,.6,1.3,3,5,7,10])for(const boundary of [0,hero.thickness]){
 const left=hero.fieldAt(boundary-1e-9,time,repeat),right=hero.fieldAt(boundary+1e-9,time,repeat);
 for(const field of ['e','h']){heroMaximumFieldJump=Math.max(heroMaximumFieldJump,Math.abs(left[field]-right[field]));close(left[field],right[field],1e-7,'hero interface '+field);}
 close(left.flux,right.flux,1e-7,'hero interface flux');heroContinuityCases++;
}
const heroInputEnergy=.5*Math.sqrt(Math.PI)*.66*(1+Math.exp(-((2*Math.PI*.66)**2)));
for(const time of [0,2,5,9]){
 let total=0;
 for(const [start,end] of [[-20,0],[0,hero.thickness],[hero.thickness,20]]){
  const count=Math.ceil((end-start)/.001),step=(end-start)/count;
  for(let i=0;i<count;i++)total+=hero.fieldAt(start+(i+.5)*step,time,false).energy*step;
 }
 heroMaximumIntegratedEnergyError=Math.max(heroMaximumIntegratedEnergyError,Math.abs(total-heroInputEnergy));
 close(total,heroInputEnergy,3e-6,'hero integrated instantaneous energy');
}
// Local one-dimensional Poynting theorem away from discontinuities:
// partial_t u + partial_z flux = 0 in the normalised (z,ct) coordinates.
let maximumPoyntingResidual=0,poyntingCases=0;
const step=1e-5;
for(const time of [0,.4,1.1,2,4,7])for(const z of [-1,-.2,.1,.2,.5,1.5]){
 const timeDerivative=(hero.fieldAt(z,time+step,false).energy-hero.fieldAt(z,time-step,false).energy)/(2*step);
 const spaceDerivative=(hero.fieldAt(z+step,time,false).flux-hero.fieldAt(z-step,time,false).flux)/(2*step);
 maximumPoyntingResidual=Math.max(maximumPoyntingResidual,Math.abs(timeDerivative+spaceDerivative));
 close(timeDerivative+spaceDerivative,0,2e-6,'hero local Poynting theorem');poyntingCases++;
}

// Anapole-like cancellation concerns one shared far-field channel, not a
// vanishing driven internal amplitude or zero radiation from all multipoles.
const cancel = anapole.channel(0);
close(cancel.sum.re, 0, 0, 'exact cancelling real channel amplitude');
close(cancel.sum.im, 0, 0, 'exact cancelling imaginary channel amplitude');
close(cancel.relativePeak, 0, 0, 'exact cancelling channel intensity');
close(Math.hypot(cancel.p.re, cancel.p.im), 1, 1e-15, 'nonzero electric contribution at cancellation');
close(Math.hypot(cancel.toroidal.re, cancel.toroidal.im), 1, 1e-15, 'nonzero toroidal-channel contribution at cancellation');
close(cancel.internalAmplitudeSquared, 2, 0, 'retained driven internal amplitudes');
const constructive = anapole.channel(1);
close(constructive.sum.re, 2, 1e-15, 'constructive real channel amplitude');
close(constructive.relativePeak, 1, 1e-15, 'constructive peak intensity');
close(constructive.intensity, 1, 1e-15, 'constructive equatorial intensity');

let radiationSamples = 0;
for (let i = 0; i <= 100; i++) {
  const offset = i / 100;
  const equator = anapole.channel(offset);
  const magnitudeSquared = equator.sum.re ** 2 + equator.sum.im ** 2;
  close(equator.relativePeak, magnitudeSquared / 4, 5e-15, 'coherent-sum radiation intensity');
  close(equator.internalAmplitudeSquared, 2, 0, 'nonzero driven amplitudes across phase offsets');
  for (let j = 0; j <= 180; j++) {
    const theta = j * Math.PI / 180;
    const value = anapole.channel(offset, theta);
    assert.ok(Number.isFinite(value.intensity) && value.intensity >= 0 && value.intensity <= 1, 'finite nonnegative normalized radiation');
    close(value.intensity, equator.relativePeak * Math.sin(theta) ** 2, 5e-15, 'shared dipolar angular channel');
    radiationSamples++;
  }
  close(anapole.channel(offset, 0).intensity, 0, 0, 'dipole-axis radiation node');
}
// Integrating the dipolar intensity over solid angle gives (8 pi/3) times
// its peak, which must retain the same interference suppression factor.
let maximumAngularIntegralError = 0;
for (const offset of [0, 0.2, 0.5, 1]) {
  const intervals = 1000;
  const step = Math.PI / intervals;
  let sum = 0;
  for (let j = 0; j <= intervals; j++) {
    const theta = j * step;
    const weight = j === 0 || j === intervals ? 1 : (j % 2 === 0 ? 2 : 4);
    sum += weight * anapole.channel(offset, theta).intensity * Math.sin(theta);
  }
  const integrated = 2 * Math.PI * sum * step / 3;
  const expected = (8 * Math.PI / 3) * anapole.channel(offset).relativePeak;
  maximumAngularIntegralError = Math.max(maximumAngularIntegralError, Math.abs(integrated - expected));
  close(integrated, expected, 1e-9, 'solid-angle-integrated dipole channel');
}
assert.throws(() => anapole.channel(-0.01));
assert.throws(() => anapole.channel(1.01));
assert.throws(() => anapole.channel(0, NaN));

console.log(JSON.stringify({
  status: 'passed',
  energy: { interfaceCases, vacuumCases, conservationCases, localSamples, maximumFieldJump, maximumIntegratedEnergyError, bulkVelocityAtIndex2_6: energy.bulkVelocityOverC(2.6) },
  hero: {heroContinuityCases,heroMaximumFieldJump,heroMaximumIntegratedEnergyError,poyntingCases,maximumPoyntingResidual},
  anapole: { cancellation: 'exact channel zero with both contributions nonzero', constructiveMaximum: constructive.relativePeak, radiationSamples, maximumAngularIntegralError }
}, null, 2));

