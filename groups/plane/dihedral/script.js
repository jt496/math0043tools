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
// Dihedral polygon animation
// === Configuration ===
const CONFIG = {
    n: 3,
    polygonColor: 0x60a5fa,
    polygonOpacity: 0.9,
    edgeColor: 0xffffff,
    vertexColor: 0xf472b6,
    axisColor: 0xffffff,
    highlightColor: 0xfbbf24,
    bgColor: 0x0f172a, // Dark blue/slate background
    animationSpeed: 0.15 // Slerp factor
};

let polygonGroup, axesGroup;
let axesLines = [];
let vertexLabels = [];
let staticLabels = [];
let staticPositionLabels;
let isAnimating = false;
let targetQuaternion = new THREE.Quaternion();
let currentPermutation = []; // Tracks where each vertex is
let overlayCanvas, overlayCtx;
let scene, camera, renderer, controls; // Correctly scoping Three.js globals
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
    // scene.background = new THREE.Color(CONFIG.bgColor); // Use CSS background for gradient

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

    axesGroup = new THREE.Group();
    scene.add(axesGroup);

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
    updateReflectionButtons();

    // Reset 3D Objects
    recreatePolygon(n);
    recreateAxes(n);
    recreateStaticLabels(n);

    // Reset transforms
    polygonGroup.quaternion.identity();
    virtualTargetQuaternion.set(0, 0, 0, 1);
    isAnimating = false;

    resetPermutation();
    commandQueue = [];
    const display = document.getElementById('word-progress-display');
    if (display) display.innerHTML = '';

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
    // Create a flat n-gon (Circle with n segments)
    const radius = 2.4;
    const geometry = new THREE.CircleGeometry(radius, n);
    // Rotate geometry so it flat on XY plane? 
    // CircleGeometry is created in XY plane by default (normal +Z).
    // But it starts with vertex at +X (0 rad).
    // Our logic assumed +X is vertex 1. That matches.

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
        // Slightly offset Z so labels don't z-fight if we view from top, 
        // though we are in 3D so it's fine.
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

        // Removed sphere creation
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

function recreateAxes(n) {
    while (axesGroup.children.length > 0) {
        axesGroup.remove(axesGroup.children[0]);
    }
    axesLines = [];

    const radius = 4.5; // Longer than polygon

    for (let i = 0; i < n; i++) {
        // Axis angles
        // For D_n, axes are at k*pi/n.
        // There are n axes.
        // Axis 0 is at angle 0?
        // Standard convention: Axis 1 passes through vertex 1? 
        // Or if n is even, bisects edges?
        // Let's align with our vertices.
        // If Vertex 1 is at theta=0.
        // Axis 1 should be at theta=0?
        // Let's distribute n axes evenly from 0 to pi (or 2pi).
        // Angle of axis k: k * PI / n.
        // Wait, for Triangle (n=3), axes are at 90, 210, 330?
        // If vertex 1 is at 0 degrees (X axis).
        // Then axis 1 is X axis (0 deg).
        // For odd n: axes pass through vertices.
        // For even n: n/2 axes through vertices, n/2 through edge midpoints.

        // Simpler: The set of reflection axes is generated by rotations of the first axis.
        // Axis i: Angle = i * PI / n.

        const angle = i * Math.PI / n;

        // We draw a line from -R to +R through center at this angle
        const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);

        const p1 = dir.clone().multiplyScalar(radius);
        const p2 = dir.clone().multiplyScalar(-radius);

        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = new THREE.LineDashedMaterial({
            color: CONFIG.axisColor,
            dashSize: 0.1,
            gapSize: 0.07,
            opacity: 0.5,
            transparent: true,
            depthTest: false
        });

        const line = new THREE.Line(geo, mat);
        line.computeLineDistances(); // Required for dashed lines
        axesGroup.add(line);

        const labelPos = p1.clone().multiplyScalar(1.1);
        // Pass the index for subscript rendering
        const labelSprite = createLabelText(i + 1);
        labelSprite.position.copy(labelPos);
        labelSprite.scale.set(0.8, 0.8, 0.8);
        axesGroup.add(labelSprite);
    }
}

