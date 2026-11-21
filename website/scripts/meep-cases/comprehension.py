# Spheres on a circle, made with a function and a list comprehension.
import math
import numpy as np
import meep as mp

n_si = 3.48
Si = mp.Medium(epsilon=n_si**2)
R = 0.6
count = 8


def bead(angle, r=0.05):
    """One sphere on the circle."""
    return mp.Sphere(radius=r, center=mp.Vector3(R * math.cos(angle), R * math.sin(angle), r), material=Si)


angles = np.linspace(0, 2 * np.pi, count, endpoint=False)
geometry = [bead(a) for a in angles if a < 1.5 * math.pi]
geometry += [bead(0.25 * np.pi * k, r=0.02 + 0.01 * k) for k in range(3)]
geometry.extend([mp.Ellipsoid(size=mp.Vector3(0.3, 0.2, 0.1), center=mp.Vector3(z=0.05), material=mp.Medium(index=1.9))])
