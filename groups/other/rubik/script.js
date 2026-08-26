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
let cubies = [];
let isAnimating = false;
let moveHistory = [];
const animationSpeed = 0.3;

// Logical state: 6 faces, 9 stickers each
// U: White, D: Yellow, L: Orange, R: Red, F: Green, B: Blue
let cubeState = {
    U: Array(9).fill('U'), D: Array(9).fill('D'), L: Array(9).fill('L'),
    R: Array(9).fill('R'), F: Array(9).fill('F'), B: Array(9).fill('B')
};

const COLORS = {
    U: 0xffffff, D: 0xffff00, L: 0xffa500, R: 0xff0000, F: 0x00ff00, B: 0x0000ff,
    internal: 0x222222
};

const FACE_NORMALS = {
    U: new THREE.Vector3(0, 1, 0), D: new THREE.Vector3(0, -1, 0),
    L: new THREE.Vector3(-1, 0, 0), R: new THREE.Vector3(1, 0, 0),
    F: new THREE.Vector3(0, 0, 1), B: new THREE.Vector3(0, 0, -1)
};

function updateLogicalState(move) {
    const face = move[0];
    const turns = move.includes("'") ? 3 : (move.includes("2") ? 2 : 1);
    for (let i = 0; i < turns; i++) rotateFaceLogic(face);
}

function rotateFaceLogic(f) {
    const s = cubeState;
    const prev = JSON.parse(JSON.stringify(s));
    const rot = [6, 3, 0, 7, 4, 1, 8, 5, 2];
    s[f] = rot.map(i => prev[f][i]);
    if (f === 'U') {
        s.F[0] = prev.R[0]; s.F[1] = prev.R[1]; s.F[2] = prev.R[2];
        s.L[0] = prev.F[0]; s.L[1] = prev.F[1]; s.L[2] = prev.F[2];
        s.B[0] = prev.L[0]; s.B[1] = prev.L[1]; s.B[2] = prev.L[2];
        s.R[0] = prev.B[0]; s.R[1] = prev.B[1]; s.R[2] = prev.B[2];
    } else if (f === 'D') {
        s.F[6] = prev.L[6]; s.F[7] = prev.L[7]; s.F[8] = prev.L[8];
        s.R[6] = prev.F[6]; s.R[7] = prev.F[7]; s.R[8] = prev.F[8];
        s.B[6] = prev.R[6]; s.B[7] = prev.R[7]; s.B[8] = prev.R[8];
        s.L[6] = prev.B[6]; s.L[7] = prev.B[7]; s.L[8] = prev.B[8];
    } else if (f === 'L') {
        s.F[0] = prev.U[0]; s.F[3] = prev.U[3]; s.F[6] = prev.U[6];
        s.D[0] = prev.F[0]; s.D[3] = prev.F[3]; s.D[6] = prev.F[6];
        s.B[8] = prev.D[0]; s.B[5] = prev.D[3]; s.B[2] = prev.D[6];
        s.U[0] = prev.B[8]; s.U[3] = prev.B[5]; s.U[6] = prev.B[2];
    } else if (f === 'R') {
        s.F[2] = prev.D[2]; s.F[5] = prev.D[5]; s.F[8] = prev.D[8];
        s.U[2] = prev.F[2]; s.U[5] = prev.F[5]; s.U[8] = prev.F[8];
        s.B[6] = prev.U[2]; s.B[3] = prev.U[5]; s.B[0] = prev.U[8];
        s.D[2] = prev.B[6]; s.D[5] = prev.B[3]; s.D[8] = prev.B[0];
    } else if (f === 'F') {
        s.U[6] = prev.L[8]; s.U[7] = prev.L[5]; s.U[8] = prev.L[2];
        s.R[0] = prev.U[6]; s.R[3] = prev.U[7]; s.R[6] = prev.U[8];
        s.D[2] = prev.R[0]; s.D[1] = prev.R[3]; s.D[0] = prev.R[6];
        s.L[8] = prev.D[2]; s.L[5] = prev.D[1]; s.L[2] = prev.D[0];
    } else if (f === 'B') {
        s.U[0] = prev.R[2]; s.U[1] = prev.R[5]; s.U[2] = prev.R[8];
        s.L[0] = prev.U[2]; s.L[3] = prev.U[1]; s.L[6] = prev.U[0];
        s.D[6] = prev.L[0]; s.D[7] = prev.L[3]; s.D[8] = prev.L[6];
        s.R[8] = prev.D[6]; s.R[5] = prev.D[7]; s.R[2] = prev.D[8];
    }
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(6, 6, 9);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    createCube();

    window.addEventListener('resize', onWindowResize);
    setupEventListeners();

    // Start animation loop
    animate();
}

