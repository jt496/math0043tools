/*
 Copyright (c) 2026 John Talbot

 Authored by John Talbot, with substantial assistance from Anthropic's
 Claude and Google's Gemini. See the NOTICE file for details.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

let scene, camera, renderer, controls;
let tilingGroup = new THREE.Group();
let latticeGroup = new THREE.Group();
let accumulatedTransform = new THREE.Matrix4();

const CONFIG = {
    bg: 0x0f172a,
    motifColor: 0x38bdf8,
    latticeColor: 0x475569,
    gridSize: 12,
    viewSize: 8
};

const T = (x, y) => new THREE.Matrix4().makeTranslation(x, y, 0);
const R = (angle, cx = 0, cy = 0) => T(cx, cy).multiply(new THREE.Matrix4().makeRotationZ(angle)).multiply(T(-cx, -cy));
const S = (sx, sy, cx = 0, cy = 0) => T(cx, cy).multiply(new THREE.Matrix4().makeScale(sx, sy, 1)).multiply(T(-cx, -cy));

const GROUPS = {
    p1: {
        v1: [1, 0], v2: [0.3, 0.8],
        syms: [{ type: 'id', label: 'e' }],
        desc: "Translations only. (Orbifold: o)", lattice: "Oblique",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' },
            { gen: 't2', tex: 't_2' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' } },
        relSeqs: { comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }] }
    },
    p2: {
        v1: [1, 0], v2: [0.3, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', gen: true }
        ],
        desc: "180° rotations. (Orbifold: 2222)", lattice: "Oblique",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' },
            { gen: 't2', tex: 't_2' }, { tex: ',\\,' }, { gen: 'C2', tex: 'C_2' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'C2sq', tex: 'C_2^2' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: '(C_2 t_1)^2' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: '(C_2 t_2)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C2: { type: 'sym', idx: 1 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            C2sq: [{ gen: 'C2' }, { gen: 'C2' }],
            conjt1: [{ gen: 'C2' }, { gen: 't1' }, { gen: 'C2' }, { gen: 't1' }],
            conjt2: [{ gen: 'C2' }, { gen: 't2' }, { gen: 'C2' }, { gen: 't2' }]
        }
    },
    pm: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σ', gen: true }
        ],
        desc: "Parallel reflections. (Orbifold: **)", lattice: "Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' },
            { gen: 't2', tex: 't_2' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 's2', tex: '\\sigma^2' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: '(\\sigma t_1)^2' }, { tex: ',\\;' },
            { rel: 'comm_st2', tex: '[\\sigma,t_2]' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, sigma: { type: 'sym', idx: 1 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            s2: [{ gen: 'sigma' }, { gen: 'sigma' }],
            conjt1: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't1' }],
            comm_st2: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't2', inv: true }]
        }
    },
    pg: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'glide', angle: Math.PI / 2, center: [0, 0], dist: 0.4, label: 'γ', gen: true }
        ],
        desc: "Glide reflections only. (Orbifold: xx)", lattice: "Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' },
            { gen: 'gamma', tex: '\\gamma' }, { tex: '\\;\\mid\\;' },
            { rel: 'conjt1', tex: '\\gamma^{-1} t_1\\gamma t_1' },
            { tex: '\\,\\rangle \\quad (t_2=\\gamma^2)' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, gamma: { type: 'sym', idx: 1 } },
        relSeqs: { conjt1: [{ gen: 'gamma', inv: true }, { gen: 't1' }, { gen: 'gamma' }, { gen: 't1' }] }
    },
    cm: {
        v1: [1, 0], v2: [0, 0.8], // Centered Rectangular
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σ', gen: true },
            { type: 'glide', angle: Math.PI / 2, center: [0.25, 0], dist: 0.4, label: 'γ' },
            { type: 'id', pre: T(0.5, 0.4), label: 't', gen: true }
        ],
        desc: "Reflections in a centered lattice. (Orbifold: *x)", lattice: "Centered Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 's2', tex: '\\sigma^2' }, { tex: ',\\;' },
            { rel: 'comm', tex: '[t,\\, \\sigma t\\sigma]' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'sym', idx: 3 }, sigma: { type: 'sym', idx: 1 } },
        relSeqs: {
            s2: [{ gen: 'sigma' }, { gen: 'sigma' }],
            comm: [{ gen: 't' }, { gen: 'sigma' }, { gen: 't' }, { gen: 'sigma' }, { gen: 't', inv: true }, { gen: 'sigma' }, { gen: 't', inv: true }, { gen: 'sigma' }]
        }
    },
    pmm: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σᵥ', gen: true },
            { type: 'refl', angle: 0, center: [0, 0], label: 'σₕ', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂' }
        ],
        desc: "Perpendicular reflections. (Orbifold: *2222)", lattice: "Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'sigma_v', tex: '\\sigma_v' }, { tex: ',\\,' }, { gen: 'sigma_h', tex: '\\sigma_h' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm12', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: '\\sigma_v^2' }, { tex: ',\\;' },
            { rel: 'comm_sv_sh', tex: '[\\sigma_v,\\sigma_h]' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: '(\\sigma_v t_1)^2' }, { tex: ',\\;' },
            { rel: 'comm_vt2', tex: '[\\sigma_v,t_2]' }, { tex: ',\\;' },
            { rel: 'comm_ht1', tex: '[\\sigma_h,t_1]' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: '(\\sigma_h t_2)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, sigma_v: { type: 'sym', idx: 1 }, sigma_h: { type: 'sym', idx: 2 } },
        relSeqs: {
            comm12: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'sigma_v' }, { gen: 'sigma_v' }],
            comm_sv_sh: [{ gen: 'sigma_v' }, { gen: 'sigma_h' }, { gen: 'sigma_v' }, { gen: 'sigma_h' }],
            conjt1: [{ gen: 'sigma_v' }, { gen: 't1' }, { gen: 'sigma_v' }, { gen: 't1' }],
            comm_vt2: [{ gen: 'sigma_v' }, { gen: 't2' }, { gen: 'sigma_v', inv: true }, { gen: 't2', inv: true }],
            comm_ht1: [{ gen: 'sigma_h' }, { gen: 't1' }, { gen: 'sigma_h', inv: true }, { gen: 't1', inv: true }],
            conjt2: [{ gen: 'sigma_h' }, { gen: 't2' }, { gen: 'sigma_h' }, { gen: 't2' }]
        }
    },
    pmg: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σ', gen: true },
            { type: 'rot', angle: Math.PI, center: [0.25, 0], label: 'C₂', gen: true },
            { type: 'glide', angle: 0, center: [0, 0], dist: 0.5, label: 'γ' }
        ],
        desc: "Reflections and rotations NOT on reflection lines. (Orbifold: 22*)", lattice: "Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'sigma', tex: '\\sigma' }, { tex: ',\\,' }, { gen: 'gamma', tex: '\\gamma' }, { tex: '\\;\\mid\\;' },
            { rel: 's2', tex: '\\sigma^2' }, { tex: ',\\;' },
            { rel: 'conj_gamma', tex: '(\\sigma\\gamma)^2' }, { tex: ',\\;' },
            { rel: 'comm_st2', tex: '[\\sigma,t_2]' }, { tex: ',\\;' },
            { rel: 'conj_t2', tex: '\\gamma t_2 \\gamma^{-1} t_2 \\rangle' }            
        ],
        genMap: { t2: { type: 'trans', which: 'v2' }, sigma: { type: 'sym', idx: 1 }, gamma: { type: 'sym', idx: 3 } },
        relSeqs: {
            s2: [{ gen: 'sigma' }, { gen: 'sigma' }],
            conj_gamma: [{ gen: 'sigma' }, { gen: 'gamma' }, { gen: 'sigma' }, { gen: 'gamma' }],
            comm_st2: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't2', inv: true }],
            conj_t2: [{ gen: 'gamma' }, { gen: 't2' }, { gen: 'gamma', inv: true }, { gen: 't2' }]
        }
    },
    pgg: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'glide', angle: Math.PI / 2, center: [0, 0], dist: 0.4, label: 'γᵥ', gen: true, arrowOffset: [0, 0.5] },
            { type: 'rot', angle: Math.PI, center: [0.25, 0.2], label: 'C₂' },
            { type: 'glide', angle: 0, center: [0, 0], dist: 0.5, label: 'γₕ', gen: true, arrowOffset: [0.5, 0] }
        ],
        desc: "Two perpendicular glides. (Orbifold: 22x)", lattice: "Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 'gamma_v', tex: '\\gamma_v' }, { tex: ',\\,' },
            { gen: 'gamma_h', tex: '\\gamma_h' }, { tex: '\\;\\mid\\;' },
            { rel: 'cycle', tex: '(\\gamma_v\\gamma_h)^2 \\rangle' }
        ],
        genMap: { gamma_v: { type: 'sym', idx: 1 }, gamma_h: { type: 'sym', idx: 3 } },
        relSeqs: { cycle: [{ gen: 'gamma_v' }, { gen: 'gamma_h' }, { gen: 'gamma_v' }, { gen: 'gamma_h' }] }
    },

    cmm: {
        v1: [1, 0], v2: [0, 0.8],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σᵥ', gen: true },
            { type: 'refl', angle: 0, center: [0, 0], label: 'σₕ', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂' },
            { type: 'id', pre: T(0.5, 0.4), label: 't', gen: true },
            { type: 'rot', angle: Math.PI, center: [0.25, 0.2], label: "C₂'" }
        ],
        desc: "Perpendicular reflections in centered lattice. (Orbifold: 2*22)", lattice: "Centered Rectangular",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'sigma_v', tex: '\\sigma_v' }, { tex: ',\\,' }, { gen: 'sigma_h', tex: '\\sigma_h' }, { tex: '\\;\\mid\\;' },
            { rel: 'invols', tex: '\\sigma_v^2' }, { tex: ',\\;' },
            { rel: 'comm_sv_sh', tex: '[\\sigma_v,\\sigma_h]' }, { tex: ',\\;' },
            { rel: 'conj_t', tex: '\\sigma_v t\\sigma_v\\sigma_h t\\sigma_h' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'sym', idx: 4 }, sigma_v: { type: 'sym', idx: 1 }, sigma_h: { type: 'sym', idx: 2 } },
        relSeqs: {
            invols: [{ gen: 'sigma_v' }, { gen: 'sigma_v' }],
            comm_sv_sh: [{ gen: 'sigma_v' }, { gen: 'sigma_h' }, { gen: 'sigma_v' }, { gen: 'sigma_h' }],
            conj_t: [{ gen: 'sigma_v' }, { gen: 't' }, { gen: 'sigma_v' }, { gen: 'sigma_h' }, { gen: 't' }, { gen: 'sigma_h' }]
        }
    },
    p4: {
        v1: [1, 0], v2: [0, 1],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'rot', angle: Math.PI / 2, center: [0, 0], label: 'C₄', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', power: true },
            { type: 'rot', angle: 3 * Math.PI / 2, center: [0, 0], label: 'C₄³', power: true }
        ],
        desc: "90° rotations. (Orbifold: 442)", lattice: "Square",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C4', tex: 'C_4' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'C4_4', tex: 'C_4^4' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_4 t_1 C_4^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_4 t_2 C_4^{-1}t_1^{-1}' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C4: { type: 'sym', idx: 1 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            C4_4: [{ gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }],
            conjt1: [{ gen: 'C4' }, { gen: 't1' }, { gen: 'C4', inv: true }, { gen: 't2' }],
            conjt2: [{ gen: 'C4' }, { gen: 't2' }, { gen: 'C4', inv: true }, { gen: 't1', inv: true }]
        }
    },
    p4m: {
        v1: [1, 0], v2: [0, 1],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: Math.PI / 2, center: [0, 0], label: 'C₄', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', power: true }, { type: 'rot', angle: 3 * Math.PI / 2, center: [0, 0], label: 'C₄³', power: true },
            { type: 'refl', angle: 0, center: [0, 0], label: 'σₕ', gen: true }, { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σᵥ' },
            { type: 'refl', angle: Math.PI / 4, center: [0, 0], label: 'σᵈ¹' }, { type: 'refl', angle: -Math.PI / 4, center: [0, 0], label: 'σᵈ²' }
        ],
        desc: "90° rotations and mirrors through centers. (Orbifold: *442)", lattice: "Square",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C4', tex: 'C_4' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: 'C_4^4' }, { tex: ',\\;' },
            { rel: 'conjt1_C4', tex: 'C_4 t_1 C_4^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2_C4', tex: 'C_4 t_2 C_4^{-1}t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'comm_s_t1', tex: '[\\sigma,t_1]' }, { tex: ',\\;' },
            { rel: 'conj_t2_s', tex: '(\\sigma t_2)^2' }, { tex: ',\\;' },
            { rel: 'conj_C4_s', tex: '(\\sigma C_4)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C4: { type: 'sym', idx: 1 }, sigma: { type: 'sym', idx: 4 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }],
            conjt1_C4: [{ gen: 'C4' }, { gen: 't1' }, { gen: 'C4', inv: true }, { gen: 't2' }],
            conjt2_C4: [{ gen: 'C4' }, { gen: 't2' }, { gen: 'C4', inv: true }, { gen: 't1', inv: true }],
            comm_s_t1: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't1', inv: true }],
            conj_t2_s: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't2' }],
            conj_C4_s: [{ gen: 'sigma' }, { gen: 'C4' }, { gen: 'sigma' }, { gen: 'C4' }]
        }
    },
    p4g: {
        v1: [1, 0], v2: [0, 1],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: Math.PI / 2, center: [0, 0], label: 'C₄', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', power: true }, { type: 'rot', angle: 3 * Math.PI / 2, center: [0, 0], label: 'C₄³', power: true },
            { type: 'refl', angle: Math.PI / 4, center: [0, 0.5], label: 'σ₁', gen: true }, { type: 'refl', angle: -Math.PI / 4, center: [0.25, 0.25], label: 'σ₂' },
            { type: 'glide', angle: Math.PI / 2, center: [0.25, 0], dist: 0.5, label: 'γ₁' }, { type: 'glide', angle: 0, center: [0, 0.25], dist: 0.5, label: 'γ₂' }
        ],
        desc: "90° rotations and offset reflections. (Orbifold: 4*2)", lattice: "Square",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C4', tex: 'C_4' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: 'C_4^4' }, { tex: ',\\;' },
            { rel: 'conjt1_C4', tex: 'C_4 t_1 C_4^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2_C4', tex: 'C_4 t_2 C_4^{-1}t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt1_s', tex: '\\sigma t_1\\sigma t_2^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt2_s', tex: '\\sigma t_2\\sigma t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conj_C4_s', tex: '\\sigma C_4\\sigma C_4 t_2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C4: { type: 'sym', idx: 1 }, sigma: { type: 'sym', idx: 4 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }, { gen: 'C4' }],
            conjt1_C4: [{ gen: 'C4' }, { gen: 't1' }, { gen: 'C4', inv: true }, { gen: 't2' }],
            conjt2_C4: [{ gen: 'C4' }, { gen: 't2' }, { gen: 'C4', inv: true }, { gen: 't1', inv: true }],
            conjt1_s: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't2', inv: true }],
            conjt2_s: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't1', inv: true }],
            conj_C4_s: [{ gen: 'sigma' }, { gen: 'C4' }, { gen: 'sigma' }, { gen: 'C4' }, { gen: 't2' }]
        }
    },
    p3: {
        v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'rot', angle: 2 * Math.PI / 3, center: [0, 0], label: 'C₃', gen: true },
            { type: 'rot', angle: 4 * Math.PI / 3, center: [0, 0], label: 'C₃²', power: true }
        ],
        desc: "120° rotations. (Orbifold: 333)", lattice: "Hexagonal",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C3', tex: 'C_3' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'C3_3', tex: 'C_3^3' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_3 t_1 C_3^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_3 t_2 C_3^{-1}t_2t_1^{-1}' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C3: { type: 'sym', idx: 1 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            C3_3: [{ gen: 'C3' }, { gen: 'C3' }, { gen: 'C3' }],
            conjt1: [{ gen: 'C3' }, { gen: 't1' }, { gen: 'C3', inv: true }, { gen: 't2' }],
            conjt2: [{ gen: 'C3' }, { gen: 't2' }, { gen: 'C3', inv: true }, { gen: 't2' }, { gen: 't1', inv: true }]
        }
    },
    p3m1: {
        v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: 2 * Math.PI / 3, center: [0, 0], label: 'C₃', gen: true }, { type: 'rot', angle: 4 * Math.PI / 3, center: [0, 0], label: 'C₃²', power: true },
            { type: 'refl', angle: Math.PI / 6, center: [0, 0], label: 'σ₁', gen: true }, { type: 'refl', angle: Math.PI / 2, center: [0, 0], label: 'σ₂' }, { type: 'refl', angle: 5 * Math.PI / 6, center: [0, 0], label: 'σ₃' }
        ],
        desc: "120° rotations and mirrors through centers. (Orbifold: *333)", lattice: "Hexagonal",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C3', tex: 'C_3' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: 'C_3^3' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_3 t_1 C_3^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_3 t_2 C_3^{-1}t_2t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt1_s', tex: '\\sigma t_1\\sigma t_2^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt2_s', tex: '\\sigma t_2\\sigma t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conj_C3_s', tex: '(\\sigma C_3)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C3: { type: 'sym', idx: 1 }, sigma: { type: 'sym', idx: 3 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'C3' }, { gen: 'C3' }, { gen: 'C3' }],
            conjt1: [{ gen: 'C3' }, { gen: 't1' }, { gen: 'C3', inv: true }, { gen: 't2' }],
            conjt2: [{ gen: 'C3' }, { gen: 't2' }, { gen: 'C3', inv: true }, { gen: 't2' }, { gen: 't1', inv: true }],
            conjt1_s: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't2', inv: true }],
            conjt2_s: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't1', inv: true }],
            conj_C3_s: [{ gen: 'sigma' }, { gen: 'C3' }, { gen: 'sigma' }, { gen: 'C3' }]
        }
    },
    p31m: {
        v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: 2 * Math.PI / 3, center: [0, 0], label: 'C₃', gen: true }, { type: 'rot', angle: 4 * Math.PI / 3, center: [0, 0], label: 'C₃²', power: true },
            { type: 'refl', angle: 0, center: [0, 0], label: 'σ₁', gen: true }, { type: 'refl', angle: Math.PI / 3, center: [0, 0], label: 'σ₂' }, { type: 'refl', angle: 2 * Math.PI / 3, center: [0, 0], label: 'σ₃' },
            { type: 'rot', angle: 2 * Math.PI / 3, center: [0.5, Math.sqrt(3) / 6], label: "C₃'" }
        ],
        desc: "120° rotations and mirrors NOT through all centers. (Orbifold: 3*3)", lattice: "Hexagonal",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C3', tex: 'C_3' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: 'C_3^3' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_3 t_1 C_3^{-1}t_2' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_3 t_2 C_3^{-1}t_2t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'comm_s_t1', tex: '[\\sigma,t_1]' }, { tex: ',\\;' },
            { rel: 'conj_t2_s', tex: '\\sigma t_2\\sigma t_2 t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conj_C3_s', tex: '(\\sigma C_3)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C3: { type: 'sym', idx: 1 }, sigma: { type: 'sym', idx: 3 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'C3' }, { gen: 'C3' }, { gen: 'C3' }],
            conjt1: [{ gen: 'C3' }, { gen: 't1' }, { gen: 'C3', inv: true }, { gen: 't2' }],
            conjt2: [{ gen: 'C3' }, { gen: 't2' }, { gen: 'C3', inv: true }, { gen: 't2' }, { gen: 't1', inv: true }],
            comm_s_t1: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't1', inv: true }],
            conj_t2_s: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't2' }, { gen: 't1', inv: true }],
            conj_C3_s: [{ gen: 'sigma' }, { gen: 'C3' }, { gen: 'sigma' }, { gen: 'C3' }]
        }
    },
    p6: {
        v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: Math.PI / 3, center: [0, 0], label: 'C₆', gen: true }, { type: 'rot', angle: 2 * Math.PI / 3, center: [0, 0], label: 'C₃', power: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', power: true }, { type: 'rot', angle: 4 * Math.PI / 3, center: [0, 0], label: 'C₃²', power: true }, { type: 'rot', angle: 5 * Math.PI / 3, center: [0, 0], label: 'C₆⁵', power: true }
        ],
        desc: "60° rotations. (Orbifold: 632)", lattice: "Hexagonal",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C6', tex: 'C_6' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'C6_6', tex: 'C_6^6' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_6 t_1 C_6^{-1}t_2t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_6 t_2 C_6^{-1}t_1^{-1}' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C6: { type: 'sym', idx: 1 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            C6_6: [{ gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }],
            conjt1: [{ gen: 'C6' }, { gen: 't1' }, { gen: 'C6', inv: true }, { gen: 't2' }, { gen: 't1', inv: true }],
            conjt2: [{ gen: 'C6' }, { gen: 't2' }, { gen: 'C6', inv: true }, { gen: 't1', inv: true }]
        }
    },
    p6m: {
        v1: [1, 0], v2: [0.5, Math.sqrt(3) / 2],
        syms: [
            { type: 'id', label: 'e' }, { type: 'rot', angle: Math.PI / 3, center: [0, 0], label: 'C₆', gen: true }, { type: 'rot', angle: 2 * Math.PI / 3, center: [0, 0], label: 'C₃', power: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', power: true }, { type: 'rot', angle: 4 * Math.PI / 3, center: [0, 0], label: 'C₃²', power: true }, { type: 'rot', angle: 5 * Math.PI / 3, center: [0, 0], label: 'C₆⁵', power: true },
            { type: 'refl', angle: 0, center: [0, 0], label: 'σ₁', gen: true }, { type: 'refl', angle: Math.PI / 6, center: [0, 0], label: 'σ₂' }, { type: 'refl', angle: 2 * Math.PI / 6, center: [0, 0], label: 'σ₃' },
            { type: 'refl', angle: 3 * Math.PI / 6, center: [0, 0], label: 'σ₄' }, { type: 'refl', angle: 4 * Math.PI / 6, center: [0, 0], label: 'σ₅' }, { type: 'refl', angle: 5 * Math.PI / 6, center: [0, 0], label: 'σ₆' }
        ],
        desc: "60° rotations and reflections. (Orbifold: *632)", lattice: "Hexagonal",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't1', tex: 't_1' }, { tex: ',\\,' }, { gen: 't2', tex: 't_2' }, { tex: ',\\,' },
            { gen: 'C6', tex: 'C_6' }, { tex: ',\\,' }, { gen: 'sigma', tex: '\\sigma' }, { tex: '\\;\\mid\\;' },
            { rel: 'comm', tex: '[t_1,t_2]' }, { tex: ',\\;' }, { rel: 'invols', tex: 'C_6^6' }, { tex: ',\\;' },
            { rel: 'conjt1', tex: 'C_6 t_1 C_6^{-1}t_2t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conjt2', tex: 'C_6 t_2 C_6^{-1}t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'comm_s_t1', tex: '[\\sigma,t_1]' }, { tex: ',\\;' },
            { rel: 'conj_t2_s', tex: '\\sigma t_2\\sigma t_2 t_1^{-1}' }, { tex: ',\\;' },
            { rel: 'conj_C6_s', tex: '(\\sigma C_6)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t1: { type: 'trans', which: 'v1' }, t2: { type: 'trans', which: 'v2' }, C6: { type: 'sym', idx: 1 }, sigma: { type: 'sym', idx: 6 } },
        relSeqs: {
            comm: [{ gen: 't1' }, { gen: 't2' }, { gen: 't1', inv: true }, { gen: 't2', inv: true }],
            invols: [{ gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }, { gen: 'C6' }],
            conjt1: [{ gen: 'C6' }, { gen: 't1' }, { gen: 'C6', inv: true }, { gen: 't2' }, { gen: 't1', inv: true }],
            conjt2: [{ gen: 'C6' }, { gen: 't2' }, { gen: 'C6', inv: true }, { gen: 't1', inv: true }],
            comm_s_t1: [{ gen: 'sigma' }, { gen: 't1' }, { gen: 'sigma' }, { gen: 't1', inv: true }],
            conj_t2_s: [{ gen: 'sigma' }, { gen: 't2' }, { gen: 'sigma' }, { gen: 't2' }, { gen: 't1', inv: true }],
            conj_C6_s: [{ gen: 'sigma' }, { gen: 'C6' }, { gen: 'sigma' }, { gen: 'C6' }]
        }
    }
};

function getMatrixFromSym(sym, ignorePre = false) {
    const m = new THREE.Matrix4(); if (sym.type === 'id') return sym.pre ? sym.pre.clone() : m;
    // if (sym.pre && (!ignorePre)) m.premultiply(sym.pre); // Unused m
    const cx = sym.center ? sym.center[0] : 0; const cy = sym.center ? sym.center[1] : 0;
    const res = T(cx, cy);
    let internal = new THREE.Matrix4();
    if (sym.type === 'rot') internal.makeRotationZ(sym.angle);
    else if (sym.type === 'refl') {
        internal.makeRotationZ(sym.angle || 0); internal.multiply(new THREE.Matrix4().makeScale(1, -1, 1)); internal.multiply(new THREE.Matrix4().makeRotationZ(-(sym.angle || 0)));
    } else if (sym.type === 'glide') {
        internal.makeRotationZ(sym.angle || 0); internal.multiply(new THREE.Matrix4().makeScale(1, -1, 1));
        internal.multiply(new THREE.Matrix4().makeTranslation(sym.dist || 0, 0, 0)); internal.multiply(new THREE.Matrix4().makeRotationZ(-(sym.angle || 0)));
    }
    res.multiply(internal); res.multiply(T(-cx, -cy));
    if (sym.pre && !ignorePre) res.multiply(sym.pre);
    return res;
}

function invSym(sym) {
    if (!sym) return sym;
    if (sym.type === 'refl') return sym;
    if (sym.type === 'rot') return { ...sym, angle: -sym.angle };
    if (sym.type === 'glide') return { ...sym, dist: -(sym.dist || 0) };
    if (sym.type === 'id' && sym.pre) {
        const pos = new THREE.Vector3();
        sym.pre.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        return { type: 'id', pre: T(-pos.x, -pos.y) };
    }
    return sym;
}

function renderPresentation(groupDef) {
    if (!groupDef.tokens) return '';
    const kr = s => katex.renderToString(s, { throwOnError: false });
    return groupDef.tokens.map(tok => {
        if (tok.gen !== undefined) return `<span class="gen-link" data-gen="${tok.gen}">${kr(tok.tex)}</span>`;
        if (tok.rel !== undefined) return `<span class="rel-link" data-rel="${tok.rel}">${kr(tok.tex)}</span>`;
        return kr(tok.tex);
    }).join('');
}

function getMotifType(groupId) {
    if (['p1', 'p2'].includes(groupId)) return 'comma';
    if (['pm', 'pmm', 'pmg', 'cm', 'cmm'].includes(groupId)) return 'arrow';
    if (['pg', 'pgg', 'p4g'].includes(groupId)) return 'hook';
    return 'spiral';
}

function createMotif(motifType) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: CONFIG.motifColor, transparent: true, opacity: 1 });
    const shape = new THREE.Shape();
    if (motifType === 'comma') {
        shape.moveTo(0.06, 0);
        shape.lineTo(0.09, 0.04);
        shape.quadraticCurveTo(0.12, 0.08, 0.09, 0.11);
        shape.quadraticCurveTo(0.06, 0.13, 0.04, 0.10);
        shape.quadraticCurveTo(0.02, 0.06, 0.06, 0);
    } else if (motifType === 'arrow') {
        shape.moveTo(0, 0.02);
        shape.lineTo(0.12, 0.06);
        shape.lineTo(0, 0.10);
        shape.lineTo(0.04, 0.06);
        shape.closePath();
    } else if (motifType === 'hook') {
        shape.moveTo(0, 0.12);
        shape.lineTo(0.04, 0.12);
        shape.lineTo(0.04, 0.05);
        shape.lineTo(0.07, 0.02);
        shape.lineTo(0.10, 0.02);
        shape.lineTo(0.10, 0.05);
        shape.lineTo(0.07, 0.05);
        shape.lineTo(0.06, 0.06);
        shape.lineTo(0, 0.06);
        shape.closePath();
    } else {
        shape.moveTo(0.04, 0);
        shape.lineTo(0.08, 0);
        shape.quadraticCurveTo(0.12, 0.03, 0.12, 0.07);
        shape.lineTo(0.12, 0.10);
        shape.lineTo(0.08, 0.08);
        shape.lineTo(0.08, 0.05);
        shape.quadraticCurveTo(0.08, 0.03, 0.06, 0.03);
        shape.closePath();
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0.08, 0.08, 0); group.add(mesh);
    return group;
}

function createLineMotif(groupId) {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: CONFIG.motifColor, linewidth: 1, transparent: true, opacity: 0.9 });
    const groupDef = GROUPS[groupId];
    const w = groupDef.v1[0], h = groupDef.v2[1] || 0.8;
    const motifType = getMotifType(groupId);
    const addCurve = (pts) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geo, mat));
    };
    if (motifType === 'comma') {
        // Meandering scroll
        const pts = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            pts.push(new THREE.Vector3(
                0.05 + t * 0.35,
                0.1 * h + 0.25 * h * Math.sin(t * Math.PI * 1.3),
                0
            ));
        }
        addCurve(pts);
        // Small spiral
        const sp = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const r = 0.06 * (1 - t * 0.7);
            sp.push(new THREE.Vector3(
                0.25 + r * Math.cos(t * Math.PI * 1.8),
                0.1 * h + 0.25 * h + r * Math.sin(t * Math.PI * 1.8),
                0
            ));
        }
        addCurve(sp);
    } else if (motifType === 'arrow') {
        // Vine with leaves - S-curve through cell
        const vine = [];
        for (let i = 0; i <= 50; i++) {
            const t = i / 50;
            vine.push(new THREE.Vector3(
                0.02 + t * 0.42,
                0.15 * h + 0.2 * h * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(vine);
        // Leaf 1 (upper)
        const leaf1 = [];
        for (let i = 0; i <= 15; i++) {
            const t = i / 15;
            leaf1.push(new THREE.Vector3(
                0.18 + 0.08 * t,
                0.15 * h + 0.2 * h * Math.sin(0.35 * Math.PI) + 0.1 * h * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(leaf1);
        // Leaf 2 (lower)
        const leaf2 = [];
        for (let i = 0; i <= 12; i++) {
            const t = i / 12;
            leaf2.push(new THREE.Vector3(
                0.12 + 0.06 * t,
                0.15 * h + 0.2 * h * Math.sin(0.2 * Math.PI) - 0.06 * h * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(leaf2);
    } else if (motifType === 'hook') {
        // Zigzag with hook — angular lines
        addCurve([
            new THREE.Vector3(0.02, 0.1 * h, 0),
            new THREE.Vector3(0.15, 0.4 * h, 0),
            new THREE.Vector3(0.28, 0.1 * h, 0),
            new THREE.Vector3(0.42, 0.35 * h, 0)
        ]);
        // Hook/curl at peak
        const hook = [];
        for (let i = 0; i <= 15; i++) {
            const t = i / 15;
            hook.push(new THREE.Vector3(
                0.15 + 0.05 * Math.cos(t * Math.PI * 1.3),
                0.4 * h + 0.04 * h * Math.sin(t * Math.PI * 1.3),
                0
            ));
        }
        addCurve(hook);
    } else {
        // Whorl/spiral arm for rotation groups
        const arm = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const r = 0.05 + t * 0.18;
            const a = t * Math.PI * 1.2 - 0.3;
            arm.push(new THREE.Vector3(
                0.2 + r * Math.cos(a),
                0.2 * h + r * Math.sin(a),
                0
            ));
        }
        addCurve(arm);
        // Inner curl
        const curl = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const r = 0.04 * (1 - t * 0.5);
            curl.push(new THREE.Vector3(
                0.2 + r * Math.cos(t * Math.PI * 2),
                0.2 * h + r * Math.sin(t * Math.PI * 2),
                0
            ));
        }
        addCurve(curl);
    }
    return group;
}

function init() {
    scene = new THREE.Scene(); scene.background = new THREE.Color(CONFIG.bg);
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(-CONFIG.viewSize * aspect / 2, CONFIG.viewSize * aspect / 2, CONFIG.viewSize / 2, -CONFIG.viewSize / 2, 0.1, 1000);
    camera.position.set(0, 0, 10);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableRotate = false; controls.enableDamping = true;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); dirLight.position.set(5, 5, 10); scene.add(dirLight);
    scene.add(tilingGroup); scene.add(latticeGroup);
    symmetryOverlayGroup = new THREE.Group(); scene.add(symmetryOverlayGroup);
    setupUI(); updateTiling(document.getElementById('group-select').value);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('show-symmetries').addEventListener('change', updateSymmetryOverlay);
    animate();
}

let isAnimatingSymmetries = false;
let symmetryOverlayGroup;
//let fundamentalCellGroup = new THREE.Group();

function updateSymmetryOverlay() {
    if (!symmetryOverlayGroup) return;
    symmetryOverlayGroup.clear();
    const show = document.getElementById('show-symmetries').checked;
    if (!show) return;
    const groupId = document.getElementById('group-select').value;
    const groupDef = GROUPS[groupId];
    if (!groupDef) return;
    groupDef.syms.forEach(sym => {
        if (sym.type === 'id') return;
        const indicator = createSymIndicator(sym, null);
        symmetryOverlayGroup.add(indicator);
    });
}

function updateTiling(groupId) {
    if (isAnimatingSymmetries) return;
    tilingGroup.clear(); latticeGroup.clear();
    const groupDef = GROUPS[groupId]; if (!groupDef) return;
    document.getElementById('group-name').textContent = groupId;
    document.getElementById('group-desc').textContent = groupDef.desc;
    document.getElementById('group-lattice').textContent = 'Lattice: ' + groupDef.lattice;
    const presEl = document.getElementById('group-pres');
    presEl.innerHTML = renderPresentation(groupDef);
    updateSymmetryButtons(groupId);
    updateSymmetryOverlay();
    const v1 = new THREE.Vector3(groupDef.v1[0], groupDef.v1[1], 0);
    const v2 = new THREE.Vector3(groupDef.v2[0], groupDef.v2[1], 0);
    const det = v1.x * v2.y - v1.y * v2.x;

    const useLines = true;
    const highlightCentral = document.getElementById('highlight-central')?.checked;
    const motif = useLines ? createLineMotif(groupId) : createMotif(getMotifType(groupId));

    let centralMotifs = [];
    if (highlightCentral) {
        const totalSyms = groupDef.syms.length;
        for (let s = 0; s < totalSyms; s++) {
            let cm = motif.clone();
            let childIndex = 0;
            const symHueOffset = s / Math.max(1, totalSyms);
            cm.traverse(child => {
                if (child.material) {
                    child.material = child.material.clone();
                    // Assure no geometry buffer tampering
                    child.material.vertexColors = false;
                    const hueOffset = childIndex * 0.618033988749895;
                    let hue = (symHueOffset + hueOffset) % 1.0;
                    child.material.color.setHSL(hue, 1.0, 0.5);
                    childIndex++;
                }
            });
            centralMotifs.push(cm);
        }
    }

    const showLattice = document.getElementById('show-lattice').checked;
    const N = CONFIG.gridSize;
    for (let i = -N; i <= N; i++) {
        for (let j = -N; j <= N; j++) {
            const origin = v1.clone().multiplyScalar(i).add(v2.clone().multiplyScalar(j));
            groupDef.syms.forEach((sym, symIdx) => {
                const symMat = getMatrixFromSym(sym);
                let inCentralCell = false;
                if (highlightCentral) {
                    const basePoint = new THREE.Vector3(0.05, 0.05, 0);
                    const mappedPoint = basePoint.applyMatrix4(symMat).add(origin);
                    const a = (mappedPoint.x * v2.y - mappedPoint.y * v2.x) / det;
                    const b = (-mappedPoint.x * v1.y + mappedPoint.y * v1.x) / det;
                    inCentralCell = (a >= -0.001 && a < 0.999 && b >= -0.001 && b < 0.999);
                }
                const currentMotif = inCentralCell ? centralMotifs[symIdx] : motif;
                const mInstance = currentMotif.clone();
                mInstance.applyMatrix4(symMat);
                mInstance.position.add(origin);
                tilingGroup.add(mInstance);
            });
            if (showLattice) {
                const points = [origin.clone(), origin.clone().add(v1), origin.clone().add(v1).add(v2), origin.clone().add(v2), origin.clone()];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const isMain = (i === 0 && j === 0);
                const lineMat = new THREE.LineBasicMaterial({ color: isMain ? 0xffffff : CONFIG.latticeColor, transparent: !isMain, opacity: isMain ? 1 : 0.2 });
                latticeGroup.add(new THREE.Line(lineGeo, lineMat));
            }
        }
    }
    tilingGroup.matrix.copy(accumulatedTransform);
    tilingGroup.matrixAutoUpdate = false;
}

function updateSymmetryButtons(groupId) {
    const container = document.getElementById('symmetry-buttons');
    container.innerHTML = '';
    const groupDef = GROUPS[groupId];
    const symColor = (type) => {
        if (type === 'id') return '129,140,248';   // #818cf8 indigo - translations
        if (type === 'rot') return '244,114,182';   // #f472b6 pink - rotations
        if (type === 'refl') return '251,191,36';   // #fbbf24 amber - reflections
        if (type === 'glide') return '52,211,153';   // #34d399 emerald - glides
        return '255,255,255';
    };
    const styleBtn = (btn, type) => {
        const c = symColor(type);
        btn.style.borderLeft = `3px solid rgba(${c},0.8)`;
        btn.style.backgroundColor = `rgba(${c},0.15)`;
    };
    const t1Sym = { type: 'id', pre: T(groupDef.v1[0], groupDef.v1[1]), label: 't₁' };
    const t2Sym = { type: 'id', pre: T(groupDef.v2[0], groupDef.v2[1]), label: 't₂' };
    [t1Sym, t2Sym].forEach(sym => {
        const btn = document.createElement('button');
        btn.className = 'btn'; btn.textContent = sym.label;
        styleBtn(btn, 'id');
        btn.addEventListener('click', () => animateGlobalSymmetry(groupId, null, sym));
        container.appendChild(btn);
    });
    groupDef.syms.forEach((sym, index) => {
        if (sym.type === 'id' && !sym.pre) return;
        if (sym.power) return;
        const btn = document.createElement('button');
        btn.className = 'btn'; btn.textContent = sym.label || sym.type;
        styleBtn(btn, sym.type);
        btn.addEventListener('click', () => animateGlobalSymmetry(groupId, index));
        container.appendChild(btn);
    });
}

function createSymIndicator(sym, shift) {
    const group = new THREE.Group();
    const cx = sym.center ? sym.center[0] : 0;
    const cy = sym.center ? sym.center[1] : 0;
    if (sym.type === 'rot') {
        let dotX = cx, dotY = cy;
        if (shift && (shift.x !== 0 || shift.y !== 0 || sym.pre)) {
            const cosA = Math.cos(sym.angle), sinA = Math.sin(sym.angle);
            const a = 1 - cosA, b = sinA;
            const det = a * a + b * b;
            let preX = 0, preY = 0;
            if (sym.pre) {
                const pp = new THREE.Vector3();
                sym.pre.decompose(pp, new THREE.Quaternion(), new THREE.Vector3());
                preX = pp.x; preY = pp.y;
            }
            const totalX = (shift ? shift.x : 0) + preX;
            const totalY = (shift ? shift.y : 0) + preY;
            if (det > 1e-10) {
                dotX = cx - preX + (a * totalX - b * totalY) / det;
                dotY = cy - preY + (b * totalX + a * totalY) / det;
            }
        }
        const dotGeo = new THREE.CircleGeometry(0.06, 32);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.9 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(dotX, dotY, 0.1);
        group.add(dot);
        const ringGeo = new THREE.RingGeometry(0.1, 0.12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(dotX, dotY, 0.1);
        group.add(ring);
    } else if (sym.type === 'refl' || sym.type === 'glide') {
        const ang = sym.angle || 0;
        // Adjust center to visual axis position
        const vcx = cx + (shift ? shift.x / 2 : 0);
        const vcy = cy + (shift ? shift.y / 2 : 0);
        const len = CONFIG.viewSize * 2;
        const dx = Math.cos(ang) * len;
        const dy = Math.sin(ang) * len;
        const points = [new THREE.Vector3(vcx - dx, vcy - dy, 0.1), new THREE.Vector3(vcx + dx, vcy + dy, 0.1)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const color = sym.type === 'refl' ? 0xfbbf24 : 0x34d399;
        const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.8 });
        group.add(new THREE.Line(lineGeo, lineMat));
        if (sym.type === 'glide') {
            const mappedOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(getMatrixFromSym(sym));
            const netX = mappedOrigin.x + (shift ? shift.x : 0);
            const netY = mappedOrigin.y + (shift ? shift.y : 0);
            const dot = netX * Math.cos(ang) + netY * Math.sin(ang);
            const sign = dot >= 0 ? 1 : -1;
            const arrowLen = 0.15;
            const dirX = sign * Math.cos(ang);
            const dirY = sign * Math.sin(ang);
            const perpX = -dirY;
            const perpY = dirX;
            const arrowOffsetX = (sym.arrowOffset ? sym.arrowOffset[0] : 0);
            const arrowOffsetY = (sym.arrowOffset ? sym.arrowOffset[1] : 0);
            const avcx = vcx + arrowOffsetX;
            const avcy = vcy + arrowOffsetY;
            const tipX = avcx + dirX * arrowLen * 0.7;
            const tipY = avcy + dirY * arrowLen * 0.7;
            const arrowPoints = [
                new THREE.Vector3(avcx - dirX * arrowLen * 0.7 + perpX * arrowLen * 0.4, avcy - dirY * arrowLen * 0.7 + perpY * arrowLen * 0.4, 0.1),
                new THREE.Vector3(tipX, tipY, 0.1),
                new THREE.Vector3(avcx - dirX * arrowLen * 0.7 - perpX * arrowLen * 0.4, avcy - dirY * arrowLen * 0.7 - perpY * arrowLen * 0.4, 0.1)
            ];
            const arrowGeo = new THREE.BufferGeometry().setFromPoints(arrowPoints);
            const arrow = new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.8 }));
            group.add(arrow);
        }
    } else if (sym.type === 'id' && sym.pre) {
        const pos = new THREE.Vector3();
        sym.pre.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        const points = [new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(pos.x, pos.y, 0.1)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x818cf8, linewidth: 2, transparent: true, opacity: 0.8 });
        group.add(new THREE.Line(lineGeo, lineMat));
        const len = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        if (len > 0) {
            const dirX = pos.x / len;
            const dirY = pos.y / len;
            const perpX = -dirY;
            const perpY = dirX;
            const arrowLen = 0.12;
            const arrowPoints = [
                new THREE.Vector3(pos.x - dirX * arrowLen + perpX * arrowLen * 0.5, pos.y - dirY * arrowLen + perpY * arrowLen * 0.5, 0.1),
                new THREE.Vector3(pos.x, pos.y, 0.1),
                new THREE.Vector3(pos.x - dirX * arrowLen - perpX * arrowLen * 0.5, pos.y - dirY * arrowLen - perpY * arrowLen * 0.5, 0.1)
            ];
            const arrowGeo = new THREE.BufferGeometry().setFromPoints(arrowPoints);
            group.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.8 })));
        }
    }
    return group;
}

async function animateGlobalSymmetry(groupId, specificSymIndex = null, customSym = null) {
    if (isAnimatingSymmetries) return;
    isAnimatingSymmetries = true;
    const groupDef = GROUPS[groupId];
    updateTiling(groupId);
    const ghostGroup = tilingGroup.clone();
    ghostGroup.traverse(child => { if (child.material) { child.material = child.material.clone(); child.material.opacity = 0.4; child.material.color.set(0x64748b); } });
    scene.add(ghostGroup);

    const v1 = new THREE.Vector2(groupDef.v1[0], groupDef.v1[1]);
    const v2 = new THREE.Vector2(groupDef.v2[0], groupDef.v2[1]);
    const det = v1.x * v2.y - v1.y * v2.x;

    const symsToAnimate = customSym ? [customSym] : (specificSymIndex !== null) ? [groupDef.syms[specificSymIndex]] : groupDef.syms;

    for (const sym of symsToAnimate) {
        const symMatrix = getMatrixFromSym(sym, true);
        // const mappedOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(symMatrix);
        // const i_coord = (mappedOrigin.x * v2.y - mappedOrigin.y * v2.x) / det;
        // const j_coord = (-mappedOrigin.x * v1.y + mappedOrigin.y * v1.x) / det;
        // const shift = new THREE.Vector2(-Math.round(i_coord - 0.001) * v1.x - Math.round(j_coord - 0.001) * v2.x, -Math.round(i_coord - 0.001) * v1.y - Math.round(j_coord - 0.001) * v2.y);
        const shift = new THREE.Vector2(0, 0);

        const indicator = createSymIndicator(sym, shift);
        scene.add(indicator);

        const speedVal = parseInt(document.getElementById('speed-slider').value) || 5;
        const duration = Math.max(300, 4000 - (speedVal - 1) * 400); const start = performance.now();
        await new Promise(resolve => {
            function step() {
                const now = performance.now(); let t = (now - start) / duration; if (t > 1) t = 1;
                const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                tilingGroup.matrix.copy(accumulatedTransform);
                const cx = sym.center ? sym.center[0] : 0; const cy = sym.center ? sym.center[1] : 0;
                let currentMatrix = new THREE.Matrix4();
                if (sym.type === 'id') {
                    if (sym.pre) {
                        const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scl = new THREE.Vector3();
                        sym.pre.decompose(pos, quat, scl);
                        currentMatrix.compose(pos.multiplyScalar(ease), new THREE.Quaternion().slerp(quat, ease), new THREE.Vector3(1, 1, 1).lerp(scl, ease));
                    }
                } else if (sym.type === 'rot') {
                    // Compute visual center: fixed point of T(shift)*R(θ,c)*T(pre)
                    let vcx = cx, vcy = cy;
                    const cosA = Math.cos(sym.angle), sinA = Math.sin(sym.angle);
                    const a = 1 - cosA, b = sinA;
                    const detR = a * a + b * b;
                    let preX = 0, preY = 0;
                    if (sym.pre) {
                        const pp = new THREE.Vector3();
                        sym.pre.decompose(pp, new THREE.Quaternion(), new THREE.Vector3());
                        preX = pp.x; preY = pp.y;
                    }
                    if (detR > 1e-10) {
                        const totalX = shift.x + preX;
                        const totalY = shift.y + preY;
                        vcx = cx - preX + (a * totalX - b * totalY) / detR;
                        vcy = cy - preY + (b * totalX + a * totalY) / detR;
                    }
                    currentMatrix.copy(T(vcx, vcy).multiply(new THREE.Matrix4().makeRotationZ(sym.angle * ease)).multiply(T(-vcx, -vcy)));
                } else if (sym.type === 'refl') {
                    const ang = sym.angle || 0; const sY = 1 - 2 * ease;
                    currentMatrix.copy(T(cx, cy).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeScale(1, sY, 1)).multiply(new THREE.Matrix4().makeRotationZ(-ang)).multiply(T(-cx, -cy)));
                } else if (sym.type === 'glide') {
                    const ang = sym.angle || 0; const sY = 1 - 2 * ease; const d = sym.dist * ease;
                    currentMatrix.copy(T(cx, cy).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeScale(1, sY, 1)).multiply(new THREE.Matrix4().makeTranslation(d, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(-ang)).multiply(T(-cx, -cy)));
                }
                if (sym.pre && sym.type !== 'id' && sym.type !== 'rot') tilingGroup.matrix.multiply(sym.pre);
                tilingGroup.matrix.premultiply(currentMatrix);
                if (sym.type !== 'id' && sym.type !== 'rot') tilingGroup.matrix.premultiply(T(shift.x * ease, shift.y * ease));
                tilingGroup.matrixAutoUpdate = false;
                if (t < 1) requestAnimationFrame(step); else resolve();
            }
            step();
        });
        await new Promise(r => setTimeout(r, Math.max(200, 1000 - speedVal * 80)));
        scene.remove(indicator);
        accumulatedTransform.copy(tilingGroup.matrix);
    }
    scene.remove(ghostGroup); isAnimatingSymmetries = false; updateTiling(groupId);
}

async function animateRelationSeq(groupId, seq) {
    const groupDef = GROUPS[groupId];
    if (!groupDef) return;
    for (const step of seq) {
        const spec = groupDef.genMap && groupDef.genMap[step.gen];
        if (!spec) continue;
        if (spec.type === 'sym') {
            const baseSym = groupDef.syms[spec.idx];
            if (step.inv) await animateGlobalSymmetry(groupId, null, invSym(baseSym));
            else await animateGlobalSymmetry(groupId, spec.idx);
        } else if (spec.type === 'trans') {
            const v = spec.which === 'v2' ? groupDef.v2 : groupDef.v1;
            const f = step.inv ? -1 : 1;
            await animateGlobalSymmetry(groupId, null, { type: 'id', pre: T(v[0] * f, v[1] * f) });
        }
    }
}

function setupUI() {
    document.getElementById('group-select').addEventListener('change', (e) => {
        accumulatedTransform.identity();
        updateTiling(e.target.value);
    });
    document.getElementById('reset-position')?.addEventListener('click', () => {
        accumulatedTransform.identity();
        updateTiling(document.getElementById('group-select').value);
    });
    document.getElementById('show-lattice').addEventListener('change', () => updateTiling(document.getElementById('group-select').value));
    const hcCheckbox = document.getElementById('highlight-central');
    if (hcCheckbox) hcCheckbox.addEventListener('change', () => updateTiling(document.getElementById('group-select').value));
    document.getElementById('group-pres').addEventListener('click', (e) => {
        const link = e.target.closest('[data-gen],[data-rel]');
        if (!link) return;
        const groupId = document.getElementById('group-select').value;
        const groupDef = GROUPS[groupId];
        if (!groupDef) return;
        const gen = link.dataset.gen;
        const rel = link.dataset.rel;
        if (gen) {
            const spec = groupDef.genMap && groupDef.genMap[gen];
            if (!spec) return;
            if (spec.type === 'sym') animateGlobalSymmetry(groupId, spec.idx);
            else if (spec.type === 'trans') {
                const v = spec.which === 'v2' ? groupDef.v2 : groupDef.v1;
                animateGlobalSymmetry(groupId, null, { type: 'id', pre: T(v[0], v[1]) });
            }
        } else if (rel) {
            const seq = groupDef.relSeqs && groupDef.relSeqs[rel];
            if (seq) animateRelationSeq(groupId, seq);
        }
    });
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -CONFIG.viewSize * aspect / 2; camera.right = CONFIG.viewSize * aspect / 2;
    camera.top = CONFIG.viewSize / 2; camera.bottom = -CONFIG.viewSize / 2;
    camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
window.addEventListener('load', init);
