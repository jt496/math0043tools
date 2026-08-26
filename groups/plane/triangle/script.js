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

/*
 Triangle Group Explorer Δ(l,m,n)
 Author: John Talbot (assisted by Antigravity, Claude, Geminini)
*/

let scene, camera, renderer, controls;
const tilingGroup = new THREE.Group();
const fundamentalGroup = new THREE.Group();
const highlightGroup = new THREE.Group();
let rp2Mode = false; // Kept for logic simplicity but toggle removed
let activeGenerator = null;
let activeRelation = null;
let generatorVerts = null; // { v1, v2, v3, type } for the current tiling
let relAnimState = { active: false, reqId: null, intervalId: null, isDeformed: false, meshes: [], meshData: [], gens: [], type: '', step: 0, stepsRemaining: 0, phase: '', animStart: 0, duration: 600, pause: 100, flowCurveMesh: null, flowDotMesh: null };
let isUpdatingTiling = false;
let lastTranslationSequence = null;
let animationSpeedMultiplier = 1.0;

// Animation State
let animationState = {
    active: false,
    speed: 5000,
    currentCount: 0,
    totalTriangles: 0,
    meshes: [],
    redrawTimeout: null
};

const CONFIG = {
    bg: 0x0f172a,
    triangleColor1: 0x0000ff,
    triangleColor2: 0xf43f5e,
    sphereColor: 0x1e293b,
    MAX_TRIANGLES: 200000
};

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bg);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, 0, 3);

    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Robust lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(5, 5, 10);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-5, -5, -10);
    scene.add(dirLight2);

    scene.add(tilingGroup);
    scene.add(fundamentalGroup);
    scene.add(highlightGroup);

    setupEventListeners();
    updateTiling();
    animate();
}

function setupEventListeners() {
    const redrawBtn = document.getElementById('redraw');
    ['l-val', 'm-val', 'n-val'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            redrawBtn.textContent = 'Update';
            redrawBtn.classList.add('pending');
        });
    });

    document.getElementById('animate-translation').addEventListener('click', () => {
        if (relAnimState.active) return;
        clearHighlights(true);
        activeRelation = null;
        updateRelLinkStyles();
        let seq;
        if (lastTranslationSequence) {
            // Use the inverse of the last sequence
            seq = [...lastTranslationSequence].reverse();
            lastTranslationSequence = null; // Next click will be a new random flow
        } else {
            // Generate a new random flow
            seq = findFlowAnimationWord(generatorVerts.type);
            lastTranslationSequence = seq;
        }
        const valEl = document.getElementById('translation-sequence');
        valEl.innerHTML = seq.join(' ');
        playMobiusFlow(seq);
    });
    document.getElementById('presentation-val').addEventListener('click', (e) => {
        if (relAnimState.active) return;
        const link = e.target.closest('[data-gen], [data-rel]');
        if (!link) return;
        const gen = link.dataset.gen;
        const rel = link.dataset.rel;
        if (gen) {
            clearHighlights();
            activeRelation = null;
            if (activeGenerator === gen) {
                activeGenerator = null;
            } else {
                activeGenerator = gen;
                drawGeneratorAxis(gen);
            }
        } else if (rel) {
            if (relAnimState.active && activeRelation !== rel) return;
            if (activeRelation === rel) {
                clearHighlights(); // Redraw since we toggle off
                activeRelation = null;
                activeGenerator = null;
            } else {
                clearHighlights(true); // Don't redraw since we are transitioning to a new animation
                activeGenerator = null;
                activeRelation = rel;
                startRelationAnimation(rel);
            }
        }
        updateGenLinkStyles();
        updateRelLinkStyles();
    });
    redrawBtn.addEventListener('click', () => {
        updateInfo();
        updateTiling();
        redrawBtn.textContent = 'Redraw';
        redrawBtn.classList.remove('pending');
    });
    document.getElementById('reset-camera').addEventListener('click', () => {
        controls.reset();
        camera.position.set(0, 0, 3);
    });
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            speedVal.textContent = speed.toFixed(1);
            animationSpeedMultiplier = speed;

            const baseDuration = 600;
            const newDuration = baseDuration / speed;
            relAnimState.duration = newDuration;
            relAnimState.pause = Math.floor(newDuration / 6);
        });
    }
}

function updateInfo() {
    const l = parseInt(document.getElementById('l-val').value) || 2;
    const m = parseInt(document.getElementById('m-val').value) || 2;
    const n = parseInt(document.getElementById('n-val').value) || 2;

    const k = 1 / l + 1 / m + 1 / n - 1;
    let geometry = "Euclidean";
    if (k > 0.0001) geometry = "Spherical";
    else if (k < -0.0001) geometry = "Hyperbolic";

    document.getElementById('geometry-type').textContent = geometry;
    document.getElementById('curvature-val').textContent = k.toFixed(4);
    const kr = (s) => katex.renderToString(s, { throwOnError: false });
    document.getElementById('presentation-val').innerHTML =
        kr('\\langle\\,') +
        `<span class="gen-link" data-gen="a">${kr('a')}</span>` +
        kr(',\\;') +
        `<span class="gen-link" data-gen="b">${kr('b')}</span>` +
        kr(',\\;') +
        `<span class="gen-link" data-gen="c">${kr('c')}</span>` +
        kr('\\;\\mid\\;') +
        `<span class="rel-link" data-rel="a2">${kr('a^2')}</span>` +
        kr(',\\;') +
        `<span class="rel-link" data-rel="b2">${kr('b^2')}</span>` +
        kr(',\\;') +
        `<span class="rel-link" data-rel="c2">${kr('c^2')}</span><br>` +
        `<span class="rel-link" data-rel="ab">${kr(`(ab)^{${l}}`)}</span>` +
        kr(',\\;') +
        `<span class="rel-link" data-rel="bc">${kr(`(bc)^{${m}}`)}</span>` +
        kr(',\\;') +
        `<span class="rel-link" data-rel="ca">${kr(`(ca)^{${n}}`)}</span>` +
        kr('\\,\\rangle');
    updateGenLinkStyles();
    updateRelLinkStyles();
    return { l, m, n, geometry, k };
}

