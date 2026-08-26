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

// Tetrahedron Symmetry Visualisation
// Group: A₄ (alternating group on 4 elements) - 12 rotational symmetries

// --- Global Variables ---
let scene, camera, renderer, controls;
let tetrahedron;
let vertexAxisLines = [];
let edgeAxisLines = [];
let isAnimating = false;
let targetQuaternion = new THREE.Quaternion();
let subgroupBuilder;

// --- Configuration ---
const CONFIG = {
    size: 2.5,
    colors: {
        // Each face gets a different color
        faces: [0xff5252, 0x448aff, 0x69f0ae, 0xffd740], // Red, Blue, Green, Yellow
        edges: 0xffffff,
        bg: 0x0f172a
    },
    animationSpeed: 0.15
};

// Tetrahedron vertices (regular tetrahedron centered at origin)
// Using coordinates where vertices are at alternating corners of a cube
// Labels follow the d4 dice exercise in the lecture notes:
// 1 = (1,1,1), 2 = (1,-1,-1), 3 = (-1,-1,1), 4 = (-1,1,-1).
// If you renumber these, the face index triples below must be renumbered to match.
const VERTICES = [
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(1, -1, -1),
    new THREE.Vector3(-1, -1, 1),
    new THREE.Vector3(-1, 1, -1)
];

// Normalize for unit tetrahedron
const vertexScale = Math.sqrt(3);
VERTICES.forEach(v => v.divideScalar(vertexScale).multiplyScalar(CONFIG.size));

// Vertex colors for buttons and display
const VERTEX_COLORS = ['#ff2200', '#0055ff', '#00ff66', '#ffcc00'];

// Edge midpoint axes (pairs of opposite edges)
// Edge 1: connects V1-V2 and V3-V4 (opposite edges)
// Edge 2: connects V1-V4 and V2-V3 (opposite edges)
// Edge 3: connects V1-V3 and V2-V4 (opposite edges)
const EDGE_AXES = [
    new THREE.Vector3(1, 0, 0).normalize(),  // midpoint of 1-2 to midpoint of 3-4
    new THREE.Vector3(0, 1, 0).normalize(),  // midpoint of 1-4 to midpoint of 2-3
    new THREE.Vector3(0, 0, 1).normalize()   // midpoint of 1-3 to midpoint of 2-4
];

const EDGE_COLORS = ['#ff00ff', '#00ffff', '#76ff03'];

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
    console.log("Initializing Tetrahedron Symmetry Visualisation...");

    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(5, 4, 7);

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
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // 6. Create Tetrahedron
    createTetrahedron();

    // 7. Create Axes
    createVertexAxes();
    createEdgeAxes();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupUI();
    setupRepPanel();
}

// Matrix / character panel (hidden until the toggle is switched on).
// The vertex coordinates above are the ones used in the d4 dice exercise in the
// notes, so every rotation here is a signed permutation matrix and displays exactly.
function setupRepPanel() {
    if (!window.RepPanel) return;
    RepPanel.attach({
        groupName: 'A₄',
        getQuaternion: () => targetQuaternion,
        generators: [
            ...VERTICES.map(v => ({ axis: [v.x, v.y, v.z], angle: 120 })),
            ...EDGE_AXES.map(a => ({ axis: [a.x, a.y, a.z], angle: 180 }))
        ]
    });
}

