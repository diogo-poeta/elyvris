/* Two equal, z-polarised plane waves in a homogeneous medium.
 * E_z/E0 = cos(kx*x + ky*y - omega*t) + cos(kx*x - ky*y - omega*t).
 * Each wave has |k| = 2*pi/lambda. Coordinates and time are normalised.
 * This analytical illustration is not an FDTD calculation or measured data.
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
