import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context={module:{exports:{}},URL};
const source=readFileSync(new URL('../gallery.js',import.meta.url),'utf8');
runInNewContext(source,context);
const {normaliseGallery,mediaURL}=context.module.exports;
const data=JSON.parse(readFileSync(new URL('../gallery-data.json',import.meta.url),'utf8'));
const base='https://diogo-poeta.github.io/lumefern/records.html';
const items=normaliseGallery(data,base);
assert.equal(items.length,data.items.filter(item=>item.status==='published'&&item.rights?.status==='cleared').length);
for(const item of data.items.filter(item=>item.status==='published'&&item.rights?.status==='cleared')){
  assert.equal(item.status,'published');
  assert.equal(item.rights.status,'cleared');
  for(const name of new Set([item.src,...(item.thumbnail?[item.thumbnail]:[])])){
    assert.match(name,/^assets\/gallery\/[a-z0-9_.-]+\.(?:jpe?g|png|webp|avif)$/i);
    assert.ok(existsSync(new URL('../'+name,import.meta.url)),name);
    const bytes=readFileSync(new URL('../'+name,import.meta.url));
    assert.ok(bytes.length>0,'Image file must not be empty');
    assert.ok(mediaURL(name,base));
  }
}
const rejected=[
  '/media/12345678-1234-1234-1234-123456789abc.jpg',
  'https://other.test/assets/gallery/photo.jpg',
  'https://user:secret@diogo-poeta.github.io/lumefern/assets/gallery/photo.jpg',
  'assets/gallery/photo.jpg?tracking=1',
  'assets/gallery/photo.jpg#fragment',
  'assets/gallery/../private.jpg',
  'assets/gallery/photo.svg',
];
for(const value of rejected)assert.equal(mediaURL(value,base),null,value);
const sample={id:'test',status:'published',category:'research',kind:'photograph',title:'Test image',caption:'Test description',alt:'',src:'assets/gallery/new-photo.png',rights:{status:'cleared'}};
const fresh=normaliseGallery({schemaVersion:1,items:[{...sample,id:'',width:0,height:0,thumbnail:'assets/gallery/old-photo.jpg'}]},base)[0];
assert.equal(fresh.id,'image-new-photo');
assert.equal(fresh.alt,sample.caption,'caption supplies a missing image description');
assert.equal(fresh.thumbnail,fresh.src,'replacing an image must also replace the thumbnail');
assert.equal(fresh.width,null,'new photos must not need manually entered pixel dimensions');
assert.equal(fresh.height,null);
assert.equal(normaliseGallery({items:[{...sample,status:'draft'}]},base).length,0,'all-draft gallery is a valid empty gallery');
assert.equal(normaliseGallery({items:[{...sample,rights:{status:'pending'}}]},base).length,0,'unconfirmed rights must not publish');
assert.equal(source.match(/fetch\(/g).length,1,'only local JSON loading is present');
assert.ok(!source.includes('/api/')&&!source.includes('/media/'));
const html=readFileSync(new URL('../records.html',import.meta.url),'utf8');
assert.ok(!html.includes('gallery-owner-link')&&!html.includes('href="/admin"'));
console.log(JSON.stringify({status:'passed',publishedImages:items.length,localFiles:'JPEGs present',rejectedMediaInputs:rejected.length,drafts:'excluded',ownerInterface:'absent'}));
