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
// Rectangle V_4 animation
const CONFIG = {
    polygonColor: 0x60a5fa,
    polygonOpacity: 0.9,
    edgeColor: 0xffffff,
    vertexColor: 0xf472b6,
    axisColor: 0xffffff,
    highlightColor: 0xfbbf24,
    bgColor: 0x0f172a,
    animationSpeed: 0.15
};

const RECT_WIDTH = 4.8;
const RECT_HEIGHT = 2.4;
// Vertices in CCW order starting from top-right
const VERTICES = [
    new THREE.Vector3(RECT_WIDTH / 2, RECT_HEIGHT / 2, 0),    // 1
    new THREE.Vector3(-RECT_WIDTH / 2, RECT_HEIGHT / 2, 0),   // 2
    new THREE.Vector3(-RECT_WIDTH / 2, -RECT_HEIGHT / 2, 0),  // 3
    new THREE.Vector3(RECT_WIDTH / 2, -RECT_HEIGHT / 2, 0)    // 4
];

let polygonGroup, axesGroup;
let axesLines = [];
let vertexLabels = [];
let staticLabels = [];
let staticPositionLabels;
let isAnimating = false;
let currentPermutation = [];
let overlayCanvas, overlayCtx;
let scene, camera, renderer, controls;
let subgroupBuilder;
const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 0, 14);

// Animation State
let animStartQuat = new THREE.Quaternion();
let animAxis = new THREE.Vector3(0, 0, 1);
let animTargetAngle = 0;
let animCurrentAngle = 0;
let virtualTargetQuaternion = new THREE.Quaternion();

window.addEventListener('load', init);

function init() {
    initThree();
    setupUI();
    initRectangle();
    animate();
}

function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.copy(DEFAULT_CAMERA_POS);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableRotate = false;
    controls.enableZoom = true;
    controls.enablePan = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, -10, 10);
    scene.add(dirLight);

    polygonGroup = new THREE.Group();
    scene.add(polygonGroup);

    axesGroup = new THREE.Group();
    scene.add(axesGroup);

    staticPositionLabels = new THREE.Group();
    scene.add(staticPositionLabels);

    overlayCanvas = document.getElementById('overlay-canvas');
    overlayCtx = overlayCanvas.getContext('2d');

    window.addEventListener('resize', onWindowResize);
    onWindowResize();
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    overlayCanvas.width = container.clientWidth;
    overlayCanvas.height = container.clientHeight;
}

function initRectangle() {
    recreatePolygon();
    recreateAxes();
    recreateStaticLabels();

    polygonGroup.quaternion.identity();
    virtualTargetQuaternion.set(0, 0, 0, 1);
    isAnimating = false;

    resetPermutation();

    if (subgroupBuilder) {
        subgroupBuilder.exit();
    }
}

function createLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, 2 * Math.PI);
    ctx.fillStyle = color === 'red' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.4)';
    ctx.fill();

    ctx.font = 'bold 80px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color === 'red' ? 'rgba(255, 68, 68, 0.4)' : '#fbbf24';
    ctx.fillText(text, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.75, 0.75, 0.75);
    return sprite;
}

