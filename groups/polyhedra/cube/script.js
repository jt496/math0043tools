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

// Cube Full Symmetry Visualisation
// Group: Oₕ (octahedral group) - 48 symmetries including reflections
// Isomorphic to S₄ × Z₂

// --- Global Variables ---
let scene, camera, renderer, controls;
let cube;
let axisLines = [];
let diagonalLines = [];
let edgeAxisLines = [];
let mirrorPlanes = [];
let isAnimating = false;
let targetMatrix = new THREE.Matrix4();
let currentMatrix = new THREE.Matrix4();
let subgroupBuilder;
let cubeMesh;
let octahedronMesh;
let isOctahedron = false;
let octaDiagonalLines = [];

// --- Configuration ---
const CONFIG = {
    cubeSize: 2,
    colors: {
        faces: [0xff5252, 0x448aff, 0x69f0ae, 0xffd740, 0xe040fb, 0xffab40],
        edges: 0xffffff,
        axis: 0xffffff,
        bg: 0x0f172a
    },
    animationSpeed: 0.15
};

// Mirror planes for the cube:
// 3 planes parallel to faces (through center, perpendicular to x, y, z)
// 6 diagonal planes (through opposite edges)
const MIRROR_PLANES = [
    // Face-parallel planes
    { normal: new THREE.Vector3(1, 0, 0), color: 0xff3300, label: 'σ<sub>x</sub>' },  // YZ plane
    { normal: new THREE.Vector3(0, 1, 0), color: 0x448aff, label: 'σ<sub>y</sub>' },  // XZ plane
    { normal: new THREE.Vector3(0, 0, 1), color: 0x69f0ae, label: 'σ<sub>z</sub>' },  // XY plane
    // Diagonal planes (through opposite edges)
    { normal: new THREE.Vector3(1, 1, 0).normalize(), color: 0xff00ff, label: 'σ₁' },
    { normal: new THREE.Vector3(1, -1, 0).normalize(), color: 0x00ffff, label: 'σ₂' },
    { normal: new THREE.Vector3(1, 0, 1).normalize(), color: 0xffff00, label: 'σ₃' },
    { normal: new THREE.Vector3(1, 0, -1).normalize(), color: 0xff8800, label: 'σ₄' },
    { normal: new THREE.Vector3(0, 1, 1).normalize(), color: 0x88ff00, label: 'σ₅' },
    { normal: new THREE.Vector3(0, 1, -1).normalize(), color: 0x0088ff, label: 'σ₆' }
];

const MIRROR_COLORS = ['#ff3300', '#448aff', '#69f0ae', '#ff00ff', '#00ffff', '#ffff00', '#ff8800', '#88ff00', '#0088ff'];

// Track orientation (determinant: +1 = proper, -1 = improper)
let orientation = 1;

// Reflection animation state
let isReflecting = false;
let reflectionPhase = 0;
let reflectionNormal = null;
let preReflectionMatrix = new THREE.Matrix4();
let postReflectionMatrix = new THREE.Matrix4();
let isInverting = false;
let inversionPhase = 0;
let preInversionMatrix = new THREE.Matrix4();
let postInversionMatrix = new THREE.Matrix4();

// Slider mapping
function sliderToSpeed(v) {
    const t = (v - 1) / (100 - 1);
    return 0.01 + t * (0.3 - 0.01);
}

function speedToSlider(speed) {
    const t = (speed - 0.01) / (0.3 - 0.01);
    return Math.round(1 + t * (100 - 1));
}

// Wait for DOM
window.addEventListener('load', () => {
    init();
    animate();
});

function init() {
    console.log("Initializing Cube Full Symmetry Visualisation...");

    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(4, 4, 6);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // 6. Create Cube
    createCube();

    // 7. Create Axes, Diagonals, and Edge Axes
    createAxes();
    createDiagonals();
    createEdgeAxes();
    createMirrorPlanes();
    createOctahedronMesh();

    // 8. Initialize matrices
    targetMatrix.identity();
    currentMatrix.identity();

    // 9. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupUI();
    setupRepPanel();
}