function createLabelText(index) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1edc1eff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw 's'
    ctx.font = '40px sans-serif';
    ctx.fillText('s', 50, 28);

    // Draw subscript index
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(index.toString(), 70, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    return sprite;
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
            processQueue();
        } else {
            animCurrentAngle += step;

            // Double check snap if extremely close (redundant but safe)
            if (Math.abs(animTargetAngle - animCurrentAngle) < 0.001) {
                animCurrentAngle = animTargetAngle;
                isAnimating = false;
                processQueue();
            }
        }

        // Apply rotation: Start * Rotation(axis, currentAngle)
        // Order: We want to rotate the object relative to its STARTing orientation by the new global axis angle.
        // If axis is GLOBAL Z, we PREMULTIPLY start. 
        // If axis is GLOBAL XY (reflection), we also PREMULTIPLY start.

        const deltaQ = new THREE.Quaternion();
        deltaQ.setFromAxisAngle(animAxis, animCurrentAngle);
        polygonGroup.quaternion.copy(animStartQuat).premultiply(deltaQ);
    } else if (commandQueue.length > 0 && !isQueuePaused) {
        // If not animating and queue not empty, start next
        processQueue();
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
    const toggleAxes = document.getElementById('toggle-axes');
    toggleAxes.addEventListener('change', (e) => {
        axesGroup.visible = e.target.checked;
    });
    // Initialize Axes Visibility
    if (axesGroup) axesGroup.visible = toggleAxes.checked;

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
    // Vertex labels visibility is handled in recreatePolygon based on checked state

    const togglePerm = document.getElementById('toggle-perm');
    if (togglePerm) {
        togglePerm.addEventListener('change', () => {
            drawPermutation();
        });
    }

    // Free Camera toggle
    // const toggleCamera = document.getElementById('toggle-camera');
    // if (toggleCamera) {
    //     toggleCamera.addEventListener('change', (e) => {
    //         freeCameraEnabled = e.target.checked;
    //         controls.enableRotate = freeCameraEnabled;
    //         controls.enableZoom = freeCameraEnabled;
    //         controls.enablePan = freeCameraEnabled;
    //         if (!freeCameraEnabled) {
    //             // Reset camera to default position
    //             camera.position.copy(DEFAULT_CAMERA_POS);
    //             camera.up.set(0, 1, 0);
    //             camera.lookAt(0, 0, 0);
    //             controls.target.set(0, 0, 0);
    //         }
    //     });
    // }

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

    // Arbitrary Word Input
    const applyWordBtn = document.getElementById('apply-word');
    if (applyWordBtn) {
        applyWordBtn.addEventListener('click', applyGroupWord);
    }

    const wordInput = document.getElementById('group-word-input');
    if (wordInput) {
        wordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') applyGroupWord();
        });
    }
}

function updateActiveNButton(n) {
    document.querySelectorAll('.n-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.n) === n);
    });
    document.getElementById('custom-n-input').value = n;
}

function updateReflectionButtons() {
    const container = document.getElementById('reflection-buttons');
    if (!container) return;
    container.innerHTML = '';

    // Generate reflection buttons s_1 to s_n
    // Order them logically? 1..n
    for (let i = 0; i < currentN; i++) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.innerHTML = `s<sub>${i + 1}</sub>`;
        btn.addEventListener('click', () => {
            applyReflection(i);
        });
        container.appendChild(btn);
    }
}


// Custom Animation State
let animStartQuat = new THREE.Quaternion();
let animAxis = new THREE.Vector3(0, 0, 1);
let animTargetAngle = 0;
let animCurrentAngle = 0;
let virtualTargetQuaternion = new THREE.Quaternion(); // For permutation calc
let commandQueue = [];
let currentActiveToken = null;
let isQueuePaused = false;

// ... initialization code continues ...

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

