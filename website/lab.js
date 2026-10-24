(() => {
  'use strict';
  const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const inputs=['film-thickness','probe-wavelength','angle','film-n','film-k','substrate-n','substrate-k','spectrum-start','spectrum-end','spectrum-step'];
  const selects=['film-material','substrate-material','polarization'];
  let ready=false,points=[],last=null,queued=0;
  const bounds={left:56,right:640,top:22,bottom:274};
  const x=(v,s,e)=>bounds.left+(v-s)/(e-s)*(bounds.right-bounds.left), y=v=>bounds.bottom-v*(bounds.bottom-bounds.top);
  const fmt=v=>Math.abs(v)<1e-13?'0.000%':v>0&&v<.00001?'<0.001%':(100*v).toFixed(3)+'%';
  const optical=v=>v!==0&&Math.abs(v)<.0001?v.toExponential(3):v.toFixed(4);
  const rangeLabel=v=>Number(v.toPrecision(10));
  function svg(tag,attrs,text,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;parent.append(n);return n;}
  function num(id,min,max=1e7){const el=$(id),v=el.valueAsNumber;if(!Number.isFinite(v)||v<min||v>max){el.setAttribute('aria-invalid','true');throw new Error(`${el.labels?.[0]?.textContent||id}: enter a number from ${min} to ${max}.`);}el.removeAttribute('aria-invalid');return v;}
  function material(which,l){const id=$(which+'-material').value;if(id==='manual')return {n:num(which+'-n',.000001,1000),k:num(which+'-k',0,1000)};return OpticalMaterials.get(id,l);}
  function record(which){const id=$(which+'-material').value;return id==='manual'?null:OpticalMaterials.getRecord(id);}
  function sourceText(which){
    const r=record(which),manual=!r;
    for(const key of ['n','k'])$(which+'-'+key).readOnly=!manual;
    const box=$(which+'-source');box.replaceChildren();
    if(manual){box.textContent='Your values, held constant across the selected spectrum.';return;}
    const a=document.createElement('a');a.href=r.databaseUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.label+' ↗';box.append(a,document.createElement('br'),`${rangeLabel(r.minNm)}–${rangeLabel(r.maxNm)} nm · ${r.conditions}`,document.createElement('br'),r.absorptionNote||'');
  }
  function options(){
    const d=num('film-thickness',0,100000),l=num('probe-wavelength',1),angle=num('angle',0,89.9),start=num('spectrum-start',1),end=num('spectrum-end',1),step=num('spectrum-step',.01);
    if(end<=start)throw new Error('The spectrum end must be greater than its start.');
    if((end-start)/step>5000)throw new Error('Choose a larger wavelength step: at most 5,001 spectral samples are supported here.');
    const range=OpticalMaterials.range(['film','substrate'].map(w=>$(w+'-material').value));
    $('valid-range').textContent=`Common data range: ${rangeLabel(range.minNm)}–${rangeLabel(range.maxNm)} nm. No extrapolation.`;
    if(start<range.minNm||end>range.maxNm||l<range.minNm||l>range.maxNm)throw new Error(`Both the probe and spectrum must lie within the common material range (${range.minNm}–${range.maxNm} nm).`);
    return {filmIndex:w=>material('film',w),substrateIndex:w=>material('substrate',w),thicknessNm:d,wavelengthNm:l,angleDeg:angle,polarization:$('polarization').value,startNm:start,endNm:end,stepNm:step};
  }
  function plot(o){
    $('plot-grid').replaceChildren();$('plot-labels').replaceChildren();
    for(let pct=0;pct<=100;pct+=20){const py=y(pct/100);svg('line',{x1:bounds.left,x2:bounds.right,y1:py,y2:py,stroke:'#d5dccb'},undefined,$('plot-grid'));svg('text',{x:bounds.left-12,y:py+4,'text-anchor':'end'},pct+'%',$('plot-labels'));}
    for(let i=0;i<=5;i++){const nm=o.startNm+(o.endNm-o.startNm)*i/5;svg('text',{x:x(nm,o.startNm,o.endNm),y:bounds.bottom+23,'text-anchor':'middle'},Number(nm.toFixed(1)),$('plot-labels'));}
    svg('text',{x:348,y:bounds.bottom+48,'text-anchor':'middle'},'Wavelength / nm',$('plot-labels'));
    const path=key=>points.map((p,i)=>`${i?'L':'M'}${x(p.wavelengthNm,o.startNm,o.endNm).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
    $('spectrum-curve').setAttribute('d',path('R'));$('transmission-curve').setAttribute('d',path('T'));$('absorption-curve').setAttribute('d',path('A'));
    $('bare-reference').setAttribute('d',points.map((p,i)=>{const r=ThinFilmModel.calculate({...o,wavelengthNm:p.wavelengthNm,thicknessNm:0}).R;return `${i?'L':'M'}${x(p.wavelengthNm,o.startNm,o.endNm).toFixed(2)},${y(r).toFixed(2)}`;}).join(' '));
    const visible=o.wavelengthNm>=o.startNm&&o.wavelengthNm<=o.endNm;
    for(const id of ['probe-line','probe-dot'])$(id).style.display=visible?'':'none';
    const px=x(o.wavelengthNm,o.startNm,o.endNm);$('probe-line').setAttribute('x1',px);$('probe-line').setAttribute('x2',px);$('probe-line').setAttribute('y1',bounds.top);$('probe-line').setAttribute('y2',bounds.bottom);$('probe-dot').setAttribute('cx',px);$('probe-dot').setAttribute('cy',y(last.R));
    $('plot-description').textContent=`Power spectrum from ${o.startNm} to ${o.endNm} nanometres, step ${o.stepNm} nanometres. ${o.polarization} polarization at ${o.angleDeg} degrees. At ${o.wavelengthNm} nanometres, R ${fmt(last.R)}, T ${fmt(last.T)}, film absorption ${fmt(last.A)}.`;
  }
  function update(){
    if(!ready)return;
    inputs.forEach(id=>$(id).removeAttribute('aria-invalid'));
    try{
      sourceText('film');sourceText('substrate');const o=options();last=ThinFilmModel.calculate(o);points=ThinFilmModel.spectrum(o);
      if([last,...points].some(p=>!Number.isFinite(p.R+p.T+p.A)||Math.min(p.R,p.T,p.A)<-1e-8||Math.max(p.R,p.T,p.A)>1+1e-8))throw new Error('This configuration produced an invalid power result. Please check the material data and parameters.');
      $('reflectance-value').textContent=fmt(last.R);$('transmittance-value').textContent=fmt(last.T);$('absorption-value').textContent=fmt(last.A);
      $('probe-context').textContent=`λ = ${o.wavelengthNm} nm · θ = ${o.angleDeg}° · ${o.polarization} · ${points.length} spectral samples`;
      for(const which of ['film','substrate']){const c=material(which,o.wavelengthNm);if($(which+'-material').value!=='manual'){for(const k of ['n','k'])$(which+'-'+k).value=Number(c[k].toPrecision(7));}}
      $('layer-value').textContent=`n = ${optical(last.filmIndex)}, k = ${optical(last.filmK)} · ${o.thicknessNm} nm`;
      $('substrate-value').textContent=`n = ${optical(last.substrateIndex)}, k = ${optical(last.substrateK)}`;
      for(const pol of ['s','p'])for(const key of ['R','T','A'])$(pol+'-'+key.toLowerCase()).textContent=fmt(last[pol][key]);
      const outside=o.wavelengthNm<o.startNm||o.wavelengthNm>o.endNm?' The probe lies outside the plotted window.':'';
      $('model-reading').textContent=`At ${o.wavelengthNm} nm, ${fmt(last.R)} is reflected, ${fmt(last.T)} enters the substrate and ${fmt(last.A)} is absorbed in the film.${outside}`;
      const fn=last.filmIndex,fringes=2*fn*o.thicknessNm*(1/o.startNm-1/o.endNm);
      if(fringes>points.length/5)$('model-reading').textContent+=' The film may produce narrow fringes; reduce the wavelength step to resolve them.';
      $('thickness-range').max=Math.max(1000,o.thicknessNm);$('thickness-range').value=o.thicknessNm;
      $('wavelength-range').min=Math.min(o.startNm,o.wavelengthNm);$('wavelength-range').max=Math.max(o.endNm,o.wavelengthNm);$('wavelength-range').value=o.wavelengthNm;$('angle-range').value=o.angleDeg;
      plot(o);$('calculation-error').hidden=true;$('result-content').classList.remove('stale-results');$('data-loading').hidden=true;$('export-csv').disabled=false;$('export-txt').disabled=false;$('copy-setup').disabled=false;$('export-status').textContent='';
    }catch(error){$('calculation-error').textContent=error.message;$('calculation-error').hidden=false;$('result-content').classList.add('stale-results');$('export-csv').disabled=true;$('export-txt').disabled=true;$('copy-setup').disabled=true;}
  }
  function schedule(){cancelAnimationFrame(queued);queued=requestAnimationFrame(update);}
  function preset(name){
    const normal={film:'tio2-siefke',substrate:'silica-malitson',n:2.1,k:0,sn:1.5,sk:0,d:100,l:550,angle:0,pol:'unpolarized',start:350,end:800,step:2};
    const p=name==='metal'?{...normal,film:'gold-johnson',d:40,angle:45}:name==='ar'?{...normal,film:'manual',substrate:'manual',n:Math.sqrt(1.5),d:550/(4*Math.sqrt(1.5))}:normal;
    $('film-material').value=p.film;$('substrate-material').value=p.substrate;$('film-n').value=p.n;$('film-k').value=p.k;$('substrate-n').value=p.sn;$('substrate-k').value=p.sk;
    $('film-thickness').value=p.d;$('probe-wavelength').value=p.l;$('angle').value=p.angle;$('polarization').value=p.pol;$('spectrum-start').value=p.start;$('spectrum-end').value=p.end;$('spectrum-step').value=p.step;update();
  }
  $('optics-form').addEventListener('submit',e=>{e.preventDefault();update();});
  inputs.forEach(id=>$(id).addEventListener('input',schedule));selects.forEach(id=>$(id).addEventListener('change',schedule));
  for(const [slider,number] of [['thickness-range','film-thickness'],['wavelength-range','probe-wavelength'],['angle-range','angle']])$(slider).addEventListener('input',()=>{$(number).value=$(slider).value;schedule();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
  $('reset-model').addEventListener('click',()=>preset('tio2'));
  function selectedCitation(which){const r=record(which);return r?{id:r.id,reference:r.citation,url:r.sourceUrl,database:r.databaseUrl}:{id:'manual',reference:'User-entered wavelength-independent n,k',url:'',database:''};}
  function exportSpectrum(format){
    if(!last||!points.length)return;
    let revision='';try{revision=OpticalMaterials.provenance().revision||'';}catch{}
    const meta={film:selectedCitation('film'),substrate:selectedCitation('substrate'),revision};
    const content=SpectrumExport[format](points,meta),mime=format==='txt'?'text/plain':'text/csv';
    const url=URL.createObjectURL(new Blob([content],{type:mime+';charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='dpoeta-optics-spectrum.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    $('export-status').textContent=`Exported ${points.length} samples as ${format.toUpperCase()} with settings and references.`;
  }
  $('export-csv').addEventListener('click',()=>exportSpectrum('csv'));
  $('export-txt').addEventListener('click',()=>exportSpectrum('txt'));
  $('copy-setup').addEventListener('click',async()=>{const u=new URL(location.href);u.search='';u.hash='explorer';for(const id of [...inputs,...selects])u.searchParams.set(id,$(id).value);try{await navigator.clipboard.writeText(u.href);$('export-status').textContent='Setup link copied.';}catch{$('export-status').textContent='Copy is unavailable. Download the CSV to retain the settings.';}});
  function references(){
    const list=$('material-reference-list');for(const r of OpticalMaterials.list()){
      const article=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p'),range=document.createElement('p');h.textContent=r.label;p.textContent=r.conditions+' '+(r.absorptionNote||'');range.textContent=`Supported range: ${rangeLabel(r.minNm)}–${rangeLabel(r.maxNm)} nm.`;range.className='source-range';article.append(h,p,range);
      const refs=r.id==='silica-malitson'?[{citation:'I. H. Malitson. Interspecimen comparison of the refractive index of fused silica. JOSA 55, 1205–1208 (1965).',url:'https://doi.org/10.1364/JOSA.55.001205'},{citation:'C. Z. Tan. Determination of refractive index of silica glass for infrared wavelengths by IR spectroscopy. J. Non-Cryst. Solids 223, 158–163 (1998).',url:'https://doi.org/10.1016/S0022-3093(97)00438-9'}]:r.references?.length?r.references:[{citation:r.citation,url:r.sourceUrl}];for(const ref of refs){const a=document.createElement('a');a.href=ref.url||r.sourceUrl;a.textContent=ref.citation;a.target='_blank';a.rel='noopener noreferrer';a.className='reference-paper';article.append(a);}
      const links=document.createElement('div');links.className='reference-data';for(const [url,label]of [[r.databaseUrl,'Database record ↗'],[r.dataUrl,'Pinned source data ↗']]){const a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}article.append(links);list.append(article);
    }
    const rev=OpticalMaterials.provenance().revision;if(rev){const p=document.createElement('p');p.className='data-revision';p.textContent='Database revision: '+rev;list.after(p);}
  }
  async function init(){try{
    await OpticalMaterials.load('materials-data.json');for(const id of ['film-material','substrate-material']){const select=$(id);select.replaceChildren();const manual=document.createElement('option');manual.value='manual';manual.textContent='Custom n + ik (constant)';select.append(manual);for(const r of OpticalMaterials.list()){const o=document.createElement('option');o.value=r.id;o.textContent=r.label;select.append(o);}select.disabled=false;}
    ready=true;references();preset('tio2');
    const params=new URLSearchParams(location.search);if(params.size){for(const id of [...inputs,...selects])if(params.has(id))$(id).value=params.get(id);update();}
  }catch(e){$('data-loading').textContent='Material library unavailable. Custom n,k calculations are still available.';for(const id of ['film-material','substrate-material']){$(id).replaceChildren(new Option('Custom n + ik (constant)','manual'));$(id).disabled=false;}
    // Manual operation can continue with a local fallback range, without inventing material data.
    const original=window.OpticalMaterials;window.OpticalMaterials={...original,range:()=>({minNm:1,maxNm:1e7})};ready=true;$('film-material').value='manual';$('substrate-material').value='manual';update();$('data-loading').hidden=false;
  }}
  init();
})();
