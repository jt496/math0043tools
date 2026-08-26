/*
    Copyright (c) 2026 John Talbot

    Authored by John Talbot, with substantial assistance from Anthropic's
    Claude and Google's Gemini. See the NOTICE file for details.
*/

// Dodecahedron Full Symmetry Visualisation
// Group: Ih (icosahedral group with central inversion) - 120 symmetries
// Isomorphic to A₅ × C₂

// --- Global Variables ---
let scene, camera, renderer, controls;
let dodecahedron;
let mirrorPlanes = [];
let cubeMeshes = [];
let isAnimating = false;
let targetMatrix = new THREE.Matrix4();
let currentMatrix = new THREE.Matrix4();
let subgroupBuilder;

let activeButton = null;
let activeAxisLine = null;

let dodecahedronMesh;
let icosahedronMesh;
let isIcosahedron = false;
let polyhedronVisible = true;

let orientation = 1;

let isReflecting = false;
let reflectionPhase = 0;
let reflectionNormal = null;
let preReflectionMatrix = new THREE.Matrix4();
let postReflectionMatrix = new THREE.Matrix4();
let isInverting = false;
let inversionPhase = 0;
let preInversionMatrix = new THREE.Matrix4();
let postInversionMatrix = new THREE.Matrix4();

const CONFIG = {
    size: 2,
    colors: {
        faces: 0x38bdf8,
        edges: 0xffffff,
        bg: 0x0f172a,
        mirror: 0xfb7185
    },
    animationSpeed: 0.15
};

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

const VERTICES = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, -1), new THREE.Vector3(1, -1, 1), new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, 1, 1), new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1), new THREE.Vector3(-1, -1, -1),
    new THREE.Vector3(0, INV_PHI, PHI), new THREE.Vector3(0, INV_PHI, -PHI), new THREE.Vector3(0, -INV_PHI, PHI), new THREE.Vector3(0, -INV_PHI, -PHI),
    new THREE.Vector3(INV_PHI, PHI, 0), new THREE.Vector3(INV_PHI, -PHI, 0), new THREE.Vector3(-INV_PHI, PHI, 0), new THREE.Vector3(-INV_PHI, -PHI, 0),
    new THREE.Vector3(PHI, 0, INV_PHI), new THREE.Vector3(PHI, 0, -INV_PHI), new THREE.Vector3(-PHI, 0, INV_PHI), new THREE.Vector3(-PHI, 0, -INV_PHI)
];

VERTICES.forEach(v => v.multiplyScalar(CONFIG.size / PHI));

const ACTUAL_CUBES = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [0, 7, 9, 10, 13, 14, 17, 18],
    [1, 6, 8, 11, 13, 14, 16, 19],
    [2, 5, 8, 11, 12, 15, 17, 18],
    [3, 4, 9, 10, 12, 15, 16, 19]
];

const FACE_AXES = [
    [0, 0.8506508, 0.5257311], [0.8506508, 0.5257311, 0], [0.5257311, 0, 0.8506508],
    [0, 0.8506508, -0.5257311], [0.5257311, 0, -0.8506508], [0.8506508, -0.5257311, 0]
].map(v => new THREE.Vector3(...v));

const VERTEX_AXES = [
    [0.5773503, 0.5773503, 0.5773503], [0.5773503, 0.5773503, -0.5773503],
    [0.5773503, -0.5773503, 0.5773503], [0.5773503, -0.5773503, -0.5773503],
    [0, 0.3568221, 0.9341724], [0.3568221, 0.9341724, 0], [0.9341724, 0, 0.3568221],
    [0, 0.3568221, -0.9341724], [0.9341724, 0, -0.3568221], [0.3568221, -0.9341724, 0]
].map(v => new THREE.Vector3(...v));

