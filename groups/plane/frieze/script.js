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
let symmetryOverlayGroup = new THREE.Group();
let accumulatedTransform = new THREE.Matrix4();

const CONFIG = {
    bg: 0x0f172a,
    motifColor: 0x38bdf8,
    latticeColor: 0x475569,
    gridSize: 20,
    viewSize: 6
};

const T = (x, y) => new THREE.Matrix4().makeTranslation(x, y, 0);

const GROUPS = {
    p1: {
        v1: [1, 0], syms: [{ type: 'id', label: 'e' }],
        desc: "HOP: Translations only. (Orbifold: ∞∞)",
        tokens: [{ tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: '\\,\\rangle' }],
        genMap: { t: { type: 'trans' } },
        relSeqs: {}
    },
    p11g: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'glide', angle: 0, center: [0, 0], dist: 0.5, sx: 1, sy: -1, cx: 0, cy: 0, tx: 0.5, ty: 0, label: 'γ', gen: true }
        ],
        desc: "STEP: Glide reflections. (Orbifold: ∞x)",
        tokens: [{ tex: '\\langle\\,' }, { gen: 'gamma', tex: '\\gamma' }, { tex: '\\,\\rangle \\quad (\\gamma^2 = t)' }],
        genMap: { gamma: { type: 'sym', idx: 1 } },
        relSeqs: {}
    },
    p1m1: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], sx: -1, sy: 1, cx: 0, cy: 0, label: 'σᵥ', gen: true }
        ],
        desc: "SIDLE: Vertical reflections. (Orbifold: *∞∞)",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'sigma_v', tex: '\\sigma_v' }, { tex: '\\;\\mid\\;' },
            { rel: 'sv2', tex: '\\sigma_v^2' }, { tex: ',\\;' },
            { rel: 'conj_t', tex: '(\\sigma_v t)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'trans' }, sigma_v: { type: 'sym', idx: 1 } },
        relSeqs: {
            sv2: [{ gen: 'sigma_v' }, { gen: 'sigma_v' }],
            conj_t: [{ gen: 'sigma_v' }, { gen: 't' }, { gen: 'sigma_v' }, { gen: 't' }]
        }
    },
    p2: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂', gen: true }
        ],
        desc: "SPIN: 180° rotations. (Orbifold: 22∞)",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'C2', tex: 'C_2' }, { tex: '\\;\\mid\\;' },
            { rel: 'C2sq', tex: 'C_2^2' }, { tex: ',\\;' },
            { rel: 'conj_t', tex: '(C_2 t)^2' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'trans' }, C2: { type: 'sym', idx: 1 } },
        relSeqs: {
            C2sq: [{ gen: 'C2' }, { gen: 'C2' }],
            conj_t: [{ gen: 'C2' }, { gen: 't' }, { gen: 'C2' }, { gen: 't' }]
        }
    },
    p2mg: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], sx: -1, sy: 1, cx: 0, cy: 0, label: 'σᵥ', gen: true },
            { type: 'rot', angle: Math.PI, center: [0.25, 0], label: 'C₂' },
            { type: 'glide', angle: 0, center: [0, 0], dist: 0.5, sx: 1, sy: -1, cx: 0, cy: 0, tx: 0.5, ty: 0, label: 'γ' }
        ],
        desc: "SPINNING SIDLE: Rotations, glides, and vertical reflections. (Orbifold: 22*)",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 'sigma_v', tex: '\\sigma_v' }, { tex: ',\\,' },
            { gen: 'gamma', tex: '\\gamma' }, { tex: '\\;\\mid\\;' },
            { rel: 'sv2', tex: '\\sigma_v^2' }, { tex: ',\\;' },
            { rel: 'conj_gamma', tex: '(\\sigma_v\\gamma)^2' },
            { tex: '\\,\\rangle \\quad (\\gamma^2 = t)' }
        ],
        genMap: { sigma_v: { type: 'sym', idx: 1 }, gamma: { type: 'sym', idx: 3 } },
        relSeqs: {
            sv2: [{ gen: 'sigma_v' }, { gen: 'sigma_v' }],
            conj_gamma: [{ gen: 'sigma_v' }, { gen: 'gamma' }, { gen: 'sigma_v' }, { gen: 'gamma' }]
        }
    },
    p11m: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: 0, center: [0, 0], sx: 1, sy: -1, cx: 0, cy: 0, label: 'σₕ', gen: true }
        ],
        desc: "JUMP: Horizontal reflection. (Orbifold: ∞*)",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'sigma_h', tex: '\\sigma_h' }, { tex: '\\;\\mid\\;' },
            { rel: 'sh2', tex: '\\sigma_h^2' }, { tex: ',\\;' },
            { rel: 'comm', tex: '[t, \\sigma_h]' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'trans' }, sigma_h: { type: 'sym', idx: 1 } },
        relSeqs: {
            sh2: [{ gen: 'sigma_h' }, { gen: 'sigma_h' }],
            comm: [{ gen: 't' }, { gen: 'sigma_h' }, { gen: 't', inv: true }, { gen: 'sigma_h' }]
        }
    },
    p2mm: {
        v1: [1, 0],
        syms: [
            { type: 'id', label: 'e' },
            { type: 'refl', angle: Math.PI / 2, center: [0, 0], sx: -1, sy: 1, cx: 0, cy: 0, label: 'σᵥ', gen: true },
            { type: 'refl', angle: 0, center: [0, 0], sx: 1, sy: -1, cx: 0, cy: 0, label: 'σₕ', gen: true },
            { type: 'rot', angle: Math.PI, center: [0, 0], label: 'C₂' }
        ],
        desc: "SPINNING JUMP: Horizontal and vertical reflections. (Orbifold: *2222)",
        tokens: [
            { tex: '\\langle\\,' }, { gen: 't', tex: 't' }, { tex: ',\\,' },
            { gen: 'sigma_v', tex: '\\sigma_v' }, { tex: ',\\,' },
            { gen: 'sigma_h', tex: '\\sigma_h' }, { tex: '\\;\\mid\\;' },
            { rel: 'sv2', tex: '\\sigma_v^2' }, { tex: ',\\;' },
            { rel: 'sh2', tex: '\\sigma_h^2' }, { tex: ',\\;' },
            { rel: 'conj_t', tex: '(\\sigma_v t)^2' }, { tex: ',\\;' },
            { rel: 'comms', tex: 't\\sigma_h t^{-1}\\sigma_h' }, { tex: '\\,\\rangle' }
        ],
        genMap: { t: { type: 'trans' }, sigma_v: { type: 'sym', idx: 1 }, sigma_h: { type: 'sym', idx: 2 } },
        relSeqs: {
            sv2: [{ gen: 'sigma_v' }, { gen: 'sigma_v' }],
            sh2: [{ gen: 'sigma_h' }, { gen: 'sigma_h' }],
            conj_t: [{ gen: 'sigma_v' }, { gen: 't' }, { gen: 'sigma_v' }, { gen: 't' }],
            comms: [{ gen: 't' }, { gen: 'sigma_h' }, { gen: 't', inv: true }, { gen: 'sigma_h' }]
        }
    }
};