function applyReflection(axisIndex) {
    const axisAngle = axisIndex * Math.PI / currentN;
    const axis = new THREE.Vector3(Math.cos(axisAngle), Math.sin(axisAngle), 0);
    const angle = Math.PI; // 180 degrees

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

function applyGroupWord() {
    const input = document.getElementById('group-word-input');
    const display = document.getElementById('word-progress-display');
    const errorDisplay = document.getElementById('word-error');
    if (!input || !display) return;
    const word = input.value.trim().toLowerCase();

    // Clear previous UI state
    display.innerHTML = '';
    if (errorDisplay) {
        errorDisplay.style.display = 'none';
        errorDisplay.textContent = '';
    }
    commandQueue = [];

    if (!word) return;

    // Parse the word into an AST
    let pos = 0;

    function parseError(msg) {
        if (errorDisplay) {
            errorDisplay.textContent = msg;
            errorDisplay.style.display = 'block';
        }
        display.innerHTML = '';
        commandQueue = [];
    }

    function parseGroup() {
        const nodes = [];
        while (pos < word.length && word[pos] !== ')') {
            if (/\s/.test(word[pos])) {
                pos++;
                continue;
            }

            if (word[pos] === '(') {
                pos++; // skip '('
                const innerNodes = parseGroup();
                if (pos >= word.length || word[pos] !== ')') {
                    parseError("Matched closing parenthesis not found.");
                    return null;
                }
                pos++; // skip ')'

                let power = 1;
                if (pos < word.length && word[pos] === '^') {
                    pos++;
                    let powerStr = '';
                    if (word[pos] === '-') {
                        powerStr += '-';
                        pos++;
                    }
                    while (pos < word.length && /\d/.test(word[pos])) {
                        powerStr += word[pos];
                        pos++;
                    }
                    if (powerStr === '-' || powerStr === '') {
                        parseError("Invalid power after group.");
                        return null;
                    }
                    power = parseInt(powerStr);
                }

                // Group element for UI highlighting
                const span = document.createElement('span');
                span.className = 'word-token';
                span.innerHTML = `(...)<sup>${power !== 1 ? power : ''}</sup>`;

                nodes.push({ type: 'group', children: innerNodes, power: power, element: span });
            } else {
                // Parse base element: e, r, s, s_X
                let baseMatch = word.substring(pos).match(/^(e|r|s_?(\d+)?)/);
                if (!baseMatch) {
                    parseError(`Unexpected character at position ${pos}: ${word[pos]}`);
                    return null;
                }

                pos += baseMatch[0].length;
                const base = baseMatch[1] || baseMatch[3]; // Fallback depending on regex group matching
                const type = base === 'e' ? 'identity' : (base.startsWith('r') ? 'rotation' : 'reflection');
                let indexStr = baseMatch[2] || baseMatch[4];

                let power = 1;
                if (pos < word.length && word[pos] === '^') {
                    pos++;
                    let powerStr = '';
                    if (word[pos] === '-') {
                        powerStr += '-';
                        pos++;
                    }
                    while (pos < word.length && /\d/.test(word[pos])) {
                        powerStr += word[pos];
                        pos++;
                    }
                    if (powerStr === '-' || powerStr === '') {
                        parseError("Invalid power after element.");
                        return null;
                    }
                    power = parseInt(powerStr);
                }

                // UI Element creation
                const span = document.createElement('span');
                span.className = 'word-token';
                let displayText = base;

                let index = 1;
                if (type === 'reflection') {
                    index = parseInt(indexStr) || 1;
                    if (index < 1 || index > currentN) {
                        parseError(`Invalid reflection index: s_${index}. Allowed range is 1 to ${currentN}.`);
                        return null;
                    }
                    displayText = `s<sub>${index}</sub>`;
                }

                // If power is 0, we treat it as 0 but still display the power if it was explicitly typed
                const actualPower = power === 0 ? 0 : power;

                if (power !== 1) {
                    displayText += `<sup>${power}</sup>`;
                }

                span.innerHTML = displayText;

                nodes.push({ type: type, index: index, power: actualPower, element: span, rawText: displayText });
            }
        }
        return nodes;
    }

    const ast = parseGroup();
    if (!ast) return; // Error occurred during parsing

    // Now flatten AST into UI tokens and execution sequence
    function flattenAST(nodes, parentSpan = null) {
        let sequence = [];
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            if (node.type === 'group') {
                // Determine if we need to wrap visually
                const groupSpan = document.createElement('span');
                groupSpan.className = 'word-token group-token';
                groupSpan.style.display = 'inline-flex';
                groupSpan.style.alignItems = 'center';

                const leftParen = document.createElement('span');
                leftParen.innerHTML = '(';
                groupSpan.appendChild(leftParen);

                const innerContainer = document.createElement('span');
                innerContainer.style.display = 'inline-flex';
                groupSpan.appendChild(innerContainer);

                const rightParen = document.createElement('span');
                rightParen.innerHTML = `)<sup>${node.power !== 1 ? node.power : ''}</sup>`;
                groupSpan.appendChild(rightParen);

                if (parentSpan) parentSpan.appendChild(groupSpan);
                else display.appendChild(groupSpan);

                const absPower = Math.abs(node.power);
                let groupSeq = [];

                // Get the base sequence for one application of the group
                let baseSeq = flattenAST(node.children, innerContainer);

                // If power is negative, we need to invert the group sequence
                // (AB)^-1 = B^-1 A^-1
                if (node.power < 0) {
                    // For dihedral generators:
                    // r^-1 is rotation by -1
                    // s^-1 is just s
                    baseSeq = baseSeq.slice().reverse().map(cmd => {
                        if (cmd.type === 'rotation') {
                            return { ...cmd, value: -cmd.value };
                        }
                        return cmd; // Reflections are their own inverse
                    });
                }

                for (let k = 0; k < absPower; k++) {
                    groupSeq.push(...baseSeq);
                }
                sequence.push(...groupSeq);

            } else {
                if (parentSpan) parentSpan.appendChild(node.element);
                else display.appendChild(node.element);

                if (node.type === 'rotation' || node.type === 'identity') {
                    const rotPower = node.type === 'identity' ? 0 : node.power;
                    sequence.push({ type: 'rotation', value: rotPower, element: node.element });
                } else if (node.type === 'reflection') {
                    const absPower = Math.abs(node.power);
                    for (let k = 0; k < absPower; k++) {
                        sequence.push({ type: 'reflection', value: node.index - 1, element: node.element, subStep: true });
                    }
                }
            }
        }
        return sequence;
    }

    const forwardSequence = flattenAST(ast);
    if (forwardSequence.length === 0) return;

    // Right-to-left composition for execution
    commandQueue = forwardSequence.reverse();
    processQueue();
}