const EDGE_AXES = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    // Orbit of (INV_PHI/2, 1/2, PHI/2)
    [0.309017, 0.5, 0.809017], [0.309017, 0.5, -0.809017],
    [0.309017, -0.5, 0.809017], [0.309017, -0.5, -0.809017],
    [0.809017, 0.309017, 0.5], [0.809017, 0.309017, -0.5],
    [-0.809017, 0.309017, 0.5], [-0.809017, 0.309017, -0.5],
    [0.5, 0.809017, 0.309017], [0.5, -0.809017, 0.309017],
    [-0.5, 0.809017, 0.309017], [-0.5, -0.809017, 0.309017]
].map(v => new THREE.Vector3(...v));

// Mirror plane normals are perpendicular to each C2 (edge-midpoint) axis.
// In Ih each mirror plane σ = (C2, -1), so the plane normal IS the C2 axis direction.
// These 15 vectors are exactly the EDGE_AXES, verified to map all dodecahedron
// vertices to vertices under reflection v → v − 2(v·n̂)n̂.
const MIRROR_PLANES = [
    { normal: new THREE.Vector3(1, 0, 0), label: 'σₓ' },
    { normal: new THREE.Vector3(0, 1, 0), label: 'σᵧ' },
    { normal: new THREE.Vector3(0, 0, 1), label: 'σ𝓏' },
    // Orbit of (1/(2φ), 1/2, φ/2) — 4 sign combinations × 3 cyclic permutations = 12
    { normal: new THREE.Vector3(0.309017, 0.5, 0.809017), label: 'σ₁' },
    { normal: new THREE.Vector3(0.309017, 0.5, -0.809017), label: 'σ₂' },
    { normal: new THREE.Vector3(0.309017, -0.5, 0.809017), label: 'σ₃' },
    { normal: new THREE.Vector3(0.309017, -0.5, -0.809017), label: 'σ₄' },
    { normal: new THREE.Vector3(0.809017, 0.309017, 0.5), label: 'σ₅' },
    { normal: new THREE.Vector3(0.809017, 0.309017, -0.5), label: 'σ₆' },
    { normal: new THREE.Vector3(-0.809017, 0.309017, 0.5), label: 'σ₇' },
    { normal: new THREE.Vector3(-0.809017, 0.309017, -0.5), label: 'σ₈' },
    { normal: new THREE.Vector3(0.5, 0.809017, 0.309017), label: 'σ₉' },
    { normal: new THREE.Vector3(0.5, -0.809017, 0.309017), label: 'σ₁₀' },
    { normal: new THREE.Vector3(-0.5, 0.809017, 0.309017), label: 'σ₁₁' },
    { normal: new THREE.Vector3(-0.5, -0.809017, 0.309017), label: 'σ₁₂' }
].map(p => { p.normal.normalize(); return p; });

window.addEventListener('load', () => {
    init();
    animate();
});

function init() {
    scene = new THREE.Scene();
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(6, 6, 8);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);
    createDodecahedron();
    createMirrorPlanes();
    setupUI();
    window.addEventListener('resize', onWindowResize);
    targetMatrix.identity();
    currentMatrix.identity();
    createCubes();
    createIcosahedronMesh();
}

function createFaceLabelMesh(text, fv, scale) {
    const centroid = new THREE.Vector3();
    fv.forEach(v => centroid.add(v));
    centroid.divideScalar(fv.length);
    const normal = centroid.clone().normalize();

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 80px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.premultiplyAlpha = true;

    const geo = new THREE.PlaneGeometry(scale, scale);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(centroid).addScaledVector(normal, 0.02);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return mesh;
}

