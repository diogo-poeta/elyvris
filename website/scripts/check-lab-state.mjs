import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// A minimal DOM exercises the real calculator event handlers without a browser.
// The regression is the one-frame window between input and recalculation:
// old numerical points must never be exported with new material citations.
class Element {
 constructor(id=''){this.id=id;this.value='';this.disabled=false;this.hidden=false;this.attributes={};this.children=[];this.listeners=new Map();this.textContent='';this.style={};this.dataset={};this.labels=[];const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)};}
 get valueAsNumber(){return this.value===''?NaN:Number(this.value);}
 setAttribute(k,v){this.attributes[k]=String(v);}
 removeAttribute(k){delete this.attributes[k];}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 after(){}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
 async trigger(name){for(const fn of this.listeners.get(name)||[])await fn({target:this,preventDefault(){}});}
 click(){}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const document={getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element(),querySelectorAll:()=>[]};
let nextFrame=0;const frames=new Map(),exports=[],clipboard=[];
const context={document,console,URL,URLSearchParams,setTimeout:()=>0,location:{href:'https://example.test/lab.html',search:''},navigator:{clipboard:{writeText:async value=>clipboard.push(value)}},Blob,Option:class extends Element{constructor(label,value){super();this.value=value;this.textContent=label;}},requestAnimationFrame:fn=>{const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)};
context.window=context;
for(const file of ['optics-model.js','materials.js','spectrum-export.js'])runInNewContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
context.OpticalMaterials.setData(JSON.parse(readFileSync(new URL('../materials-data.json',import.meta.url),'utf8')));
context.OpticalMaterials={...context.OpticalMaterials,load:async()=>context.OpticalMaterials.list()};
context.SpectrumExport={csv:(points,meta)=>{exports.push({points:JSON.parse(JSON.stringify(points)),meta:JSON.parse(JSON.stringify(meta))});return 'test';},txt:context.SpectrumExport.txt};
// The real browser URL methods are isolated from test-global state.
context.URL=class extends URL{};context.URL.createObjectURL=()=> 'blob:unit-test';context.URL.revokeObjectURL=()=>{};
runInNewContext(readFileSync(new URL('../lab.js',import.meta.url),'utf8'),context);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(get('export-csv').disabled,false,'initial calculation enables export');
await get('export-csv').trigger('click');
assert.equal(exports.length,1);assert.equal(exports[0].meta.film.id,'tio2-siefke');

get('film-material').value='gold-johnson';await get('film-material').trigger('change');
for(const id of ['export-csv','export-txt','copy-setup'])assert.equal(get(id).disabled,true,'pending input disables '+id);
// Even directly dispatched events cannot bypass the missing result snapshot.
await get('export-csv').trigger('click');await get('copy-setup').trigger('click');
assert.equal(exports.length,1,'pending change cannot export old points');assert.equal(clipboard.length,0,'pending change cannot copy an uncomputed setup');
for(const callback of frames.values())callback();frames.clear();
assert.equal(get('export-csv').disabled,false);await get('export-csv').trigger('click');
assert.equal(exports.length,2);assert.equal(exports[1].meta.film.id,'gold-johnson');
assert.equal(exports[1].points[0].filmIndex,context.OpticalMaterials.get('gold-johnson',350).n,'exported numbers match the cited gold dataset');

get('film-thickness').value='199.875';await get('film-thickness').trigger('input');
await get('export-csv').trigger('click');assert.equal(exports.length,2);
for(const callback of frames.values())callback();frames.clear();
await get('export-csv').trigger('click');assert.equal(exports[2].points[0].thicknessNm,199.875);
await get('copy-setup').trigger('click');assert.equal(new URL(clipboard[0]).searchParams.get('film-thickness'),'199.875');

get('film-material').value='manual';get('film-k').value='-1';await get('film-material').trigger('change');
for(const callback of frames.values())callback();frames.clear();
assert.equal(get('calculation-error').hidden,false);assert.equal(get('export-csv').disabled,true);
await get('export-csv').trigger('click');assert.equal(exports.length,3,'invalid inputs cannot export stale results');
console.log(JSON.stringify({status:'passed',pendingInput:'exports and setup copy blocked',materialCitation:'matches calculated points',exactThickness:199.875,invalidInputs:'stale export blocked'}));