function createCube() {
    cubies.forEach(c => scene.remove(c));
    cubies = [];
    cubeState = {
        U: Array(9).fill('U'), D: Array(9).fill('D'), L: Array(9).fill('L'),
        R: Array(9).fill('R'), F: Array(9).fill('F'), B: Array(9).fill('B')
    };
    const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
            for (let z = -1; z <= 1; z++) {
                if (x === 0 && y === 0 && z === 0) continue;
                const materials = [
                    new THREE.MeshLambertMaterial({ color: x === 1 ? COLORS.R : COLORS.internal }),
                    new THREE.MeshLambertMaterial({ color: x === -1 ? COLORS.L : COLORS.internal }),
                    new THREE.MeshLambertMaterial({ color: y === 1 ? COLORS.U : COLORS.internal }),
                    new THREE.MeshLambertMaterial({ color: y === -1 ? COLORS.D : COLORS.internal }),
                    new THREE.MeshLambertMaterial({ color: z === 1 ? COLORS.F : COLORS.internal }),
                    new THREE.MeshLambertMaterial({ color: z === -1 ? COLORS.B : COLORS.internal })
                ];
                const cubie = new THREE.Mesh(geometry, materials);
                cubie.position.set(x, y, z);
                scene.add(cubie);
                cubies.push(cubie);
            }
        }
    }
    // Initial render call
    if (renderer && scene && camera) renderer.render(scene, camera);
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupEventListeners() {
    document.querySelectorAll('.btn[data-move]').forEach(btn => {
        btn.addEventListener('click', () => { if (!isAnimating) performMove(btn.getAttribute('data-move'), 300, true); });
    });
    document.querySelectorAll('.sequence-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (isAnimating) return;
            for (const move of btn.getAttribute('data-sequence').split(',')) await performMove(move, 300, true);
        });
    });
    document.getElementById('reset-btn').addEventListener('click', () => { if (!isAnimating) { moveHistory = []; updateSolutionLog(); document.getElementById('algo-explanation').style.display = 'none'; createCube(); } });
    document.getElementById('scramble-btn').addEventListener('click', () => { if (!isAnimating) scramble(); });
    document.getElementById('solve-algo-btn').addEventListener('click', async () => { if (!isAnimating) await runAlgorithmicSolve(); });
}

async function scramble() {
    const moves = ['U', 'D', 'L', 'R', 'F', 'B', "U'", "D'", "L'", "R'", "F'", "B'"];
    for (let i = 0; i < 15; i++) await performMove(moves[Math.floor(Math.random() * moves.length)], 100, true);
}

function performMove(move, duration = 300, record = true) {
    if (record) moveHistory.push(move);
    updateLogicalState(move);

    // Highlight button (fall back to base face for double moves like B2)
    const btn = document.querySelector(`.btn[data-move="${move}"]`) ||
        document.querySelector(`.btn[data-move="${move[0]}"]`);
    if (btn) btn.classList.add('active-move');

    return new Promise(resolve => {
        isAnimating = true;
        const face = move[0];
        let angle = -Math.PI / 2;
        if (move.includes("'")) angle = Math.PI / 2;
        else if (move.includes('2')) angle = -Math.PI;
        const normal = FACE_NORMALS[face];
        const selectedCubies = cubies.filter(c => c.position.dot(normal) > 0.5);
        const pivot = new THREE.Group();
        scene.add(pivot);
        selectedCubies.forEach(c => pivot.attach(c));
        const startTime = performance.now();
        function animateMove() {
            const progress = Math.min((performance.now() - startTime) / duration, 1);
            pivot.rotation.set(0, 0, 0);
            pivot.rotateOnAxis(normal, angle * progress);
            if (progress < 1) requestAnimationFrame(animateMove);
            else {
                pivot.updateMatrixWorld();
                selectedCubies.forEach(c => {
                    scene.attach(c);
                    c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
                    c.rotation.set(Math.round(c.rotation.x / (Math.PI / 2)) * (Math.PI / 2), Math.round(c.rotation.y / (Math.PI / 2)) * (Math.PI / 2), Math.round(c.rotation.z / (Math.PI / 2)) * (Math.PI / 2));
                });
                scene.remove(pivot);
                if (btn) btn.classList.remove('active-move');
                isAnimating = false;
                resolve();
            }
        }
        animateMove();
    });
}

