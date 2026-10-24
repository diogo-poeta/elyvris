/* Curated optical constants from refractiveindex.info (CC0-1.0).
 * Source records, original publications and exact revision are in materials-data.json.
 * Formula wavelengths are micrometres; public API wavelengths are nanometres.
 * Tabulated data use piecewise-linear wavelength interpolation, without extrapolation.
 */
(function(root){
  'use strict';
  var dataset=null,records=new Map(),loadPromise=null;
  function mustLoad(){if(!dataset)throw new Error('OpticalMaterials.load() must complete before selecting a material.');}
  function metadata(record){var result={};Object.keys(record).forEach(function(key){if(key!=='models')result[key]=record[key];});return result;}
  function setData(data){
    if(!data||data.schemaVersion!==1||!Array.isArray(data.records))throw new TypeError('Unsupported optical-material dataset.');
    var next=new Map();
    data.records.forEach(function(record){
      if(!record.id||!record.models||!Number.isFinite(record.minNm)||!Number.isFinite(record.maxNm))throw new TypeError('Invalid optical-material record.');
      next.set(record.id,record);
    });
    dataset=data;records=next;return list();
  }
  function load(url){
    if(loadPromise)return loadPromise;
    loadPromise=fetch(url||'materials-data.json').then(function(response){if(!response.ok)throw new Error('Material data could not be loaded ('+response.status+').');return response.json();}).then(setData).catch(function(error){loadPromise=null;throw error;});
    return loadPromise;
  }
  function list(){mustLoad();return Array.from(records.values()).map(metadata);}
  function getRecord(id){mustLoad();var record=records.get(id);if(!record)throw new RangeError('Unknown optical material: '+id);return metadata(record);}
  function interpolate(rows,wavelength,column){
    if(wavelength<rows[0][0]||wavelength>rows[rows.length-1][0])throw new RangeError('Wavelength is outside the source table.');
    var low=0,high=rows.length-1;
    while(high-low>1){var mid=(low+high)>>1;if(rows[mid][0]>wavelength)high=mid;else low=mid;}
    if(rows[low][0]===wavelength)return rows[low][column];
    if(rows[high][0]===wavelength)return rows[high][column];
    var fraction=(wavelength-rows[low][0])/(rows[high][0]-rows[low][0]);
    return rows[low][column]+fraction*(rows[high][column]-rows[low][column]);
  }
  function formula(model,wavelengthNm){
    var wavelength=wavelengthNm/1000,lambda2=wavelength*wavelength;
    var co=model.coefficients,n2=1+co[0];
    for(var i=1;i<co.length;i+=2){var resonance=model.type==='formula 1'?co[i+1]*co[i+1]:co[i+1];n2+=co[i]*lambda2/(lambda2-resonance);}
    if(n2<=0||!Number.isFinite(n2))throw new RangeError('Material formula is not physical at this wavelength.');
    return Math.sqrt(n2);
  }
  function get(id,wavelengthNm){
    mustLoad();var record=records.get(id);
    if(!record)throw new RangeError('Unknown optical material: '+id);
    if(!Number.isFinite(wavelengthNm)||wavelengthNm<record.minNm||wavelengthNm>record.maxNm)throw new RangeError(record.label+' supports '+record.minNm+'–'+record.maxNm+' nm; extrapolation is disabled.');
    var result={n:undefined,k:0};
    record.models.forEach(function(model){
      if(model.type==='formula 1'||model.type==='formula 2')result.n=formula(model,wavelengthNm);
      else if(model.type==='tabulated nk'){result.n=interpolate(model.data,wavelengthNm,1);result.k=interpolate(model.data,wavelengthNm,2);}
      else if(model.type==='tabulated n')result.n=interpolate(model.data,wavelengthNm,1);
      else if(model.type==='tabulated k')result.k=interpolate(model.data,wavelengthNm,1);
      else throw new Error('Unsupported material model: '+model.type);
    });
    if(!Number.isFinite(result.n)||!Number.isFinite(result.k)||result.n<=0||result.k<0)throw new RangeError('Invalid material optical constants.');
    return result;
  }
  function range(ids){
    mustLoad();if(!Array.isArray(ids))ids=[ids];
    var minimum=1,maximum=1e7;
    ids.forEach(function(id){if(!id||id==='manual')return;var rec=getRecord(id);minimum=Math.max(minimum,rec.minNm);maximum=Math.min(maximum,rec.maxNm);});
    if(minimum>maximum)throw new RangeError('Selected materials have no common supported wavelength range.');
    return {minNm:minimum,maxNm:maximum};
  }
  function provenance(){mustLoad();return {source:dataset.source,repository:dataset.repository,revision:dataset.revision,retrievedAt:dataset.retrievedAt,license:dataset.license,licenseUrl:dataset.licenseUrl,databaseCitation:dataset.databaseCitation,interpolation:dataset.interpolation};}
  root.OpticalMaterials=Object.freeze({load:load,setData:setData,list:list,getRecord:getRecord,get:get,range:range,provenance:provenance});
}(typeof globalThis!=='undefined'?globalThis:window));
