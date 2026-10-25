/* Curated, read-only static gallery.
 * Only reviewed published items from the local gallery-data.json are loaded.
 * Images must be same-origin local gallery assets. No account/session API,
 * owner interface, draft API, upload or write endpoint is included.
 */
(function(root){
  'use strict';
  const KINDS=Object.freeze({photograph:'Photograph',illustration:'Research illustration',reference:'Reference image'});
  function mediaURL(value,base){
    if(typeof value!=='string'||!value.trim()||/[\\%]/.test(value))return null;
    try{
      const url=new URL(value,base),origin=new URL(base);
      if(url.origin!==origin.origin||url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))return null;
      const folder=new URL('assets/gallery/',base).pathname;
      const staticFile=url.pathname.startsWith(folder)&&/^[a-z0-9][a-z0-9_.-]*\.(?:avif|jpe?g|png|webp)$/i.test(url.pathname.slice(folder.length));
      return staticFile?url.href:null;
    }catch{return null;}
  }
  function sourceURL(value){
    if(typeof value!=='string'||!value.trim())return null;
    try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
  }
  function normaliseItem(item,base){
    if(!item||item.status!=='published'||!['research','travel'].includes(item.category)||!Object.hasOwn(KINDS,item.kind||'photograph'))return null;
    if(!['title','caption'].every(key=>typeof item[key]==='string'&&item[key].trim()))return null;
    if(item.rights?.status!=='cleared')return null;
    const src=mediaURL(item.src,base);if(!src)return null;
    const generatedId='image-'+new URL(src).pathname.split('/').pop().replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-').slice(0,90);
    const id=typeof item.id==='string'&&item.id.trim()?item.id:generatedId;
    if(!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id))return null;
    const dimensions=[item.width,item.height].every(value=>Number.isFinite(value)&&value>0&&value<=100000);
    const width=dimensions?item.width:null,height=dimensions?item.height:null;
    const alt=typeof item.alt==='string'&&item.alt.trim()?item.alt.trim():item.caption.trim();
    const location=typeof item.location==='string'?item.location:typeof item.location?.label==='string'?item.location.label:'';
    let date=null;
    if(item.date&&typeof item.date.value==='string'&&['year','month','day'].includes(item.date.precision)){
      const patterns={year:/^\d{4}$/,month:/^\d{4}-(0[1-9]|1[0-2])$/,day:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/};
      if(patterns[item.date.precision].test(item.date.value))date={value:item.date.value,precision:item.date.precision};
    }
    // Copy only public display fields, never owner IDs or storage metadata.
    return {id,status:'published',category:item.category,kind:item.kind||'photograph',title:item.title.trim(),caption:item.caption.trim(),alt,src,thumbnail:src,width,height,date,location,credit:typeof item.credit==='string'?item.credit:'',sourceUrl:sourceURL(item.sourceUrl),featured:item.featured===true};
  }
  function normaliseGallery(data,base){
    if(!data||!Array.isArray(data.items)||(data.schemaVersion!==undefined&&data.schemaVersion!==1))throw new TypeError('Unsupported gallery data.');
    const ids=new Set(),items=[];
    data.items.forEach(raw=>{const item=normaliseItem(raw,base);if(item&&!ids.has(item.id)){ids.add(item.id);items.push(item);}});
    if(data.items.some(item=>item?.status==='published'&&item.rights?.status==='cleared')&&!items.length)throw new TypeError('No published gallery items could be displayed.');
    return items;
  }
  function wrapIndex(index,delta,length){return length>0?((index+delta)%length+length)%length:-1;}
  function swipeDirection(start,end){
    if(!start||!end)return 0;
    const dx=end.x-start.x,dy=end.y-start.y,elapsed=end.time-start.time;
    return elapsed>=0&&elapsed<=1000&&Math.abs(dx)>=50&&Math.abs(dx)>Math.abs(dy)*1.4?(dx<0?1:-1):0;
  }
  const helpers=Object.freeze({mediaURL,normaliseItem,normaliseGallery,wrapIndex,swipeDirection});
  if(typeof module==='object'&&module.exports)module.exports=helpers;
  if(!root.document)return;

  const gallery=document.querySelector('#photo-gallery');
  const status=document.querySelector('#gallery-status');
  const empty=document.querySelector('#gallery-empty');
  const error=document.querySelector('#gallery-error');
  const filters=[...document.querySelectorAll('[data-gallery-category]')];
  const dialog=document.querySelector('#gallery-lightbox');
  const image=document.querySelector('#lightbox-image');
  const stage=document.querySelector('#lightbox-stage');
  const closeButton=document.querySelector('#lightbox-close');
  const previousButton=document.querySelector('#lightbox-previous');
  const nextButton=document.querySelector('#lightbox-next');
  if(!gallery||!status||!empty||!error||!dialog||!image||!stage||!closeButton||!previousButton||!nextButton)return;
  const position=document.querySelector('#lightbox-position');
  const kind=document.querySelector('#lightbox-kind');
  const title=document.querySelector('#lightbox-title');
  const caption=document.querySelector('#lightbox-caption');
  const context=document.querySelector('#lightbox-context');
  const credit=document.querySelector('#lightbox-credit');
  const source=document.querySelector('#lightbox-source');
  const imageError=document.querySelector('#lightbox-load-error');
  const loading=document.querySelector('#lightbox-loading');
  let items=[],visibleItems=[],active='research',index=-1,originButton=null;
  let scrollLock=null,touch=null;

  function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
  function formattedDate(date){
    if(!date)return '';
    if(date.precision==='year')return date.value;
    const value=new Date(date.value+(date.precision==='month'?'-01':'')+'T12:00:00Z');
    if(!Number.isFinite(value.getTime()))return '';
    return new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'long',...(date.precision==='day'?{day:'numeric'}:{}),timeZone:'UTC'}).format(value);
  }
  function metadata(item){return [item.location,formattedDate(item.date)].filter(Boolean).join(' · ');}
  function render(){
    visibleItems=items.filter(item=>item.category===active);
    const fragment=document.createDocumentFragment();
    visibleItems.forEach((item,i)=>{
      const figure=node('figure','gallery-piece');figure.dataset.kind=item.kind;figure.dataset.photoId=item.id;
      if(item.featured)figure.classList.add('gallery-featured');
      const button=node('button','gallery-open');button.type='button';button.dataset.photoId=item.id;button.setAttribute('aria-label','Enlarge image: '+item.title);button.setAttribute('aria-haspopup','dialog');
      const photo=node('img','gallery-image');photo.src=item.src;if(item.width&&item.height){photo.width=item.width;photo.height=item.height;}photo.alt=item.alt;photo.loading=i===0?'eager':'lazy';photo.decoding='async';photo.referrerPolicy='no-referrer';
      // Natural image proportions are retained, including small references.
      if(item.width)photo.style.maxWidth=item.width+'px';
      photo.addEventListener('load',()=>{if(photo.naturalWidth&&photo.naturalHeight){photo.width=photo.naturalWidth;photo.height=photo.naturalHeight;photo.style.maxWidth=photo.naturalWidth+'px';}});
      const affordance=node('span','gallery-enlarge','Enlarge ↗');affordance.setAttribute('aria-hidden','true');button.append(photo,affordance);
      const description=node('figcaption','gallery-caption');
      const heading=node('div','gallery-caption-top');heading.append(node('h3','',item.title),node('span','gallery-kind',KINDS[item.kind]));description.append(heading,node('p','gallery-caption-text',item.caption));
      const details=metadata(item);if(details)description.append(node('p','gallery-photo-context',details));
      figure.append(button,description);fragment.append(figure);
    });
    gallery.replaceChildren(fragment);gallery.setAttribute('aria-busy','false');empty.hidden=visibleItems.length!==0;error.hidden=true;
    const count=visibleItems.length;status.textContent=count+(count===1?' image':' images')+(active==='all'?'':' · '+(active==='research'?'Research':'Travel'));
    filters.forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.galleryCategory===active));button.disabled=false;});
  }
  function lockScroll(){
    if(scrollLock)return;
    const gap=Math.max(0,window.innerWidth-document.documentElement.clientWidth);
    scrollLock={overflow:document.body.style.overflow,paddingRight:document.body.style.paddingRight};
    const padding=Number.parseFloat(getComputedStyle(document.body).paddingRight)||0;
    document.body.style.overflow='hidden';if(gap)document.body.style.paddingRight=(padding+gap)+'px';
  }
  function restoreScroll(){if(!scrollLock)return;document.body.style.overflow=scrollLock.overflow;document.body.style.paddingRight=scrollLock.paddingRight;scrollLock=null;}
  function showImage(){
    const item=visibleItems[index];if(!item)return;
    imageError.hidden=true;image.hidden=true;if(loading)loading.hidden=false;
    dialog.dataset.kind=item.kind;image.alt=item.alt;if(item.width&&item.height){image.width=item.width;image.height=item.height;}else{image.removeAttribute('width');image.removeAttribute('height');}image.src=item.src;
    title.textContent=item.title;caption.textContent=item.caption;context.textContent=metadata(item);context.hidden=!context.textContent;credit.textContent=item.credit;credit.hidden=!item.credit;
    kind.textContent=KINDS[item.kind];position.textContent=(index+1)+' / '+visibleItems.length+' · '+item.title;
    if(item.sourceUrl){source.href=item.sourceUrl;source.hidden=false;}else{source.hidden=true;source.removeAttribute('href');}
    previousButton.disabled=visibleItems.length<2;nextButton.disabled=visibleItems.length<2;
  }
  function openImage(id,button){
    const nextIndex=visibleItems.findIndex(item=>item.id===id);if(nextIndex<0)return;
    index=nextIndex;originButton=button;showImage();lockScroll();
    if(!dialog.open)dialog.showModal();closeButton.focus({preventScroll:true});
  }
  function closeImage(){if(dialog.open)dialog.close();}
  function move(delta){if(index<0||visibleItems.length<2)return;index=wrapIndex(index,delta,visibleItems.length);showImage();}
  function focusables(){return [...dialog.querySelectorAll('button:not([disabled]),a[href],[tabindex="0"]')].filter(element=>!element.hidden&&!element.closest('[hidden]'));}
  function keyboard(event){
    if(!dialog.open)return;
    if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}
    else if(event.key==='ArrowRight'){event.preventDefault();move(1);}
    else if(event.key==='Escape'){event.preventDefault();closeImage();}
    else if(event.key==='Tab'){
      const controls=focusables(),first=controls[0],last=controls[controls.length-1];
      if(!first){event.preventDefault();closeButton.focus();return;}
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  }
  filters.forEach(button=>button.addEventListener('click',()=>{active=button.dataset.galleryCategory;render();}));
  gallery.addEventListener('click',event=>{const button=event.target.closest('button[data-photo-id]');if(button&&gallery.contains(button))openImage(button.dataset.photoId,button);});
  closeButton.addEventListener('click',closeImage);previousButton.addEventListener('click',()=>move(-1));nextButton.addEventListener('click',()=>move(1));
  document.addEventListener('keydown',keyboard);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeImage();});
  dialog.addEventListener('close',()=>{restoreScroll();touch=null;index=-1;const target=originButton&&originButton.isConnected&&!originButton.closest('[hidden]')?originButton:filters.find(button=>button.getAttribute('aria-pressed')==='true');target?.focus({preventScroll:true});originButton=null;});
  image.addEventListener('error',()=>{image.hidden=true;imageError.hidden=false;if(loading)loading.hidden=true;});
  image.addEventListener('load',async()=>{const loaded=image.currentSrc||image.src;try{if(image.decode)await image.decode();}catch{}if((image.currentSrc||image.src)!==loaded)return;if(image.naturalWidth&&image.naturalHeight){image.width=image.naturalWidth;image.height=image.naturalHeight;}image.hidden=false;imageError.hidden=true;if(loading)loading.hidden=true;});
  stage.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||event.target.closest('button'))return;
    if(event.isPrimary===false){touch=null;return;}
    touch={id:event.pointerId,x:event.clientX,y:event.clientY,time:event.timeStamp};
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup',event=>{
    if(!touch||touch.id!==event.pointerId)return;
    const direction=swipeDirection(touch,{x:event.clientX,y:event.clientY,time:event.timeStamp});touch=null;
    if(direction){event.preventDefault();move(direction);}
  });
  stage.addEventListener('pointercancel',()=>{touch=null;});

  async function load(){
    const response=await fetch('gallery-data.json',{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('Gallery data unavailable.');
    items=normaliseGallery(await response.json(),location.href);render();
  }
  load().catch(()=>{gallery.setAttribute('aria-busy','false');status.textContent='Gallery unavailable';error.hidden=false;empty.hidden=true;});
})(typeof globalThis!=='undefined'?globalThis:window);