function createDodecahedron() {
    dodecahedron = new THREE.Group();
    dodecahedronMesh = new THREE.Group();
    const faceIndices = [
        [0, 8, 4, 14, 12], [0, 12, 1, 17, 16], [0, 16, 2, 10, 8],
        [1, 9, 5, 14, 12], [1, 17, 3, 11, 9], [2, 13, 3, 17, 16],
        [2, 10, 6, 15, 13], [3, 13, 15, 7, 11], [4, 8, 10, 6, 18],
        [4, 18, 19, 5, 14], [5, 9, 11, 7, 19], [6, 15, 7, 19, 18]
    ];
    faceIndices.forEach((face, faceIdx) => {
        const geometry = new THREE.BufferGeometry();
        const fv = face.map(idx => VERTICES[idx]);
        const positions = [];
        for (let i = 1; i < 4; i++) {
            positions.push(fv[0].x, fv[0].y, fv[0].z);
            positions.push(fv[i].x, fv[i].y, fv[i].z);
            positions.push(fv[i + 1].x, fv[i + 1].y, fv[i + 1].z);
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshPhysicalMaterial({ color: CONFIG.colors.faces, metalness: 0.1, roughness: 0.5, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        dodecahedronMesh.add(mesh);
        const points = [...fv, fv[0]];
        const edgeGeo = new THREE.BufferGeometry().setFromPoints(points);
        const edgeMat = new THREE.LineBasicMaterial({ color: CONFIG.colors.edges, linewidth: 2 });
        const edgeLine = new THREE.Line(edgeGeo, edgeMat);
        dodecahedronMesh.add(edgeLine);

        dodecahedronMesh.add(createFaceLabelMesh(String(faceIdx + 1), fv, 0.6));
    });
    dodecahedron.add(dodecahedronMesh);
    scene.add(dodecahedron);
}

function createIcosahedronMesh() {
    // Dual icosahedron: vertices along ±FACE_AXES directions.
    // Circumradius set so inradius = dodecahedron circumradius, placing
    // dodecahedron vertices (inscribed cube vertices) on icosahedron face planes.
    const R_d = CONFIG.size / PHI * Math.sqrt(3);
    const icoRadius = R_d * Math.sqrt(3 * (1 + PHI * PHI)) / (PHI * PHI);

    // 12 vertices: verts[2i] = +FACE_AXES[i], verts[2i+1] = -FACE_AXES[i]
    const verts = [];
    FACE_AXES.forEach(axis => {
        verts.push(axis.clone().multiplyScalar(icoRadius));
        verts.push(axis.clone().negate().multiplyScalar(icoRadius));
    });

    // 20 triangular faces with outward-facing winding
    const faces = [
        [0,4,2], [0,2,6], [0,9,4], [0,6,11], [0,11,9],
        [1,3,5], [1,7,3], [1,5,8], [1,10,7], [1,8,10],
        [2,4,10], [2,8,6], [2,10,8],
        [3,11,5], [3,7,9], [3,9,11],
        [4,9,7], [4,7,10],
        [5,6,8], [5,11,6]
    ];
    const positions = [];
    faces.forEach(([a, b, c]) => {
        const va = verts[a], vb = verts[b], vc = verts[c];
        positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const faceMat = new THREE.MeshPhysicalMaterial({
        color: CONFIG.colors.faces,
        metalness: 0.1, roughness: 0.5,
        transparent: true, opacity: 0.2,
        depthWrite: false, side: THREE.DoubleSide
    });
    icosahedronMesh = new THREE.Group();
    icosahedronMesh.add(new THREE.Mesh(geo, faceMat));

    // 30 edges
    const edgePairs = [
        [0,2],[0,4],[0,6],[0,9],[0,11],
        [1,3],[1,5],[1,7],[1,8],[1,10],
        [2,4],[2,6],[2,8],[2,10],
        [3,5],[3,7],[3,9],[3,11],
        [4,7],[4,9],[4,10],
        [5,6],[5,8],[5,11],
        [6,8],[6,11],
        [7,9],[7,10],
        [8,10],
        [9,11]
    ];
    const edgePositions = [];
    edgePairs.forEach(([a, b]) => {
        edgePositions.push(verts[a].x, verts[a].y, verts[a].z,
                           verts[b].x, verts[b].y, verts[b].z);
    });
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    icosahedronMesh.add(new THREE.LineSegments(edgeGeo,
        new THREE.LineBasicMaterial({ color: CONFIG.colors.edges, linewidth: 2 })));

    faces.forEach(([a, b, c], i) => {
        icosahedronMesh.add(createFaceLabelMesh(String(i + 1), [verts[a], verts[b], verts[c]], 0.5));
    });

    icosahedronMesh.visible = false;
    dodecahedron.add(icosahedronMesh);
}

function switchPolyhedron(showIcosa) {
    isIcosahedron = showIcosa;
    dodecahedronMesh.visible = !showIcosa && polyhedronVisible;
    icosahedronMesh.visible = showIcosa && polyhedronVisible;

    document.getElementById('poly-primary').className = showIcosa ? 'poly-switch inactive-poly' : 'poly-switch active-poly';
    document.getElementById('poly-secondary').className = showIcosa ? 'poly-switch active-poly' : 'poly-switch inactive-poly';

    document.querySelectorAll('.rotation-category .label, .btn-group .label').forEach(label => {
        if (label.textContent.includes('Order 5')) {
            label.textContent = showIcosa ? 'Vertex Rotations (Order 5)' : 'Face Rotations (Order 5)';
        } else if (label.textContent.includes('Order 3')) {
            label.textContent = showIcosa ? 'Face Rotations (Order 3)' : 'Vertex Rotations (Order 3)';
        }
    });

    document.querySelectorAll('#face-btns .btn').forEach((btn, i) => {
        btn.innerHTML = showIcosa ? `V<sub>${i + 1}</sub>` : `F<sub>${i + 1}</sub>`;
    });
    document.querySelectorAll('#vertex-btns .btn').forEach((btn, i) => {
        btn.innerHTML = showIcosa ? `F<sub>${i + 1}</sub>` : `V<sub>${i + 1}</sub>`;
    });

    const resetBtn = document.getElementById('reset-cube');
    if (resetBtn) resetBtn.textContent = showIcosa ? 'Reset Icosahedron' : 'Reset Dodecahedron';

    const polyBtn = document.getElementById('poly-shape-toggle-btn');
    if (polyBtn) polyBtn.textContent = showIcosa ? 'Icosahedron' : 'Dodecahedron';
}

function createCubes() {
    const scale = CONFIG.size / PHI;
    const targetDistSq = Math.pow(2 * scale, 2);

    ACTUAL_CUBES.forEach((cubeIndices, i) => {
        const cubeGroup = new THREE.Group();
        const color = [0xff5252, 0x448aff, 0x69f0ae, 0xffd740, 0xe040fb][i];
        const mat = new THREE.LineBasicMaterial({ color: color, linewidth: 3 });

        for (let a = 0; a < 8; a++) {
            for (let b = a + 1; b < 8; b++) {
                const p1 = VERTICES[cubeIndices[a]];
                const p2 = VERTICES[cubeIndices[b]];
                if (Math.abs(p1.distanceToSquared(p2) - targetDistSq) < 0.1) {
                    const geo = new THREE.BufferGeometry().setFromPoints([p1.clone(), p2.clone()]);
                    const line = new THREE.Line(geo, mat);
                    cubeGroup.add(line);
                }
            }
        }

        cubeGroup.visible = false;
        dodecahedron.add(cubeGroup);
        cubeMeshes.push(cubeGroup);
    });
}

function createMirrorPlanes() {
    MIRROR_PLANES.forEach((plane, i) => {
        const geo = new THREE.PlaneGeometry(5, 5);
        const mat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.mirror, transparent: true, opacity: 0.1, side: THREE.DoubleSide, visible: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.lookAt(plane.normal);
        scene.add(mesh);
        mirrorPlanes.push(mesh);
    });
}

function setupUI() {
    const faceContainer = document.getElementById('face-btns');
    FACE_AXES.forEach((axis, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerHTML = `F<sub>${i + 1}</sub>`;
        btn.onclick = () => handleRotationClick(btn, axis, 72);
        faceContainer.appendChild(btn);
    });

    const vertexContainer = document.getElementById('vertex-btns');
    VERTEX_AXES.forEach((axis, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerHTML = `V<sub>${i + 1}</sub>`;
        btn.onclick = () => handleRotationClick(btn, axis, 120);
        vertexContainer.appendChild(btn);
    });

    const edgeContainer = document.getElementById('edge-btns');
    EDGE_AXES.forEach((axis, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerHTML = `E<sub>${i + 1}</sub>`;
        btn.onclick = () => handleRotationClick(btn, axis, 180);
        edgeContainer.appendChild(btn);
    });

    const inversionBtn = document.getElementById('inversion-btn');
    inversionBtn.onclick = () => handleInversionClick(inversionBtn);

    const toggles = document.getElementById('mirror-toggles');
    MIRROR_PLANES.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = p.label;
        btn.style.width = '35px';
        btn.style.padding = '5px 0';
        btn.style.fontSize = '12px';
        btn.style.borderColor = 'var(--accent-red)';
        btn.onclick = () => handleMirrorClick(btn, i);
        toggles.appendChild(btn);
    });
    document.getElementById('reset-cube').onclick = () => {
        targetMatrix.identity(); currentMatrix.identity(); dodecahedron.matrix.identity(); dodecahedron.matrixAutoUpdate = false;
        orientation = 1; isAnimating = false; isReflecting = false; isInverting = false; reflectionPhase = 0; inversionPhase = 0;
        clearActiveState();
        updatePermutationDisplay(); updateOrientationDisplay();
    };
    document.getElementById('reset-view').onclick = () => { camera.position.set(6, 6, 8); controls.target.set(0, 0, 0); controls.update(); };

    const cubeTogglesContainer = document.getElementById('cube-toggles');
    const cubeToggleBtns = [];
    const cubeColors = [0xff5252, 0x448aff, 0x69f0ae, 0xffd740, 0xe040fb];

    const label = document.createElement('div');
    label.style.fontSize = '12px';
    label.style.color = '#94a3b8';
    label.style.marginBottom = '5px';
    label.textContent = 'Toggle Inscribed Cubes:';
    cubeTogglesContainer.parentNode.insertBefore(label, cubeTogglesContainer);

    ACTUAL_CUBES.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = i + 1;
        btn.style.borderColor = '#' + cubeColors[i].toString(16).padStart(6, '0');
        btn.style.width = '30px';
        btn.style.padding = '5px 0';
        btn.onclick = () => {
            cubeMeshes[i].visible = !cubeMeshes[i].visible;
            btn.classList.toggle('active', cubeMeshes[i].visible);
            btn.style.backgroundColor = cubeMeshes[i].visible ? btn.style.borderColor : '';
        };
        cubeTogglesContainer.appendChild(btn);
        cubeToggleBtns.push(btn);
    });

    const polyToggleBtn = document.createElement('button');
    polyToggleBtn.id = 'poly-shape-toggle-btn';
    polyToggleBtn.className = 'btn';
    polyToggleBtn.textContent = 'Dodecahedron';
    polyToggleBtn.style.flex = '1';
    polyToggleBtn.style.fontSize = '11px';
    polyToggleBtn.style.padding = '5px 4px';
    polyToggleBtn.onclick = () => {
        polyhedronVisible = !polyhedronVisible;
        dodecahedronMesh.visible = polyhedronVisible && !isIcosahedron;
        icosahedronMesh.visible = polyhedronVisible && isIcosahedron;
        polyToggleBtn.classList.toggle('active', !polyhedronVisible);
    };
    cubeTogglesContainer.appendChild(polyToggleBtn);

    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    speedSlider.oninput = (e) => { CONFIG.animationSpeed = (parseInt(e.target.value) / 100) * 0.3 + 0.01; speedValue.textContent = CONFIG.animationSpeed.toFixed(2); };

}

function handleRotationClick(btn, axis, angleDegrees) {
    if (activeButton === btn) {
        performRotation(axis, angleDegrees);
    } else {
        clearActiveState();
        activeButton = btn;
        btn.classList.add('active');
        showRotationAxis(axis);
    }
}

function handleMirrorClick(btn, idx) {
    if (activeButton === btn) {
        performReflection(idx);
    } else {
        clearActiveState();
        activeButton = btn;
        btn.classList.add('active');
        mirrorPlanes[idx].material.visible = true;
    }
}

function handleInversionClick(btn) {
    if (activeButton === btn) {
        performInversion();
    } else {
        clearActiveState();
        activeButton = btn;
        btn.classList.add('active');
        showInversionVisualization();
    }
}

function clearActiveState() {
    if (activeButton) {
        activeButton.classList.remove('active');
        activeButton = null;
    }
    if (activeAxisLine) {
        scene.remove(activeAxisLine);
        activeAxisLine = null;
    }
    mirrorPlanes.forEach(m => m.material.visible = false);

    // Special case for inversion visualization if we added any
    if (window.inversionPoint) {
        scene.remove(window.inversionPoint);
        window.inversionPoint = null;
    }
}

function showInversionVisualization() {
    // Show a small sphere at the origin to represent the inversion center
    const geo = new THREE.SphereGeometry(0.1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    window.inversionPoint = mesh;
}

function showRotationAxis(axis) {
    const points = [];
    const dir = axis.clone().normalize();
    points.push(dir.clone().multiplyScalar(-10));
    points.push(dir.clone().multiplyScalar(10));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.2, gapSize: 0.1 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    scene.add(line);
    activeAxisLine = line;
}

function performRotation(axis, angleDegrees) {
    if (isAnimating || isReflecting || isInverting) return;
    const m = new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), THREE.MathUtils.degToRad(angleDegrees));
    targetMatrix.premultiply(m);
    isAnimating = true;
}

