/*
    Copyright (c) 2026 John Talbot

    Authored by John Talbot, with substantial assistance from Anthropic's
    Claude and Google's Gemini. See the NOTICE file for details.
*/

// Dodecahedron Rotational Symmetry Visualisation
// Group: I (icosahedral group) - 60 rotational symmetries
// Isomorphic to A₅ (even permutations of 5 items)

// --- Global Variables ---
let scene, camera, renderer, controls;
let dodecahedron;
let cubeMeshes = [];
let isAnimating = false;
let targetQuaternion = new THREE.Quaternion();
let currentQuaternion = new THREE.Quaternion();
let subgroupBuilder;

let activeButton = null;
let activeAxisLine = null;

let dodecahedronMesh;
let icosahedronMesh;
let isIcosahedron = false;
let polyhedronVisible = true;

// --- Configuration ---
const CONFIG = {
    size: 2,
    colors: {
        faces: 0x38bdf8,
        edges: 0xffffff,
        bg: 0x0f172a,
        cubes: [0xff5252, 0x448aff, 0x69f0ae, 0xffd740, 0xe040fb]
    },
    animationSpeed: 0.15
};

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

// Dodecahedron vertices (20)
const VERTICES = [
    new THREE.Vector3(1, 1, 1),           // 0
    new THREE.Vector3(1, 1, -1),          // 1
    new THREE.Vector3(1, -1, 1),          // 2
    new THREE.Vector3(1, -1, -1),         // 3
    new THREE.Vector3(-1, 1, 1),          // 4
    new THREE.Vector3(-1, 1, -1),         // 5
    new THREE.Vector3(-1, -1, 1),         // 6
    new THREE.Vector3(-1, -1, -1),        // 7
    new THREE.Vector3(0, INV_PHI, PHI),    // 8
    new THREE.Vector3(0, INV_PHI, -PHI),   // 9
    new THREE.Vector3(0, -INV_PHI, PHI),   // 10
    new THREE.Vector3(0, -INV_PHI, -PHI),  // 11
    new THREE.Vector3(INV_PHI, PHI, 0),    // 12
    new THREE.Vector3(INV_PHI, -PHI, 0),   // 13
    new THREE.Vector3(-INV_PHI, PHI, 0),   // 14
    new THREE.Vector3(-INV_PHI, -PHI, 0),  // 15
    new THREE.Vector3(PHI, 0, INV_PHI),    // 16
    new THREE.Vector3(PHI, 0, -INV_PHI),   // 17
    new THREE.Vector3(-PHI, 0, INV_PHI),   // 18
    new THREE.Vector3(-PHI, 0, -INV_PHI)    // 19
];

// Scale vertices
VERTICES.forEach(v => v.multiplyScalar(CONFIG.size / PHI));

// The 5 inscribed cubes (as vertex indices)
const ACTUAL_CUBES = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [0, 7, 9, 10, 13, 14, 17, 18],
    [1, 6, 8, 11, 13, 14, 16, 19],
    [2, 5, 8, 11, 12, 15, 17, 18],
    [3, 4, 9, 10, 12, 15, 16, 19]
];

// Rotation Axes
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

// Slider mapping
function sliderToSpeed(v) {
    const t = (v - 1) / (100 - 1);
    return 0.01 + t * (0.3 - 0.01);
}