function getMatrixFromSym(sym) {
    const m = new THREE.Matrix4(); if (sym.type === 'id') return m;
    const cx = sym.cx !== undefined ? sym.cx : (sym.center ? sym.center[0] : 0);
    const cy = sym.cy !== undefined ? sym.cy : (sym.center ? sym.center[1] : 0);
    m.makeTranslation(cx, cy, 0);
    const internal = new THREE.Matrix4();
    if (sym.type === 'rot') internal.makeRotationZ(sym.angle);
    else if (sym.type === 'refl') internal.makeScale(sym.sx, sym.sy, 1);
    else if (sym.type === 'glide') {
        internal.makeScale(sym.sx, sym.sy, 1);
        internal.premultiply(new THREE.Matrix4().makeTranslation(sym.tx || 0, sym.ty || 0, 0));
    }
    m.multiply(internal); m.multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, 0));
    return m;
}

function invSym(sym) {
    if (!sym) return sym;
    if (sym.type === 'refl') return sym;
    if (sym.type === 'rot') return { ...sym, angle: -sym.angle };
    if (sym.type === 'glide') return { ...sym, tx: -(sym.tx || 0), ty: -(sym.ty || 0) };
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
    if (['p1m1', 'p11m', 'p2mm', 'p2mg'].includes(groupId)) return 'arrow';
    return 'hook'; // p11g
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
    } else {
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
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0.08, 0.08, 0); group.add(mesh);
    return group;
}

