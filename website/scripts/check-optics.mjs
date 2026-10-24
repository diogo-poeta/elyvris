import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const context = {};
for (const file of ['optics-model.js','materials.js']) runInNewContext(readFileSync(new URL('../'+file, import.meta.url), 'utf8'), context);
context.OpticalMaterials.setData(JSON.parse(readFileSync(new URL('../materials-data.json',import.meta.url),'utf8')));
const model=context.ThinFilmModel,materials=context.OpticalMaterials;
const close=(actual,expected,tol=2e-11)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} differs from ${expected}`);
let checks=0;
const bareR=((1-1.5)/(1+1.5))**2;
for(const filmIndex of [1.1,Math.sqrt(1.5),1.5,2.1,3]){
 const p=model.calculate({filmIndex,thicknessNm:0,wavelengthNm:550});close(p.R,bareR);close(p.T,1-bareR);close(p.r.re,-.2);close(p.r.im,0);checks++;
}
for(const angleDeg of [0,20,45,65,85])for(const polarization of ['s','p']){
 const c0=Math.cos(angleDeg*Math.PI/180),cs=Math.sqrt(1-(Math.sin(angleDeg*Math.PI/180)/1.5)**2);
 const r=polarization==='s'?(c0-1.5*cs)/(c0+1.5*cs):(1.5*c0-cs)/(1.5*c0+cs);
 const p=model.calculate({filmIndex:2.7,filmK:3,thicknessNm:0,wavelengthNm:550,angleDeg,polarization});close(p.R,r*r);close(p.R+p.T,1);close(p.A,0);checks++;
}
const brewster=model.calculate({filmIndex:2,thicknessNm:0,wavelengthNm:550,angleDeg:Math.atan(1.5)*180/Math.PI,polarization:'p'});close(brewster.R,0);checks++;
const matching=Math.sqrt(1.5),design=550;
const ar=model.calculate({filmIndex:matching,thicknessNm:design/(4*matching),wavelengthNm:design});close(ar.R,0);close(ar.T,1);checks++;
const half=model.calculate({filmIndex:2.1,thicknessNm:design/(2*2.1),wavelengthNm:design});close(half.R,bareR);checks++;
for(const angleDeg of [0,30,60,80]){
 const p=model.calculate({filmIndex:{n:2.3,k:.17},thicknessNm:120,wavelengthNm:550,angleDeg,polarization:'unpolarized'});
 close(p.R,(p.s.R+p.p.R)/2);close(p.T,(p.s.T+p.p.T)/2);assert.equal(p.r,null);checks++;
}
// Independent reference values generated with Steven Byrnes' tmm.coh_tmm,
// using the public reference implementation. Reference derivation:
// https://arxiv.org/abs/1603.02720 ; https://github.com/sbyrnes321/tmm
const references = [
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 120,
      "wavelengthNm": 550,
      "angleDeg": 45,
      "polarization": "s"
    },
    "expected": {
      "R": 0.15906905544908084,
      "T": 0.8409309445509185,
      "A": 6.661338147750939e-16
    }
  },
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 120,
      "wavelengthNm": 550,
      "angleDeg": 45,
      "polarization": "p"
    },
    "expected": {
      "R": 0.030159400994843436,
      "T": 0.9698405990051565,
      "A": 0.0
    }
  },
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0.12,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 120,
      "wavelengthNm": 550,
      "angleDeg": 45,
      "polarization": "s"
    },
    "expected": {
      "R": 0.16480721842375048,
      "T": 0.5861355355715963,
      "A": 0.2490572460046533
    }
  },
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0.12,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 120,
      "wavelengthNm": 550,
      "angleDeg": 45,
      "polarization": "p"
    },
    "expected": {
      "R": 0.030552164486409347,
      "T": 0.6829446385119309,
      "A": 0.2865031970016598
    }
  },
  {
    "options": {
      "filmIndex": 0.25,
      "filmK": 3.2,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 45,
      "wavelengthNm": 550,
      "angleDeg": 60,
      "polarization": "s"
    },
    "expected": {
      "R": 0.9272537942446577,
      "T": 0.02409383040730785,
      "A": 0.048652375348034446
    }
  },
  {
    "options": {
      "filmIndex": 0.25,
      "filmK": 3.2,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 45,
      "wavelengthNm": 550,
      "angleDeg": 60,
      "polarization": "p"
    },
    "expected": {
      "R": 0.7691515692726855,
      "T": 0.08774728349944469,
      "A": 0.14310114722786985
    }
  },
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0.12,
      "substrateIndex": 3.8,
      "substrateK": 0.2,
      "thicknessNm": 200,
      "wavelengthNm": 650,
      "angleDeg": 72,
      "polarization": "s"
    },
    "expected": {
      "R": 0.6132672924557938,
      "T": 0.21891327253871712,
      "A": 0.16781943500548907
    }
  },
  {
    "options": {
      "filmIndex": 2.1,
      "filmK": 0.12,
      "substrateIndex": 3.8,
      "substrateK": 0.2,
      "thicknessNm": 200,
      "wavelengthNm": 650,
      "angleDeg": 72,
      "polarization": "p"
    },
    "expected": {
      "R": 0.02690125285007039,
      "T": 0.5602983268710828,
      "A": 0.4128004202788468
    }
  },
  {
    "options": {
      "filmIndex": 0.8,
      "filmK": 0,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 300,
      "wavelengthNm": 500,
      "angleDeg": 60,
      "polarization": "s"
    },
    "expected": {
      "R": 0.8516070203393021,
      "T": 0.14839297966069814,
      "A": -2.7755575615628914e-16
    }
  },
  {
    "options": {
      "filmIndex": 0.8,
      "filmK": 0,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 300,
      "wavelengthNm": 500,
      "angleDeg": 60,
      "polarization": "p"
    },
    "expected": {
      "R": 0.7202599031661774,
      "T": 0.2797400968338229,
      "A": -2.7755575615628914e-16
    }
  },
  {
    "options": {
      "filmIndex": 1.7,
      "filmK": 0,
      "substrateIndex": 1.4,
      "substrateK": 0.4,
      "thicknessNm": 0,
      "wavelengthNm": 633,
      "angleDeg": 45,
      "polarization": "s"
    },
    "expected": {
      "R": 0.12125875834000381,
      "T": 0.8787412416599959,
      "A": 3.3306690738754696e-16
    }
  },
  {
    "options": {
      "filmIndex": 1.7,
      "filmK": 0,
      "substrateIndex": 1.4,
      "substrateK": 0.4,
      "thicknessNm": 0,
      "wavelengthNm": 633,
      "angleDeg": 45,
      "polarization": "p"
    },
    "expected": {
      "R": 0.014703686474159424,
      "T": 0.9852963135258405,
      "A": 1.1102230246251565e-16
    }
  },
  {
    "options": {
      "filmIndex": 1.7,
      "filmK": 0,
      "substrateIndex": 1.4,
      "substrateK": 0.4,
      "thicknessNm": 200,
      "wavelengthNm": 633,
      "angleDeg": 45,
      "polarization": "s"
    },
    "expected": {
      "R": 0.13941602211629198,
      "T": 0.8605839778837076,
      "A": 4.440892098500626e-16
    }
  },
  {
    "options": {
      "filmIndex": 1.7,
      "filmK": 0,
      "substrateIndex": 1.4,
      "substrateK": 0.4,
      "thicknessNm": 200,
      "wavelengthNm": 633,
      "angleDeg": 45,
      "polarization": "p"
    },
    "expected": {
      "R": 0.018940085895268174,
      "T": 0.9810599141047315,
      "A": 3.3306690738754696e-16
    }
  },
  {
    "options": {
      "filmIndex": 2.0,
      "filmK": 15,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 10000,
      "wavelengthNm": 400,
      "angleDeg": 70,
      "polarization": "s"
    },
    "expected": {
      "R": 0.9881950244758261,
      "T": 1.0713779202919157e-32,
      "A": 0.011804975524173922
    }
  },
  {
    "options": {
      "filmIndex": 2.0,
      "filmK": 15,
      "substrateIndex": 1.5,
      "substrateK": 0,
      "thicknessNm": 10000,
      "wavelengthNm": 400,
      "angleDeg": 70,
      "polarization": "p"
    },
    "expected": {
      "R": 0.9056620748634303,
      "T": 1.3720519001732686e-31,
      "A": 0.09433792513656969
    }
  }
];
for(const test of references){const p=model.calculate(test.options);for(const key of ['R','T','A'])close(p[key],test.expected[key]);checks++;}
// Lossless-film energy conservation and passive absorbing-film bounds across
// normal, oblique, evanescent-film and highly absorbing configurations.
let sampleCount=0,largestLosslessError=0,smallestAbsorptance=1;
for(const filmIndex of [.6,.9,1.1,1.5,2.1,3])for(const filmK of [0,.001,.3,4])for(const substrateK of [0,.15])for(const thicknessNm of [0,25,100,300,600,10000])for(const angleDeg of [0,20,45,60,80])for(const polarization of ['s','p']){
 const p=model.calculate({filmIndex,filmK,substrateIndex:1.5,substrateK,thicknessNm,wavelengthNm:550,angleDeg,polarization});
 for(const key of ['R','T','A'])assert.ok(Number.isFinite(p[key])&&p[key]>=-1e-10&&p[key]<=1+1e-10,`${key}=${p[key]}`);
 close(p.R+p.T+p.A,1);smallestAbsorptance=Math.min(smallestAbsorptance,p.A);
 if(filmK===0||thicknessNm===0){largestLosslessError=Math.max(largestLosslessError,Math.abs(p.A));close(p.A,0);}sampleCount++;
}
// Critical-angle film limit is finite and agrees continuously with nearby n.
for(const polarization of ['s','p']){
 const critical=model.calculate({filmIndex:Math.sin(Math.PI/6),thicknessNm:200,wavelengthNm:550,angleDeg:30,polarization});
 const near=model.calculate({filmIndex:Math.sin(Math.PI/6)+1e-8,thicknessNm:200,wavelengthNm:550,angleDeg:30,polarization});
 close(critical.R,near.R,2e-7);close(critical.T,near.T,2e-7);close(critical.A,0);checks++;
}
// Regression: q1 close to zero may still accumulate finite phase in a very
// thick film. A film identical to the substrate cannot create a new interface,
// so changing its thickness must preserve the bare-interface power exactly.
for(const polarization of ['s','p'])for(const thicknessNm of [100000,10000000]){
 const o={filmIndex:.5,substrateIndex:.5,thicknessNm,wavelengthNm:1,angleDeg:30,polarization};
 const actual=model.calculate(o),bare=model.calculate({...o,thicknessNm:0});
 close(actual.R,bare.R,2e-14);close(actual.T,bare.T,2e-14);close(actual.A,0);checks++;
}
// Normal-incidence powers are independent of the s/p amplitude-sign convention,
// including absorbing films and absorbing semi-infinite substrates.
for(const filmIndex of [{n:2.3,k:0},{n:.2,k:3.5}])for(const substrateIndex of [{n:1.5,k:0},{n:3.8,k:.2}]){
 const o=model.calculate({filmIndex,substrateIndex,thicknessNm:88,wavelengthNm:550});
 for(const key of ['R','T','A'])close(o.s[key],o.p[key],2e-14);checks++;
}
// An evanescent field in a lossless final medium carries no normal power.
for(const polarization of ['s','p']){
 const o=model.calculate({filmIndex:2,substrateIndex:.5,thicknessNm:0,wavelengthNm:550,angleDeg:60,polarization});
 close(o.R,1,2e-14);close(o.T,0,2e-14);close(o.A,0,2e-14);checks++;
}
// Known material check values and direct tabulated data preservation.
close(materials.get('silica-malitson',587.6).n,1.4584623420532408,1e-12);
close(materials.get('bk7-schott',587.6).n,1.5167984379050088,1e-12);
const gold=materials.get('gold-johnson',587.6);assert.ok(gold.n>.2&&gold.n<.5&&gold.k>2.5&&gold.k<3.2);
assert.equal(materials.get('silica-malitson',550).k,0);
assert.throws(()=>materials.get('silica-malitson',209));
assert.throws(()=>materials.get('silicon-green',1451));
const overlap=materials.range(['silica-malitson','silicon-green']);close(overlap.minNm,250);close(overlap.maxNm,1450);
// The loader must preserve exact table nodes, interpolate in wavelength,
// and reject both endpoints outside each record rather than extrapolate.
const materialData=JSON.parse(readFileSync(new URL('../materials-data.json',import.meta.url),'utf8'));
let materialTableChecks=0;
for(const record of materialData.records){
 assert.throws(()=>materials.get(record.id,record.minNm-Math.max(1e-8,record.minNm*1e-10)));
 assert.throws(()=>materials.get(record.id,record.maxNm+Math.max(1e-8,record.maxNm*1e-10)));
 for(const table of record.models.filter(m=>m.type.startsWith('tabulated'))){
  for(let i=0;i<table.data.length;i++){
   const row=table.data[i];if(row[0]<record.minNm||row[0]>record.maxNm)continue;
   const value=materials.get(record.id,row[0]);
   if(table.type==='tabulated nk'){close(value.n,row[1],1e-13);close(value.k,row[2],1e-13);}
   else close(value[table.type==='tabulated k'?'k':'n'],row[1],1e-13);
   materialTableChecks++;
   if(i+1<table.data.length){const next=table.data[i+1],mid=(row[0]+next[0])/2;if(mid>record.maxNm)continue;const middle=materials.get(record.id,mid);
    if(table.type==='tabulated nk'){close(middle.n,(row[1]+next[1])/2,2e-12);close(middle.k,(row[2]+next[2])/2,2e-12);}
    else close(middle[table.type==='tabulated k'?'k':'n'],(row[1]+next[1])/2,2e-12);
    materialTableChecks++;
   }
  }
 }
}
const disp=model.calculate({filmIndex:w=>materials.get('tio2-siefke',w),substrateIndex:w=>materials.get('silica-malitson',w),thicknessNm:100,wavelengthNm:350,angleDeg:45,polarization:'unpolarized'});assert.ok(disp.A>0&&disp.A<1);
const points=model.spectrum({filmIndex:w=>materials.get('tio2-siefke',w),substrateIndex:w=>materials.get('silica-malitson',w),thicknessNm:120,angleDeg:45,polarization:'unpolarized',startNm:350,endNm:800,stepNm:2});
assert.equal(points.length,226);assert.equal(points[0].wavelengthNm,350);assert.equal(points.at(-1).wavelengthNm,800);assert.equal(model.toCSV(points).trim().split('\n').length,227);assert.ok(model.toCSV(points).startsWith('wavelength_nm,reflectance,transmittance,film_absorptance,R_s,R_p,T_s,T_p,A_s,A_p'));
assert.throws(()=>model.calculate({filmIndex:NaN,thicknessNm:100,wavelengthNm:550}));
assert.throws(()=>model.calculate({filmIndex:2,filmK:-.1,thicknessNm:100,wavelengthNm:550}));
assert.throws(()=>model.calculate({filmIndex:2,thicknessNm:-1,wavelengthNm:550}));
assert.throws(()=>model.spectrum({filmIndex:2,thicknessNm:100,stepNm:0}));
console.log(JSON.stringify({status:'passed',analyticAndReferenceCases:checks,independentTmmCases:references.length,passivePowerSamples:sampleCount,largestLosslessAbsorptanceError:largestLosslessError,smallestAbsorptance,materials:materials.list().length,materialTableChecks,materialRevision:materials.provenance().revision},null,2));