// Matrix / character panel (hidden until the toggle is switched on).
// The face rotations plus the mirror planes generate all 48 elements of O_h,
// including the inversion -I.
function setupRepPanel() {
    if (!window.RepPanel) return;
    RepPanel.attach({
        groupName: 'S₄ × C₂',
        getMatrix: () => targetMatrix,
        generators: [
            { axis: [1, 0, 0], angle: 90 },
            { axis: [0, 1, 0], angle: 90 },
            { axis: [0, 0, 1], angle: 90 },
            ...MIRROR_PLANES.map(p => ({ normal: [p.normal.x, p.normal.y, p.normal.z] }))
        ]
    });
}


function createCube() {
    const geometry = new THREE.BoxGeometry(CONFIG.cubeSize, CONFIG.cubeSize, CONFIG.cubeSize);

    const materials = CONFIG.colors.faces.map(color => {
        return new THREE.MeshPhysicalMaterial({
            color: color,
            metalness: 0.1,
            roughness: 0.5,
            clearcoat: 0.1,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.2,
            depthWrite: false
        });
    });

    cube = new THREE.Group();
    cubeMesh = new THREE.Mesh(geometry, materials);

    // Add edges
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: CONFIG.colors.edges, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    cubeMesh.add(edges);

    addFaceLabels();

    cube.add(cubeMesh);
    scene.add(cube);
}

function addFaceLabels() {
    function createLabelTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.premultiplyAlpha = true;
        return texture;
    }

    const offset = CONFIG.cubeSize / 2 + 0.01;
    const labels = ['1', '6', '2', '5', '3', '4'];

    labels.forEach((label, i) => {
        const texture = createLabelTexture(label);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);

        if (i === 0) { plane.position.set(offset, 0, 0); plane.rotation.y = Math.PI / 2; }
        if (i === 1) { plane.position.set(-offset, 0, 0); plane.rotation.y = -Math.PI / 2; }
        if (i === 2) { plane.position.set(0, offset, 0); plane.rotation.x = -Math.PI / 2; }
        if (i === 3) { plane.position.set(0, -offset, 0); plane.rotation.x = Math.PI / 2; }
        if (i === 4) { plane.position.set(0, 0, offset); }
        if (i === 5) { plane.position.set(0, 0, -offset); plane.rotation.y = Math.PI; }

        cubeMesh.add(plane);
    });
}

function createAxes() {
    function createLine(start, end, color) {
        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        axisLines.push(line);
    }

    const d = 3.5;
    const lineD = 3;

    createLine(new THREE.Vector3(-lineD, 0, 0), new THREE.Vector3(lineD, 0, 0), 0xff5252);
    // createAxisLabel("X", new THREE.Vector3(d, 0, 0), 0xff5252);

    createLine(new THREE.Vector3(0, -lineD, 0), new THREE.Vector3(0, lineD, 0), 0x448aff);
    // createAxisLabel("Y", new THREE.Vector3(0, d, 0), 0x448aff);

    createLine(new THREE.Vector3(0, 0, -lineD), new THREE.Vector3(0, 0, lineD), 0x69f0ae);
    // createAxisLabel("Z", new THREE.Vector3(0, 0, d), 0x69f0ae);
}

function createAxisLabel(text, position, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 36px sans-serif';
    const hexColor = '#' + new THREE.Color(color).getHexString();
    ctx.fillStyle = hexColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.premultiplyAlpha = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.1 });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.8, 0.8, 0.8);
    scene.add(sprite);
    axisLines.push(sprite);
}