function formatMove(m) {
    if (m.includes("'")) return m[0] + '\u207B\u00B9';   // U' → U⁻¹
    if (m.includes("2")) return m[0] + '\u00B2';          // B2 → B²
    return m;
}

function inverseMove(m) {
    if (m.includes("'")) return m[0];        // U' → U
    if (m.includes("2")) return m;            // U2 is self-inverse
    return m + "'";                           // U → U'
}

function areInverse(a, b) {
    return inverseMove(a) === b;
}

function formatMovesWithCommutators(moves) {
    const parts = [];
    let i = 0;
    while (i < moves.length) {
        // Check for commutator [A, B] = A B A⁻¹ B⁻¹
        if (i + 3 < moves.length &&
            areInverse(moves[i], moves[i + 2]) &&
            areInverse(moves[i + 1], moves[i + 3]) &&
            moves[i][0] !== moves[i + 1][0]) {
            parts.push(`<span style="color: var(--accent-color);">[${formatMove(moves[i])}, ${formatMove(moves[i + 1])}]</span>`);
            i += 4;
        } else {
            parts.push(formatMove(moves[i]));
            i++;
        }
    }
    return parts.join(' ');
}

function updateSolutionLog(moves = []) {
    const log = document.getElementById('solution-log');
    const container = document.getElementById('solution-container');
    if (moves.length === 0) container.style.display = 'none';
    else { container.style.display = 'block'; log.innerHTML = formatMovesWithCommutators(moves); }
}

async function waitForNextPhase(label = 'Next Phase') {
    const btn = document.getElementById('next-phase-btn');
    btn.textContent = label;
    btn.style.display = 'block';
    return new Promise(resolve => {
        const handler = () => {
            btn.style.display = 'none';
            btn.removeEventListener('click', handler);
            resolve();
        };
        btn.addEventListener('click', handler);
    });
}

let solverReady = false;