function processQueue() {
    if (isAnimating || isQueuePaused || commandQueue.length === 0) {
        if (commandQueue.length === 0 && currentActiveToken) {
            currentActiveToken.classList.remove('active');
            currentActiveToken.classList.add('completed');
            currentActiveToken = null;
        }
        return;
    }

    const cmd = commandQueue.shift();

    // UI Highlighting
    if (currentActiveToken && currentActiveToken !== cmd.element) {
        currentActiveToken.classList.remove('active');
        currentActiveToken.classList.add('completed');
    }

    if (cmd.element) {
        cmd.element.classList.add('active');
        currentActiveToken = cmd.element;
    }

    if (cmd.type === 'rotation') {
        if (cmd.value === 0) {
            isQueuePaused = true;
            setTimeout(() => {
                isQueuePaused = false;
                processQueue(); // Resume the queue
            }, 400);
            return;
        } else {
            applyRotation(cmd.value);
        }
    } else if (cmd.type === 'reflection') {
        applyReflection(cmd.value);
    }
}

// === Permutation Calculation ===

function resetPermutation() {
    currentPermutation = [];
    for (let i = 0; i < currentN; i++) currentPermutation[i] = i + 1;
    document.getElementById('perm-text').textContent = "e (Identity)";

    // Reset virtual tracker
    virtualTargetQuaternion.identity();
}

// ... updatePermutationDisplayPseudo uses virtualTargetQuaternion ...

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
                // Follow the map
                // Vertex curr moves to map[curr].
                // So the element at map[curr] in the NEXT step will be...
                // Wait. Cycle (1 2 3) means 1->2, 2->3, 3->1.
                // Here, Vertex 1 moves to Slot 2.
                // Does that mean 1 maps to 2? Yes.
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

