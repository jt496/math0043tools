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

/**
 * Rotation-matrix and character panel for the polyhedra pages.
 *
 * Shows, for the symmetry currently applied to the solid:
 *   - the 3x3 matrix rho(g) of the rotation;
 *   - its character chi(g) = trace(rho(g)) = 1 + 2 cos(theta);
 *   - which conjugacy class g lies in.
 *
 * Hidden by default. A toggle is injected into the control panel, and the
 * choice is remembered in localStorage; ?rep=1 in the URL switches it on so
 * that lecture notes and problem sheets can link to the enabled version while
 * the plain link stays plain.
 *
 * Conjugacy classes are computed by honestly conjugating inside the generated
 * group -- NOT by cycle type. In A4 (the rotations of the tetrahedron) the
 * eight 3-cycles form two classes of four, not one; they only merge in S4.
 *
 * Matrices are plain row-major number[3][3] so this file has no dependency on
 * three.js and can be unit tested outside the browser.
 */
(function (global) {
    'use strict';

    // ── Linear algebra on plain 3x3 arrays ────────────────────────────────────

    function matMul(A, B) {
        const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++) {
                let s = 0;
                for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j];
                C[i][j] = s;
            }
        return C;
    }

    // For an orthogonal matrix (every element of O(3)) the inverse is the transpose.
    function matTranspose(A) {
        return [[A[0][0], A[1][0], A[2][0]],
        [A[0][1], A[1][1], A[2][1]],
        [A[0][2], A[1][2], A[2][2]]];
    }

    function matTrace(A) { return A[0][0] + A[1][1] + A[2][2]; }

    function matDet(A) {
        return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
             - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
             + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    }

    /** true for the improper elements: reflections, rotoreflections, inversion. */
    function isImproper(A) { return matDet(A) < 0; }

    function identity() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }

    // Canonical string key, so matrices can be used in a Map/Set.
    // -0 is normalised to 0 so that the key is stable.
    function matKey(A, dp = 6) {
        const f = 10 ** dp;
        return A.map(row => row.map(v => (Math.round(v * f) + 0)).join(',')).join(';');
    }

    // Quaternion (x, y, z, w) -> rotation matrix, row-major.
    function quatToMatrix(q) {
        let { x, y, z, w } = q;
        const n = Math.hypot(x, y, z, w);
        if (n > 0) { x /= n; y /= n; z /= n; w /= n; }
        return [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
        ];
    }

    // THREE.Matrix4 -> the top-left 3x3 block, row-major.
    // Matrix4.elements is column-major, so entry (i,j) sits at elements[j*4+i].
    function matrix4ToMatrix(m) {
        const e = m.elements;
        return [[e[0], e[4], e[8]],
                [e[1], e[5], e[9]],
                [e[2], e[6], e[10]]];
    }

    // Householder reflection in the plane through the origin with unit normal n.
    function reflectionToMatrix(normal) {
        let [x, y, z] = normal;
        const n = Math.hypot(x, y, z);
        if (n === 0) return identity();
        x /= n; y /= n; z /= n;
        return [
            [1 - 2 * x * x, -2 * x * y, -2 * x * z],
            [-2 * y * x, 1 - 2 * y * y, -2 * y * z],
            [-2 * z * x, -2 * z * y, 1 - 2 * z * z]
        ];
    }

    // Rodrigues' formula: rotation by `degrees` about `axis`.
    function axisAngleToMatrix(axis, degrees) {
        let [x, y, z] = axis;
        const n = Math.hypot(x, y, z);
        if (n === 0) return identity();
        x /= n; y /= n; z /= n;
        const t = degrees * Math.PI / 180;
        const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
        return [
            [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
            [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
            [z * x * C - y * s, z * y * C + x * s, c + z * z * C]
        ];
    }

    /**
      * The angle turned through, in degrees.
      *
      * A rotation has tr = 1 + 2cos(theta). An improper element is a rotation
      * followed by a reflection in the plane perpendicular to its axis, and has
      * tr = -1 + 2cos(theta): theta = 0 is a plain reflection (tr = 1) and
      * theta = 180 is the inversion -I (tr = -3).
      */
    function rotationAngle(A) {
        const t = matTrace(A);
        const c = isImproper(A) ? (t + 1) / 2 : (t - 1) / 2;
        return Math.acos(Math.min(1, Math.max(-1, c))) * 180 / Math.PI;
    }

    // ── Group generation and conjugacy classes ────────────────────────────────

    /** Turn a generator spec -- {axis, angle} or {normal} -- into a matrix. */
    function generatorMatrix(g) {
        return g.normal ? reflectionToMatrix(g.normal) : axisAngleToMatrix(g.axis, g.angle);
    }

    /** Close a set of generator matrices under multiplication (breadth first). */
    function generateGroup(generators, limit = 240) {
        const elements = [identity()];
        const seen = new Set([matKey(identity())]);
        for (let i = 0; i < elements.length; i++) {
            for (const g of generators) {
                const p = matMul(g, elements[i]);
                const k = matKey(p);
                if (!seen.has(k)) {
                    seen.add(k);
                    elements.push(p);
                    if (elements.length > limit) return elements; // safety valve
                }
            }
        }
        return elements;
    }

    /**
     * Partition the group into conjugacy classes by computing h g h^-1 for every
     * h in G. Deliberately not a shortcut via cycle type: in A4 the 3-cycles
     * split into two classes, and a cycle-type shortcut would wrongly merge them.
     */
    function conjugacyClasses(elements) {
        const index = new Map(elements.map((m, i) => [matKey(m), i]));
        const assigned = new Array(elements.length).fill(-1);
        const classes = [];
        for (let i = 0; i < elements.length; i++) {
            if (assigned[i] !== -1) continue;
            const id = classes.length;
            const members = [];
            for (const h of elements) {
                const conj = matMul(matMul(h, elements[i]), matTranspose(h));
                const j = index.get(matKey(conj));
                if (j !== undefined && assigned[j] === -1) {
                    assigned[j] = id;
                    members.push(j);
                }
            }
            classes.push({
                id, members,
                angle: rotationAngle(elements[i]),
                improper: isImproper(elements[i])
            });
        }
        return { classes, assigned, index };
    }

    /**
     * Human-readable name for each class. Classes sharing a rotation angle are
     * distinguished by a letter -- which is exactly what happens in A4, where two
     * distinct classes of four both consist of rotations by 120 degrees.
     */
    function labelClasses(classes) {
        // Two classes only need a letter if size AND angle coincide -- as they do
        // for the two classes of 120 degree rotations in A4. Where the sizes
        // already differ (the cube's face and edge half-turns) the letter would
        // just be noise.
        const byShape = new Map();
        classes.forEach(c => {
            const key = (c.improper ? 'i' : 'r') + Math.round(c.angle) + ':' + c.members.length;
            if (!byShape.has(key)) byShape.set(key, []);
            byShape.get(key).push(c);
        });
        classes.forEach(c => {
            const size = c.members.length;
            const deg = Math.round(c.angle);
            let label;
            if (c.improper) {
                // theta = 0 is a plain mirror; theta = 180 is the inversion -I.
                if (deg === 0) label = size + (size === 1 ? ' reflection' : ' reflections');
                else if (deg === 180) label = 'inversion';
                else label = size + (size === 1 ? ' rotoreflection' : ' rotoreflections')
                    + ' by ' + deg + '\u00b0';
                c.label = label;
                return;
            }
            if (deg === 0) { c.label = 'identity'; return; }
            const noun = size === 1 ? 'rotation' : 'rotations';
            label = size + ' ' + noun + ' by ' + deg + '\u00b0';
            const peers = byShape.get((c.improper ? 'i' : 'r') + deg + ':' + size);
            if (peers.length > 1) {
                label += ' (' + String.fromCharCode(65 + peers.indexOf(c)) + ' of ' + peers.length + ')';
            }
            c.label = label;
        });
        return classes;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    // Entries are printed symbolically rather than as decimals, in the same
    // spirit as the Representation Explorer (groups/structure/representations).
    // That page renders LaTeX through MathJax; these pages do not load MathJax
    // (and the panel re-renders on every animation frame), so the symbols here
    // are plain Unicode -- but the key idea is the same: pull out a common
    // factor so that every entry comes out fraction-free.
    //
    // Rotation matrices need far fewer symbols than a general representation.
    // The three solids between them use only:
    //   tetrahedron, cube   0, ±1
    //   dodecahedron        0, ±1, ±1/2, ±φ/2, ±(φ−1)/2   -> ×2 clears them all
    const MINUS = '−';
    const PHI = (1 + Math.sqrt(5)) / 2;

    // ff = "fraction free": true if the symbol can stand in a matrix that has
    // had its common factor pulled out to the front.
    const SYMBOLS = [
        { v: 0, s: '0', ff: true },
        { v: 1, s: '1', ff: true },
        { v: 2, s: '2', ff: true },
        { v: 3, s: '3', ff: true },
        { v: 4, s: '4', ff: true },
        { v: Math.SQRT2, s: '√2', ff: true },
        { v: Math.sqrt(3), s: '√3', ff: true },
        { v: Math.sqrt(5), s: '√5', ff: true },
        { v: PHI, s: 'φ', ff: true },
        { v: PHI - 1, s: 'φ−1', neg: '1−φ', ff: true },
        { v: PHI + 1, s: 'φ+1', neg: '−(φ+1)', ff: true },
        { v: 2 * PHI, s: '2φ', ff: true },
        { v: 2 * (PHI - 1), s: '2(φ−1)', neg: '2(1−φ)', ff: true },
        { v: 0.5, s: '½', ff: false },
        { v: 1 / 3, s: '⅓', ff: false },
        { v: 2 / 3, s: '⅔', ff: false },
        { v: 0.25, s: '¼', ff: false },
        { v: 0.75, s: '¾', ff: false },
        { v: Math.SQRT1_2, s: '√2/2', ff: false },
        { v: Math.sqrt(3) / 2, s: '√3/2', ff: false },
        { v: Math.sqrt(3) / 3, s: '√3/3', ff: false },
        { v: PHI / 2, s: 'φ/2', ff: false },
        { v: (PHI - 1) / 2, s: '(φ−1)/2', neg: '(1−φ)/2', ff: false },
        { v: (PHI + 1) / 2, s: '(φ+1)/2', neg: '−(φ+1)/2', ff: false }
    ];

    // The axes on the dodecahedron pages are written as 7-figure decimals, so
    // entries land within ~1e-8 of their exact values; 1e-6 is comfortable.
    const TOL = 1e-6;

    /**
     * Snap v to a known exact value: {s, ff}, or null if it is not one.
     * Compound symbols carry their own negative form, so that -(φ−1) prints as
     * the conventional 1−φ rather than the ambiguous −φ−1.
     */
    function symbolFor(v) {
        const a = Math.abs(v);
        for (const { v: value, s, neg, ff } of SYMBOLS) {
            if (Math.abs(a - value) < TOL) {
                if (value === 0) return { s: '0', ff };
                return { s: v < 0 ? (neg || MINUS + s) : s, ff };
            }
        }
        return null;
    }

    // Prefix shown in front of the bracket when a factor has been pulled out.
    const FRACTION = { 2: '½', 3: '⅓', 4: '¼', 6: '⅙', 12: '1/12' };

    /**
     * Format the nine entries.
     *
     * Tries to pull out a common factor 1/k so that every entry of k·A prints
     * fraction-free -- k = 2 turns the dodecahedron's ±φ/2 and ±(φ−1)/2 into
     * ±φ and ±(φ−1). Failing that it prints the entries as they are, and only
     * if some entry is unrecognisable does it fall back to decimals (the whole
     * matrix at once, so the display is never a mix of symbols and decimals).
     *
     * @returns {{cells: string[], factor: string|null}}
     */
    function formatMatrix(A) {
        const flat = [].concat(...A);
        for (const k of [1, 2, 3, 4, 6, 12]) {
            const hits = flat.map(v => symbolFor(v * k));
            if (hits.every(h => h !== null && h.ff)) {
                return { cells: hits.map(h => h.s), factor: k === 1 ? null : FRACTION[k] };
            }
        }
        const plain = flat.map(v => symbolFor(v));
        if (plain.every(h => h !== null)) {
            return { cells: plain.map(h => h.s), factor: null };
        }
        return {
            cells: flat.map(v => {
                const r = Math.abs(v) < 5e-4 ? 0 : v; // avoid "−0.000"
                return r.toFixed(3).replace('-', MINUS);
            }),
            factor: null
        };
    }

    /**
     * The character. For the icosahedral group these are 3, φ, 1−φ, −1, 0 --
     * exactly the character table row, so it is worth naming them rather than
     * printing 1.618.
     */
    function formatTrace(t) {
        const r = Math.abs(t) < TOL ? 0 : t;
        const rounded = Math.round(r);
        if (Math.abs(r - rounded) < TOL) return String(rounded).replace('-', MINUS);
        const hit = symbolFor(r);
        return hit ? hit.s : r.toFixed(3).replace('-', MINUS);
    }

    const STYLE_ID = 'rep-panel-styles';
    const CSS = `
.rep-toggle-row { display: flex; align-items: center; gap: 10px; margin-top: 5px; }
.rep-switch { position: relative; display: inline-block; width: 40px; height: 20px; flex-shrink: 0; }
.rep-switch input { opacity: 0; width: 0; height: 0; }
.rep-switch-slider { position: absolute; cursor: pointer; inset: 0; border-radius: 34px;
    background-color: rgba(255,255,255,0.1); transition: .4s; }
.rep-switch-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px;
    bottom: 3px; background-color: #fff; border-radius: 50%; transition: .4s; }
.rep-switch input:checked + .rep-switch-slider { background-color: var(--accent-color, #38bdf8); }
.rep-switch input:checked + .rep-switch-slider:before { transform: translateX(20px); }
.rep-info-btn { background: transparent; border: 1px solid var(--accent-color, #38bdf8);
    color: var(--accent-color, #38bdf8); border-radius: 50%; width: 22px; height: 22px;
    font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center;
    justify-content: center; padding: 0; line-height: 1; flex-shrink: 0; transition: all .2s ease; }
.rep-info-btn:hover { background: rgba(56,189,248,0.15); transform: scale(1.1); }

.rep-panel { margin-top: 12px; padding: 12px; border-radius: 10px;
    background: rgba(15,23,42,0.55); border: 1px solid rgba(255,255,255,0.08);
    font-size: 0.95rem; font-weight: 400; color: #e2e8f0; text-align: left; line-height: 1.5; }
.rep-panel.rep-hidden { display: none; }
.rep-panel .rep-row { display: flex; align-items: center; gap: 12px; }
.rep-panel .rep-row + .rep-row { margin-top: 10px; }
.rep-panel .rep-label { color: #94a3b8; font-size: 0.85rem; min-width: 52px; flex-shrink: 0; }
.rep-panel .rep-value { color: #e2e8f0; font-weight: 600; }
.rep-panel .rep-aside { color: #94a3b8; font-weight: 400; font-size: 0.85rem; }
.rep-matrix { display: grid; flex: 0 0 auto; grid-template-columns: repeat(3, minmax(2.4em, auto)); gap: 2px 8px;
    padding: 4px 10px; border-left: 2px solid #64748b; border-right: 2px solid #64748b;
    border-radius: 3px; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.95rem; font-weight: 500; color: #f8fafc; }
/* Centred, as LaTeX's pmatrix is: right-aligning pushes every entry towards
   the closing bracket and leaves a gap after the opening one. */
.rep-matrix span { text-align: center; white-space: nowrap; }
.rep-panel .rep-factor { font-size: 1.15rem; color: #f8fafc; flex: 0 0 auto; }
.rep-panel .rep-factor.rep-hidden { display: none; }

.rep-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.9);
    backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 10000;
    display: none; align-items: center; justify-content: center; }
.rep-modal-overlay.rep-open { display: flex; }
.rep-modal { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
    padding: 24px; max-width: min(90%, 540px); max-height: 90vh; overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); color: #f8fafc;
    font-family: 'Outfit', sans-serif; text-align: left; }
.rep-modal-header { display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px; }
.rep-modal-header h2 { margin: 0; color: var(--accent-color, #38bdf8); font-size: 1.25rem; font-weight: 600; }
.rep-modal-close { background: transparent; border: none; color: #94a3b8; font-size: 32px;
    line-height: 1; cursor: pointer; padding: 0 4px; transition: color .2s; }
.rep-modal-close:hover { color: #fff; }
.rep-modal-body { font-size: 0.95em; color: #cbd5e1; line-height: 1.6; }
.rep-modal-body p { margin: 0 0 12px 0; }
.rep-modal-body a { color: var(--accent-color, #38bdf8); text-decoration: none; font-weight: 600; }
.rep-modal-body a:hover { text-decoration: underline; }
`;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * @param {object} opts
     * @param {function(): {x,y,z,w}} [opts.getQuaternion]  current orientation
     * @param {function(): THREE.Matrix4} [opts.getMatrix]  ditto, for the pages
     *        that track a Matrix4 because their group contains reflections
     * @param {Array<{axis:number[], angle:number}|{normal:number[]}>} opts.generators
     *        rotations as {axis, angle}, reflections as {normal}
     * @param {string} [opts.groupName]   e.g. 'A₄', used in the help text
     * @param {string} [opts.anchor]      selector of the element to sit under
     * @param {string} [opts.storageKey]  localStorage key for the toggle state
     */
    function attach(opts) {
        injectStyles();

        const anchor = document.querySelector(opts.anchor || '#permutation-overlay');
        if (!anchor) return null;

        const groupName = opts.groupName || 'G';
        const hasReflections = opts.generators.some(g => g.normal);
        const storageKey = opts.storageKey || 'math0043.polyhedra.showRep';

        // The pages differ in what they track: a quaternion where the group is
        // all rotations, a Matrix4 where it also contains reflections.
        const currentElement = opts.getMatrix
            ? () => matrix4ToMatrix(opts.getMatrix())
            : () => quatToMatrix(opts.getQuaternion());

        // Group data, computed once.
        const gens = opts.generators.map(generatorMatrix);
        const elements = generateGroup(gens);
        const { classes, assigned, index } = conjugacyClasses(elements);
        labelClasses(classes);

        // ---- toggle -----------------------------------------------------------
        const row = document.createElement('div');
        row.className = 'rep-toggle-row';
        row.setAttribute('data-subgroup-hide', '');
        row.innerHTML =
            '<label class="rep-switch">' +
            '<input type="checkbox" id="rep-toggle">' +
            '<span class="rep-switch-slider"></span>' +
            '</label>' +
            '<span>Show matrix &amp; character</span>' +
            '<button class="rep-info-btn" id="rep-info-btn" type="button" ' +
            'title="Matrices and characters" aria-label="About matrices and characters">?</button>';
        anchor.parentNode.insertBefore(row, anchor);

        // ---- readout ----------------------------------------------------------
        const panel = document.createElement('div');
        panel.className = 'rep-panel rep-hidden';
        panel.setAttribute('data-subgroup-hide', '');
        panel.innerHTML =
            '<div class="rep-row"><span class="rep-label">ρ(g)</span>' +
            '<span class="rep-factor" id="rep-factor"></span>' +
            '<span class="rep-matrix" id="rep-matrix"></span></div>' +
            '<div class="rep-row"><span class="rep-label">χ(g)</span>' +
            '<span class="rep-value" id="rep-chi"></span>' +
            '<span class="rep-aside" id="rep-chi-aside"></span></div>' +
            '<div class="rep-row"><span class="rep-label">Class</span>' +
            '<span class="rep-value" id="rep-class"></span></div>';
        anchor.parentNode.insertBefore(panel, anchor.nextSibling);

        const matrixEl = panel.querySelector('#rep-matrix');
        const factorEl = panel.querySelector('#rep-factor');
        const chiEl = panel.querySelector('#rep-chi');
        const asideEl = panel.querySelector('#rep-chi-aside');
        const classEl = panel.querySelector('#rep-class');

        // ---- help modal -------------------------------------------------------
        const modal = document.createElement('div');
        modal.className = 'rep-modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="rep-modal">' +
            '<div class="rep-modal-header"><h2>Matrices and characters</h2>' +
            '<button class="rep-modal-close" type="button" aria-label="Close dialog">&times;</button></div>' +
            '<div class="rep-modal-body">' +
            '<p>Every symmetry of the solid moves space rigidly about the centre, so it ' +
            'can be written as a 3&times;3 matrix. Sending each group element <em>g</em> to ' +
            'its matrix ρ(<em>g</em>) is a <strong>representation</strong> ' +
            'ρ : ' + groupName + ' → GL(3,ℝ).</p>' +
            '<p>The <strong>character</strong> χ(<em>g</em>) is the trace of that matrix — ' +
            'the sum of its diagonal entries. For a rotation by angle θ the trace always works ' +
            'out to 1 + 2cosθ' + (hasReflections ? ', and for a reflection or rotoreflection ' +
            'to −1 + 2cosθ' : '') + ', so the character only depends on the angle turned ' +
            'through.</p>' +
            '<p>That is why the character is constant on each <strong>conjugacy class</strong>: ' +
            'conjugate elements are the same rotation seen from a different viewpoint, so they ' +
            'turn through the same angle. Note that the converse can fail — in ' + groupName +
            ' two <em>different</em> classes may share an angle.</p>' +
            '<p>To decompose representations and build character tables, visit the ' +
            '<a href="../../structure/representations/index.html">Representation Explorer &rarr;</a></p>' +
            '</div></div>';
        document.body.appendChild(modal);

        const openModal = () => modal.classList.add('rep-open');
        const closeModal = () => modal.classList.remove('rep-open');
        row.querySelector('#rep-info-btn').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
        modal.querySelector('.rep-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        // ---- visibility -------------------------------------------------------
        const checkbox = row.querySelector('#rep-toggle');

        // Declared here, not beside the update loop below: setVisible() calls
        // render() during setup, which would otherwise hit the temporal dead zone.
        let lastKey = null;

        function readInitialState() {
            const param = new URLSearchParams(global.location.search).get('rep');
            if (param === '1' || param === 'true') return true;
            if (param === '0' || param === 'false') return false;
            try {
                return global.localStorage.getItem(storageKey) === '1';
            } catch (err) {
                return false; // private browsing, storage disabled, etc.
            }
        }

        function setVisible(on) {
            // A class rather than an inline style, so it does not fight the
            // Subgroup Builder's data-subgroup-hide show/hide of style.display.
            panel.classList.toggle('rep-hidden', !on);
            if (on) render(true);
        }

        checkbox.checked = readInitialState();
        setVisible(checkbox.checked);

        checkbox.addEventListener('change', () => {
            setVisible(checkbox.checked);
            try {
                global.localStorage.setItem(storageKey, checkbox.checked ? '1' : '0');
            } catch (err) { /* storage unavailable: the toggle still works this session */ }
        });

        // ---- update loop ------------------------------------------------------
        function render(force) {
            if (!force && panel.classList.contains('rep-hidden')) return;
            const M = currentElement();
            const key = matKey(M, 4);
            if (!force && key === lastKey) return;
            lastKey = key;

            const { cells, factor } = formatMatrix(M);
            factorEl.textContent = factor || '';
            factorEl.classList.toggle('rep-hidden', !factor);
            matrixEl.innerHTML = cells.map(s => '<span>' + s + '</span>').join('');

            const deg = Math.round(rotationAngle(M));
            chiEl.textContent = formatTrace(matTrace(M));
            // Rotations have tr = 1 + 2cos(theta); improper elements -1 + 2cos(theta).
            asideEl.textContent = (isImproper(M) ? '= −1 + 2cos\u00a0' : '= 1 + 2cos\u00a0')
                + deg + '\u00b0'; // nbsp keeps "2cos 120\u00b0" together

            const i = index.get(matKey(M));
            classEl.textContent = i === undefined ? '—' : classes[assigned[i]].label;
        }

        (function loop() {
            render(false);
            global.requestAnimationFrame(loop);
        })();

        const handle = {
            render: () => render(true),
            elements,
            classes,
            setVisible: on => { checkbox.checked = on; setVisible(on); }
        };
        api.instances.push(handle);
        return handle;
    }

    const api = {
        attach,
        // Panels attached on this page, for debugging from the console.
        instances: [],
        // exported for testing
        _internal: {
            matMul, matTranspose, matTrace, matKey, identity,
            quatToMatrix, axisAngleToMatrix, rotationAngle,
            matDet, isImproper, reflectionToMatrix, matrix4ToMatrix, generatorMatrix,
            generateGroup, conjugacyClasses, labelClasses,
            formatMatrix, formatTrace, symbolFor
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.RepPanel = api;

})(typeof window !== 'undefined' ? window : globalThis);