function speedToSlider(speed) {
    const t = (speed - 0.01) / (0.3 - 0.01);
    return Math.round(1 + t * (100 - 1));
}

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
    createCubes();
    createIcosahedronMesh();
    setupUI();

    window.addEventListener('resize', onWindowResize);
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

        const material = new THREE.MeshPhysicalMaterial({
            color: CONFIG.colors.faces,
            metalness: 0.1,
            roughness: 0.5,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });

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
        const color = CONFIG.colors.cubes[i];
        const mat = new THREE.LineBasicMaterial({ color: color, linewidth: 3 });

        // Draw lines between all pairs with dist around 2*scale
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

    document.getElementById('reset-cube').onclick = () => {
        targetQuaternion.identity();
        currentQuaternion.identity();
        dodecahedron.quaternion.identity();
        isAnimating = false;
        clearActiveState();
        updatePermutationDisplay();
    };

    document.getElementById('reset-view').onclick = () => {
        camera.position.set(6, 6, 8);
        controls.target.set(0, 0, 0);
        controls.update();
    };

    const cubeTogglesContainer = document.getElementById('cube-toggles');
    const cubeToggleBtns = [];

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
        const colorStr = '#' + CONFIG.colors.cubes[i].toString(16).padStart(6, '0');
        btn.style.borderColor = colorStr;
        btn.style.width = '30px';
        btn.style.padding = '5px 0';
        btn.onclick = () => {
            cubeMeshes[i].visible = !cubeMeshes[i].visible;
            btn.classList.toggle('active', cubeMeshes[i].visible);
            btn.style.backgroundColor = cubeMeshes[i].visible ? colorStr : '';
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
    speedSlider.oninput = (e) => {
        CONFIG.animationSpeed = sliderToSpeed(parseInt(e.target.value));
        speedValue.textContent = CONFIG.animationSpeed.toFixed(2);
    };

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

function clearActiveState() {
    if (activeButton) {
        activeButton.classList.remove('active');
        activeButton = null;
    }
    if (activeAxisLine) {
        scene.remove(activeAxisLine);
        activeAxisLine = null;
    }
}

function showRotationAxis(axis) {
    const points = [];
    const dir = axis.clone().normalize();
    points.push(dir.clone().multiplyScalar(-10));
    points.push(dir.clone().multiplyScalar(10));

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.2,
        gapSize: 0.1,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    scene.add(line);
    activeAxisLine = line;
}

function performRotation(axis, angleDegrees) {
    if (isAnimating) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), THREE.MathUtils.degToRad(angleDegrees));
    targetQuaternion.premultiply(q);
    isAnimating = true;
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (isAnimating) {
        if (dodecahedron.quaternion.angleTo(targetQuaternion) < 0.001) {
            dodecahedron.quaternion.copy(targetQuaternion);
            currentQuaternion.copy(targetQuaternion);
            isAnimating = false;
            updatePermutationDisplay();
        } else {
            dodecahedron.quaternion.slerp(targetQuaternion, CONFIG.animationSpeed);
        }
    }
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function computePermutationFromQuat(q) {
    const p = [];
    ACTUAL_CUBES.forEach((origIndices, i) => {
        // Transform all vertices of cube i
        const transformedVerts = origIndices.map(idx => VERTICES[idx].clone().applyQuaternion(q));

        let bestCube = -1;
        let maxMatches = 0;

        ACTUAL_CUBES.forEach((targetIndices, j) => {
            let matches = 0;
            transformedVerts.forEach(tv => {
                if (targetIndices.some(tIdx => tv.distanceToSquared(VERTICES[tIdx]) < 0.05)) {
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
    const p = computePermutationFromQuat(targetQuaternion);
    const pStr = permToColoredCycleHTML(p);
    const text = "Permutation: " + (pStr === "e" ? "e (Identity)" : pStr);
    document.getElementById('permutation-overlay').innerHTML = text;
}

window.addEventListener('load', () => {
    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: (p) => CayleyGraph.permToCycleString(p)
        },
        getButtonGenerators: function () {
            const generators = [];
            // Face rotation buttons
            const faceBtns = document.querySelectorAll('#face-btns .btn');
            FACE_AXES.forEach((axis, i) => {
                const btn = faceBtns[i];
                if (btn) {
                    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone(), THREE.MathUtils.degToRad(72));
                    generators.push({
                        button: btn,
                        label: `F<sub>${i + 1}</sub>`,
                        color: '#38bdf8',
                        permutation: computePermutationFromQuat(q)
                    });
                }
            });
            // Vertex rotation buttons
            const vertexBtns = document.querySelectorAll('#vertex-btns .btn');
            VERTEX_AXES.forEach((axis, i) => {
                const btn = vertexBtns[i];
                if (btn) {
                    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone(), THREE.MathUtils.degToRad(120));
                    generators.push({
                        button: btn,
                        label: `V<sub>${i + 1}</sub>`,
                        color: '#f59e42',
                        permutation: computePermutationFromQuat(q)
                    });
                }
            });
            // Edge rotation buttons
            const edgeBtns = document.querySelectorAll('#edge-btns .btn');
            EDGE_AXES.forEach((axis, i) => {
                const btn = edgeBtns[i];
                if (btn) {
                    const q = new THREE.Quaternion().setFromAxisAngle(axis.clone(), THREE.MathUtils.degToRad(180));
                    generators.push({
                        button: btn,
                        label: `E<sub>${i + 1}</sub>`,
                        color: '#a3e635',
                        permutation: computePermutationFromQuat(q)
                    });
                }
            });
            return generators;
        },
        canvasContainer: document.getElementById('canvas-container'),
        cayleyCanvas: document.getElementById('cayley-canvas'),
        orderDisplay: document.getElementById('generator-selector'),
        toggleButton: document.getElementById('subgroup-builder-btn')
    });
});
