
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

// === Configuration ===
const CONFIG = {
    n: 3,
    polygonColor: 0x60a5fa,
    polygonOpacity: 0.9,
    edgeColor: 0xffffff,
    vertexColor: 0xf472b6,
    highlightColor: 0xfbbf24,
    bgColor: 0x0f172a, // Dark blue/slate background
    animationSpeed: 0.15 // Slerp factor
};

let polygonGroup;
let staticPositionLabels;
let vertexLabels = [];
let staticLabels = [];
let isAnimating = false;
let targetQuaternion = new THREE.Quaternion();
let currentPermutation = []; // Tracks where each vertex is
let overlayCanvas, overlayCtx;
let scene, camera, renderer, controls; // Properly declare these variables!
let freeCameraEnabled = false;
let subgroupBuilder;
const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 0, 14);

// State for logic
let currentN = 3;

// === Initialization ===
window.addEventListener('load', init);

function init() {
    initThree();
    setupUI();
    setN(3);
    animate();
}

function initThree() {
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 14); // Top-down view
    camera.up.set(0, 1, 0); // Y is up on screen
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Controls - Always create enabled, but disable interaction features by default
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // Disable all interaction by default (will be enabled via toggle)
    controls.enableRotate = false;
    controls.enableZoom = true;
    controls.enablePan = false;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, -10, 10);
    scene.add(dirLight);

    // Groups
    polygonGroup = new THREE.Group();
    scene.add(polygonGroup);

    staticPositionLabels = new THREE.Group();
    scene.add(staticPositionLabels);

    // Overlay Canvas
    overlayCanvas = document.getElementById('overlay-canvas');
    overlayCtx = overlayCanvas.getContext('2d');

    // Resize handler
    window.addEventListener('resize', onWindowResize);
    onWindowResize(); // Force initial resize
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);

    // Resize overlay
    overlayCanvas.width = container.clientWidth;
    overlayCanvas.height = container.clientHeight;
}

// === clear and recreate scene objects ===
function setN(n) {
    currentN = n;

    // Update UI text
    document.getElementById('n-display').textContent = n;
    document.getElementById('title-n').textContent = n;
    document.getElementById('rotation-order').textContent = n;
    document.getElementById('rotation-divisor').textContent = n;
    document.getElementById('rotation-power').max = n - 1;

    updateActiveNButton(n);

    // Reset 3D Objects
    recreatePolygon(n);
    recreateStaticLabels(n);

    // Reset transforms
    polygonGroup.quaternion.identity();
    virtualTargetQuaternion.set(0, 0, 0, 1);
    isAnimating = false;

    resetPermutation();

    if (subgroupBuilder) {
        subgroupBuilder.exit();
    }
}

function recreatePolygon(n) {
    // Remove old
    while (polygonGroup.children.length > 0) {
        polygonGroup.remove(polygonGroup.children[0]);
    }
    vertexLabels = [];

    // Create a flat n-gon (Circle with n segments)
    const radius = 2.4;
    const geometry = new THREE.CircleGeometry(radius, n);

    // Materials
    const material = new THREE.MeshPhysicalMaterial({
        color: CONFIG.polygonColor,
        metalness: 0.1,
        roughness: 0.2,
        clearcoat: 0.5,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    polygonGroup.add(mesh);

    // Edges
    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({ color: CONFIG.edgeColor, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    polygonGroup.add(edges);

    // Vertex Labels
    for (let i = 0; i < n; i++) {
        // CircleGeometry vertices are at 0, 2pi/n... CCW.
        const theta = (i * 2 * Math.PI) / n;

        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        const z = 0.05;

        // Label i+1
        const label = createLabel((i + 1).toString());

        // Respect current visibility toggle
        const toggle = document.getElementById('toggle-labels');
        if (toggle) {
            label.visible = toggle.checked;
        }

        label.position.set(x, y, z);
        polygonGroup.add(label);
        vertexLabels.push({
            mesh: label,
            originalIndex: i, // 0-based index
            theta: theta
        });
    }
}

function createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Draw background circle for better visibility
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // semi-transparent background
    ctx.fill();

    ctx.font = 'bold 80px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbbf24'; // text color
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.75, 0.75, 0.75);
    return sprite;
}

function createStaticLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Draw background circle for better visibility (more transparent)
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // more transparent background
    ctx.fill();

    ctx.font = 'bold 80px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 68, 68, 0.4)'; // fainter red text color (40% opacity)
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.75, 0.75, 0.75);
    return sprite;
}