function createDiagonals() {
    const cs = CONFIG.cubeSize / 2;
    const corners = [
        new THREE.Vector3(cs, cs, cs), new THREE.Vector3(-cs, -cs, -cs),
        new THREE.Vector3(-cs, cs, cs), new THREE.Vector3(cs, -cs, -cs),
        new THREE.Vector3(-cs, -cs, cs), new THREE.Vector3(cs, cs, -cs),
        new THREE.Vector3(cs, -cs, cs), new THREE.Vector3(-cs, cs, -cs)
    ];

    const colors = [0xff00ff, 0x00ffff, 0xffff00, 0x76ff03];

    for (let i = 0; i < 4; i++) {
        const points = [corners[2 * i], corners[2 * i + 1]];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: colors[i], linewidth: 4 });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        cube.add(line);
        diagonalLines.push(line);
    }

    // Octahedron face-axis lines: endpoints at 2× face-centroid distance along each D axis.
    // Face centroid of (+,+,+) face = (r/3, r/3, r/3) where r = sqrt(2); extend by ×2.
    const d = 2 * Math.sqrt(2) / 3; // ≈ 0.943
    const octaEndpoints = [
        new THREE.Vector3(d, d, d), new THREE.Vector3(-d, -d, -d),
        new THREE.Vector3(-d, d, d), new THREE.Vector3(d, -d, -d),
        new THREE.Vector3(-d, -d, d), new THREE.Vector3(d, d, -d),
        new THREE.Vector3(d, -d, d), new THREE.Vector3(-d, d, -d)
    ];

    for (let i = 0; i < 4; i++) {
        const points = [octaEndpoints[2 * i], octaEndpoints[2 * i + 1]];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: colors[i], linewidth: 4 });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        cube.add(line);
        octaDiagonalLines.push(line);
    }
}

function createEdgeAxes() {
    // Edge midpoint axes (6 axes through opposite edge midpoints)
    const cs = CONFIG.cubeSize / 2;
    const edgeAxes = [
        { dir: new THREE.Vector3(0, 1, 1).normalize(), color: 0xff4400 },   // edge1
        { dir: new THREE.Vector3(0, 1, -1).normalize(), color: 0x00ee66 },  // edge2
        { dir: new THREE.Vector3(1, 0, 1).normalize(), color: 0x9900ff },   // edge3
        { dir: new THREE.Vector3(1, 0, -1).normalize(), color: 0xffdd00 },  // edge4
        { dir: new THREE.Vector3(1, 1, 0).normalize(), color: 0xff0099 },   // edge5
        { dir: new THREE.Vector3(1, -1, 0).normalize(), color: 0x00ccff }   // edge6
    ];

    const lineLength = 3;
    edgeAxes.forEach(({ dir, color }) => {
        const start = dir.clone().multiplyScalar(-lineLength);
        const end = dir.clone().multiplyScalar(lineLength);
        const points = [start, end];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: color, linewidth: 2, transparent: true, opacity: 0.6 });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        scene.add(line);
        edgeAxisLines.push(line);
    });
}