function performReflection(idx) {
    if (isAnimating || isReflecting || isInverting) return;
    const n = MIRROR_PLANES[idx].normal;
    reflectionNormal = n;
    preReflectionMatrix.copy(currentMatrix);
    const m = new THREE.Matrix4().set(1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0, -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0, -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0, 0, 0, 0, 1);
    postReflectionMatrix.copy(currentMatrix).premultiply(m);
    targetMatrix.copy(postReflectionMatrix);
    orientation *= -1; reflectionPhase = 0; isReflecting = true;
}

function performInversion() {
    if (isAnimating || isReflecting || isInverting) return;
    preInversionMatrix.copy(currentMatrix);
    const m = new THREE.Matrix4().makeScale(-1, -1, -1);
    postInversionMatrix.copy(currentMatrix).premultiply(m);
    targetMatrix.copy(postInversionMatrix);
    orientation *= -1; inversionPhase = 0; isInverting = true;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (isReflecting) updateReflectionAnimation();
    else if (isInverting) updateInversionAnimation();
    else if (isAnimating) {
        const cP = new THREE.Vector3(), cQ = new THREE.Quaternion(), cS = new THREE.Vector3();
        currentMatrix.decompose(cP, cQ, cS);
        const tP = new THREE.Vector3(), tQ = new THREE.Quaternion(), tS = new THREE.Vector3();
        targetMatrix.decompose(tP, tQ, tS);
        cQ.slerp(tQ, CONFIG.animationSpeed);
        cS.lerp(tS, CONFIG.animationSpeed);
        if (cQ.angleTo(tQ) < 0.001 && cS.distanceTo(tS) < 0.001) { currentMatrix.copy(targetMatrix); isAnimating = false; updatePermutationDisplay(); }
        else { currentMatrix.compose(cP, cQ, cS); }
        dodecahedron.matrix.copy(currentMatrix);
        dodecahedron.matrixAutoUpdate = false;
    }
    renderer.render(scene, camera);
}

