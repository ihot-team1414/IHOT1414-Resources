#!/usr/bin/env python3
"""
Convert a (huge) binary STL export of the robot into the two web models used
by the home-page hero:  assets/robot/robot-hi.glb  and  assets/robot/robot-lo.glb

What it does
  1. welds duplicate vertices and splits the mesh into parts (edge-connected pieces)
  2. sorts parts into material groups by shape: panel (big thin sheets), frame
     (long structure), accent (swerve module plates + any --accent part ids),
     wheel, metal (everything else). Tiny parts (< 8 mm) are dropped.
  3. writes one uncompressed GLB with one material per group (material names are
     what js/hero3d.js uses to pick colors)
  4. you then simplify + compress it with gltfpack (meshoptimizer):

     gltfpack -i robot_full.glb -o assets/robot/robot-hi.glb -si 0.06 -sa -gn 35 -cc -vp 14
     gltfpack -i robot_full.glb -o assets/robot/robot-lo.glb -si 0.02 -sa -gn 35 -cc -vp 14

Requirements: pip install numpy scipy trimesh ; npm i -g gltfpack
Usage:        python3 tools/cad/stl_to_glb.py "Main Assembly.stl" robot_full.glb [--list] [--accent 1042,1051]

The STL must be in millimetres with Z up (Onshape/SolidWorks default); the GLB
is written in metres with Y up. Run with --list to print the biggest parts and
their ids so you can choose which ones to highlight in IHOT blue.
The 2026 robot used: --accent 914,1026,1035,1042,1051  (turret plates).
Then regenerate the poster: open tools/robot-preview.html?transparent=1 at
1600x1280 and screenshot (see README "Updating the robot model").
"""
import argparse, json, sys, time
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
import trimesh

ap = argparse.ArgumentParser()
ap.add_argument('stl'); ap.add_argument('out')
ap.add_argument('--accent', default='', help='comma-separated part ids to color IHOT blue')
ap.add_argument('--list', action='store_true', help='print the largest parts and exit')
args = ap.parse_args()
t0 = time.time()

# 1. read binary STL (vertices only) and weld on a 0.01 mm grid
with open(args.stl, 'rb') as f:
    f.seek(80); n = int(np.frombuffer(f.read(4), '<u4')[0])
dt = np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
tri = np.memmap(args.stl, dtype=dt, offset=84, mode='r', shape=(n,))
v = np.ascontiguousarray(tri['v']).reshape(-1, 3)
del tri
q = np.round((v - v.min(0)) * 100).astype(np.int64)
key = (q[:, 0] << 42) | (q[:, 1] << 21) | q[:, 2]
del q
_, first, inv = np.unique(key, return_index=True, return_inverse=True)
del key
verts = v[first].astype(np.float64)
del v, first
faces = inv.reshape(-1, 3).astype(np.int32)
del inv
faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
print(f'{n:,} triangles -> {len(verts):,} unique vertices ({time.time()-t0:.0f}s)')

# 2. parts = faces connected through shared edges (memory-conscious: ~3 GB peak)
nf = len(faces)
pairs = faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
k = np.minimum(pairs[:, 0], pairs[:, 1]).astype(np.int64) * 10_000_000 + np.maximum(pairs[:, 0], pairs[:, 1])
del pairs
o = np.argsort(k, kind='stable')
ks = k[o]; del k
fs = (o // 3).astype(np.int32); del o     # row r of `pairs` belongs to face r // 3
same = ks[1:] == ks[:-1]; del ks
rows, cols = fs[:-1][same], fs[1:][same]; del fs, same
A = coo_matrix((np.ones(len(rows), np.int8), (rows, cols)), shape=(nf, nf)); del rows, cols
nparts, fpart = connected_components(A, directed=False); del A
cnt = np.bincount(fpart, minlength=nparts)
mn = np.full((nparts, 3), np.inf); mx = np.full((nparts, 3), -np.inf)
for c in range(3):
    np.minimum.at(mn, fpart, verts[faces[:, c]]); np.maximum.at(mx, fpart, verts[faces[:, c]])
V0, V1, V2 = (verts[faces[:, c]] for c in range(3))
cr = np.cross(V1 - V0, V2 - V0); area = np.linalg.norm(cr, axis=1) / 2
nrm = cr / np.maximum(2 * area[:, None], 1e-12)
pa = np.bincount(fpart, weights=area, minlength=nparts)
planar = np.max([np.bincount(fpart, weights=area * (np.abs(nrm[:, a]) > 0.985), minlength=nparts) / np.maximum(pa, 1e-9) for a in range(3)], axis=0)
d = mx - mn
print(f'{nparts} parts ({time.time()-t0:.0f}s)')
if args.list:
    for i in np.argsort(-cnt)[:60]:
        print(i, cnt[i], 'min', np.round(mn[i]), 'size', np.round(d[i]), f'planar {planar[i]:.2f}')
    sys.exit()

# 3. classify
accent_ids = {int(x) for x in args.accent.split(',') if x.strip()}
cls = np.full(nparts, 'metal', dtype=object)
for i in range(nparts):
    a, b, c = sorted(d[i]); dmax = d[i].max()
    if dmax < 8: cls[i] = 'drop'
    elif dmax > 350 and planar[i] > 0.85 and a < 110 and d[i][2] > 300: cls[i] = 'panel'
    elif 180 < b < 200 and 180 < c < 200 and 55 < a < 70: cls[i] = 'accent'
    elif 90 < a < 102 and 90 < b < 102 and 90 < c < 104 and mn[i, 2] < 5: cls[i] = 'wheel'
    elif dmax >= 250: cls[i] = 'frame'
    if i in accent_ids: cls[i] = 'accent'

# 4. export one GLB, one material per group, Z-up mm -> Y-up m, centered on the floor
center = (verts.min(0) + verts.max(0)) / 2; zmin = verts[:, 2].min()
cols = {'frame': [40, 48, 62, 255], 'panel': [30, 36, 48, 255], 'metal': [170, 180, 195, 255], 'accent': [62, 117, 183, 255], 'wheel': [25, 28, 34, 255]}
fc = cls[fpart]
scene = trimesh.Scene()
for g, col in cols.items():
    F = faces[fc == g]
    if not len(F): continue
    used, inv2 = np.unique(F, return_inverse=True)
    P = verts[used]
    P = np.stack([P[:, 0] - center[0], P[:, 2] - zmin, -(P[:, 1] - center[1])], 1) / 1000.0
    mat = trimesh.visual.material.PBRMaterial(name=g, baseColorFactor=col, metallicFactor=0.5, roughnessFactor=0.5)
    scene.add_geometry(trimesh.Trimesh(P, inv2.reshape(-1, 3), process=False, visual=trimesh.visual.TextureVisuals(material=mat)), node_name=g, geom_name=g)
    print(f'  {g:7s} {len(F):>10,} triangles')
scene.export(args.out)
print(f'wrote {args.out} ({time.time()-t0:.0f}s). Now run gltfpack (see top of this file).')