function createMirrorPlanes() {
    MIRROR_PLANES.forEach((plane, idx) => {
        const planeSize = CONFIG.cubeSize * 1.8;
        const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
        const material = new THREE.MeshBasicMaterial({
            color: plane.color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.lookAt(plane.normal);
        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        mirrorPlanes.push(mesh);
    });
}

function createOctahedronMesh() {
    const r = Math.sqrt(2); // same edge length as cube (side 2)
    const px = new THREE.Vector3(r, 0, 0);
    const nx = new THREE.Vector3(-r, 0, 0);
    const py = new THREE.Vector3(0, r, 0);
    const ny = new THREE.Vector3(0, -r, 0);
    const pz = new THREE.Vector3(0, 0, r);
    const nz = new THREE.Vector3(0, 0, -r);

    // Color each face by its diagonal pair (same colors as D1-D4 buttons)
    const DIAG_COLORS = [
        new THREE.Color(0xff00ff), // diag1: (+,+,+) and (-,-,-)
        new THREE.Color(0x00ffff), // diag2: (-,+,+) and (+,-,-)
        new THREE.Color(0xffff00), // diag3: (-,-,+) and (+,+,-)
        new THREE.Color(0x76ff03)  // diag4: (+,-,+) and (-,+,-)
    ];

    // 8 faces with correct outward-facing winding order
    const faces = [
        { verts: [px, py, pz], diag: 0 }, // (+,+,+)
        { verts: [px, nz, py], diag: 2 }, // (+,+,-)
        { verts: [px, pz, ny], diag: 3 }, // (+,-,+)
        { verts: [px, ny, nz], diag: 1 }, // (+,-,-)
        { verts: [nx, pz, py], diag: 1 }, // (-,+,+)
        { verts: [nx, py, nz], diag: 3 }, // (-,+,-)
        { verts: [nx, ny, pz], diag: 2 }, // (-,-,+)
        { verts: [nx, nz, ny], diag: 0 }  // (-,-,-)
    ];

    const positions = [];
    const colors = [];
    for (const face of faces) {
        const color = DIAG_COLORS[face.diag];
        for (const v of face.verts) {
            positions.push(v.x, v.y, v.z);
            colors.push(color.r, color.g, color.b);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.1,
        roughness: 0.5,
        clearcoat: 0.1,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    octahedronMesh = new THREE.Mesh(geometry, material);

    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: CONFIG.colors.edges, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    octahedronMesh.add(edges);

    addOctahedronVertexLabels(r);

    octahedronMesh.visible = false;
    cube.add(octahedronMesh);
}

function addOctahedronVertexLabels(r) {
    function createLabelTexture(text, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 80px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);
        texture.premultiplyAlpha = true;
        return texture;
    }

    const offset = r + 0.35;
    // Colors match the corresponding cube face (BoxGeometry material order: +x,-x,+y,-y,+z,-z)
    const vertexLabels = [
        { pos: [offset, 0, 0],  text: '1', color: 'rgba(255,82,82,0.95)' },
        { pos: [-offset, 0, 0], text: '6', color: 'rgba(68,138,255,0.95)' },
        { pos: [0, offset, 0],  text: '2', color: 'rgba(105,240,174,0.95)' },
        { pos: [0, -offset, 0], text: '5', color: 'rgba(255,215,64,0.95)' },
        { pos: [0, 0, offset],  text: '3', color: 'rgba(224,64,251,0.95)' },
        { pos: [0, 0, -offset], text: '4', color: 'rgba(255,171,64,0.95)' }
    ];

    vertexLabels.forEach(({ pos, text, color }) => {
        const texture = createLabelTexture(text, color);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.01 });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(...pos);
        sprite.scale.set(0.6, 0.6, 0.6);
        octahedronMesh.add(sprite);
    });
}

function switchPolyhedron(showOcta) {
    isOctahedron = showOcta;
    cubeMesh.visible = !showOcta;
    octahedronMesh.visible = showOcta;

    document.getElementById('poly-primary').className = showOcta ? 'poly-switch inactive-poly' : 'poly-switch active-poly';
    document.getElementById('poly-secondary').className = showOcta ? 'poly-switch active-poly' : 'poly-switch inactive-poly';

    // Update rotation category labels (Face ↔ Vertex for orders 3 and 4)
    document.querySelectorAll('.rotation-category .label').forEach(label => {
        if (label.textContent.includes('Order 4')) {
            label.textContent = showOcta ? 'Vertex Rotations (Order 4)' : 'Face Rotations (Order 4)';
        } else if (label.textContent.includes('Order 3')) {
            label.textContent = showOcta ? 'Face Rotations (Order 3)' : 'Vertex Rotations (Order 3)';
        }
    });

    // Update D₁–D₄ button labels to F₁–F₄ for octahedron (face rotations)
    document.querySelectorAll('[data-axis^="diag"]').forEach(btn => {
        const n = btn.dataset.axis.replace('diag', '');
        btn.innerHTML = showOcta ? `F<sub>${n}</sub>` : `D<sub>${n}</sub>`;
    });

    // Update "Show Diagonals" / "Show Face Axes" toggle label
    const diagToggle = document.getElementById('toggle-diagonals');
    if (diagToggle) {
        const diagRow = diagToggle.closest('.toggle-row');
        if (diagRow) {
            const textSpan = diagRow.querySelector(':scope > span');
            if (textSpan) textSpan.textContent = showOcta ? 'Show Face Axes' : 'Show Diagonals';
        }
        // Swap which diagonal lines are shown if the toggle is currently on
        if (diagToggle.checked) {
            diagonalLines.forEach(l => l.visible = !showOcta);
            octaDiagonalLines.forEach(l => l.visible = showOcta);
        }
    }
}

function performRotation(axisVector, angleDegrees) {
    if (isAnimating || isReflecting) return;

    const angle = THREE.MathUtils.degToRad(angleDegrees);
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationAxis(axisVector.normalize(), angle);

    targetMatrix.premultiply(rotationMatrix);
    isAnimating = true;
}

function performReflection(planeIndex) {
    if (isAnimating || isReflecting) return;

    const normal = MIRROR_PLANES[planeIndex].normal.clone();

    reflectionNormal = normal;
    preReflectionMatrix.copy(currentMatrix);

    const reflectionMatrix = new THREE.Matrix4();
    const n = normal;

    reflectionMatrix.set(
        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
        0, 0, 0, 1
    );

    postReflectionMatrix.copy(currentMatrix);
    postReflectionMatrix.premultiply(reflectionMatrix);
    targetMatrix.copy(postReflectionMatrix);

    orientation *= -1;
    reflectionPhase = 0;
    isReflecting = true;
}

function performInversion() {
    if (isAnimating || isReflecting || isInverting) return;

    preInversionMatrix.copy(currentMatrix);

    const inversionMatrix = new THREE.Matrix4();
    inversionMatrix.set(
        -1, 0, 0, 0,
        0, -1, 0, 0,
        0, 0, -1, 0,
        0, 0, 0, 1
    );

    postInversionMatrix.copy(currentMatrix);
    postInversionMatrix.premultiply(inversionMatrix);
    targetMatrix.copy(postInversionMatrix);

    orientation *= -1;
    inversionPhase = 0;
    isInverting = true;
}

function updateAnimation() {
    if (isReflecting) {
        updateReflectionAnimation();
        return;
    }

    if (isInverting) {
        updateInversionAnimation();
        return;
    }

    if (!isAnimating) return;

    const currentPos = new THREE.Vector3();
    const currentQuat = new THREE.Quaternion();
    const currentScale = new THREE.Vector3();
    currentMatrix.decompose(currentPos, currentQuat, currentScale);

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    const targetScale = new THREE.Vector3();
    targetMatrix.decompose(targetPos, targetQuat, targetScale);

    currentQuat.slerp(targetQuat, CONFIG.animationSpeed);
    currentScale.lerp(targetScale, CONFIG.animationSpeed);

    const quatDiff = currentQuat.angleTo(targetQuat);
    const scaleDiff = currentScale.distanceTo(targetScale);

    if (quatDiff < 0.001 && scaleDiff < 0.001) {
        currentMatrix.copy(targetMatrix);
        isAnimating = false;
    } else {
        currentMatrix.compose(currentPos, currentQuat, currentScale);
    }

    cube.matrix.copy(currentMatrix);
    cube.matrixAutoUpdate = false;
}

function updateReflectionAnimation() {
    const speed = CONFIG.animationSpeed * 2;
    reflectionPhase += speed;

    if (reflectionPhase >= 2) {
        reflectionPhase = 2;
        currentMatrix.copy(postReflectionMatrix);
        cube.matrix.copy(currentMatrix);
        cube.matrixAutoUpdate = false;
        isReflecting = false;
        return;
    }

    let scaleFactor;
    if (reflectionPhase < 1) {
        scaleFactor = 1 - reflectionPhase;
    } else {
        scaleFactor = reflectionPhase - 1;
    }

    const n = reflectionNormal;
    const s = scaleFactor;

    const scaleAlongNormal = new THREE.Matrix4();
    scaleAlongNormal.set(
        1 + (s - 1) * n.x * n.x, (s - 1) * n.x * n.y, (s - 1) * n.x * n.z, 0,
        (s - 1) * n.y * n.x, 1 + (s - 1) * n.y * n.y, (s - 1) * n.y * n.z, 0,
        (s - 1) * n.z * n.x, (s - 1) * n.z * n.y, 1 + (s - 1) * n.z * n.z, 0,
        0, 0, 0, 1
    );

    let displayMatrix = new THREE.Matrix4();
    if (reflectionPhase < 1) {
        displayMatrix.copy(scaleAlongNormal);
        displayMatrix.multiply(preReflectionMatrix);
    } else {
        displayMatrix.copy(scaleAlongNormal);
        displayMatrix.multiply(postReflectionMatrix);
    }

    cube.matrix.copy(displayMatrix);
    cube.matrixAutoUpdate = false;
}

function updateInversionAnimation() {
    const speed = CONFIG.animationSpeed * 2;
    inversionPhase += speed;

    if (inversionPhase >= 2) {
        inversionPhase = 2;
        currentMatrix.copy(postInversionMatrix);
        cube.matrix.copy(currentMatrix);
        cube.matrixAutoUpdate = false;
        isInverting = false;
        return;
    }

    let scaleFactor;
    if (inversionPhase < 1) {
        scaleFactor = 1 - inversionPhase;
    } else {
        scaleFactor = inversionPhase - 1;
    }

    const scaleMatrix = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);

    let displayMatrix = new THREE.Matrix4();
    if (inversionPhase < 1) {
        displayMatrix.copy(scaleMatrix);
        displayMatrix.multiply(preInversionMatrix);
    } else {
        displayMatrix.copy(scaleMatrix);
        displayMatrix.multiply(postInversionMatrix);
    }

    cube.matrix.copy(displayMatrix);
    cube.matrixAutoUpdate = false;
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateAnimation();
    updatePermutationDisplay();
    updateOrientationDisplay();
    renderer.render(scene, camera);
}