function recreateStaticLabels(n) {
    // Remove old static labels
    while (staticPositionLabels.children.length > 0) {
        staticPositionLabels.remove(staticPositionLabels.children[0]);
    }
    staticLabels = [];

    const radius = 3.2; // Further out than the polygon vertices

    // Check current toggle state
    const toggle = document.getElementById('toggle-labels');
    const isVisible = toggle ? toggle.checked : false;

    for (let i = 0; i < n; i++) {
        const theta = (i * 2 * Math.PI) / n;

        const x = radius * Math.cos(theta);
        const y = radius * Math.sin(theta);
        const z = 0.05;

        // Label i+1
        const label = createStaticLabel((i + 1).toString());
        label.visible = isVisible; // Respect current toggle state
        label.position.set(x, y, z);
        staticPositionLabels.add(label);
        staticLabels.push(label);
    }
}

// === Animation Logic ===

function animate() {
    requestAnimationFrame(animate);

    // Always update controls (needed for damping)
    if (controls) {
        controls.update();
    }

    if (isAnimating) {
        // Linear-ish interpolation (Ease out)
        const diff = animTargetAngle - animCurrentAngle;
        let step = diff * CONFIG.animationSpeed;

        // Minimum step to ensure finish
        const minStep = 0.005 * (diff > 0 ? 1 : -1);

        // Use minStep if calculated step is too small
        if (Math.abs(step) < Math.abs(minStep)) step = minStep;

        // Prevent overshoot: if step is larger than diff, just take diff
        if (Math.abs(step) > Math.abs(diff)) {
            animCurrentAngle = animTargetAngle;
            isAnimating = false;
        } else {
            animCurrentAngle += step;

            // Double check snap if extremely close (redundant but safe)
            if (Math.abs(animTargetAngle - animCurrentAngle) < 0.001) {
                animCurrentAngle = animTargetAngle;
                isAnimating = false;
            }
        }

        // Apply rotation: Start * Rotation(axis, currentAngle)
        const deltaQ = new THREE.Quaternion();
        deltaQ.setFromAxisAngle(animAxis, animCurrentAngle);

        polygonGroup.quaternion.copy(animStartQuat).premultiply(deltaQ);
    }

    renderer.render(scene, camera);
    drawPermutation();
}

function drawPermutation() {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const toggle = document.getElementById('toggle-perm');
    if (!toggle || !toggle.checked) return;

    // Config for text
    overlayCtx.font = '60px Outfit, sans-serif';
    overlayCtx.fillStyle = '#fbbf24'; // Matches highlight/labels
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'top';

    const text = document.getElementById('perm-text').textContent;
    // Draw top center
    overlayCtx.fillText(`${text}`, overlayCanvas.width / 2, 35);
}


// === UI Logic ===