function updateTiling() {
    isUpdatingTiling = true;
    const { l, m, n, geometry } = updateInfo();

    // Stop any running relation animation and dispose all highlight GPU resources
    clearHighlights();
    relAnimState.isDeformed = false;
    // Dispose tiling resources
    [...tilingGroup.children, ...fundamentalGroup.children].forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    });
    tilingGroup.clear();
    fundamentalGroup.clear();
    animationState.active = false;
    animationState.currentCount = 0;
    animationState.meshes = [];
    lastTranslationSequence = null;
    const seqEl = document.getElementById('translation-sequence');
    if (seqEl) seqEl.innerHTML = '';

    if (controls) {
        controls.reset();
        const dist = geometry === "Euclidean" ? 5 : 3;
        camera.position.set(0, 0, dist);
    }

    // Show overlay, then defer the heavy computation so the browser paints first
    const overlay = document.getElementById('tiling-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        generateTiling(l, m, n, geometry);
        overlay.classList.add('hidden');
        isUpdatingTiling = false;
    }, 30);
}

function getTriangleCenter(v1, v2, v3) {
    return new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);
}

function getTriangleKey(v1, v2, v3, type) {
    const center = getTriangleCenter(v1, v2, v3);
    const prec = (type === "Hyperbolic") ? 10 : 6;
    const s = Math.pow(10, prec);
    return Math.round(center.x * s) + "," + Math.round(center.y * s) + "," + Math.round(center.z * s);
}

function generateTiling(l, m, n, type) {
    const alpha = Math.PI / l, beta = Math.PI / m, gamma = Math.PI / n;
    let v1, v2, v3;

    // Deep recursion to ensure space-filling coverage
    const maxDepth = 200;

    if (type === "Spherical") {
        const cosC = (Math.cos(gamma) + Math.cos(alpha) * Math.cos(beta)) / (Math.sin(alpha) * Math.sin(beta));
        const dC = Math.acos(Math.max(-1, Math.min(1, cosC)));
        const cosB = (Math.cos(beta) + Math.cos(alpha) * Math.cos(gamma)) / (Math.sin(alpha) * Math.sin(gamma));
        const dB = Math.acos(Math.max(-1, Math.min(1, cosB)));
        v1 = new THREE.Vector3(0, 0, 1);
        v2 = new THREE.Vector3(Math.sin(dC), 0, Math.cos(dC));
        v3 = new THREE.Vector3(Math.sin(dB) * Math.cos(alpha), Math.sin(dB) * Math.sin(alpha), Math.cos(dB));

        // Background sphere (full mode only)
        tilingGroup.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 64, 32),
            new THREE.MeshPhongMaterial({ color: CONFIG.sphereColor, transparent: true, opacity: 0.9 })
        ));


    } else if (type === "Euclidean") {
        const sB = Math.sin(beta) / Math.sin(gamma);
        v1 = new THREE.Vector3(0, 0, 0); v2 = new THREE.Vector3(1, 0, 0); v3 = new THREE.Vector3(sB * Math.cos(alpha), sB * Math.sin(alpha), 0);
    } else {
        const coshC = (Math.cos(gamma) + Math.cos(alpha) * Math.cos(beta)) / (Math.sin(alpha) * Math.sin(beta));
        const coshB = (Math.cos(beta) + Math.cos(alpha) * Math.cos(gamma)) / (Math.sin(alpha) * Math.sin(gamma));
        const rB = Math.tanh(Math.acosh(coshC) / 2), rC = Math.tanh(Math.acosh(coshB) / 2);
        v1 = new THREE.Vector3(0, 0, 0); v2 = new THREE.Vector3(rB, 0, 0); v3 = new THREE.Vector3(rC * Math.cos(alpha), rC * Math.sin(alpha), 0);
        tilingGroup.add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.005, 16, 128), new THREE.MeshBasicMaterial({ color: 0x475569 })));
    }

    generatorVerts = { v1: v1.clone(), v2: v2.clone(), v3: v3.clone(), type };

    // Create the fundamental triangle as a permanent black mesh
    const fundBuf = [];
    addTriangleToBuffer(v1, v2, v3, fundBuf, type);
    const fundGeo = new THREE.BufferGeometry();
    fundGeo.setAttribute('position', new THREE.Float32BufferAttribute(fundBuf, 3));
    fundGeo.computeVertexNormals();
    const fundMesh = new THREE.Mesh(fundGeo, new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide
    }));
    tilingGroup.add(fundMesh);
    animationState.meshes.push(fundMesh);

    // RP² mode clips the sphere at the equator using the GPU — clean edge on straddling triangles
    // renderer.clippingPlanes logic removed as RP2 mode is disabled
    renderer.clippingPlanes = [];

    const visited = new Set();
    const queue = [{ v: [v1.clone(), v2.clone(), v3.clone()], d: 0, even: true }];
    const trisEven = [], trisOdd = [];
    let head = 0;
    let renderedCount = 0;
    visited.add(getTriangleKey(v1, v2, v3, type));

    while (head < queue.length && head < CONFIG.MAX_TRIANGLES) {
        const curr = queue[head++];
        const [p1, p2, p3] = curr.v;

        // Render all triangles (RP2 skipping logic removed)
        const targetArr = curr.even ? trisEven : trisOdd;
        if (head > 1) {
            addTriangleToBuffer(p1, p2, p3, targetArr, type);
            renderedCount++;
        }

        if (curr.d < maxDepth) {
            const sides = [[p1, p2, p3], [p2, p3, p1], [p3, p1, p2]];
            for (let i = 0; i < 3; i++) {
                const [a, b, c] = sides[i];
                const reflectedC = reflectAcrossGeodesic(a, b, c, type);
                const nextV = [a.clone(), b.clone(), reflectedC];
                const key = getTriangleKey(nextV[0], nextV[1], nextV[2], type);
                if (!visited.has(key)) {
                    visited.add(key);
                    // For hyperbolic: skip sub-pixel triangles — mark visited but don't queue
                    if (type === "Hyperbolic") {
                        const ax = nextV[1].x - nextV[0].x, ay = nextV[1].y - nextV[0].y;
                        const bx = nextV[2].x - nextV[0].x, by = nextV[2].y - nextV[0].y;
                        if (Math.abs(ax * by - ay * bx) < 1e-9) continue;
                    }
                    queue.push({ v: nextV, d: curr.d + 1, even: !curr.even });
                }
            }
        }
    }

    animationState.totalTriangles = Math.max(1, renderedCount);
    if (trisEven.length > 0) animationState.meshes.push(createAnimatedMesh(trisEven, CONFIG.triangleColor1));
    if (trisOdd.length > 0) animationState.meshes.push(createAnimatedMesh(trisOdd, CONFIG.triangleColor2));

    animationState.meshes.forEach(m => tilingGroup.add(m));
    animationState.active = true;
    if (activeGenerator) drawGeneratorAxis(activeGenerator);
}