function setupUI() {
    // Rotation buttons
    document.querySelectorAll('.btn[data-axis]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const axisName = e.target.dataset.axis;
            const angle = parseFloat(e.target.dataset.angle);
            let axis = new THREE.Vector3();

            switch (axisName) {
                case 'x': axis.set(1, 0, 0); break;
                case 'y': axis.set(0, 1, 0); break;
                case 'z': axis.set(0, 0, 1); break;
                case 'diag1': axis.set(1, 1, 1); break;
                case 'diag2': axis.set(-1, 1, 1); break;
                case 'diag3': axis.set(-1, -1, 1); break;
                case 'diag4': axis.set(1, -1, 1); break;
                case 'edge1': axis.set(0, 1, 1); break;
                case 'edge2': axis.set(0, 1, -1); break;
                case 'edge3': axis.set(1, 0, 1); break;
                case 'edge4': axis.set(1, 0, -1); break;
                case 'edge5': axis.set(1, 1, 0); break;
                case 'edge6': axis.set(1, -1, 0); break;
            }
            performRotation(axis, angle);
        });
    });

    // Reflection buttons
    document.querySelectorAll('.btn[data-reflection]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.reflection);
            performReflection(idx);
        });
    });

    // Inversion button
    const invBtn = document.getElementById('inversion-btn');
    if (invBtn) {
        invBtn.addEventListener('click', () => {
            performInversion();
        });
    }

    // Reset buttons
    document.getElementById('reset-cube').addEventListener('click', () => {
        targetMatrix.identity();
        currentMatrix.identity();
        orientation = 1;
        cube.matrix.identity();
        cube.matrixAutoUpdate = false;
        isAnimating = false;
        isReflecting = false;
        isInverting = false;
        reflectionPhase = 0;
        inversionPhase = 0;
        updatePermutationDisplay();
        updateOrientationDisplay();
        if (subgroupBuilder) subgroupBuilder.reset();
    });

    document.getElementById('reset-view').addEventListener('click', () => {
        camera.position.set(4, 4, 6);
        controls.target.set(0, 0, 0);
        controls.update();
    });

    // Speed slider
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    if (speedSlider && speedValue) {
        speedSlider.value = speedToSlider(CONFIG.animationSpeed);
        speedValue.textContent = CONFIG.animationSpeed.toFixed(2);

        speedSlider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            CONFIG.animationSpeed = sliderToSpeed(v);
            speedValue.textContent = CONFIG.animationSpeed.toFixed(2);
        });
    }

    // Toggle axes
    document.getElementById('toggle-axes').addEventListener('change', (e) => {
        axisLines.forEach(line => line.visible = e.target.checked);
    });

    // Toggle diagonals
    document.getElementById('toggle-diagonals').addEventListener('change', (e) => {
        toggleDiagonals(e.target.checked);
    });

    // Toggle edge axes
    document.getElementById('toggle-edge-axes').addEventListener('change', (e) => {
        toggleEdgeAxes(e.target.checked);
    });


    // Toggle mirror planes individually
    document.querySelectorAll('.mirror-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const planeIdx = parseInt(e.target.dataset.plane);
            const plane = mirrorPlanes[planeIdx];
            plane.visible = !plane.visible;

            if (plane.visible) {
                btn.style.backgroundColor = MIRROR_COLORS[planeIdx];
                btn.style.color = '#000';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }
        });
    });
}

