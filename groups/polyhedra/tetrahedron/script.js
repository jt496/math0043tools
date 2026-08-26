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

// Tetrahedron Full Symmetry Visualisation
// Group: S₄ (symmetric group on 4 elements) - 24 symmetries including reflections

// --- Global Variables ---
let scene, camera, renderer, controls;
let tetrahedron;
let vertexAxisLines = [];
let edgeAxisLines = [];
let mirrorPlanes = [];
let isAnimating = false;
let targetMatrix = new THREE.Matrix4();
let currentMatrix = new THREE.Matrix4();
let subgroupBuilder;

// --- Configuration ---
const CONFIG = {
    size: 2.5,
    colors: {
        faces: [0xff5252, 0x448aff, 0x69f0ae, 0xffd740],
        edges: 0xffffff,
        bg: 0x0f172a
    },
    animationSpeed: 0.15
};

// Tetrahedron vertices (regular tetrahedron centered at origin)
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
const EDGE_AXES = [
    new THREE.Vector3(1, 0, 0).normalize(),
    new THREE.Vector3(0, 1, 0).normalize(),
    new THREE.Vector3(0, 0, 1).normalize()
];

const EDGE_COLORS = ['#ff00ff', '#00ffff', '#76ff03'];

// Mirror planes - each passes through one edge and the midpoint of the opposite edge
// There are 6 such planes
const MIRROR_PLANES = [
    // Plane through edge V1-V2 and midpoint of V3-V4
    { normal: new THREE.Vector3(0, 1, -1).normalize(), color: 0xff0000 },
    // Plane through edge V1-V4 and midpoint of V2-V3
    { normal: new THREE.Vector3(1, 0, -1).normalize(), color: 0xff6600 },
    // Plane through edge V1-V3 and midpoint of V2-V4
    { normal: new THREE.Vector3(1, -1, 0).normalize(), color: 0xffee00 },
    // Plane through edge V2-V4 and midpoint of V1-V3
    { normal: new THREE.Vector3(1, 1, 0).normalize(), color: 0x00ee00 },
    // Plane through edge V2-V3 and midpoint of V1-V4
    { normal: new THREE.Vector3(1, 0, 1).normalize(), color: 0x00aaff },
    // Plane through edge V3-V4 and midpoint of V1-V2
    { normal: new THREE.Vector3(0, 1, 1).normalize(), color: 0xcc00ff }
];

const MIRROR_COLORS = ['#ff0000', '#ff6600', '#ffee00', '#00ee00', '#00aaff', '#cc00ff'];

// Track orientation (determinant of transformation matrix: +1 = proper, -1 = improper)
let orientation = 1;

// Reflection animation state
let isReflecting = false;
let reflectionPhase = 0;  // 0 to 1: squash phase, 1 to 2: expand phase
let reflectionNormal = null;
let preReflectionMatrix = new THREE.Matrix4();
let postReflectionMatrix = new THREE.Matrix4();

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
    console.log("Initializing Tetrahedron Full Symmetry Visualisation...");

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

    // 7. Create Axes and Mirror Planes
    createVertexAxes();
    createEdgeAxes();
    createMirrorPlanes();

    // 8. Initialize matrices
    targetMatrix.identity();
    currentMatrix.identity();

    // 9. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupUI();
    setupRepPanel();
}

// Matrix / character panel (hidden until the toggle is switched on).
// T_d contains reflections as well as rotations, so the panel reads the full
// 4x4 transform rather than a quaternion.
function setupRepPanel() {
    if (!window.RepPanel) return;
    RepPanel.attach({
        groupName: 'S₄',
        getMatrix: () => targetMatrix,
        generators: [
            ...VERTICES.map(v => ({ axis: [v.x, v.y, v.z], angle: 120 })),
            ...EDGE_AXES.map(a => ({ axis: [a.x, a.y, a.z], angle: 180 })),
            ...MIRROR_PLANES.map(p => ({ normal: [p.normal.x, p.normal.y, p.normal.z] }))
        ]
    });
}


function createTetrahedron() {
    tetrahedron = new THREE.Group();

    // Create geometry manually for per-face coloring
    const geometry = new THREE.BufferGeometry();

    // Winding gives outward normals; these track the vertex numbering above.
    const faceIndices = [
        [0, 3, 1], // opposite to vertex 3
        [0, 1, 2], // opposite to vertex 4
        [0, 2, 3], // opposite to vertex 2
        [1, 3, 2]  // opposite to vertex 1
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
    mesh.renderOrder = 1;
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
}

function addVertexLabels() {
    VERTICES.forEach((vertex, idx) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
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

        const pos = vertex.clone().multiplyScalar(1.25);
        sprite.position.copy(pos);
        sprite.scale.set(0.6, 0.6, 0.6);
        tetrahedron.add(sprite);
    });
}