function recreatePolygon() {
    while (polygonGroup.children.length > 0) {
        polygonGroup.remove(polygonGroup.children[0]);
    }
    vertexLabels = [];

    const shape = new THREE.Shape();
    shape.moveTo(VERTICES[0].x, VERTICES[0].y);
    shape.lineTo(VERTICES[1].x, VERTICES[1].y);
    shape.lineTo(VERTICES[2].x, VERTICES[2].y);
    shape.lineTo(VERTICES[3].x, VERTICES[3].y);
    shape.lineTo(VERTICES[0].x, VERTICES[0].y);

    const geometry = new THREE.ShapeGeometry(shape);

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

    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({ color: CONFIG.edgeColor, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    polygonGroup.add(edges);

    const toggle = document.getElementById('toggle-labels');
    for (let i = 0; i < 4; i++) {
        const label = createLabel((i + 1).toString(), 'yellow');
        if (toggle) label.visible = toggle.checked;
        label.position.copy(VERTICES[i]);
        label.position.z = 0.05;
        polygonGroup.add(label);
        vertexLabels.push({ mesh: label, originalIndex: i });
    }
}

function recreateStaticLabels() {
    while (staticPositionLabels.children.length > 0) {
        staticPositionLabels.remove(staticPositionLabels.children[0]);
    }
    staticLabels = [];
    const toggle = document.getElementById('toggle-labels');
    const isVisible = toggle ? toggle.checked : false;

    // Place labels slightly further out
    const scale = 1.3;
    for (let i = 0; i < 4; i++) {
        const label = createLabel((i + 1).toString(), 'red');
        label.visible = isVisible;
        const pos = VERTICES[i].clone().multiplyScalar(scale);
        pos.z = 0.05;
        label.position.copy(pos);
        staticPositionLabels.add(label);
        staticLabels.push(label);
    }
}

function recreateAxes() {
    while (axesGroup.children.length > 0) {
        axesGroup.remove(axesGroup.children[0]);
    }
    axesLines = [];

    const radiusX = RECT_WIDTH / 2 + 1;
    const radiusY = RECT_HEIGHT / 2 + 1;

    // Horizontal axis (Reflection s1, y -> -y) -> Axis is X axis
    addAxisLine(new THREE.Vector3(-radiusX, 0, 0), new THREE.Vector3(radiusX, 0, 0), 1, new THREE.Vector3(radiusX * 1.1, 0, 0));
    // Vertical axis (Reflection s2, x -> -x) -> Axis is Y axis
    addAxisLine(new THREE.Vector3(0, -radiusY, 0), new THREE.Vector3(0, radiusY, 0), 2, new THREE.Vector3(0, radiusY * 1.1, 0));
}

function addAxisLine(p1, p2, index, labelPos) {
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
    line.computeLineDistances();
    axesGroup.add(line);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1edc1eff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '40px sans-serif';
    ctx.fillText(index === 1 ? 'a' : 'b', 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(labelPos);
    sprite.scale.set(0.8, 0.8, 0.8);
    axesGroup.add(sprite);
}

function setupUI() {
    document.getElementById('rotate-r').addEventListener('click', () => applyRotation());
    document.getElementById('reflect-a').addEventListener('click', () => applyReflection(1));
    document.getElementById('reflect-b').addEventListener('click', () => applyReflection(2));

    document.getElementById('reset-shape').addEventListener('click', () => {
        initRectangle();
        camera.position.copy(DEFAULT_CAMERA_POS);
        if (controls) controls.update();
    });

    const toggleAxes = document.getElementById('toggle-axes');
    toggleAxes.addEventListener('change', (e) => axesGroup.visible = e.target.checked);
    if (axesGroup) axesGroup.visible = toggleAxes.checked;

    const toggleLabels = document.getElementById('toggle-labels');
    toggleLabels.addEventListener('change', (e) => {
        const isVisible = e.target.checked;
        vertexLabels.forEach(item => { if (item.mesh) item.mesh.visible = isVisible; });
        staticLabels.forEach(label => { if (label) label.visible = isVisible; });
    });

    const togglePerm = document.getElementById('toggle-perm');
    if (togglePerm) togglePerm.addEventListener('change', drawPermutation);

    const slider = document.getElementById('speed-slider');
    const display = document.getElementById('speed-value');
    if (slider) {
        slider.addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            CONFIG.animationSpeed = 0.01 + (v / 100) * 0.29;
            if (display) display.textContent = CONFIG.animationSpeed.toFixed(2);
        });
    }
}

function applyRotation() {
    const axis = new THREE.Vector3(0, 0, 1);
    startAnimation(axis, Math.PI);
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
    virtualTargetQuaternion.premultiply(rotQuat);
    updatePermutationDisplayPseudo();
}

function applyReflection(axisIndex) {
    // s1: Horizontal reflection -> reflect across X axis
    // s2: Vertical reflection -> reflect across Y axis
    const axis = axisIndex === 1 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    startAnimation(axis, Math.PI);
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
    virtualTargetQuaternion.premultiply(rotQuat);
    updatePermutationDisplayPseudo();
}

function startAnimation(axis, angle) {
    if (isAnimating) animStartQuat.copy(polygonGroup.quaternion);
    else animStartQuat.copy(polygonGroup.quaternion);

    animAxis.copy(axis);
    animTargetAngle = angle;
    animCurrentAngle = 0;
    isAnimating = true;
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();

    if (isAnimating) {
        const diff = animTargetAngle - animCurrentAngle;
        let step = diff * CONFIG.animationSpeed;
        const minStep = 0.005 * (diff > 0 ? 1 : -1);

        if (Math.abs(step) < Math.abs(minStep)) step = minStep;
        if (Math.abs(step) > Math.abs(diff)) {
            animCurrentAngle = animTargetAngle;
            isAnimating = false;
        } else {
            animCurrentAngle += step;
            if (Math.abs(animTargetAngle - animCurrentAngle) < 0.001) {
                animCurrentAngle = animTargetAngle;
                isAnimating = false;
            }
        }

        const deltaQ = new THREE.Quaternion().setFromAxisAngle(animAxis, animCurrentAngle);
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

    overlayCtx.font = '60px Outfit, sans-serif';
    overlayCtx.fillStyle = '#fbbf24';
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'top';
    const text = document.getElementById('perm-text').textContent;
    overlayCtx.fillText(`${text}`, overlayCanvas.width / 2, 35);
}

function resetPermutation() {
    currentPermutation = [1, 2, 3, 4];
    document.getElementById('perm-text').textContent = "e (Identity)";
    virtualTargetQuaternion.identity();
}

function updatePermutationDisplayPseudo() {
    const p = [];
    for (let i = 0; i < 4; i++) {
        const v = VERTICES[i].clone();
        v.applyQuaternion(virtualTargetQuaternion);
        let maxDot = -1.0;
        let bestJ = 0;
        for (let j = 0; j < 4; j++) {
            const vFlat = new THREE.Vector3(v.x, v.y, 0).normalize();
            const slot = VERTICES[j].clone().normalize();
            const dot = vFlat.dot(slot);
            if (dot > maxDot) { maxDot = dot; bestJ = j; }
        }
        p[i] = bestJ + 1; // 1-based index
    }

    const cycles = getCycles(p);
    document.getElementById('perm-text').textContent = cycles;
}

function getCycles(map) {
    let visited = new Array(4).fill(false);
    let cycles = [];
    for (let i = 0; i < 4; i++) {
        if (!visited[i]) {
            let cycle = [];
            let curr = i;
            while (!visited[curr]) {
                visited[curr] = true;
                cycle.push(curr + 1);
                curr = map[curr] - 1;
            }
            if (cycle.length > 1) cycles.push("(" + cycle.join(" ") + ")");
        }
    }
    if (cycles.length === 0) return "e (Identity)";
    return cycles.join("");
}

window.addEventListener('load', () => {
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
        modal.style.display = 'flex';
        modalFooter.style.display = mode === 'test' ? 'flex' : 'none';
        feedbackMsg.textContent = '';
        checkBtn.disabled = false;

        // V_4 Elements: e, r, s1, s2
        // Permutations using the 1..4 slots
        // e = [1, 2, 3, 4]
        // r = [3, 4, 1, 2] (rot by 180 degrees)
        // s1 = [4, 3, 2, 1] (horiz reflection across X axis, y -> -y)
        // s2 = [2, 1, 4, 3] (vert reflection across Y axis, x -> -x)

        const elements = [
            [1, 2, 3, 4], // e
            [3, 4, 1, 2], // r
            [4, 3, 2, 1], // s1
            [2, 1, 4, 3]  // s2
        ];
        const labels = ["e", "r", "a", "b"];

        const { table } = CayleyGraph.generateCayleyTable(elements);
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

    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

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
            checkBtn.disabled = true;
        }
    });

    subgroupBuilder = CayleyGraph.setupSubgroupBuilder({
        logicOptions: {
            formatLabel: function (p) {
                // Identity
                if (p[0] === 1 && p[1] === 2 && p[2] === 3 && p[3] === 4) return "e";
                // Rotation
                if (p[0] === 3 && p[1] === 4 && p[2] === 1 && p[3] === 2) return "r";
                // a
                if (p[0] === 4 && p[1] === 3 && p[2] === 2 && p[3] === 1) return "a";
                // b
                if (p[0] === 2 && p[1] === 1 && p[2] === 4 && p[3] === 3) return "b";
                return "??";
            }
        },
        getButtonGenerators: function () {
            return [
                {
                    button: document.getElementById('rotate-r'),
                    label: 'r',
                    color: '#38bdf8',
                    permutation: [3, 4, 1, 2]
                },
                {
                    button: document.getElementById('reflect-a'),
                    label: 'a',
                    color: '#ff6b6b',
                    permutation: [4, 3, 2, 1]
                },
                {
                    button: document.getElementById('reflect-b'),
                    label: 'b',
                    color: '#4ade80',
                    permutation: [2, 1, 4, 3]
                }
            ];
        },
        canvasContainer: document.getElementById('canvas-container'),
        cayleyCanvas: document.getElementById('cayley-canvas'),
        orderDisplay: document.getElementById('generator-selector'),
        toggleButton: document.getElementById('subgroup-builder-btn')
    });
});