function toggleDiagonals(show) {
    if (isOctahedron) {
        octaDiagonalLines.forEach(line => line.visible = show);
        diagonalLines.forEach(line => line.visible = false);
    } else {
        diagonalLines.forEach(line => line.visible = show);
        octaDiagonalLines.forEach(line => line.visible = false);
    }

    const diagonalColors = ['#ff00ff', '#00ffff', '#ffff00', '#76ff03'];
    const buttons = [
        document.querySelector('button[data-axis="diag1"]'),
        document.querySelector('button[data-axis="diag2"]'),
        document.querySelector('button[data-axis="diag3"]'),
        document.querySelector('button[data-axis="diag4"]')
    ];

    buttons.forEach((btn, index) => {
        if (btn) {
            if (show) {
                btn.style.backgroundColor = diagonalColors[index];
                btn.style.color = '#000';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }
        }
    });
}

function toggleEdgeAxes(show) {
    edgeAxisLines.forEach(line => line.visible = show);

    const edgeColors = ['#ff4400', '#00ee66', '#9900ff', '#ffdd00', '#ff0099', '#00ccff'];
    const buttons = [
        document.querySelector('button[data-axis="edge1"]'),
        document.querySelector('button[data-axis="edge2"]'),
        document.querySelector('button[data-axis="edge3"]'),
        document.querySelector('button[data-axis="edge4"]'),
        document.querySelector('button[data-axis="edge5"]'),
        document.querySelector('button[data-axis="edge6"]')
    ];

    buttons.forEach((btn, index) => {
        if (btn) {
            if (show) {
                btn.style.backgroundColor = edgeColors[index];
                btn.style.color = '#000';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }
        }
    });
}

