import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context={module:{exports:{}},URL};
const source=readFileSync(new URL('../gallery.js',import.meta.url),'utf8');
runInNewContext(source,context);
const {normaliseGallery,mediaURL}=context.module.exports;
const data=JSON.parse(readFileSync(new URL('../gallery-data.json',import.meta.url),'utf8'));
const base='https://diogo-poeta.github.io/lumafern/records.html';
const items=normaliseGallery(data,base);
assert.equal(data.items.length,6);
assert.equal(items.length,6);
for(const item of data.items){
  assert.equal(item.status,'published');
  assert.equal(item.rights.status,'cleared');
  for(const name of [item.src,item.thumbnail]){
    assert.match(name,/^assets\/gallery\/[a-z0-9_-]+\.jpg$/);
    assert.ok(existsSync(new URL('../'+name,import.meta.url)),name);
    const bytes=readFileSync(new URL('../'+name,import.meta.url));
    assert.equal(bytes[0],0xff);assert.equal(bytes[1],0xd8);
    assert.ok(mediaURL(name,base));
  }
}
const rejected=[
  '/media/12345678-1234-1234-1234-123456789abc.jpg',
  'https://other.test/assets/gallery/photo.jpg',
  'https://user:secret@diogo-poeta.github.io/lumafern/assets/gallery/photo.jpg',
  'assets/gallery/photo.jpg?tracking=1',
  'assets/gallery/photo.jpg#fragment',
  'assets/gallery/../private.jpg',
  'assets/gallery/photo.svg',
];
for(const value of rejected)assert.equal(mediaURL(value,base),null,value);
const drafts=structuredClone(data);drafts.items[0].status='draft';
assert.equal(normaliseGallery(drafts,base).length,5,'draft records must not render');
assert.equal(source.match(/fetch\(/g).length,1,'only local JSON loading is present');
assert.ok(!source.includes('/api/')&&!source.includes('/media/'));
const html=readFileSync(new URL('../records.html',import.meta.url),'utf8');
assert.ok(!html.includes('gallery-owner-link')&&!html.includes('href="/admin"'));
console.log(JSON.stringify({status:'passed',publishedImages:items.length,localFiles:'JPEGs present',rejectedMediaInputs:rejected.length,drafts:'excluded',ownerInterface:'absent'}));