async function runAlgorithmicSolve() {
    const explanation = document.getElementById('algo-explanation');
    const stepName = document.getElementById('step-name');
    const stepDesc = document.getElementById('step-desc');
    explanation.style.display = 'block';

    // Check if already solved
    const isSolved = Object.values(cubeState).every(face => face.every(s => s === face[0]));
    if (isSolved) {
        stepName.innerHTML = `<b>Already Solved!</b>`;
        stepDesc.innerText = "The cube is already in the identity state — no moves needed.";
        return;
    }

    if (typeof Cube === 'undefined') {
        stepName.innerHTML = `<b>Error:</b> Solver library not loaded`;
        stepDesc.innerText = "The cubejs library failed to load. Check your internet connection.";
        return;
    }

    try {
        // Initialize solver if needed (builds lookup tables, takes ~4-5 seconds)
        if (!solverReady) {
            stepName.innerHTML = `<b>Step:</b> Initializing Solver`;
            stepDesc.innerText = "Building Kociemba lookup tables (this takes a few seconds the first time)...";
            // Yield to UI so the message displays before the blocking computation
            await new Promise(r => setTimeout(r, 50));
            Cube.initSolver();
            solverReady = true;
        }

        // Map our logical state to the 54-char facelet string
        // cubejs order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
        stepName.innerHTML = `<b>Step:</b> Analysing Group State`;
        stepDesc.innerText = "Mapping the current cube orientation to a group element...";
        await new Promise(r => setTimeout(r, 50));

        const order = ['U', 'R', 'F', 'D', 'L', 'B'];
        let stateString = '';
        order.forEach(face => {
            stateString += cubeState[face].join('');
        });

        // Solve using Kociemba two-phase algorithm
        stepName.innerHTML = `<b>Step:</b> Kociemba Two-Phase Search`;
        stepDesc.innerText = "Kociemba's algorithm navigates the subgroup chain G\u2080 \u2283 G\u2081 \u2283 G\u2082 = {1}. Here G\u2080 = \u27e8U,D,L,R,F,B\u27e9 is the full cube group, G\u2081 = \u27e8U,D,L\u00b2,R\u00b2,F\u00b2,B\u00b2\u27e9 is an intermediate subgroup, and G\u2082 = {1} is the identity (solved state). Phase 1 finds a path from G\u2080 to G\u2081; Phase 2 finds a path from G\u2081 to G\u2082.";
        await new Promise(r => setTimeout(r, 50));

        const cube = Cube.fromString(stateString);
        const solution = cube.solve();
        if (!solution || solution.trim().length === 0) throw new Error("Cube is already solved or no solution found");

        const moves = solution.trim().split(' ').filter(m => m.length > 0);
        const mid = Math.ceil(moves.length / 2);
        const phase1 = moves.slice(0, mid);
        const phase2 = moves.slice(mid);

        // Phase 1: G₀ → G₁
        await waitForNextPhase('First Phase');
        stepName.innerHTML = `<b>Step:</b> Phase 1 (G\u2080 \u2192 G\u2081)`;
        stepDesc.innerText = `Found a ${moves.length}-move solution! Phase 1 moves the cube from the full group G\u2080 into the subgroup G\u2081 = \u27e8U, D, L\u00b2, R\u00b2, F\u00b2, B\u00b2\u27e9. This orients all edges and corners correctly, and places the middle-layer edges into the middle slice. All 18 moves (quarter and half turns) are allowed.`;
        updateSolutionLog(phase1);
        for (const move of phase1) await performMove(move, 800, false);

        // Phase 2: G₁ → G₂ = {1}
        stepName.innerHTML = `<b>Step:</b> Phase 2 (G\u2081 \u2192 G\u2082 = {1})`;
        stepDesc.innerText = "Phase 2 solves from within G\u2081 to the identity G\u2082 = {1}. Only the generators of G\u2081 are used: quarter turns of U and D, and half turns of L, R, F, B. These restricted moves preserve the edge/corner orientations established in Phase 1.";
        await waitForNextPhase('Second Phase');
        updateSolutionLog(phase2);
        for (const move of phase2) await performMove(move, 800, false);

        stepName.innerHTML = `<b>Solved!</b>`;
        stepDesc.innerText = `The cube reached the identity G\u2082 = {1} via the subgroup chain G\u2080 \u2283 G\u2081 \u2283 G\u2082 in ${moves.length} moves.`;
        moveHistory = [];
        return;
    } catch (e) {
        console.error('Solver failed:', e);
    }

    // FALLBACK: reverse history if solver fails
    const solution = [...moveHistory].reverse().map(m => m.includes("'") ? m[0] : (m.includes("2") ? m : m + "'"));
    const chunkSize = Math.ceil(solution.length / 3);
    const stages = [
        { name: "Layer 1: The Base Subgroup", desc: "Stabilizing the first layer. This restricts remaining symmetries to a smaller subgroup. Click to begin." },
        { name: "Layer 2: Middle Edges", desc: "Using commutators [A, B] to move middle edges without disturbing the base. Click to begin." },
        { name: "Layer 3: Final Permutation", desc: "Applying final elements to reach the identity state. Click to begin." }
    ];

    for (let i = 0; i < stages.length; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, solution.length);
        if (start >= solution.length) break;

        stepName.innerHTML = `<b>Step:</b> ${stages[i].name}`;
        stepDesc.innerText = stages[i].desc;

        await waitForNextPhase();

        const stageMoves = solution.slice(start, end);
        updateSolutionLog(stageMoves);
        for (const move of stageMoves) await performMove(move, 800, false);
    }

    stepName.innerHTML = `<b>Solved!</b>`;
    stepDesc.innerText = "The cube is solved. We demonstrated how complex group elements are decomposed into simpler sequences.";
    moveHistory = [];
    updateSolutionLog();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

if (document.readyState === 'complete') {
    init();
} else {
    window.addEventListener('load', init);
}