function reflectAcrossGeodesic(p1, p2, p_out, type) {
    if (type === "Euclidean") {
        const n = new THREE.Vector3(-(p2.y - p1.y), p2.x - p1.x, 0).normalize();
        const dist = p_out.x * n.x + p_out.y * n.y - (n.x * p1.x + n.y * p1.y);
        return new THREE.Vector3(p_out.x - 2 * dist * n.x, p_out.y - 2 * dist * n.y, 0);
    } else if (type === "Spherical") {
        const n = new THREE.Vector3().crossVectors(p1, p2).normalize();
        return p_out.clone().sub(n.clone().multiplyScalar(2 * p_out.dot(n))).normalize();
    } else {
        const A1 = 2 * p1.x, B1 = 2 * p1.y, C1 = p1.x * p1.x + p1.y * p1.y + 1;
        const A2 = 2 * p2.x, B2 = 2 * p2.y, C2 = p2.x * p2.x + p2.y * p2.y + 1;
        const det = A1 * B2 - A2 * B1;
        if (Math.abs(det) < 1e-12) {
            const n = new THREE.Vector3(-(p2.y - p1.y), p2.x - p1.x, 0).normalize();
            const dist = p_out.x * n.x + p_out.y * n.y;
            return new THREE.Vector3(p_out.x - 2 * dist * n.x, p_out.y - 2 * dist * n.y, 0);
        }
        const h = (C1 * B2 - C2 * B1) / det, k = (A1 * C2 - A2 * C1) / det;
        const rSq = Math.max(0, h * h + k * k - 1);
        const dx = p_out.x - h, dy = p_out.y - k;
        const factor = rSq / Math.max(dx * dx + dy * dy, 1e-15);
        return new THREE.Vector3(h + dx * factor, k + dy * factor, 0);
    }
}

// Interpolate along the hyperbolic geodesic (Poincaré disk) from p1 to p2 at fraction t.
// The geodesic is the arc of a circle orthogonal to the unit circle through p1 and p2,
// or a diameter when the geodesic passes through the origin.
function hypGeodesicLerp(p1, p2, t) {
    if (t <= 0) return p1.clone();
    if (t >= 1) return p2.clone();
    const A1 = 2 * p1.x, B1 = 2 * p1.y, C1 = p1.x * p1.x + p1.y * p1.y + 1;
    const A2 = 2 * p2.x, B2 = 2 * p2.y, C2 = p2.x * p2.x + p2.y * p2.y + 1;
    const det = A1 * B2 - A2 * B1;
    if (Math.abs(det) < 1e-10) {
        // Geodesic is a diameter through the origin — straight line suffices
        return new THREE.Vector3(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y), 0);
    }
    const h = (C1 * B2 - C2 * B1) / det;
    const k = (A1 * C2 - A2 * C1) / det;
    const r = Math.sqrt(Math.max(0, h * h + k * k - 1));
    const theta1 = Math.atan2(p1.y - k, p1.x - h);
    const theta2 = Math.atan2(p2.y - k, p2.x - h);
    let dTheta = theta2 - theta1;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const theta = theta1 + t * dTheta;
    return new THREE.Vector3(h + r * Math.cos(theta), k + r * Math.sin(theta), 0);
}

function drawFundamentalTriangle(v1, v2, v3, type) {
    const buf = [];
    addTriangleToBuffer(v1, v2, v3, buf, type);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf, 3));
    geo.computeVertexNormals();
    fundamentalGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
    })));
}

function addTriangleToBuffer(v1, v2, v3, buffer, type) {
    let segs;
    if (type === "Spherical") {
        segs = 16;
    } else if (type === "Hyperbolic") {
        // Fewer segments for smaller triangles — they're near the boundary and tiny on screen
        const ax = v2.x - v1.x, ay = v2.y - v1.y;
        const bx = v3.x - v1.x, by = v3.y - v1.y;
        const area = Math.abs(ax * by - ay * bx) * 0.5;
        segs = area > 0.01 ? 10 : area > 0.001 ? 8 : area > 0.0002 ? 6 : area > 0.00003 ? 4 : 2;
    } else {
        segs = 3;
    }
    const getP = (u, v) => {
        if (type === "Hyperbolic") {
            // Geodesic barycentric interpolation:
            // 1. Find the point p12 on the v1–v2 geodesic at fraction v/(u+v)
            // 2. Move from p12 toward v3 along that geodesic by fraction w = 1-u-v
            // This guarantees all three edges follow hyperbolic geodesics.
            const w = 1 - u - v;
            const uv = u + v;
            if (uv < 1e-10) return v3.clone();
            return hypGeodesicLerp(hypGeodesicLerp(v1, v2, v / uv), v3, w);
        }
        const p = new THREE.Vector3().addScaledVector(v1, u).addScaledVector(v2, v).addScaledVector(v3, 1 - u - v);
        return type === "Spherical" ? p.normalize() : p;
    };
    for (let i = 0; i < segs; i++) {
        for (let j = 0; j < segs - i; j++) {
            const a = getP(i / segs, j / segs), b = getP((i + 1) / segs, j / segs), c = getP(i / segs, (j + 1) / segs);
            buffer.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
            if (j < segs - i - 1) {
                const d = getP((i + 1) / segs, (j + 1) / segs);
                buffer.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
            }
        }
    }
}