// Permutation Logic
const diagonals = [
    new THREE.Vector3(1, 1, 1).normalize(),
    new THREE.Vector3(-1, 1, 1).normalize(),
    new THREE.Vector3(-1, -1, 1).normalize(),
    new THREE.Vector3(1, -1, 1).normalize()
];

function computePermutationFromMatrix(matrix) {
    let p = [];
    for (let i = 0; i < 4; i++) {
        const v = diagonals[i].clone().applyMatrix4(matrix);
        let closestIndex = -1;
        let maxDot = -1;
        for (let j = 0; j < 4; j++) {
            const dot = Math.abs(v.dot(diagonals[j]));
            if (dot > maxDot) {
                maxDot = dot;
                closestIndex = j;
            }
        }
        p[i] = closestIndex + 1;
    }
    return p;
}

function getCycleNotationHTML(p) {
    let visited = [false, false, false, false];
    let cycles = [];
    const colors = ['#ff00ff', '#00ffff', '#ffff00', '#76ff03'];

    for (let i = 0; i < 4; i++) {
        if (!visited[i]) {
            let cycle = [];
            let x = i;
            while (!visited[x]) {
                visited[x] = true;
                cycle.push(`<span style="color: ${colors[x]}">${x + 1}</span>`);
                x = p[x] - 1;
            }
            if (cycle.length > 1) {
                cycles.push("(" + cycle.join(" ") + ")");
            }
        }
    }

    if (cycles.length === 0) return "e (Identity)";
    return cycles.join("");
}

