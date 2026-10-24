/* Homepage reference spectrum: an ideal lossless quarter-wave matching layer
 * between air and n=1.5 glass, calculated by the same thin-film engine.
 * DOI copy buttons retain publication links. No measured data are implied.
 */
(() => {
  'use strict';
  const curve=document.querySelector('#teaser-spectrum');
  if(curve&&window.ThinFilmModel){
    const p=ThinFilmModel.spectrum({filmIndex:Math.sqrt(1.5),thicknessNm:550/(4*Math.sqrt(1.5))});
    curve.setAttribute('d',p.map((v,i)=>`${i?'L':'M'}${55+(v.wavelengthNm-350)/450*430},${205-v.R/.04*180}`).join(' '));
  }
  document.querySelectorAll('.pub-content').forEach(article=>{
    const doi=article.querySelector('a[href^="https://doi.org/"]');
    if(!doi||!navigator.clipboard)return;
    const button=document.createElement('button');button.type='button';button.className='doi-copy';button.textContent='Copy DOI';
    const status=document.createElement('span');status.className='copy-status';status.setAttribute('role','status');
    button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(doi.href);status.textContent='DOI copied';}catch{status.textContent='Copy from the DOI link above';}});
    article.append(button,status);
  });
})();