function updateReflectionAnimation() {
    reflectionPhase += CONFIG.animationSpeed * 2;
    if (reflectionPhase >= 2) {
        currentMatrix.copy(postReflectionMatrix);
        dodecahedron.matrixAutoUpdate = false;
        dodecahedron.matrix.copy(currentMatrix);
        isReflecting = false;
        updatePermutationDisplay();
        updateOrientationDisplay();
    } else {
        const s = reflectionPhase < 1 ? 1 - reflectionPhase : reflectionPhase - 1;
        const n = reflectionNormal;
        const scaleM = new THREE.Matrix4().set(1 + (s - 1) * n.x * n.x, (s - 1) * n.x * n.y, (s - 1) * n.x * n.z, 0, (s - 1) * n.y * n.x, 1 + (s - 1) * n.y * n.y, (s - 1) * n.y * n.z, 0, (s - 1) * n.z * n.x, (s - 1) * n.z * n.y, 1 + (s - 1) * n.z * n.z, 0, 0, 0, 0, 1);
        dodecahedron.matrixAutoUpdate = false;
        dodecahedron.matrix.copy(scaleM).multiply(reflectionPhase < 1 ? preReflectionMatrix : postReflectionMatrix);
    }
}

function updateInversionAnimation() {
    inversionPhase += CONFIG.animationSpeed * 2;
    if (inversionPhase >= 2) {
        currentMatrix.copy(postInversionMatrix);
        dodecahedron.matrixAutoUpdate = false;
        dodecahedron.matrix.copy(currentMatrix);
        isInverting = false;
        updatePermutationDisplay();
        updateOrientationDisplay();
    } else {
        const s = inversionPhase < 1 ? 1 - inversionPhase : inversionPhase - 1;
        const scaleM = new THREE.Matrix4().makeScale(s, s, s);
        dodecahedron.matrixAutoUpdate = false;
        dodecahedron.matrix.copy(scaleM).multiply(inversionPhase < 1 ? preInversionMatrix : postInversionMatrix);
    }
}