function updateGenLinkStyles() {
    document.querySelectorAll('.gen-link').forEach(el => {
        el.classList.toggle('active', el.dataset.gen === activeGenerator);
    });
}

function updateRelLinkStyles() {
    document.querySelectorAll('.rel-link').forEach(el => {
        el.classList.toggle('active', el.dataset.rel === activeRelation);
    });
}

// Create a thick line/tube mesh along an array of THREE.Vector3 points.
function makeThickLine(pts, radius, color) {
    if (pts.length < 2) return null;
    const curvePts = pts.length === 2
        ? [pts[0], pts[0].clone().lerp(pts[1], 0.5), pts[1]]
        : pts;
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0);
    const geo = new THREE.TubeGeometry(curve, Math.max(curvePts.length * 2, 16), radius, 8, false);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}

// Apply one reflection generator to a labelled triangle [p1,p2,p3]:
//   a: reflect p2 across side p1–p3
//   b: reflect p3 across side p1–p2
//   c: reflect p1 across side p2–p3
function applyGenerator(gen, tri, type) {
    const [p1, p2, p3] = tri;
    if (gen === 'a') return [p1.clone(), reflectAcrossGeodesic(p1, p3, p2, type), p3.clone()];
    if (gen === 'b') return [p1.clone(), p2.clone(), reflectAcrossGeodesic(p1, p2, p3, type)];
    return [reflectAcrossGeodesic(p2, p3, p1, type), p2.clone(), p3.clone()]; // 'c'
}

function clearRelationAnimation(preventRedraw = false) {
    if (relAnimState.reqId) { cancelAnimationFrame(relAnimState.reqId); relAnimState.reqId = null; }
    if (relAnimState.intervalId) { clearInterval(relAnimState.intervalId); relAnimState.intervalId = null; }
    relAnimState.active = false;

    if (relAnimState.isDeformed) {
        if (!preventRedraw) {
            // relAnimState.isDeformed = false; // Removed auto-redraw trigger
        }
    }
    if (relAnimState.flowCurveMesh) {
        highlightGroup.remove(relAnimState.flowCurveMesh);
        relAnimState.flowCurveMesh.geometry.dispose();
        relAnimState.flowCurveMesh.material.dispose();
        relAnimState.flowCurveMesh = null;
    }
    if (relAnimState.flowDotMesh) {
        highlightGroup.remove(relAnimState.flowDotMesh);
        relAnimState.flowDotMesh.geometry.dispose();
        relAnimState.flowDotMesh.material.dispose();
        relAnimState.flowDotMesh = null;
    }
}