function createTetrahedron() {
    tetrahedron = new THREE.Group();

    // Create geometry manually for per-face coloring
    const geometry = new THREE.BufferGeometry();

    // Face definitions (vertex indices). The winding gives outward normals, so
    // these triples track the vertex numbering above rather than being reordered.
    const faceIndices = [
        [0, 3, 1], // Face opposite to vertex 3
        [0, 1, 2], // Face opposite to vertex 4
        [0, 2, 3], // Face opposite to vertex 2
        [1, 3, 2]  // Face opposite to vertex 1
    ];

    const positions = [];
    const colors = [];

    faceIndices.forEach((face, faceIdx) => {
        const color = new THREE.Color(CONFIG.colors.faces[faceIdx]);
        face.forEach(vertIdx => {
            const v = VERTICES[vertIdx];
            positions.push(v.x, v.y, v.z);
            colors.push(color.r, color.g, color.b);
        });
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.1,
        roughness: 0.5,
        clearcoat: 0.1,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;  // Render faces after axes
    tetrahedron.add(mesh);

    // Add edges
    const edgePositions = [];
    const edgePairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    edgePairs.forEach(pair => {
        edgePositions.push(VERTICES[pair[0]].x, VERTICES[pair[0]].y, VERTICES[pair[0]].z);
        edgePositions.push(VERTICES[pair[1]].x, VERTICES[pair[1]].y, VERTICES[pair[1]].z);
    });

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: CONFIG.colors.edges, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    tetrahedron.add(edges);

    // Add vertex labels
    addVertexLabels();

    scene.add(tetrahedron);
    targetQuaternion.copy(tetrahedron.quaternion);
}

function addVertexLabels() {
    VERTICES.forEach((vertex, idx) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Canvas is transparent by default, no need to fill
        ctx.font = 'bold 96px sans-serif';
        ctx.fillStyle = VERTEX_COLORS[idx];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((idx + 1).toString(), 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.premultiplyAlpha = true;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.1
        });
        const sprite = new THREE.Sprite(material);

        // Position slightly outside the vertex
        const pos = vertex.clone().multiplyScalar(1.25);
        sprite.position.copy(pos);
        sprite.scale.set(0.6, 0.6, 0.6);
        tetrahedron.add(sprite);
    });
}

function createVertexAxes() {
    // Each vertex axis goes from vertex through the centroid of opposite face
    // Lines go through the whole tetrahedron (from one side to the other)

    VERTICES.forEach((vertex, idx) => {
        // Axis from vertex through center and out the opposite side
        const direction = vertex.clone().normalize();
        const start = direction.clone().multiplyScalar(-CONFIG.size * 1.2);
        const end = direction.clone().multiplyScalar(CONFIG.size * 1.2);

        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const color = new THREE.Color(VERTEX_COLORS[idx]);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 0;  // Render before transparent faces
        scene.add(line);
        vertexAxisLines.push(line);
    });
}

function createEdgeAxes() {
    // Three axes through midpoints of opposite edges
    EDGE_AXES.forEach((axis, idx) => {
        const start = axis.clone().multiplyScalar(-CONFIG.size * 1.2);
        const end = axis.clone().multiplyScalar(CONFIG.size * 1.2);

        const points = [start, end];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const color = new THREE.Color(EDGE_COLORS[idx]);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 0;  // Render before transparent faces
        line.visible = false;  // Hidden by default
        scene.add(line);
        edgeAxisLines.push(line);
    });
}

function createAxisLabel(text, position, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 64, 64);
    ctx.font = 'bold 36px sans-serif';
    const hexColor = '#' + new THREE.Color(color).getHexString();
    ctx.fillStyle = hexColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(0.8, 0.8, 0.8);
    scene.add(sprite);
    return sprite;
}

function performRotation(axisVector, angleDegrees) {
    if (isAnimating) return;

    const angle = THREE.MathUtils.degToRad(angleDegrees);
    const rotationQuaternion = new THREE.Quaternion();

    rotationQuaternion.setFromAxisAngle(axisVector.normalize(), angle);

    targetQuaternion.premultiply(rotationQuaternion);
    isAnimating = true;
}