function createVertexAxes() {
    VERTICES.forEach((vertex, idx) => {
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
        line.renderOrder = 0;
        scene.add(line);
        vertexAxisLines.push(line);
    });
}

function createEdgeAxes() {
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
        line.renderOrder = 0;
        line.visible = false;
        scene.add(line);
        edgeAxisLines.push(line);
    });
}

function createMirrorPlanes() {
    MIRROR_PLANES.forEach((plane, idx) => {
        // Create a semi-transparent plane
        const planeSize = CONFIG.size * 2;
        const geometry = new THREE.PlaneGeometry(planeSize, planeSize);
        const material = new THREE.MeshBasicMaterial({
            color: plane.color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Orient the plane to face the normal direction
        mesh.lookAt(plane.normal);

        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        mirrorPlanes.push(mesh);
    });
}

function performRotation(axisVector, angleDegrees) {
    if (isAnimating) return;

    const angle = THREE.MathUtils.degToRad(angleDegrees);
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeRotationAxis(axisVector.normalize(), angle);

    targetMatrix.premultiply(rotationMatrix);
    isAnimating = true;
}

function performReflection(planeIndex) {
    if (isAnimating || isReflecting) return;

    const normal = MIRROR_PLANES[planeIndex].normal.clone();

    // Store the reflection normal and current state
    reflectionNormal = normal;
    preReflectionMatrix.copy(currentMatrix);

    // Reflection matrix: I - 2 * n * n^T
    const reflectionMatrix = new THREE.Matrix4();
    const n = normal;

    reflectionMatrix.set(
        1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
        -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
        -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
        0, 0, 0, 1
    );

    // Calculate the target matrix after reflection
    postReflectionMatrix.copy(currentMatrix);
    postReflectionMatrix.premultiply(reflectionMatrix);
    targetMatrix.copy(postReflectionMatrix);

    orientation *= -1;  // Flip orientation
    reflectionPhase = 0;
    isReflecting = true;
}

function updateAnimation() {
    // Handle reflection animation separately
    if (isReflecting) {
        updateReflectionAnimation();
        return;
    }

    if (!isAnimating) return;

    // Interpolate between current and target matrix
    // Extract position, quaternion, scale from both matrices
    const currentPos = new THREE.Vector3();
    const currentQuat = new THREE.Quaternion();
    const currentScale = new THREE.Vector3();
    currentMatrix.decompose(currentPos, currentQuat, currentScale);

    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    const targetScale = new THREE.Vector3();
    targetMatrix.decompose(targetPos, targetQuat, targetScale);

    // Slerp quaternion and lerp scale
    currentQuat.slerp(targetQuat, CONFIG.animationSpeed);
    currentScale.lerp(targetScale, CONFIG.animationSpeed);

    // Check if close enough
    const quatDiff = currentQuat.angleTo(targetQuat);
    const scaleDiff = currentScale.distanceTo(targetScale);

    if (quatDiff < 0.001 && scaleDiff < 0.001) {
        currentMatrix.copy(targetMatrix);
        isAnimating = false;
    } else {
        currentMatrix.compose(currentPos, currentQuat, currentScale);
    }

    // Apply to tetrahedron
    tetrahedron.matrix.copy(currentMatrix);
    tetrahedron.matrixAutoUpdate = false;
}

function updateReflectionAnimation() {
    // Animate reflection as: squash to plane, then expand on other side
    const speed = CONFIG.animationSpeed * 2;
    reflectionPhase += speed;

    if (reflectionPhase >= 2) {
        // Animation complete
        reflectionPhase = 2;
        currentMatrix.copy(postReflectionMatrix);
        tetrahedron.matrix.copy(currentMatrix);
        tetrahedron.matrixAutoUpdate = false;
        isReflecting = false;
        return;
    }

    // Calculate scale factor along the normal
    // Phase 0-1: scale goes from 1 to 0 (squash)
    // Phase 1-2: scale goes from 0 to -1 then back to 1 (but reflected)
    let scaleFactor;
    if (reflectionPhase < 1) {
        // Squashing phase: 1 -> 0
        scaleFactor = 1 - reflectionPhase;
    } else {
        // Expanding phase: 0 -> 1 (but now reflected)
        scaleFactor = reflectionPhase - 1;
    }

    // Create a matrix that scales along the normal direction
    // Scale matrix along arbitrary axis: use the formula for scaling along a unit vector n
    const n = reflectionNormal;
    const s = scaleFactor;

    // Scaling matrix along direction n by factor s:
    // S = I + (s - 1) * n * n^T
    const scaleAlongNormal = new THREE.Matrix4();
    scaleAlongNormal.set(
        1 + (s - 1) * n.x * n.x, (s - 1) * n.x * n.y, (s - 1) * n.x * n.z, 0,
        (s - 1) * n.y * n.x, 1 + (s - 1) * n.y * n.y, (s - 1) * n.y * n.z, 0,
        (s - 1) * n.z * n.x, (s - 1) * n.z * n.y, 1 + (s - 1) * n.z * n.z, 0,
        0, 0, 0, 1
    );

    // Apply the scale to the appropriate base matrix
    let displayMatrix = new THREE.Matrix4();
    if (reflectionPhase < 1) {
        // Squashing from pre-reflection state
        displayMatrix.copy(preReflectionMatrix);
        displayMatrix.premultiply(scaleAlongNormal);
    } else {
        // Expanding to post-reflection state
        displayMatrix.copy(postReflectionMatrix);
        displayMatrix.premultiply(scaleAlongNormal);
    }

    tetrahedron.matrix.copy(displayMatrix);
    tetrahedron.matrixAutoUpdate = false;
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

    // Reflection buttons
    document.querySelectorAll('.btn[data-reflection]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const refName = e.target.dataset.reflection;
            const idx = parseInt(refName.substring(1)) - 1;
            performReflection(idx);
        });
    });

    // Color the vertex buttons
    document.querySelectorAll('.vertex-btn').forEach((btn, idx) => {
        btn.style.borderColor = VERTEX_COLORS[idx];
        btn.style.borderWidth = '2px';
    });

    // Color the reflection buttons
    document.querySelectorAll('.reflection-btn').forEach((btn, idx) => {
        btn.style.borderColor = MIRROR_COLORS[idx];
        btn.style.borderWidth = '2px';
    });

    // Reset buttons
    document.getElementById('reset-tetra').addEventListener('click', () => {
        targetMatrix.identity();
        currentMatrix.identity();
        orientation = 1;
        tetrahedron.matrix.identity();
        tetrahedron.matrixAutoUpdate = false;
        isAnimating = false;
        isReflecting = false;
        reflectionPhase = 0;
        relationshipPhase = 0;
        updatePermutationDisplay();
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

        document.querySelectorAll('.edge-btn').forEach((btn, idx) => {
            if (e.target.checked) {
                btn.style.backgroundColor = EDGE_COLORS[idx];
                btn.style.color = '#000';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }
        });
    });

    // Toggle mirror planes individually
    document.querySelectorAll('.mirror-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const planeIdx = parseInt(e.target.dataset.plane);
            const plane = mirrorPlanes[planeIdx];
            plane.visible = !plane.visible;

            // Update button appearance
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

// Permutation display
function computePermutationFromMatrix(matrix) {
    let p = [];

    for (let i = 0; i < 4; i++) {
        const v = VERTICES[i].clone().applyMatrix4(matrix);

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
    const p = computePermutationFromMatrix(targetMatrix);
    const text = "Permutation: " + getCycleNotationHTML(p);
    document.getElementById('permutation-overlay').innerHTML = text;
}

// === Subgroup Builder Integration ===
window.addEventListener('load', () => {
    const AXIS_MAP = {
        v1: VERTICES[0],
        v2: VERTICES[1],
        v3: VERTICES[2],
        v4: VERTICES[3],
        e1: EDGE_AXES[0],
        e2: EDGE_AXES[1],
        e3: EDGE_AXES[2]
    };

    function permFromRotation(axisVector, angleDegrees) {
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        const m = new THREE.Matrix4();
        m.makeRotationAxis(axisVector.clone().normalize(), angle);
        return computePermutationFromMatrix(m);
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
        return computePermutationFromMatrix(m);
    }

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: (p) => CayleyGraph.permToCycleString(p)
        },
        getButtonGenerators: function () {
            const generators = [];

            // Rotation buttons (vertex + edge)
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
                const refName = btn.dataset.reflection;
                const idx = parseInt(refName.substring(1)) - 1;
                generators.push({
                    button: btn,
                    label: btn.textContent.trim(),
                    color: btn.style.borderColor || MIRROR_COLORS[idx],
                    permutation: permFromReflection(MIRROR_PLANES[idx].normal)
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