function clearHighlights(preventRedraw = false) {
    clearRelationAnimation(preventRedraw);
    [...highlightGroup.children].forEach(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    highlightGroup.clear();
}

function applyGeneratorToVertex(gen, v, type) {
    if (!generatorVerts) return v.clone();
    const { v1, v2, v3 } = generatorVerts;
    if (gen === 'a') return reflectAcrossGeodesic(v1, v3, v, type);
    if (gen === 'b') return reflectAcrossGeodesic(v1, v2, v, type);
    return reflectAcrossGeodesic(v2, v3, v, type);
}

// Central function to animate any sequence of generators (relations or random walks)
function playSequence(gensArray) {
    if (!generatorVerts) return;
    const { type } = generatorVerts;

    if (animationState.active) {
        animationState.active = false;
        animationState.currentCount = animationState.totalTriangles;
        animationState.meshes.forEach(mesh => {
            const totalVerts = mesh.geometry.attributes.position.count;
            mesh.geometry.setDrawRange(0, totalVerts);
        });
    }

    relAnimState.meshes = animationState.meshes;
    relAnimState.gens = gensArray;
    relAnimState.type = type;
    relAnimState.step = 0;
    relAnimState.stepsRemaining = gensArray.length;
    relAnimState.active = true;
    relAnimState.isDeformed = true;

    prepareNextRelStep();
    relAnimState.reqId = requestAnimationFrame(animateRelStep);
}

function startRelationAnimation(rel) {
    if (!generatorVerts) return;
    const l = parseInt(document.getElementById('l-val').value) || 2;
    const m = parseInt(document.getElementById('m-val').value) || 2;
    const n = parseInt(document.getElementById('n-val').value) || 2;
    const relInfo = {
        ab: { gens: ['a', 'b'], order: l },
        bc: { gens: ['b', 'c'], order: m },
        ca: { gens: ['c', 'a'], order: n },
        a2: { gens: ['a'], order: 1 },
        b2: { gens: ['b'], order: 1 },
        c2: { gens: ['c'], order: 1 }
    };
    const { gens, order } = relInfo[rel];

    let seq = [];
    const totalSteps = 2 * order;
    for (let i = 0; i < totalSteps; i++) {
        seq.push(gens[i % gens.length]);
    }

    playSequence(seq);
}

function prepareNextRelStep() {
    const gen = relAnimState.gens[relAnimState.step % relAnimState.gens.length];

    // Highlight the generator axis
    drawGeneratorAxis(gen, false);

    relAnimState.meshData = relAnimState.meshes.map(mesh => {
        const positions = mesh.geometry.attributes.position.array;
        const count = positions.length / 3;
        const start = new Float32Array(positions);
        const end = new Float32Array(positions.length);
        const mid = new Float32Array(positions.length);
        const dirs = new Float32Array(positions.length);
        const lift = new Float32Array(positions.length);

        for (let i = 0; i < count; i++) {
            const o = i * 3;
            const v = new THREE.Vector3(positions[o], positions[o + 1], positions[o + 2]);
            const vTarget = applyGeneratorToVertex(gen, v, relAnimState.type);

            start[o] = v.x; start[o + 1] = v.y; start[o + 2] = v.z;
            end[o] = vTarget.x; end[o + 1] = vTarget.y; end[o + 2] = vTarget.z;

            const m = new THREE.Vector3().addVectors(v, vTarget).multiplyScalar(0.5);
            mid[o] = m.x; mid[o + 1] = m.y; mid[o + 2] = m.z;

            const dir = new THREE.Vector3().subVectors(v, m);
            dirs[o] = dir.x; dirs[o + 1] = dir.y; dirs[o + 2] = dir.z;

            // Define standard 3D flip directions to simulate physical page turns
            let lDir = new THREE.Vector3(0, 0, 1);
            if (relAnimState.type === 'Spherical') {
                if (m.lengthSq() > 1e-6) lDir.copy(m).normalize();
            }
            lift[o] = lDir.x; lift[o + 1] = lDir.y; lift[o + 2] = lDir.z;
        }
        return { start, end, mid, dirs, lift, mesh };
    });

    relAnimState.animStart = performance.now();
    relAnimState.phase = 'flip';
}

function animateRelStep(time) {
    if (!relAnimState.active) return;

    const elapsed = time - relAnimState.animStart;

    if (relAnimState.phase === 'flip') {
        let t = elapsed / relAnimState.duration;
        if (t >= 1) t = 1;

        // Ease in and out
        const easeT = (t < 0.5) ? (2 * t * t) : (-1 + (4 - 2 * t) * t);
        const theta = easeT * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        relAnimState.meshData.forEach(({ mid, dirs, lift, mesh, end }) => {
            const pos = mesh.geometry.attributes.position.array;
            const count = pos.length / 3;
            for (let i = 0; i < count; i++) {
                const o = i * 3;
                if (t === 1) {
                    pos[o] = end[o];
                    pos[o + 1] = end[o + 1];
                    pos[o + 2] = end[o + 2];
                } else {
                    const r = Math.sqrt(dirs[o] * dirs[o] + dirs[o + 1] * dirs[o + 1] + dirs[o + 2] * dirs[o + 2]);
                    pos[o] = mid[o] + dirs[o] * cosT + lift[o] * r * sinT;
                    pos[o + 1] = mid[o + 1] + dirs[o + 1] * cosT + lift[o + 1] * r * sinT;
                    pos[o + 2] = mid[o + 2] + dirs[o + 2] * cosT + lift[o + 2] * r * sinT;
                }
            }
            mesh.geometry.attributes.position.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
        });

        if (t === 1) {
            relAnimState.phase = 'pause';
            relAnimState.animStart = time;
        }
    } else if (relAnimState.phase === 'pause') {
        if (elapsed > relAnimState.pause) {
            relAnimState.step++;
            relAnimState.stepsRemaining--;
            if (relAnimState.stepsRemaining <= 0) {
                relAnimState.isDeformed = false;
                clearRelationAnimation();
                activeRelation = null;
                updateRelLinkStyles();
                // Ensure generator axis from last frame is hidden
                [...highlightGroup.children].forEach(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
                highlightGroup.clear();
                return;
            } else {
                prepareNextRelStep();
            }
        }
    }

    if (relAnimState.active) {
        relAnimState.reqId = requestAnimationFrame(animateRelStep);
    }
}

function findFlowAnimationWord(type) {
    const allowed = ['a', 'b', 'c'];
    for (let attempts = 0; attempts < 1000; attempts++) {
        const walkLen = 2 * (Math.floor(Math.random() * 5) + 2); // Even length 4..12
        let seq = [];
        let last = null;
        for (let i = 0; i < walkLen; i++) {
            let choices = allowed.filter(g => g !== last);
            let nxt = choices[Math.floor(Math.random() * choices.length)];
            seq.push(nxt);
            last = nxt;
        }

        if (type === 'Euclidean') {
            let o = new THREE.Vector3(0, 0, 0), x = new THREE.Vector3(1, 0, 0), y = new THREE.Vector3(0, 1, 0);
            for (let g of seq) { o = applyGeneratorToVertex(g, o, type); x = applyGeneratorToVertex(g, x, type); y = applyGeneratorToVertex(g, y, type); }
            let dx = x.clone().sub(o), dy = y.clone().sub(o);
            if (dx.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-4 && dy.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-4) {
                if (o.length() > 0.1) return seq;
            }
        }
        else if (type === 'Hyperbolic') {
            let o = new THREE.Vector3(0, 0, 0), p = new THREE.Vector3(0.5, 0, 0);
            for (let g of seq) { o = applyGeneratorToVertex(g, o, type); p = applyGeneratorToVertex(g, p, type); }
            let w0_r = o.x, w0_i = o.y, w1_r = p.x, w1_i = p.y, w0_sq = w0_r * w0_r + w0_i * w0_i;
            if (w0_sq > 0.99) continue;
            let num_r = w0_r - w1_r, num_i = w0_i - w1_i;
            let prod_r = w1_r * w0_r + w1_i * w0_i, prod_i = w1_i * w0_r - w1_r * w0_i;
            let den_r = 0.5 * prod_r - 0.5, den_i = 0.5 * prod_i, den_sq = den_r * den_r + den_i * den_i;
            if (den_sq < 1e-8) continue;
            let rhs_r = (num_r * den_r + num_i * den_i) / den_sq, rhs_i = (num_i * den_r - num_r * den_i) / den_sq;
            let theta = Math.atan2(rhs_i, rhs_r) / 2;
            let alpha_r = Math.cos(theta) / Math.sqrt(1 - w0_sq);
            if (Math.abs(alpha_r) > 1.05) return seq;
        }
        else if (type === 'Spherical') {
            let o = new THREE.Vector3(0, 0, 1);
            for (let g of seq) o = applyGeneratorToVertex(g, o, type);
            if (o.distanceTo(new THREE.Vector3(0, 0, 1)) > 0.5) return seq;
        }
    }
    return ['a', 'b', 'c', 'b']; // Fallback
}

function playMobiusFlow(seq) {
    if (!generatorVerts) return;
    const type = generatorVerts.type;

    fundamentalGroup.visible = false;
    if (animationState.active) {
        animationState.active = false;
        animationState.currentCount = animationState.totalTriangles;
        animationState.meshes.forEach(m => m.geometry.setDrawRange(0, m.geometry.attributes.position.count));
    }

    relAnimState.meshes = animationState.meshes;
    relAnimState.type = type;
    relAnimState.active = true;
    relAnimState.isDeformed = true;

    relAnimState.meshData = animationState.meshes.map(mesh => {
        const positions = mesh.geometry.attributes.position.array;
        const start = new Float32Array(positions);
        return { start, mesh };
    });

    relAnimState.flowParams = {};

    if (type === 'Euclidean') {
        let o = new THREE.Vector3(0, 0, 0), x = new THREE.Vector3(1, 0, 0), y = new THREE.Vector3(0, 1, 0);
        for (let g of seq) { o = applyGeneratorToVertex(g, o, type); x = applyGeneratorToVertex(g, x, type); y = applyGeneratorToVertex(g, y, type); }
        let dx = x.clone().sub(o), dy = y.clone().sub(o);
        relAnimState.flowParams.tVector = o;
        let R = new THREE.Matrix4().set(dx.x, dy.x, 0, 0, dx.y, dy.y, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
        relAnimState.flowParams.RTarget = new THREE.Quaternion().setFromRotationMatrix(R);
    }
    else if (type === 'Spherical') {
        let x = new THREE.Vector3(1, 0, 0), y = new THREE.Vector3(0, 1, 0), z = new THREE.Vector3(0, 0, 1);
        for (let g of seq) { x = applyGeneratorToVertex(g, x, type); y = applyGeneratorToVertex(g, y, type); z = applyGeneratorToVertex(g, z, type); }
        let m = new THREE.Matrix4().set(x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, 0, 0, 0, 1);
        relAnimState.flowParams.qTarget = new THREE.Quaternion().setFromRotationMatrix(m);
    }
    else if (type === 'Hyperbolic') {
        let o = new THREE.Vector3(0, 0, 0), p = new THREE.Vector3(0.5, 0, 0);
        for (let g of seq) { o = applyGeneratorToVertex(g, o, type); p = applyGeneratorToVertex(g, p, type); }
        let w0_r = o.x, w0_i = o.y, w1_r = p.x, w1_i = p.y, w0_sq = w0_r * w0_r + w0_i * w0_i;
        let absA = 1 / Math.sqrt(1 - w0_sq);
        let num_r = w0_r - w1_r, num_i = w0_i - w1_i;
        let prod_r = w1_r * w0_r + w1_i * w0_i, prod_i = w1_i * w0_r - w1_r * w0_i;
        let den_r = 0.5 * prod_r - 0.5, den_i = 0.5 * prod_i, den_sq = den_r * den_r + den_i * den_i;
        let rhs_r = (num_r * den_r + num_i * den_i) / den_sq, rhs_i = (num_i * den_r - num_r * den_i) / den_sq;
        let theta = Math.atan2(rhs_i, rhs_r) / 2;
        let a_r = absA * Math.cos(theta), a_i = absA * Math.sin(theta);
        let b_r = w0_r * a_r + w0_i * a_i, b_i = w0_i * a_r - w0_r * a_i;
        if (a_r < 0) { a_r *= -1; a_i *= -1; b_r *= -1; b_i *= -1; }
        relAnimState.flowParams.SU11 = { a_r, a_i, b_r, b_i };
    }

    relAnimState.animStart = performance.now();
    relAnimState.duration = 4000 / animationSpeedMultiplier;
    relAnimState.phase = 'mobius_flow';

    // Set up trajectory visualization
    const steps = 100;
    const curvePts = [];
    const center = getTriangleCenter(generatorVerts.v1, generatorVerts.v2, generatorVerts.v3);
    if (type === 'Euclidean') {
        const tVec = relAnimState.flowParams.tVector;
        for (let i = 0; i <= steps; i++) {
            const easeT = i / steps;
            const q = new THREE.Quaternion().identity().slerp(relAnimState.flowParams.RTarget, easeT);
            const p = center.clone().applyQuaternion(q).add(tVec.clone().multiplyScalar(easeT));
            p.z = 0.01; // Lift above tiling
            curvePts.push(p);
        }
    } else if (type === 'Spherical') {
        for (let i = 0; i <= steps; i++) {
            const easeT = i / steps;
            const q = new THREE.Quaternion().identity().slerp(relAnimState.flowParams.qTarget, easeT);
            const p = center.clone().applyQuaternion(q).normalize().multiplyScalar(1.01);
            curvePts.push(p);
        }
    } else if (type === 'Hyperbolic') {
        const params = relAnimState.flowParams;
        for (let i = 0; i <= steps; i++) {
            const easeT = i / steps;
            const { a_r, a_i, b_r, b_i } = params.SU11;
            let Mt = {};
            if (a_r > 1.0001) {
                let D = Math.acosh(a_r);
                let sinT = Math.sinh(easeT * D) / Math.sinh(D);
                Mt.a_r = Math.cosh(easeT * D); Mt.a_i = a_i * sinT; Mt.b_r = b_r * sinT; Mt.b_i = b_i * sinT;
            } else if (a_r < 0.9999) {
                let D = Math.acos(a_r);
                let sinT = Math.sin(easeT * D) / Math.sin(D);
                Mt.a_r = Math.cos(easeT * D); Mt.a_i = a_i * sinT; Mt.b_r = b_r * sinT; Mt.b_i = b_i * sinT;
            } else {
                Mt.a_r = 1; Mt.a_i = a_i * easeT; Mt.b_r = b_r * easeT; Mt.b_i = b_i * easeT;
            }
            let sx = center.x, sy = center.y;
            let num_r = Mt.a_r * sx - Mt.a_i * sy + Mt.b_r;
            let num_i = Mt.a_r * sy + Mt.a_i * sx + Mt.b_i;
            let den_r = Mt.b_r * sx + Mt.b_i * sy + Mt.a_r;
            let den_i = Mt.b_r * sy - Mt.b_i * sx - Mt.a_i;
            let den_sq = den_r * den_r + den_i * den_i;
            let px = (num_r * den_r + num_i * den_i) / den_sq;
            let py = (num_i * den_r - num_r * den_i) / den_sq;
            curvePts.push(new THREE.Vector3(px, py, 0.01));
        }
    }
    // Below code is disabled for now -- uncomment to show green dot and trajectory of translation flow
    // Draw the curve
    // const geo = new THREE.BufferGeometry().setFromPoints(curvePts);
    // relAnimState.flowCurveMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({
    //     color: 0x22c55e,
    //     linewidth: 2, // Note: Three.js webgl renderer often ignores linewidth > 1
    //     transparent: true,
    //     opacity: 0.6
    // }));
    // highlightGroup.add(relAnimState.flowCurveMesh);

    // Create a moving small green dot
    // const dotRadius = type === 'Spherical' ? 0.008 : 0.015;
    // const dotGeo = new THREE.SphereGeometry(dotRadius, 16, 16);
    // relAnimState.flowDotMesh = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    // relAnimState.flowDotMesh.position.copy(curvePts[0]);
    // highlightGroup.add(relAnimState.flowDotMesh);

    relAnimState.reqId = requestAnimationFrame(animateMobiusFlowStep);
}

function animateMobiusFlowStep(time) {
    if (!relAnimState.active) return;
    const elapsed = time - relAnimState.animStart;
    let t = Math.min(1, Math.max(0, elapsed / relAnimState.duration));
    const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const type = relAnimState.type;
    const params = relAnimState.flowParams;

    let Mt = {};
    if (type === 'Hyperbolic') {
        const { a_r, a_i, b_r, b_i } = params.SU11;
        if (a_r > 1.0001) {
            let D = Math.acosh(a_r);
            let sinT = Math.sinh(easeT * D) / Math.sinh(D);
            Mt.a_r = Math.cosh(easeT * D); Mt.a_i = a_i * sinT; Mt.b_r = b_r * sinT; Mt.b_i = b_i * sinT;
        } else if (a_r < 0.9999) {
            let D = Math.acos(a_r);
            let sinT = Math.sin(easeT * D) / Math.sin(D);
            Mt.a_r = Math.cos(easeT * D); Mt.a_i = a_i * sinT; Mt.b_r = b_r * sinT; Mt.b_i = b_i * sinT;
        } else {
            Mt.a_r = 1; Mt.a_i = a_i * easeT; Mt.b_r = b_r * easeT; Mt.b_i = b_i * easeT;
        }
    }

    relAnimState.meshData.forEach(({ start, mesh }) => {
        const pos = mesh.geometry.attributes.position.array;
        const count = pos.length / 3;
        for (let i = 0; i < count; i++) {
            const o = i * 3;
            let sx = start[o], sy = start[o + 1], sz = start[o + 2];

            if (type === 'Euclidean') {
                let v = new THREE.Vector3(sx, sy, sz);
                let q = new THREE.Quaternion().identity().slerp(params.RTarget, easeT);
                v.applyQuaternion(q);
                v.add(params.tVector.clone().multiplyScalar(easeT));
                pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
            }
            else if (type === 'Spherical') {
                let v = new THREE.Vector3(sx, sy, sz);
                let q = new THREE.Quaternion().identity().slerp(params.qTarget, easeT);
                v.applyQuaternion(q);
                pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
            }
            else if (type === 'Hyperbolic') {
                let num_r = Mt.a_r * sx - Mt.a_i * sy + Mt.b_r;
                let num_i = Mt.a_r * sy + Mt.a_i * sx + Mt.b_i;
                let den_r = Mt.b_r * sx + Mt.b_i * sy + Mt.a_r;
                let den_i = Mt.b_r * sy - Mt.b_i * sx - Mt.a_i;
                let den_sq = den_r * den_r + den_i * den_i;
                if (den_sq > 1e-10) {
                    pos[o] = (num_r * den_r + num_i * den_i) / den_sq;
                    pos[o + 1] = (num_i * den_r - num_r * den_i) / den_sq;
                    pos[o + 2] = 0;
                }
            }
        }
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
    });

    // Update the moving dot position
    if (relAnimState.flowDotMesh) {
        const center = getTriangleCenter(generatorVerts.v1, generatorVerts.v2, generatorVerts.v3);
        let px = center.x, py = center.y, pz = center.z;
        if (type === 'Euclidean') {
            const v = new THREE.Vector3(px, py, pz);
            const q = new THREE.Quaternion().identity().slerp(relAnimState.flowParams.RTarget, easeT);
            v.applyQuaternion(q).add(relAnimState.flowParams.tVector.clone().multiplyScalar(easeT));
            relAnimState.flowDotMesh.position.set(v.x, v.y, 0.015);
        } else if (type === 'Spherical') {
            const v = new THREE.Vector3(px, py, pz);
            const q = new THREE.Quaternion().identity().slerp(relAnimState.flowParams.qTarget, easeT);
            v.applyQuaternion(q).normalize().multiplyScalar(1.01);
            relAnimState.flowDotMesh.position.copy(v);
        } else if (type === 'Hyperbolic') {
            let num_r = Mt.a_r * px - Mt.a_i * py + Mt.b_r;
            let num_i = Mt.a_r * py + Mt.a_i * px + Mt.b_i;
            let den_r = Mt.b_r * px + Mt.b_i * py + Mt.a_r;
            let den_i = Mt.b_r * py - Mt.b_i * px - Mt.a_i;
            let den_sq = den_r * den_r + den_i * den_i;
            relAnimState.flowDotMesh.position.set(
                (num_r * den_r + num_i * den_i) / den_sq,
                (num_i * den_r - num_r * den_i) / den_sq,
                0.01
            );
        }
    }

    if (t === 1) {
        relAnimState.isDeformed = true;
        relAnimState.active = false;
        if (relAnimState.reqId) { cancelAnimationFrame(relAnimState.reqId); relAnimState.reqId = null; }
    } else {
        relAnimState.reqId = requestAnimationFrame(animateMobiusFlowStep);
    }
}

// Draw the full reflection axis for generator a, b, or c.
// a ↔ side v1–v3,  b ↔ side v1–v2,  c ↔ side v2–v3
function drawGeneratorAxis(gen, clearAnim = true) {
    if (clearAnim) {
        clearHighlights();
    } else {
        [...highlightGroup.children].forEach(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
        highlightGroup.clear();
    }
    if (!generatorVerts) return;

    const { v1, v2, v3, type } = generatorVerts;
    const sides = { a: [v1, v3], b: [v1, v2], c: [v2, v3] };
    const [p1, p2] = sides[gen];
    const pts = [];

    if (type === 'Euclidean') {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len, uy = dy / len, ext = 30;
        pts.push(new THREE.Vector3(p1.x - ext * ux, p1.y - ext * uy, 0.002));
        pts.push(new THREE.Vector3(p1.x + ext * ux, p1.y + ext * uy, 0.002));

    } else if (type === 'Spherical') {
        const n = new THREE.Vector3().crossVectors(p1, p2).normalize();
        const u = p1.clone().normalize();
        const v = new THREE.Vector3().crossVectors(n, u).normalize();
        const N = 128;
        for (let i = 0; i <= N; i++) {
            const t = 2 * Math.PI * i / N;
            pts.push(u.clone().multiplyScalar(Math.cos(t)).add(v.clone().multiplyScalar(Math.sin(t))).normalize().multiplyScalar(1.01));
        }

    } else { // Hyperbolic — full geodesic arc from boundary to boundary
        const A1 = 2 * p1.x, B1 = 2 * p1.y, C1 = p1.x * p1.x + p1.y * p1.y + 1;
        const A2 = 2 * p2.x, B2 = 2 * p2.y, C2 = p2.x * p2.x + p2.y * p2.y + 1;
        const det = A1 * B2 - A2 * B1;
        const N = 128;
        if (Math.abs(det) < 1e-10) {
            // Diameter — extend well beyond the unit disk on both sides
            const angle = Math.atan2(p2.y, p2.x);
            pts.push(new THREE.Vector3(-Math.cos(angle) * 1.5, -Math.sin(angle) * 1.5, 0.001));
            pts.push(new THREE.Vector3(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5, 0.001));
        } else {
            const h = (C1 * B2 - C2 * B1) / det, k = (A1 * C2 - A2 * C1) / det;
            const r = Math.sqrt(Math.max(0, h * h + k * k - 1));
            const R = Math.sqrt(h * h + k * k);
            const phi = Math.atan2(k, h);
            const dTheta = Math.acos(Math.max(-1, Math.min(1, -r / R)));
            let th1 = phi + dTheta, th2 = phi - dTheta;
            const tv = Math.atan2(p1.y - k, p1.x - h);
            while (th2 < th1) th2 += 2 * Math.PI;
            let tvn = tv; while (tvn < th1) tvn += 2 * Math.PI; while (tvn > th1 + 2 * Math.PI) tvn -= 2 * Math.PI;
            let start = th1, end = th2;
            if (tvn > th2) { start = th2; end = th1 + 2 * Math.PI; }
            // Extend arc beyond the unit-circle boundary so the line is visible outside the disk
            const ext = 0.25;
            start -= ext; end += ext;
            for (let i = 0; i <= N; i++) {
                const t = start + (end - start) * i / N;
                pts.push(new THREE.Vector3(h + r * Math.cos(t), k + r * Math.sin(t), 0.001));
            }
        }
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    highlightGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfbbf24 })));
}

function createAnimatedMesh(verts, color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    geo.setDrawRange(0, 0);
    return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, shininess: 30 }));
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (animationState.active) {
        animationState.currentCount += animationState.speed / 10;
        if (animationState.currentCount >= animationState.totalTriangles) {
            animationState.currentCount = animationState.totalTriangles;
            animationState.active = false;
        }

        animationState.meshes.forEach(mesh => {
            const totalVerts = mesh.geometry.attributes.position.count;
            // progress is from 0 to 1 across the total triangle count
            const progress = animationState.currentCount / animationState.totalTriangles;
            // Determine how many triangles (each 3 vertices) to show
            mesh.geometry.setDrawRange(0, Math.floor(progress * totalVerts / 3) * 3);
        });
    }

    renderer.render(scene, camera);
}
window.addEventListener('load', init);
