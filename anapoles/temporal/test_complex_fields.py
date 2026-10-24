"""Meaningful controls for complex-field import/reconstruction, not an anapole run."""
import csv
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from complex_fields import (C0, EPS0, MU0, Z0, REQUIRED_COLUMNS, load_csv,
                            load_npz, validate_grid, reconstruct, poynting,
                            maxwell_residuals, web_slice)


def plane_wave(samples, index=1.5, wavelength_nm=366.5, standing=False):
    x=np.array([-1.,0.,1.]); y=np.array([-1.,0.,1.])
    z=np.linspace(0,wavelength_nm/index,samples)
    k=2*np.pi*index/wavelength_nm
    forward=np.exp(1j*k*z)
    backward=np.exp(-1j*k*z) if standing else np.zeros_like(forward)
    electric=np.zeros((3,3,samples,3),dtype=complex)
    magnetic=np.zeros_like(electric)
    electric[...,0]=forward+backward
    magnetic[...,1]=index/Z0*(forward-backward)
    return x,y,z,electric,magnetic


class ReconstructionTests(unittest.TestCase):
    def test_shared_phase_preserves_arbitrary_spatial_phases(self):
        e=np.array([[1+2j,3-1j,0j]])
        h=np.array([[2-3j,4j,1j]])
        er,hr=reconstruct(e,h,np.pi/2)
        np.testing.assert_allclose(er,e.imag,atol=1e-14)
        np.testing.assert_allclose(hr,h.imag,atol=1e-14)
        # No hard-coded quarter-cycle shift is inserted for magnetic fields.
        e2,h2=reconstruct(e,h,0)
        np.testing.assert_allclose(e2,e.real)
        np.testing.assert_allclose(h2,h.real)

    def test_periodicity(self):
        *_,e,h=plane_wave(20)
        a,b=reconstruct(e,h,.372)
        aa,bb=reconstruct(e,h,.372+2*np.pi)
        np.testing.assert_allclose(a,aa,atol=1e-14)
        np.testing.assert_allclose(b,bb,atol=1e-14)

    def test_cycle_averaged_poynting_equals_phase_average(self):
        *_,e,h=plane_wave(32)
        average=sum(poynting(e,h,phase) for phase in np.linspace(0,2*np.pi,64,endpoint=False))/64
        np.testing.assert_allclose(average,poynting(e,h),rtol=1e-13,atol=1e-16)
        np.testing.assert_allclose(poynting(e,h)[...,2],1.5/(2*Z0),rtol=1e-13)

    def test_standing_wave_is_not_assigned_radiation_from_field_maxima(self):
        *_,e,h=plane_wave(40,standing=True)
        np.testing.assert_allclose(poynting(e,h),0,atol=1e-16)
        # Both field phasors are nonzero; their relative phase is retained.
        self.assertGreater(np.max(np.abs(e)),1)
        self.assertGreater(np.max(np.abs(h)),.001)

    def test_maxwell_residual_converges_quadratically(self):
        coarse=plane_wave(64); fine=plane_wave(128)
        a=maxwell_residuals(*coarse,366.5,1.5**2)
        b=maxwell_residuals(*fine,366.5,1.5**2)
        self.assertLess(a['faradayRelativeL2'],.002)
        self.assertLess(a['ampereRelativeL2'],.002)
        self.assertGreater(a['faradayRelativeL2']/b['faradayRelativeL2'],3.8)
        self.assertGreater(a['ampereRelativeL2']/b['ampereRelativeL2'],3.8)
        self.assertAlmostEqual(a['faradayRelativeL2'],a['ampereRelativeL2'],places=9)

    def test_inconsistent_e_h_phase_fails_maxwell_control(self):
        x,y,z,e,h=plane_wave(64)
        broken=maxwell_residuals(x,y,z,e,1j*h,366.5,1.5**2)
        self.assertGreater(broken['faradayRelativeL2'],1)
        self.assertGreater(broken['ampereRelativeL2'],1)

    def test_single_plane_cannot_claim_full_maxwell_validation(self):
        x,y,z,e,h=plane_wave(8)
        with self.assertRaisesRegex(ValueError,'one plane is insufficient'):
            maxwell_residuals(x,y,z[:1],e[:,:,:1],h[:,:,:1],366.5,2.25)

    def test_import_order_units_and_compact_plane(self):
        grid=plane_wave(4)
        x,y,z,e,h=grid
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as temp:
            path=Path(temp)/'fields.csv'
            rows=[]
            for i,a in enumerate(x):
                for j,b in enumerate(y):
                    for k,c in enumerate(z):
                        values=np.concatenate([e[i,j,k],h[i,j,k]])
                        rows.append([a,b,c]+[v for value in values for v in (value.real,value.imag)])
            with path.open('w',newline='') as file:
                writer=csv.writer(file);writer.writerow(REQUIRED_COLUMNS);writer.writerows(reversed(rows))
            loaded=load_csv(path)
            for actual,expected in zip(loaded,grid):
                np.testing.assert_allclose(actual,expected)
            np.savez(Path(temp)/'fields.npz',x_nm=x,y_nm=y,z_nm=z,electric=e,magnetic=h)
            for actual,expected in zip(load_npz(Path(temp)/'fields.npz'),grid):
                np.testing.assert_allclose(actual,expected)
        meta={'phaseConvention':'exp(-i omega t)','source':'synthetic plane-wave unit test, not paper data','geometry':{'kind':'homogeneous test medium'},'wavelengthNm':366.5}
        output=web_slice(grid,meta,z[1],1,1/Z0)
        self.assertEqual(output['electric']['unit'],'E/E0')
        self.assertEqual(output['magnetic']['unit'],'H/H0')
        self.assertEqual(len(output['electric']['components']['Ex']['re']),9)
        self.assertGreater(output['sharedNormalizedMagnitudeScale'],1)
        self.assertEqual(output['grid']['rowOrder'],'y then x')
        self.assertEqual(output['metadata']['source'],meta['source'])
        with self.assertRaisesRegex(ValueError,'not an exported z plane'):
            web_slice(grid,meta,.123,1,1/Z0)

    def test_intensity_only_and_duplicate_positions_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as temp:
            path=Path(temp)/'intensity.csv'
            path.write_text('x_nm,y_nm,z_nm,E_squared,H_squared\n0,0,0,1,1\n')
            with self.assertRaisesRegex(ValueError,'missing columns'):
                load_csv(path)
            fields=Path(temp)/'duplicate.csv'
            with fields.open('w',newline='') as file:
                writer=csv.writer(file);writer.writerow(REQUIRED_COLUMNS);writer.writerow([0,0,0]+[0]*12);writer.writerow([0,0,0]+[0]*12)
            with self.assertRaises(ValueError):load_csv(fields)

    def test_nonfinite_and_undeclared_convention_rejected(self):
        with self.assertRaises(ValueError):reconstruct(np.ones(3),np.ones(3),float('nan'))
        grid=plane_wave(4)
        with self.assertRaisesRegex(ValueError,'phaseConvention'):
            web_slice(grid,{'source':'test','wavelengthNm':366.5,'geometry':'test'},grid[2][0],1,1/Z0)


if __name__=='__main__':
    unittest.main(verbosity=2)