function updateAnimation() {
    if (!isAnimating) return;

    if (tetrahedron.quaternion.angleTo(targetQuaternion) < 0.001) {
        tetrahedron.quaternion.copy(targetQuaternion);
        isAnimating = false;
    } else {
        tetrahedron.quaternion.slerp(targetQuaternion, CONFIG.animationSpeed);
    }
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
                case 'v1': axis.copy(VERTICES[0]).normalize(); break;
                case 'v2': axis.copy(VERTICES[1]).normalize(); break;
                case 'v3': axis.copy(VERTICES[2]).normalize(); break;
                case 'v4': axis.copy(VERTICES[3]).normalize(); break;
                case 'e1': axis.copy(EDGE_AXES[0]); break;
                case 'e2': axis.copy(EDGE_AXES[1]); break;
                case 'e3': axis.copy(EDGE_AXES[2]); break;
            }
            performRotation(axis, angle);
        });
    });

    // Color the vertex buttons
    document.querySelectorAll('.vertex-btn').forEach((btn, idx) => {
        btn.style.borderColor = VERTEX_COLORS[idx];
        btn.style.borderWidth = '2px';
    });

    // Reset buttons
    document.getElementById('reset-tetra').addEventListener('click', () => {
        targetQuaternion.set(0, 0, 0, 1);
        isAnimating = true;
        if (subgroupBuilder) subgroupBuilder.reset();
    });

    document.getElementById('reset-view').addEventListener('click', () => {
        camera.position.set(5, 4, 7);
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
        vertexAxisLines.forEach(line => line.visible = e.target.checked);
    });

    document.getElementById('toggle-edge-axes').addEventListener('change', (e) => {
        edgeAxisLines.forEach(line => line.visible = e.target.checked);

        // Also update edge button colors
        document.querySelectorAll('.edge-btn').forEach((btn, idx) => {
            if (e.target.checked) {
                btn.style.backgroundColor = EDGE_COLORS[idx];
                btn.style.color = '#000';
                // btn.style.borderColor = EDGE_COLORS[idx];
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                // btn.style.borderColor = '';
            }
        });
    });
}

// Permutation display
function computePermutationFromQuat(q) {
    // Track where each original vertex ends up
    let p = [];

    for (let i = 0; i < 4; i++) {
        // Apply rotation to original vertex position
        const v = VERTICES[i].clone().applyQuaternion(q);

        // Find which original vertex it's closest to
        let closestIndex = -1;
        let minDist = Infinity;

        for (let j = 0; j < 4; j++) {
            const dist = v.distanceTo(VERTICES[j]);
            if (dist < minDist) {
                minDist = dist;
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

    for (let i = 0; i < 4; i++) {
        if (!visited[i]) {
            let cycle = [];
            let x = i;
            while (!visited[x]) {
                visited[x] = true;
                cycle.push(`<span style="color: ${VERTEX_COLORS[x]}">${x + 1}</span>`);
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
    const p = computePermutationFromQuat(targetQuaternion);
    const text = "Permutation: " + getCycleNotationHTML(p);
    document.getElementById('permutation-overlay').innerHTML = text;
}

// === Subgroup Builder Integration ===
window.addEventListener('load', () => {
    const AXIS_MAP = {
        v1: { axis: VERTICES[0], quat: true },
        v2: { axis: VERTICES[1], quat: true },
        v3: { axis: VERTICES[2], quat: true },
        v4: { axis: VERTICES[3], quat: true },
        e1: { axis: EDGE_AXES[0], quat: true },
        e2: { axis: EDGE_AXES[1], quat: true },
        e3: { axis: EDGE_AXES[2], quat: true }
    };

    function permFromRotation(axisVector, angleDegrees) {
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        const q = new THREE.Quaternion();
        q.setFromAxisAngle(axisVector.clone().normalize(), angle);
        return computePermutationFromQuat(q);
    }

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: (p) => CayleyGraph.permToCycleString(p)
        },
        getButtonGenerators: function () {
            const generators = [];
            document.querySelectorAll('.btn[data-axis]').forEach(btn => {
                const axisName = btn.dataset.axis;
                const angle = parseFloat(btn.dataset.angle);
                const entry = AXIS_MAP[axisName];
                if (!entry) return;
                generators.push({
                    button: btn,
                    label: btn.textContent.trim(),
                    color: btn.style.borderColor || '#38bdf8',
                    permutation: permFromRotation(entry.axis, angle)
                });
            });
            return generators;
        },
        canvasContainer: document.getElementById('canvas-container'),
        cayleyCanvas: document.getElementById('cayley-canvas'),
        orderDisplay: document.getElementById('generator-selector'),
        toggleButton: document.getElementById('subgroup-builder-btn')
    });
});