// === Cayley Table UI Integration ===
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
        document.getElementById('modal-title').innerHTML = `Cayley Table for D<sub>${currentN}</sub>`;
        modal.style.display = 'flex';
        modalFooter.style.display = mode === 'test' ? 'flex' : 'none';
        feedbackMsg.textContent = '';
        checkBtn.disabled = false; // Reset check button state

        const n = currentN;

        // 1. Construct Elements in Canonical Order
        // Order: e, r, r^2, ..., r^{n-1}, s, sr, sr^2, ..., sr^{n-1}

        // r = (1 2 ... n)
        const r = [];
        for (let i = 1; i <= n; i++) r.push((i % n) + 1);

        // s = (1)(2 n)(3 n-1)...
        const s = [];
        for (let i = 1; i <= n; i++) {
            let val = (2 + n - i);
            if (val > n) val -= n;
            s.push(val);
        }

        const elements = [];
        const labels = [];

        // Add Rotations
        let curr = CayleyGraph.identityPerm(n);
        for (let k = 0; k < n; k++) {
            elements.push(curr);
            if (k === 0) labels.push("e");
            else if (k === 1) labels.push("r");
            else labels.push(`r<sup>${k}</sup>`);

            curr = CayleyGraph.composePerm(curr, r);
        }

        // Add Reflections
        // s, sr, sr^2 ...
        // Note: s is first reflection (sr^0).
        // Add Reflections
        // s, rs, r^2s ... r^{n-1}s
        // Note: s = r^0 s
        let currRot = CayleyGraph.identityPerm(n);
        for (let k = 0; k < n; k++) {
            // element = r^k * s
            const el = CayleyGraph.composePerm(currRot, s);
            elements.push(el);

            if (k === 0) labels.push("s");
            else if (k === 1) labels.push("rs");
            else labels.push(`r<sup>${k}</sup>s`);

            // Advance rotation r^k -> r^{k+1}
            currRot = CayleyGraph.composePerm(currRot, r);
        }

        // 2. Generate Table
        // We trust our manual construction covers D_n (size 2n)
        const { table } = CayleyGraph.generateCayleyTable(elements);

        // 3. Render
        const formatLabel = (el, idx) => labels[idx];

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
    const REFLECTION_COLORS = ['#ff6b6b', '#ffa06b', '#ffeb6b', '#6bff6b', '#6bffff', '#d96bff', '#ff00ff', '#00ffff'];

    function permFromRotation(k) {
        const n = currentN;
        const p = [];
        for (let i = 0; i < n; i++) {
            let dest = (i + k + n) % n;
            p.push(dest + 1);
        }
        return p;
    }

    function permFromReflection(axisIndex) {
        const n = currentN;
        const p = [];
        for (let j = 0; j < n; j++) {
            let dest = (2 * axisIndex - j + 2 * n) % n;
            p.push(dest + 1);
        }
        return p;
    }

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: function (p) {
                const n = currentN;
                const v0 = p[0] - 1;
                const v1 = p[1] - 1;
                const diff = (v1 - v0 + n) % n;

                if (diff === 1) {
                    // Rotation
                    const k = v0;
                    if (k === 0) return "e";
                    if (k === 1) return "r";
                    return `r<sup>${k}</sup>`;
                } else {
                    // Reflection
                    const k = (-v0 + n) % n;
                    if (k === 0) return "s";
                    if (k === 1) return "sr";
                    return `sr<sup>${k}</sup>`;
                }
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

            // Reflection buttons
            const container = document.getElementById('reflection-buttons');
            if (container) {
                const buttons = container.querySelectorAll('.btn');
                buttons.forEach((btn, idx) => {
                    generators.push({
                        button: btn,
                        label: `s<sub>${idx + 1}</sub>`,
                        color: REFLECTION_COLORS[idx % REFLECTION_COLORS.length],
                        permutation: permFromReflection(idx)
                    });
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

