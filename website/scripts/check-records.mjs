import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the actual read-only renderer with a minimal DOM: no browser, server,
// network request or image download is used by this regression.
const source=readFileSync(new URL('../records.js',import.meta.url),'utf8');
const published=JSON.parse(readFileSync(new URL('../records-data.json',import.meta.url),'utf8'));
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(node=>typeof node==='string'?node:node.textContent).join('');}
  set innerHTML(value){throw new Error('The records renderer must not parse data as HTML.');}
  get childNodes(){return this.children;}
  append(...nodes){for(const node of nodes)if(node.tagName==='#fragment')this.children.push(...node.children);else this.children.push(node);}
  replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  click(){this.listeners.get('click')?.();}
}
async function render(data){
  const list=new Element(),status=new Element(),error=new Element();error.hidden=true;
  const categories=['all','laboratory','presentation','affiliation'];
  const filters=categories.map(category=>{const button=new Element('button');button.dataset.category=category;button.disabled=true;return button;});
  const elements={'#records-list':list,'#record-count':status,'#records-error':error};
  const requests=[];
  const context={document:{querySelector:selector=>elements[selector],querySelectorAll:()=>filters,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')},URL,location:new URL('https://portfolio.test/website/records.html'),fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>structuredClone(data)};}};
  runInNewContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {list,status,error,filters,requests};
}
function descendants(node,tag){return node.children.flatMap(child=>typeof child==='string'?[]:[...(child.tagName===tag?[child]:[]),...descendants(child,tag)]);}

assert.equal(published.records.length,7);
assert.ok(published.records.every(record=>record.status==='published'&&record.media.length===0));
const baseline=await render(published);
assert.equal(baseline.error.hidden,true);
assert.equal(baseline.list.children.length,published.records.length);
assert.equal(baseline.status.textContent,'7 records');
assert.equal(descendants(baseline.list,'img').length,0,'no unprovided photos are fabricated');
assert.equal(baseline.requests.length,1);assert.equal(baseline.requests[0].url,'records-data.json');
for(const record of published.records)assert.ok(baseline.list.textContent.includes(record.title));
for(const button of baseline.filters){
  assert.equal(button.disabled,false);button.click();
  const expected=published.records.filter(record=>button.dataset.category==='all'||record.category===button.dataset.category).length;
  assert.equal(baseline.list.children.filter(article=>!article.hidden).length,expected);
  assert.equal(button.attributes['aria-pressed'],'true');
}

const allowed=['assets/research-photo.png','assets/laboratory/photo-2026.JPG','assets/visit.webp','assets/poster.avif'];
const blocked=[
  'https://tracker.test/visit.png','//tracker.test/visit.png','http://tracker.test/visit.png',
  'data:image/png;base64,AAAA','javascript:alert(1)','blob:https://portfolio.test/id',
  'https://username:password@portfolio.test/website/assets/photo.png',
  '/website/assets/photo.png','assets/photo.png?visitor=id','assets/photo.png#fragment',
  'assets/../outside.png','assets/%2e%2e/outside.png','assets/folder/../../outside.png',
  'assets/photo.svg','assets/photo.html'
];
const mediaData=structuredClone(published);
mediaData.records[0].media=[...allowed,...blocked].map(src=>({src,width:640,height:480,alt:'Research image',caption:'Caption',rights:{status:'cleared'}}));
mediaData.records[0].media.push({src:'assets/uncleared.png',width:640,height:480,alt:'Research image',caption:'Caption',rights:{status:'pending'}});
mediaData.records[0].references=[
  {label:'External reference',url:'https://reference.test/article'},
  {label:'Local reference',url:'research.html'},
  {label:'Credentials forbidden',url:'https://username:password@reference.test/article'},
  {label:'Local credentials forbidden',url:'https://username:password@portfolio.test/website/research.html'},
  {label:'Script forbidden',url:'javascript:alert(1)'},
  {label:'Data forbidden',url:'data:text/html,example'},
  {label:'Insecure external forbidden',url:'http://reference.test/article'}
];
mediaData.records[0].title='<img src=x onerror=alert(1)>';
const media=await render(mediaData);
assert.equal(media.error.hidden,true);
const photos=descendants(media.list,'img');
assert.deepEqual(photos.map(photo=>photo.src).sort(),allowed.map(path=>new URL(path,'https://portfolio.test/website/records.html').href).sort());
assert.ok(photos.every(photo=>photo.referrerPolicy==='no-referrer'));
const links=descendants(media.list,'a');
assert.ok(links.some(link=>link.href==='https://reference.test/article'&&link.rel==='noopener noreferrer'));
assert.ok(links.some(link=>link.href==='https://portfolio.test/website/research.html'));
for(const label of ['Credentials forbidden','Local credentials forbidden','Script forbidden','Data forbidden','Insecure external forbidden'])assert.ok(!links.some(link=>link.textContent.includes(label)));
assert.ok(media.list.textContent.includes('<img src=x onerror=alert(1)>'),'data are retained as text');
assert.equal(photos.length,allowed.length,'markup in text must not create an image');

const draft=structuredClone(published);draft.records[0].status='draft';
const rejected=await render(draft);
assert.equal(rejected.error.hidden,false);assert.equal(rejected.list.children.length,0,'public record data fail closed if a draft is included');
console.log(JSON.stringify({status:'passed',publishedRecords:published.records.length,filters:baseline.filters.length,allowedLocalRasterImages:allowed.length,blockedMediaURLs:blocked.length,credentialReferences:'rejected',dataRendering:'text only',draftDataset:'rejected'}));