function onWindowResize() { const container = document.getElementById('canvas-container'); camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight); }

function computePermutationFromMatrix(m) {
    const p = [];
    ACTUAL_CUBES.forEach((origIndices, i) => {
        const transformedVerts = origIndices.map(idx => VERTICES[idx].clone().applyMatrix4(m));

        let bestCube = -1;
        let maxMatches = 0;

        ACTUAL_CUBES.forEach((targetIndices, j) => {
            let matches = 0;
            transformedVerts.forEach(tv => {
                if (targetIndices.some(tIdx => tv.distanceToSquared(VERTICES[tIdx]) < 0.01)) {
                    matches++;
                }
            });
            if (matches > maxMatches) {
                maxMatches = matches;
                bestCube = j;
            }
        });
        p[i] = bestCube + 1;
    });
    return p;
}

function permToColoredCycleHTML(p) {
    const n = p.length;
    const visited = new Array(n).fill(false);
    const cycles = [];
    const colors = ['#ff5252', '#448aff', '#69f0ae', '#ffd740', '#e040fb'];

    for (let i = 0; i < n; i++) {
        if (!visited[i]) {
            const cycleIndices = [];
            let curr = i;
            while (!visited[curr]) {
                visited[curr] = true;
                cycleIndices.push(curr);
                curr = p[curr] - 1;
            }
            if (cycleIndices.length > 1) {
                const cycleHtml = cycleIndices.map(idx => `<span style="color: ${colors[idx]}">${idx + 1}</span>`).join(' ');
                cycles.push("(" + cycleHtml + ")");
            }
        }
    }
    return cycles.length === 0 ? "e" : cycles.join("");
}