function updatePermutationDisplay() {
    const p = computePermutationFromMatrix(targetMatrix);
    const text = "Permutation: " + getCycleNotationHTML(p);
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

// === Subgroup Builder Integration ===
window.addEventListener('load', () => {
    const AXIS_MAP = {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1),
        diag1: new THREE.Vector3(1, 1, 1),
        diag2: new THREE.Vector3(-1, 1, 1),
        diag3: new THREE.Vector3(-1, -1, 1),
        diag4: new THREE.Vector3(1, -1, 1),
        edge1: new THREE.Vector3(0, 1, 1),
        edge2: new THREE.Vector3(0, 1, -1),
        edge3: new THREE.Vector3(1, 0, 1),
        edge4: new THREE.Vector3(1, 0, -1),
        edge5: new THREE.Vector3(1, 1, 0),
        edge6: new THREE.Vector3(1, -1, 0)
    };

    // Custom group logic for Oh = S4 x C2
    // Element structure: { p: [1,2,3,4], s: 1 } (where s is 1 or -1)

    const logicOptions = {
        identity: { p: [1, 2, 3, 4], s: 1 },
        serialize: (el) => `${el.s}:${el.p.join(',')}`,
        multiply: (a, b) => ({
            p: CayleyGraph.composePerm(a.p, b.p),
            s: a.s * b.s
        }),
        formatLabel: (el) => {
            const cycle = CayleyGraph.permToCycleString(el.p);
            // Use minus sign and plus sign
            return (el.s === 1 ? '+' : '−') + cycle;
        }
    };

    function permFromRotation(axisVector, angleDegrees) {
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        const m = new THREE.Matrix4();
        m.makeRotationAxis(axisVector.clone().normalize(), angle);
        return { p: computePermutationFromMatrix(m), s: 1 };
    }

    function permFromReflection(normal) {
        const n = normal.clone().normalize();
        const m = new THREE.Matrix4();
        m.set(
            1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
            -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
            -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
            0, 0, 0, 1
        );
        return { p: computePermutationFromMatrix(m), s: -1 };
    }

    function permFromInversion() {
        // Inversion doesn't permute diagonals (since they are unoriented lines)
        // but flips orientation.
        return { p: [1, 2, 3, 4], s: -1 };
    };

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: logicOptions,
        getButtonGenerators: function () {
            const generators = [];

            // Rotation buttons
            document.querySelectorAll('.btn[data-axis]').forEach(btn => {
                const axisName = btn.dataset.axis;
                const angle = parseFloat(btn.dataset.angle);
                const axis = AXIS_MAP[axisName];
                if (!axis) return;
                generators.push({
                    button: btn,
                    label: btn.textContent.trim(),
                    color: btn.style.borderColor || '#38bdf8',
                    permutation: permFromRotation(axis, angle)
                });
            });

            // Reflection buttons
            document.querySelectorAll('.reflection-btn').forEach(btn => {
                const idx = parseInt(btn.dataset.reflection);
                generators.push({
                    button: btn,
                    label: btn.textContent.trim(),
                    color: btn.style.borderColor || '#f472b6',
                    permutation: permFromReflection(MIRROR_PLANES[idx].normal)
                });
            });

            // Inversion button
            const invBtn = document.getElementById('inversion-btn');
            if (invBtn) {
                generators.push({
                    button: invBtn,
                    label: 'i',
                    color: '#ffffff',
                    permutation: permFromInversion()
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