function setupUI() {
    // N Buttons
    document.querySelectorAll('.n-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const n = parseInt(e.target.dataset.n);
            setN(n);
        });
    });

    document.getElementById('set-custom-n').addEventListener('click', () => {
        const val = parseInt(document.getElementById('custom-n-input').value);
        if (val >= 3 && val <= 24) setN(val);
    });

    // Rotation Buttons
    document.getElementById('rotate-cw').addEventListener('click', () => {
        applyRotation(1); // r
    });
    document.getElementById('rotate-ccw').addEventListener('click', () => {
        applyRotation(-1); // r inverse
    });

    document.getElementById('apply-rotation').addEventListener('click', () => {
        const k = parseInt(document.getElementById('rotation-power').value) || 1;
        applyRotation(k);
    });

    // Reset Orientation
    document.getElementById('reset-shape').addEventListener('click', () => {
        setN(currentN); // Simply look consistent
        // Reset camera zoom
        camera.position.copy(DEFAULT_CAMERA_POS);
        if (controls) controls.update();
    });

    // Toggles
    const toggleLabels = document.getElementById('toggle-labels');
    toggleLabels.addEventListener('change', (e) => {
        const isVisible = e.target.checked;
        vertexLabels.forEach(item => {
            if (item.mesh) item.mesh.visible = isVisible;
        });
        staticLabels.forEach(label => {
            if (label) label.visible = isVisible;
        });
    });

    const togglePerm = document.getElementById('toggle-perm');
    if (togglePerm) {
        togglePerm.addEventListener('change', () => {
            drawPermutation();
        });
    }

    // Speed slider
    const slider = document.getElementById('speed-slider');
    const display = document.getElementById('speed-value');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            CONFIG.animationSpeed = 0.01 + (v / 100) * 0.29; // map 1-100 to 0.01-0.3
            if (display) display.textContent = CONFIG.animationSpeed.toFixed(2);
        });
    }
}

function updateActiveNButton(n) {
    document.querySelectorAll('.n-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.n) === n);
    });
    document.getElementById('custom-n-input').value = n;
}

// Custom Animation State
let animStartQuat = new THREE.Quaternion();
let animAxis = new THREE.Vector3(0, 0, 1);
let animTargetAngle = 0;
let animCurrentAngle = 0;
let virtualTargetQuaternion = new THREE.Quaternion(); // For permutation calc

// === Transform Operations ===

function applyRotation(k) {
    // Determine the axis and angle
    const angle = k * (2 * Math.PI / currentN);
    const axis = new THREE.Vector3(0, 0, 1);

    startAnimation(axis, angle);

    // Update virtual target for permutation
    const rotQuat = new THREE.Quaternion();
    rotQuat.setFromAxisAngle(axis, angle);
    virtualTargetQuaternion.premultiply(rotQuat);
    updatePermutationDisplayPseudo();
}

function startAnimation(axis, angle) {
    // If already animating, commit the current state
    if (isAnimating) {
        // Snap to current visual state as new start
        animStartQuat.copy(polygonGroup.quaternion);
    } else {
        animStartQuat.copy(polygonGroup.quaternion);
    }

    animAxis.copy(axis);
    animTargetAngle = angle;
    animCurrentAngle = 0;
    isAnimating = true;
}

// === Permutation Calculation ===

function resetPermutation() {
    currentPermutation = [];
    for (let i = 0; i < currentN; i++) currentPermutation[i] = i + 1;
    document.getElementById('perm-text').textContent = "e (Identity)";

    // Reset virtual tracker
    virtualTargetQuaternion.identity();
}

function updatePermutationDisplayPseudo() {
    const n = currentN;
    const initialPositions = [];
    for (let i = 0; i < n; i++) {
        const theta = (i * 2 * Math.PI) / n;
        initialPositions.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
    }

    const p = [];

    for (let i = 0; i < n; i++) {
        const v = initialPositions[i].clone();
        // Use virtualTargetQuaternion to predict where it lands
        v.applyQuaternion(virtualTargetQuaternion);

        let maxDot = -1.0;
        let bestJ = 0;

        for (let j = 0; j < n; j++) {
            const vFlat = new THREE.Vector3(v.x, v.y, 0).normalize();
            const slot = initialPositions[j];
            const dot = vFlat.dot(slot);
            if (dot > maxDot) {
                maxDot = dot;
                bestJ = j;
            }
        }
        p[i] = bestJ;
    }
    const cycles = getCycles(p);
    document.getElementById('perm-text').textContent = cycles;
}


function getCycles(map) {
    // map[i] = destination of i
    const n = map.length;
    let visited = new Array(n).fill(false);
    let cycles = [];

    for (let i = 0; i < n; i++) {
        if (!visited[i]) {
            let cycle = [];
            let curr = i;
            while (!visited[curr]) {
                visited[curr] = true;
                cycle.push(curr + 1);
                curr = map[curr];
            }
            if (cycle.length > 1) {
                cycles.push("(" + cycle.join(" ") + ")");
            }
        }
    }

    if (cycles.length === 0) return "e (Identity)";
    return cycles.join("");
}

