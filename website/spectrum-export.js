/* Text exports share the same calculated points; TXT contains numeric tab-separated rows.
 * Reference and configuration metadata stay in #-prefixed TXT comment lines.
 */
(function(root){
  'use strict';
  const numericColumns=['wavelength_nm','R','T_into_substrate','A_in_film','R_s','R_p','T_s','T_p','A_s','A_p','film_n','film_k','substrate_n','substrate_k','thickness_nm','angle_deg'];
  const values=p=>[p.wavelengthNm,p.R,p.T,p.A,p.s.R,p.p.R,p.s.T,p.p.T,p.s.A,p.p.A,p.filmIndex,p.filmK,p.substrateIndex,p.substrateK,p.thicknessNm,p.angleDeg];
  const clean=v=>String(v??'').replace(/[\r\n\t]+/g,' ');
  const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  function validate(points){if(!Array.isArray(points)||!points.length)throw new Error('No spectrum is available to export.');for(const p of points)if(!values(p).every(Number.isFinite))throw new Error('The spectrum contains a non-finite value.');}
  function csv(points,meta){
    validate(points);meta=meta||{};const f=meta.film||{},s=meta.substrate||{};
    const headers=[...numericColumns,'polarization','film_dataset','film_reference','film_source','substrate_dataset','substrate_reference','substrate_source','film_database_record','substrate_database_record','database_revision'];
    return headers.join(',')+'\n'+points.map(p=>[...values(p),p.polarization,f.id,f.reference,f.url,s.id,s.reference,s.url,f.database,s.database,meta.revision].map(cell).join(',')).join('\n')+'\n';
  }
  function txt(points,meta){
    validate(points);meta=meta||{};const f=meta.film||{},s=meta.substrate||{},p=points[0];
    const lines=['# DPoeta optics lab: coherent single-film spectrum',
      '# R: reflected power; T: power entering semi-infinite substrate; A: absorption in the film.',
      '# Fractions are dimensionless (0 to 1). Wavelength and thickness are in nm; angle is in degrees.',
      '# Polarization: '+clean(p.polarization),
      '# Film dataset: '+clean(f.id), '# Film reference: '+clean(f.reference), '# Film source: '+clean(f.url), '# Film database record: '+clean(f.database),
      '# Substrate dataset: '+clean(s.id),'# Substrate reference: '+clean(s.reference),'# Substrate source: '+clean(s.url),'# Substrate database record: '+clean(s.database),
      '# Database revision: '+clean(meta.revision),
      '# '+numericColumns.join('\t')];
    return lines.join('\n')+'\n'+points.map(p=>values(p).join('\t')).join('\n')+'\n';
  }
  root.SpectrumExport=Object.freeze({csv,txt,numericColumns:Object.freeze(numericColumns)});
}(typeof globalThis!=='undefined'?globalThis:window));