function createLineMotif(groupId) {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: CONFIG.motifColor, linewidth: 1, transparent: true, opacity: 0.9 });
    const h = 1; // frieze strip height
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
                -0.1 + 0.25 * Math.sin(t * Math.PI * 1.3),
                0
            ));
        }
        addCurve(pts);
        const sp = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const r = 0.06 * (1 - t * 0.7);
            sp.push(new THREE.Vector3(
                0.25 + r * Math.cos(t * Math.PI * 1.8),
                -0.1 + 0.25 + r * Math.sin(t * Math.PI * 1.8),
                0
            ));
        }
        addCurve(sp);
    } else if (motifType === 'arrow') {
        // Vine with leaves
        const vine = [];
        for (let i = 0; i <= 50; i++) {
            const t = i / 50;
            vine.push(new THREE.Vector3(
                0.02 + t * 0.42,
                -0.15 + 0.2 * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(vine);
        const leaf1 = [];
        for (let i = 0; i <= 15; i++) {
            const t = i / 15;
            leaf1.push(new THREE.Vector3(
                0.18 + 0.08 * t,
                -0.15 + 0.2 * Math.sin(0.35 * Math.PI) + 0.1 * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(leaf1);
        const leaf2 = [];
        for (let i = 0; i <= 12; i++) {
            const t = i / 12;
            leaf2.push(new THREE.Vector3(
                0.12 + 0.06 * t,
                -0.15 + 0.2 * Math.sin(0.2 * Math.PI) - 0.06 * Math.sin(t * Math.PI),
                0
            ));
        }
        addCurve(leaf2);
    } else {
        // Zigzag with hook
        addCurve([
            new THREE.Vector3(0.02, -0.15, 0),
            new THREE.Vector3(0.15, 0.15, 0),
            new THREE.Vector3(0.28, -0.15, 0),
            new THREE.Vector3(0.42, 0.1, 0)
        ]);
        const hook = [];
        for (let i = 0; i <= 15; i++) {
            const t = i / 15;
            hook.push(new THREE.Vector3(
                0.15 + 0.05 * Math.cos(t * Math.PI * 1.3),
                0.15 + 0.04 * Math.sin(t * Math.PI * 1.3),
                0
            ));
        }
        addCurve(hook);
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
    scene.add(tilingGroup); scene.add(latticeGroup); scene.add(symmetryOverlayGroup);
    setupUI(); updateTiling(document.getElementById('group-select').value);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('show-symmetries').addEventListener('change', updateSymmetryOverlay);
    animate();
}

let isAnimatingSymmetries = false;

function updateTiling(groupId) {
    if (isAnimatingSymmetries) return;
    tilingGroup.clear(); latticeGroup.clear();
    const groupDef = GROUPS[groupId]; if (!groupDef) return;
    document.getElementById('group-name').textContent = groupId;
    document.getElementById('group-desc').textContent = groupDef.desc;
    const presEl = document.getElementById('group-pres');
    presEl.innerHTML = renderPresentation(groupDef);
    updateSymmetryButtons(groupId);
    updateSymmetryOverlay();
    const v1 = new THREE.Vector3(groupDef.v1[0], groupDef.v1[1], 0);
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
        const origin = v1.clone().multiplyScalar(i);
        groupDef.syms.forEach((sym, symIdx) => {
            const symMat = getMatrixFromSym(sym);
            let inCentralCell = false;
            if (highlightCentral) {
                const basePoint = new THREE.Vector3(0.05, 0, 0); // Pick a point inside the base motif
                const mappedPoint = basePoint.applyMatrix4(symMat).add(origin);
                // Check if the center falls inside the [0, 1) unit cell
                inCentralCell = (mappedPoint.x >= -0.001 && mappedPoint.x < 0.999);
            }
            const currentMotif = inCentralCell ? centralMotifs[symIdx] : motif;
            const mInstance = currentMotif.clone();
            mInstance.applyMatrix4(symMat);
            mInstance.position.add(origin);
            tilingGroup.add(mInstance);
        });
        if (showLattice) {
            const points = [origin.clone(), origin.clone().add(v1), origin.clone().add(v1).add(new THREE.Vector3(0, 1, 0)), origin.clone().add(new THREE.Vector3(0, 1, 0)), origin.clone()];
            points.forEach(p => p.y -= 0.5);
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const isMain = (i === 0);
            const lineMat = new THREE.LineBasicMaterial({ color: isMain ? 0xffffff : CONFIG.latticeColor, transparent: !isMain, opacity: isMain ? 1 : 0.2 });
            latticeGroup.add(new THREE.Line(lineGeo, lineMat));
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
        if (type === 'id') return '129,140,248';   // indigo - translations
        if (type === 'rot') return '244,114,182';   // pink - rotations
        if (type === 'refl') return '251,191,36';   // amber - reflections
        if (type === 'glide') return '52,211,153';   // emerald - glides
        return '255,255,255';
    };
    const styleBtn = (btn, type) => {
        const c = symColor(type);
        btn.style.borderLeft = `3px solid rgba(${c},0.8)`;
        btn.style.backgroundColor = `rgba(${c},0.15)`;
    };
    // Translation button
    const t1Sym = { type: 'id', pre: T(groupDef.v1[0], groupDef.v1[1]), label: 't₁' };
    const tBtn = document.createElement('button');
    tBtn.className = 'btn'; tBtn.textContent = 't₁';
    styleBtn(tBtn, 'id');
    tBtn.addEventListener('click', () => animateGlobalSymmetry(groupId, null, t1Sym));
    container.appendChild(tBtn);
    // Symmetry buttons
    groupDef.syms.forEach((sym, index) => {
        if (sym.type === 'id') return;
        const btn = document.createElement('button');
        btn.className = 'btn'; btn.textContent = sym.label || sym.type;
        styleBtn(btn, sym.type);
        btn.addEventListener('click', () => animateGlobalSymmetry(groupId, index));
        container.appendChild(btn);
    });
}

function createSymIndicator(sym, shift) {
    const group = new THREE.Group();
    const cx = sym.cx !== undefined ? sym.cx : (sym.center ? sym.center[0] : 0);
    const cy = sym.cy !== undefined ? sym.cy : (sym.center ? sym.center[1] : 0);
    if (sym.type === 'rot') {
        let dotX = cx, dotY = cy;
        if (shift && (shift.x !== 0 || shift.y !== 0)) {
            const cosA = Math.cos(sym.angle), sinA = Math.sin(sym.angle);
            const a = 1 - cosA, b = sinA;
            const det = a * a + b * b;
            if (det > 1e-10) {
                dotX = cx + (a * shift.x - b * shift.y) / det;
                dotY = cy + (b * shift.x + a * shift.y) / det;
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
    } else if (sym.type === 'refl') {
        const ang = sym.angle !== undefined ? sym.angle : (sym.sy === -1 ? 0 : Math.PI / 2);
        // Adjust center to visual axis position: cx + shift/2 projected perpendicular to axis
        const vcx = cx + (shift ? shift.x / 2 : 0);
        const vcy = cy + (shift ? shift.y / 2 : 0);
        const len = CONFIG.viewSize * 2;
        const dx = Math.cos(ang) * len;
        const dy = Math.sin(ang) * len;
        const points = [new THREE.Vector3(vcx - dx, vcy - dy, 0.1), new THREE.Vector3(vcx + dx, vcy + dy, 0.1)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 2, transparent: true, opacity: 0.8 });
        group.add(new THREE.Line(lineGeo, lineMat));
    } else if (sym.type === 'glide') {
        const ang = sym.angle !== undefined ? sym.angle : 0;
        // Adjust center to visual axis position
        const vcx = cx + (shift ? shift.x / 2 : 0);
        const vcy = cy + (shift ? shift.y / 2 : 0);
        const len = CONFIG.viewSize * 2;
        const dx = Math.cos(ang) * len;
        const dy = Math.sin(ang) * len;
        const points = [new THREE.Vector3(vcx - dx, vcy - dy, 0.1), new THREE.Vector3(vcx + dx, vcy + dy, 0.1)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x34d399, linewidth: 2, transparent: true, opacity: 0.8 });
        group.add(new THREE.Line(lineGeo, lineMat));
        // Arrow direction from net displacement
        const mappedOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(getMatrixFromSym(sym));
        const netX = mappedOrigin.x + (shift ? shift.x : 0);
        const netY = mappedOrigin.y + (shift ? shift.y : 0);
        const dot = netX * Math.cos(ang) + netY * Math.sin(ang);
        const sign = dot >= 0 ? 1 : -1;
        const dirX = sign * Math.cos(ang);
        const dirY = sign * Math.sin(ang);
        const perpX = -dirY;
        const perpY = dirX;
        const arrowLen = 0.15;
        const tipX = vcx + dirX * arrowLen * 0.7;
        const tipY = vcy + dirY * arrowLen * 0.7;
        const arrowPoints = [
            new THREE.Vector3(vcx - dirX * arrowLen * 0.7 + perpX * arrowLen * 0.4, vcy - dirY * arrowLen * 0.7 + perpY * arrowLen * 0.4, 0.1),
            new THREE.Vector3(tipX, tipY, 0.1),
            new THREE.Vector3(vcx - dirX * arrowLen * 0.7 - perpX * arrowLen * 0.4, vcy - dirY * arrowLen * 0.7 - perpY * arrowLen * 0.4, 0.1)
        ];
        const arrowGeo = new THREE.BufferGeometry().setFromPoints(arrowPoints);
        group.add(new THREE.Line(arrowGeo, new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.8 })));
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

    const symsToAnimate = customSym ? [customSym] : (specificSymIndex !== null) ? [groupDef.syms[specificSymIndex]] : groupDef.syms.filter(s => s.type !== 'id');

    for (const sym of symsToAnimate) {
        const symMatrix = getMatrixFromSym(sym);
        const v = new THREE.Vector3(0, 0, 0).applyMatrix4(symMatrix);
        // const offset_x = v1.x !== 0 ? -Math.round(v.x / v1.x - 0.001) * v1.x : 0;
        // const offset_y = -v.y;
        // const shift = new THREE.Vector2(offset_x, offset_y);
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
                const cx = sym.cx !== undefined ? sym.cx : (sym.center ? sym.center[0] : 0);
                const cy = sym.cy !== undefined ? sym.cy : (sym.center ? sym.center[1] : 0);
                let currentMatrix = new THREE.Matrix4();
                if (sym.type === 'id') {
                    if (sym.pre) {
                        const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scl = new THREE.Vector3();
                        sym.pre.decompose(pos, quat, scl);
                        currentMatrix.compose(pos.multiplyScalar(ease), new THREE.Quaternion().slerp(quat, ease), new THREE.Vector3(1, 1, 1).lerp(scl, ease));
                    }
                } else if (sym.type === 'rot') {
                    // Compute visual center: fixed point of T(shift)*R(θ,c)
                    let vcx = cx, vcy = cy;
                    const cosA = Math.cos(sym.angle), sinA = Math.sin(sym.angle);
                    const a = 1 - cosA, b = sinA;
                    const detR = a * a + b * b;
                    if (detR > 1e-10) {
                        vcx = cx + (a * shift.x - b * shift.y) / detR;
                        vcy = cy + (b * shift.x + a * shift.y) / detR;
                    }
                    currentMatrix.copy(T(vcx, vcy).multiply(new THREE.Matrix4().makeRotationZ(sym.angle * ease)).multiply(T(-vcx, -vcy)));
                } else if (sym.type === 'refl') {
                    const sY = 1 + (sym.sy - 1) * ease;
                    const sX = 1 + (sym.sx - 1) * ease;
                    currentMatrix.copy(T(cx, cy).multiply(new THREE.Matrix4().makeScale(sX, sY, 1)).multiply(T(-cx, -cy)));
                } else if (sym.type === 'glide') {
                    const sY = 1 + (sym.sy - 1) * ease;
                    const sX = 1 + (sym.sx - 1) * ease;
                    const glideMat = new THREE.Matrix4().makeScale(sX, sY, 1);
                    glideMat.premultiply(new THREE.Matrix4().makeTranslation((sym.tx || 0) * ease, (sym.ty || 0) * ease, 0));
                    currentMatrix.copy(T(cx, cy).multiply(glideMat).multiply(T(-cx, -cy)));
                }
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
            const v = groupDef.v1;
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
            else if (spec.type === 'trans') animateGlobalSymmetry(groupId, null, { type: 'id', pre: T(groupDef.v1[0], groupDef.v1[1]) });
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

function updateSymmetryOverlay() {
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