function updatePermutationDisplay() {
    const p = computePermutationFromMatrix(targetMatrix);
    const pStr = permToColoredCycleHTML(p);
    const text = "Permutation: " + (pStr === "e" ? "e (Identity)" : pStr);
    document.getElementById('permutation-overlay').innerHTML = text;
}

function updateOrientationDisplay() {
    const text = document.getElementById('orientation-text');
    if (orientation === 1) {
        text.textContent = 'Orientation: +1';
        text.style.color = '#69f0ae';
    } else {
        text.textContent = 'Orientation: −1';
        text.style.color = '#ff6b6b';
    }
}

window.addEventListener('load', () => {
    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: { identity: { p: [1, 2, 3, 4, 5], s: 1 }, serialize: (el) => `${el.s}:${el.p.join(',')}`, multiply: (a, b) => ({ p: CayleyGraph.composePerm(a.p, b.p), s: a.s * b.s }), formatLabel: (el) => (el.s === 1 ? '+' : '−') + CayleyGraph.permToCycleString(el.p) },
        getButtonGenerators: function () {
            const generators = [];
            // Face rotation buttons
            const faceBtns = document.querySelectorAll('#face-btns .btn');
            FACE_AXES.forEach((axis, i) => {
                const btn = faceBtns[i];
                if (btn) {
                    const qFace = new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(72));
                    generators.push({
                        button: btn,
                        label: `F<sub>${i + 1}</sub>`,
                        color: '#38bdf8',
                        permutation: { p: computePermutationFromMatrix(qFace), s: 1 }
                    });
                }
            });
            // Vertex rotation buttons
            const vertexBtns = document.querySelectorAll('#vertex-btns .btn');
            VERTEX_AXES.forEach((axis, i) => {
                const btn = vertexBtns[i];
                if (btn) {
                    const qVertex = new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(120));
                    generators.push({
                        button: btn,
                        label: `V<sub>${i + 1}</sub>`,
                        color: '#f59e42',
                        permutation: { p: computePermutationFromMatrix(qVertex), s: 1 }
                    });
                }
            });
            // Edge rotation buttons
            const edgeBtns = document.querySelectorAll('#edge-btns .btn');
            EDGE_AXES.forEach((axis, i) => {
                const btn = edgeBtns[i];
                if (btn) {
                    const qEdge = new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(180));
                    generators.push({
                        button: btn,
                        label: `E<sub>${i + 1}</sub>`,
                        color: '#a3e635',
                        permutation: { p: computePermutationFromMatrix(qEdge), s: 1 }
                    });
                }
            });
            // Mirror buttons
            const mirrorBtns = document.querySelectorAll('#mirror-toggles .btn');
            MIRROR_PLANES.forEach((plane, i) => {
                const btn = mirrorBtns[i];
                if (btn) {
                    const n = plane.normal;
                    const mRef = new THREE.Matrix4().set(
                        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
                        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
                        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
                        0, 0, 0, 1
                    );
                    generators.push({
                        button: btn,
                        label: plane.label || `M${i + 1}`,
                        color: '#fb7185',
                        permutation: { p: computePermutationFromMatrix(mRef), s: -1 }
                    });
                }
            });
            // Inversion button
            const invBtn = document.getElementById('inversion-btn');
            if (invBtn) {
                generators.push({
                    button: invBtn,
                    label: 'i',
                    color: '#ffffff',
                    permutation: { p: computePermutationFromMatrix(new THREE.Matrix4().makeScale(-1, -1, -1)), s: -1 }
                });
            }
            return generators;
        },
        canvasContainer: document.getElementById('canvas-container'),
        cayleyCanvas: document.getElementById('cayley-canvas'),
        orderDisplay: document.getElementById('generator-selector'),
        toggleButton: document.getElementById('subgroup-builder-btn')
    });
});