// === Subgroup Builder Integration ===
window.addEventListener('load', () => {

    // Cayley Table UI
    const modal = document.getElementById('cayley-modal');
    const closeBtn = document.querySelector('.modal-close');
    const tableContainer = document.getElementById('cayley-table-container');
    const modalFooter = document.getElementById('modal-footer');
    const checkBtn = document.getElementById('check-btn');
    const revealBtn = document.getElementById('reveal-btn');
    const feedbackMsg = document.getElementById('feedback-msg');

    let currentCheckFn = null;
    let currentRevealFn = null;

    function openTable(mode) {
        document.getElementById('modal-title').innerHTML = `Cayley Table for C<sub>${currentN}</sub>`;
        modal.style.display = 'flex';
        modalFooter.style.display = mode === 'test' ? 'flex' : 'none';
        feedbackMsg.textContent = '';
        checkBtn.disabled = false; // Reset check button state

        // Generate Group Elements for C_n
        // Generator r:
        const n = currentN;
        const r = [];
        for (let i = 1; i <= n; i++) r.push((i % n) + 1);

        // Generate subgroup <r> => C_n
        const { elements } = CayleyGraph.generateSubgroup([r]);

        // Sort elements by power of r for nicer display?
        // generateSubgroup BFS usually gives I, r, r^2... naturally for cyclic group

        // Helper to format labels
        const formatLabel = (el, idx) => {
            if (idx === 0) return "e";
            if (idx === 1) return "r";
            return `r<sup>${idx}</sup>`;
        };

        const { table } = CayleyGraph.generateCayleyTable(elements);

        const { checkAnswers, revealAnswers } = CayleyGraph.renderCayleyTable(tableContainer, elements, table, {
            mode: mode,
            formatLabel: formatLabel
        });

        currentCheckFn = checkAnswers;
        currentRevealFn = revealAnswers;
    }

    document.getElementById('show-table-btn').addEventListener('click', () => openTable('view'));
    document.getElementById('test-table-btn').addEventListener('click', () => openTable('test'));

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    checkBtn.addEventListener('click', () => {
        if (currentCheckFn) {
            const { total, correct } = currentCheckFn();
            if (correct === total) {
                feedbackMsg.textContent = "All correct! Great job!";
                feedbackMsg.className = "feedback-msg success";
            } else {
                feedbackMsg.textContent = `${correct} / ${total} correct. Keep trying!`;
                feedbackMsg.className = "feedback-msg error";
            }
        }
    });

    revealBtn.addEventListener('click', () => {
        if (currentRevealFn) {
            const { total, correct } = currentRevealFn();
            feedbackMsg.textContent = `Answers revealed. You got ${correct} / ${total} correct.`;
            feedbackMsg.className = "feedback-msg";
            checkBtn.disabled = true; // Disable check button after reveal
        }
    });

    // Subgroup Builder
    function permFromRotation(k) {
        const n = currentN;
        const p = [];
        for (let i = 0; i < n; i++) {
            let dest = (i + k + n) % n;
            p.push(dest + 1);
        }
        return p;
    }

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: function (p) {
                const k = (p[0] - 1 + currentN) % currentN;
                if (k === 0) return "e";
                if (k === 1) return "r";
                return `r<sup>${k}</sup>`;
            }
        },
        getButtonGenerators: function () {
            const generators = [];

            // Add Rotation buttons
            const cwBtn = document.getElementById('rotate-cw');
            if (cwBtn) {
                generators.push({
                    button: cwBtn,
                    label: 'r',
                    color: '#38bdf8',
                    permutation: permFromRotation(1)
                });
            }

            const ccwBtn = document.getElementById('rotate-ccw');
            if (ccwBtn) {
                generators.push({
                    button: ccwBtn,
                    label: 'r⁻¹',
                    color: '#4ade80',
                    permutation: permFromRotation(-1)
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

