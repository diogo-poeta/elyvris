/* Display-only material annotations for the geometry designer.
 * Citations and sample descriptions match the site's materials-data.json.
 * These labels do not assign optical constants to shapes or run a simulation.
 */
window.ELYVRIS_GEOMETRY_MATERIALS = Object.freeze([
  {
    id: 'unassigned', label: 'Unassigned', color: '#7f66a7',
    note: 'No material has been specified.', citation: '', url: ''
  },
  {
    id: 'silica-malitson', label: 'Fused silica · SiO₂', color: '#668da0',
    note: 'Fused silica at 20 °C; optical constants depend on wavelength.',
    citation: 'I. H. Malitson, J. Opt. Soc. Am. 55, 1205–1208 (1965).',
    url: 'https://doi.org/10.1364/JOSA.55.001205'
  },
  {
    id: 'silicon-green', label: 'Crystalline silicon · Si', color: '#576d8d',
    note: 'Intrinsic crystalline silicon at 300 K; optical constants depend on wavelength.',
    citation: 'M. A. Green, Sol. Energy Mater. Sol. Cells 92, 1305–1310 (2008).',
    url: 'https://doi.org/10.1016/j.solmat.2008.06.009'
  },
  {
    id: 'tio2-siefke', label: 'Titanium dioxide · TiO₂ film', color: '#af8c62',
    note: 'Reference concerns a film grown by atomic layer deposition; other films can differ.',
    citation: 'T. Siefke et al., Adv. Optical Mater. 4, 1780–1786 (2016).',
    url: 'https://doi.org/10.1002/adom.201600250'
  },
  {
    id: 'mgf2-rodriguez', label: 'Magnesium fluoride · MgF₂ film', color: '#69a290',
    note: 'Reference concerns a deposited film; it is not a bulk-crystal tensor.',
    citation: 'L. V. Rodríguez-de Marcos et al., Opt. Mater. Express 7, 989–1006 (2017).',
    url: 'https://doi.org/10.1364/OME.7.000989'
  },
  {
    id: 'gold-johnson', label: 'Gold · Au', color: '#c28d3b',
    note: 'Room-temperature optical constants; real films vary with preparation.',
    citation: 'P. B. Johnson and R. W. Christy, Phys. Rev. B 6, 4370–4379 (1972).',
    url: 'https://doi.org/10.1103/PhysRevB.6.4370'
  },
  {
    id: 'aluminum-rakic', label: 'Aluminium · Al', color: '#9295a5',
    note: 'The source models intrinsic aluminium; native oxide and roughness are not included.',
    citation: 'A. D. Rakić, Appl. Opt. 34, 4755–4767 (1995).',
    url: 'https://doi.org/10.1364/AO.34.004755'
  },
  {
    id: 'bk7-schott', label: 'N-BK7 glass · SCHOTT', color: '#8c9cbd',
    note: 'Catalog glass data at 20 °C; optical constants depend on wavelength.',
    citation: 'SCHOTT optical glass data sheets.',
    url: 'https://www.schott.com/en-us/products/optical-glass-p1000267/downloads/'
  }
]);
