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

// =====================================================
// Cayley Graph — Shared Module
// =====================================================
// Provides: permutation utilities, subgroup generation,
// graph layout, and canvas rendering.
// =====================================================

const CayleyGraph = (() => {

    // --------------------------------------------------
    // Permutation utilities (1-indexed value arrays)
    // p = [p(1), p(2), ..., p(n)]  where p(i) ∈ {1..n}
    // --------------------------------------------------

    function identityPerm(n) {
        const p = [];
        for (let i = 0; i < n; i++) p[i] = i + 1;
        return p;
    }

    /** Compose: this needs to match multiplication, so composePerm(a, b) = a ∘ b, so first apply b, then apply a.  (a ∘ b)(i) = a(b(i)) */
    function composePerm(a, b) {
        const n = b.length;
        const result = new Array(n);
        for (let i = 0; i < n; i++) {
            result[i] = a[b[i] - 1];
        }
        return result;
    }

    function invertPerm(p) {
        const n = p.length;
        const inv = new Array(n);
        for (let i = 0; i < n; i++) {
            inv[p[i] - 1] = i + 1;
        }
        return inv;
    }

    function permsEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    function permToCycleString(p) {
        const n = p.length;
        const visited = new Array(n).fill(false);
        const cycles = [];

        for (let i = 0; i < n; i++) {
            if (!visited[i]) {
                const cycle = [];
                let curr = i;
                while (!visited[curr]) {
                    visited[curr] = true;
                    cycle.push(curr + 1);
                    curr = p[curr] - 1;
                }
                if (cycle.length > 1) {
                    cycles.push("(" + cycle.join(" ") + ")");
                }
            }
        }
        return cycles.length === 0 ? "e" : cycles.join("");
    }

    function getCycleLengths(p) {
        const n = p.length;
        const visited = new Array(n).fill(false);
        const lengths = [];
        for (let i = 0; i < n; i++) {
            if (!visited[i]) {
                let length = 0;
                let curr = i;
                while (!visited[curr]) {
                    visited[curr] = true;
                    length++;
                    curr = p[curr] - 1;
                }
                if (length > 1) lengths.push(length);
            }
        }
        return lengths.sort((a, b) => b - a);
    }

    // --------------------------------------------------
    // Subgroup generation via BFS
    // --------------------------------------------------

    // --------------------------------------------------
    // Subgroup generation via BFS
    // --------------------------------------------------

    /**
     * Generate the subgroup ⟨generators⟩ using BFS.
     * @param {any[]} generators - array of group elements
     * @param {object} [options]
     * @param {Function} [options.multiply] - (a, b) => a * b
     * @param {Function} [options.serialize] - (a) => string key
     * @param {any} [options.identity] - identity element
     * @returns {{ elements: any[], multiplicationTable: number[][] }}
     */
    function generateSubgroup(generators, options = {}) {
        const multiply = options.multiply || composePerm;
        const serialize = options.serialize || (el => el.join(","));

        // Determine identity
        let id;
        if (options.identity !== undefined) {
            id = options.identity;
        } else {
            if (generators.length === 0) {
                // Fallback for empty generators if no explicit identity provided
                // Assume standard permutation of size 1 if nothing else known
                return { elements: [], multiplicationTable: [] };
            }
            id = identityPerm(generators[0].length);
        }

        if (generators.length === 0) {
            return { elements: [id], multiplicationTable: [] };
        }

        const elements = [id];
        const elementSet = new Map(); // key → index
        elementSet.set(serialize(id), 0);

        // multiplicationTable[genIdx] = Map(elemIdx → resultIdx)
        const multiplicationTable = generators.map(() => ({}));

        const queue = [0]; // indices into elements

        while (queue.length > 0) {
            const idx = queue.shift();
            const elem = elements[idx];

            for (let g = 0; g < generators.length; g++) {
                // Right-multiply: elem * gen
                const product = multiply(elem, generators[g]);
                const key = serialize(product);

                let productIdx = elementSet.get(key);
                if (productIdx === undefined) {
                    productIdx = elements.length;
                    elements.push(product);
                    elementSet.set(key, productIdx);
                    queue.push(productIdx);
                }

                multiplicationTable[g][idx] = productIdx;
            }
        }

        return { elements, multiplicationTable };
    }

    // --------------------------------------------------
    // Group Analysis (S4/A4 Detection)
    // --------------------------------------------------

    function detectS4A4(elements, generators, options = {}) {
        const order = elements.length;
        if (order !== 12 && order !== 24) return null;

        // Default options if not provided (fallback to perm logic)
        const multiply = options.multiply || composePerm;
        // diff: uses custom serialize if provided, else joins
        const serialize = options.serialize || (p => p.join(","));
        // diff: uses custom equals if provided, else compares strings/length
        const equals = options.equals || ((a, b) => serialize(a) === serialize(b));
        const identity = options.identity || elements[0]; // Assumption: elements[0] is identity if not specified? 
        // Better: find identity or passed in. generateSubgroup ensures elements[0] is identity usually.

        const ctx = { multiply, serialize, equals, identity };

        // Check Center: Z(G) must be trivial for S4/A4
        const center = getCenter(elements, ctx);
        if (center.length > 1) return null;

        let detectedGroup = null;
        let subgroupOrder = -1;
        let classification = null;

        if (order === 24) {
            // S4 candidate. Look for subgroup of index 4 -> order 6
            subgroupOrder = 6;
            detectedGroup = "S_4";

            // Analyze Generators for S4
            console.log("Analyzing S4 Generators...");
            const genInfos = generators.map(g => {
                // Handle case where g is not an array (e.g. {p: [...], s: ...} from Cube)
                const perm = Array.isArray(g) ? g : (g.p && Array.isArray(g.p) ? g.p : g);

                let cycles = [];
                if (Array.isArray(perm)) {
                    cycles = getCycleLengths(perm);
                }

                // Compute order
                let curr = g;
                let ord = 1;
                while (!ctx.equals(curr, identity)) {
                    curr = ctx.multiply(curr, g);
                    ord++;
                    if (ord > 24) break; // Safety break
                }
                return { cycles, order: ord, perm: g, arrayPerm: perm };
            });

            // Classification Logic
            // 1) 3-cycle + 4-cycle
            // 2) 2-cycle + 3-cycle (not S3)
            // 3) 2-cycle + 4-cycle
            // 4) 3 2-cycles with common element
            // 5) 2 4-cycles

            genInfos.sort((a, b) => a.order - b.order); // Sort by order

            let type = "Unknown";
            const orders = genInfos.map(i => i.order).sort((a, b) => a - b);
            const cycleLengths = genInfos.map(i => i.cycles);

            if (genInfos.length === 2) {
                if (orders[0] === 3 && orders[1] === 4) {
                    type = "Type 1: 3-cycle + 4-cycle";
                } else if (orders[0] === 2 && orders[1] === 3) {
                    // Check if they generate S4 (which they do if we are here)
                    // But strictly: "not containing both elements of the 2-cycle"
                    type = "Type 2: 2-cycle + 3-cycle";
                } else if (orders[0] === 2 && orders[1] === 4) {
                    type = "Type 3: 2-cycle + 4-cycle";
                } else if (orders[0] === 4 && orders[1] === 4) {
                    type = "Type 5: Two 4-cycles";
                }
            } else if (genInfos.length === 3) {
                if (orders[0] === 2 && orders[1] === 2 && orders[2] === 2) {
                    // Check if they are 2-cycles (transpositions)
                    const allTranspositions = cycleLengths.every(c => c.length === 1 && c[0] === 2);
                    if (allTranspositions) {
                        // Check common element
                        // Support of a transposition (a b) is {a, b}
                        // Intersection of supports?
                        // Element moved by all 3?
                        const support = (p) => {
                            const s = new Set();
                            for (let i = 0; i < p.length; i++) {
                                if (p[i] !== i + 1) s.add(i + 1);
                            }
                            return s;
                        };
                        const s1 = support(genInfos[0].arrayPerm);
                        const s2 = support(genInfos[1].arrayPerm);
                        const s3 = support(genInfos[2].arrayPerm);

                        // Intersection of s1, s2, s3
                        let intersection = new Set([...s1].filter(x => s2.has(x) && s3.has(x)));
                        if (intersection.size > 0) {
                            type = "Type 4: 3 2-cycles with a common element";
                        } else {
                            type = "Type 4-variant: 3 2-cycles (other)";
                        }
                    }
                }
            }

            console.log(`S4 Generator Type: ${type}`);
            classification = { type, genInfos };
        } else if (order === 12) {
            // A4 candidate. Look for subgroup of index 4 -> order 3
            subgroupOrder = 3;
            detectedGroup = "A_4";
        }

        // Find a subgroup H of order k
        const H = findSubgroupOfOrder(elements, subgroupOrder, ctx);
        if (!H) return null;

        // Construct representation on cosets G/H
        const cosetRep = getCosetRepresentation(elements, H, ctx);
        if (!cosetRep) return null;

        console.log(`Detected ${detectedGroup}`);
        generators.forEach((gen, i) => {
            const perm = cosetRep.get(ctx.serialize(gen));
            if (perm) {
                console.log(`Generator ${i + 1}: ${permToCycleString(perm)}`);
            }
        });

        return classification;
    }

    // Removed serializerPerm as we use options.serialize now

    function getCenter(elements, { multiply, equals }) {
        const center = [];
        for (const a of elements) {
            let commutesAll = true;
            for (const b of elements) {
                if (!equals(multiply(a, b), multiply(b, a))) {
                    commutesAll = false;
                    break;
                }
            }
            if (commutesAll) center.push(a);
        }
        return center;
    }

    function findSubgroupOfOrder(elements, targetOrder, ctx) {
        const { multiply, equals, identity } = ctx;

        if (targetOrder === 3) {
            // A4 case: subgroup of order 3 is cyclic (generated by 3-cycle)
            for (const g of elements) {
                // Must use generic generateSubgroup logic or simple power iteration
                // Let's use simple power iteration since we have multiply
                const sub = [identity];
                let curr = g;
                while (!equals(curr, identity)) {
                    sub.push(curr);
                    curr = multiply(curr, g);
                    if (sub.length > targetOrder) break; // Optimization
                }

                // If distinct elements count is 3 and it closed (implied if we reached identity)
                // Actually need to check if elements are distinct.
                // But for cyclic group generated by g:
                // Order of g must be 3.
                if (sub.length === 3 && equals(curr, identity)) {
                    // Check distinctness (already implied if stopped at identity)
                    return sub;
                }
            }
        } else if (targetOrder === 6) {
            // S4 case: subgroup of order 6 is S3 -> generated by {order 2, order 3}
            const order2 = [];
            const order3 = [];

            for (const g of elements) {
                if (equals(g, identity)) continue;
                const g2 = multiply(g, g);
                if (equals(g2, identity)) {
                    order2.push(g);
                } else {
                    const g3 = multiply(g2, g);
                    if (equals(g3, identity)) {
                        order3.push(g);
                    }
                }
            }

            for (const a of order2) {
                for (const b of order3) {
                    // Try to generate S3 with a (ord 2) and b (ord 3)
                    // We can reuse generateSubgroup if we expose it or reimplement small BFS
                    // Re-use exposed generateSubgroup? 
                    // Issue: generateSubgroup is in upper scope but expects options.
                    // Let's just pass options to it.
                    const subData = generateSubgroup([a, b], { multiply, serialize: ctx.serialize, identity });
                    const sub = subData.elements;
                    if (sub.length === 6) return sub;
                }
            }
        }
        return null;
    }

    function getCosetRepresentation(elements, subgroup, { multiply, serialize }) {
        // 1. Identify Cosets
        const cosets = [];
        const remaining = new Set(elements.map(serialize));
        // Serialize subgroup for membership check is risky if serialize is not unique/canonical?
        // Assuming serialize is canonical key.

        while (remaining.size > 0) {
            // Pick a representative
            let rep = null;
            for (const el of elements) {
                if (remaining.has(serialize(el))) {
                    rep = el;
                    break;
                }
            }
            if (!rep) break;

            // Determine coset gH
            const currentCoset = [];
            for (const h of subgroup) {
                const gh = multiply(rep, h);
                const s = serialize(gh);
                if (remaining.has(s)) {
                    remaining.delete(s);
                    currentCoset.push(s);
                }
            }
            cosets.push(currentCoset);
        }

        if (cosets.length !== 4) return null;

        // 2. Build map element -> permutation of {1,2,3,4}
        const map = new Map();

        const elementToCosetIndex = new Map();
        for (let i = 0; i < cosets.length; i++) {
            for (const s of cosets[i]) {
                elementToCosetIndex.set(s, i);
            }
        }

        for (const g of elements) {
            const perm = [];
            for (let i = 0; i < 4; i++) {
                // To find where coset i maps under g:
                // Take representative of coset i (first one found)
                const xStr = cosets[i][0];
                const x = elements.find(e => serialize(e) === xStr);

                const gx = multiply(g, x);
                const gxStr = serialize(gx);

                const targetIndex = elementToCosetIndex.get(gxStr);
                perm[i] = targetIndex + 1; // 1-based index
            }
            map.set(serialize(g), perm);
        }

        return map;
    }

    // --------------------------------------------------
    // Graph layout — Concentric / Backbone Detection
    // --------------------------------------------------

    function layoutCayleyGraph(numNodes, edges, width, height) {
        if (numNodes === 0) return { positions: [] };
        if (numNodes === 1) return { positions: [{ x: width / 2, y: height / 2 }] };

        // 1. Try to find a structural backbone (Cyclic or Concentric)
        // We look for a generator that decomposes the graph into 1, 2, or maybe 3 regular orbits.
        // Ideally 1 (Cyclic) or 2 (Dihedral-ish).

        let bestGen = -1;
        let bestOrbits = null;
        let minOrbitCount = Infinity;

        for (let g = 0; g < edges.length; g++) {
            const orbits = findOrbits(numNodes, edges[g]);
            // Prefer generators that create large cycles.
            // A generator that fixes everyone (orbit count = numNodes) is bad.
            // A generator with order 2 (orbit count = numNodes/2) is less ideal than order N (orbit count 1).
            // We want MIN positive orbit count, but generally < numNodes.

            if (orbits.length < numNodes && orbits.length < minOrbitCount) {
                // Check if orbits are roughly balanced? (Optional, but usually nice)
                minOrbitCount = orbits.length;
                bestGen = g;
                bestOrbits = orbits;
            }
        }

        // Use concentric layout if we found a nice backbone (1 or 2 orbits, or small number <= 4 for larger groups)
        if (bestGen !== -1 && minOrbitCount <= 4) {
            return layoutConcentric(numNodes, bestOrbits, edges, width, height);
        }

        // 2. Fallback: Force-directed simulation
        return layoutForceDirected(numNodes, edges, width, height);
    }

    function findOrbits(numNodes, edgeMap) {
        const visited = new Set();
        const orbits = [];

        for (let i = 0; i < numNodes; i++) {
            if (visited.has(i)) continue;

            const orbit = [];
            let curr = i;
            while (!visited.has(curr)) {
                visited.add(curr);
                orbit.push(curr);
                curr = edgeMap[curr];
                if (curr === undefined) break; // Should not happen in group (permutation)
            }
            orbits.push(orbit);
        }
        return orbits;
    }

    function layoutConcentric(numNodes, orbits, edges, width, height) {
        const positions = new Array(numNodes).fill(null);
        const cx = width / 2;
        const cy = height / 2;

        const numOrbits = orbits.length;
        const maxR = Math.min(width, height) / 2 - 50;
        const minR = 50; // Ensure inner orbit doesn't collapse to center

        // Radii distribution
        const radii = [];
        if (numOrbits === 1) {
            radii.push(maxR * 0.85);
        } else {
            for (let i = 0; i < numOrbits; i++) {
                // Linear interpolation from maxR to minR
                // i=0 -> maxR
                // i=numOrbits-1 -> minR
                const r = maxR - (i * (maxR - minR) / (numOrbits - 1));
                radii.push(r);
            }
        }

        const refOrbit = orbits[0];
        const refN = refOrbit.length;

        // Layout each orbit
        for (let i = 0; i < numOrbits; i++) {
            let orbit = orbits[i]; // Mutable reference (we might reverse it)
            const radius = radii[i];
            const N = orbit.length;

            // Check orientation relative to Orbit 0 (if i > 0)
            if (i > 0) {
                // Heuristic: Check edges from Orbit 0 to Orbit i
                // If u -> v maps indices k -> k (approx), Keep.
                // If u -> v maps indices k -> -k (approx), Reverse.

                let forwardScore = 0;
                let reverseScore = 0;

                // Sample edges
                for (let g = 0; g < edges.length; g++) {
                    const map = edges[g];
                    for (let refIdx = 0; refIdx < refN; refIdx++) {
                        const u = refOrbit[refIdx];
                        const v = map[u];
                        const targetIdx = orbit.indexOf(v);

                        if (targetIdx !== -1) {
                            // Check "slope"
                            // Compare with next neighbor in Ref Orbit
                            const nextRefIdx = (refIdx + 1) % refN;
                            const uNext = refOrbit[nextRefIdx];
                            const vNext = map[uNext];
                            const targetIdxNext = orbit.indexOf(vNext);

                            if (targetIdxNext !== -1) {
                                // Calculate delta in target
                                let delta = targetIdxNext - targetIdx;
                                // Wrap delta
                                if (delta > N / 2) delta -= N;
                                if (delta < -N / 2) delta += N;

                                if (delta > 0) forwardScore++;
                                if (delta < 0) reverseScore++;
                            }
                        }
                    }
                }

                // If reverse correlation is stronger, reverse the orbit
                if (reverseScore > forwardScore) {
                    orbit.reverse();
                    // Update the array in the master list so logic below is consistent
                    orbits[i] = orbit;
                }
            }

            // Phase offset alignment
            let phase = -Math.PI / 2; // Start at top

            if (i > 0) {
                // Align orbit[i] to orbit[0]
                let angleDiffSum = 0;
                let count = 0;

                for (let g = 0; g < edges.length; g++) {
                    const map = edges[g];
                    for (let refIdx = 0; refIdx < refN; refIdx++) {
                        const u = refOrbit[refIdx];
                        const v = map[u];
                        const targetIdx = orbit.indexOf(v);

                        if (targetIdx !== -1) {
                            const refAngle = (refIdx / refN) * 2 * Math.PI;
                            const targetUnphased = (targetIdx / N) * 2 * Math.PI;

                            let diff = refAngle - targetUnphased;
                            while (diff <= -Math.PI) diff += 2 * Math.PI;
                            while (diff > Math.PI) diff -= 2 * Math.PI;

                            angleDiffSum += diff;
                            count++;
                        }
                    }
                }

                if (count > 0) {
                    phase = -Math.PI / 2 + (angleDiffSum / count);
                }

                // Special case for N=2 (e.g. C2 x C2 structure) -> Avoid linear layout
                // If N=2, standard alignment puts inner nodes radially aligned with outer nodes.
                // boosting phase by 90 degrees (PI/2) creates a square/diamond.
                if (N === 2) {
                    phase += Math.PI / 2;
                }
            }

            // Assign positions
            for (let k = 0; k < N; k++) {
                const nodeIndex = orbit[k];
                const angle = phase + (k / N) * 2 * Math.PI;
                positions[nodeIndex] = {
                    x: cx + radius * Math.cos(angle),
                    y: cy + radius * Math.sin(angle)
                };
            }
        }

        return { positions };
    }

    function layoutForceDirected(numNodes, edges, width, height) {
        const positions = [];
        const padding = 60;
        const cx = width / 2;
        const cy = height / 2;
        const maxR = Math.min(width, height) / 2 - padding;

        // Initial placement: circle
        for (let i = 0; i < numNodes; i++) {
            const angle = (2 * Math.PI * i) / numNodes - Math.PI / 2;
            positions.push({
                x: cx + maxR * Math.cos(angle),
                y: cy + maxR * Math.sin(angle),
                vx: 0,
                vy: 0
            });
        }

        // Collect unique edges
        const allEdges = [];
        for (const edgeMap of edges) {
            for (const [from, to] of Object.entries(edgeMap)) {
                allEdges.push({ from: parseInt(from), to: to });
            }
        }

        // Force-directed simulation
        const iterations = 300;
        const repulsion = 5000;
        const attraction = 0.005;
        const damping = 0.9;
        const idealLength = Math.min(200, maxR * 0.6);

        for (let iter = 0; iter < iterations; iter++) {
            const temp = 1 - iter / iterations; // cooling

            // Repulsive forces between all pairs
            for (let i = 0; i < numNodes; i++) {
                for (let j = i + 1; j < numNodes; j++) {
                    let dx = positions[i].x - positions[j].x;
                    let dy = positions[i].y - positions[j].y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    let force = repulsion / (dist * dist);

                    let fx = (dx / dist) * force * temp;
                    let fy = (dy / dist) * force * temp;

                    positions[i].vx += fx;
                    positions[i].vy += fy;
                    positions[j].vx -= fx;
                    positions[j].vy -= fy;
                }
            }

            // Attractive forces along edges
            for (const edge of allEdges) {
                let dx = positions[edge.to].x - positions[edge.from].x;
                let dy = positions[edge.to].y - positions[edge.from].y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                let force = attraction * (dist - idealLength) * temp;

                let fx = (dx / dist) * force;
                let fy = (dy / dist) * force;

                positions[edge.from].vx += fx;
                positions[edge.from].vy += fy;
                positions[edge.to].vx -= fx;
                positions[edge.to].vy -= fy;
            }

            // Center gravity — pull everything toward center
            for (let i = 0; i < numNodes; i++) {
                let dx = cx - positions[i].x;
                let dy = cy - positions[i].y;
                positions[i].vx += dx * 0.001;
                positions[i].vy += dy * 0.001;
            }

            // Apply velocities
            for (let i = 0; i < numNodes; i++) {
                positions[i].vx *= damping;
                positions[i].vy *= damping;
                positions[i].x += positions[i].vx;
                positions[i].y += positions[i].vy;

                // Keep within bounds
                positions[i].x = Math.max(padding, Math.min(width - padding, positions[i].x));
                positions[i].y = Math.max(padding, Math.min(height - padding, positions[i].y));
            }
        }

        return { positions: positions.map(p => ({ x: p.x, y: p.y })) };
    }

    // --------------------------------------------------
    // Rendering
    // --------------------------------------------------

    function renderCayleyGraph(canvas, elements, multiplicationTable, generatorLabels, generatorColors, formatLabelFn, positions, transform, nodeColors) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const formatLabel = formatLabelFn || permToCycleString;

        // Default transform
        const tx = transform ? transform.x : 0;
        const ty = transform ? transform.y : 0;
        const scale = transform ? transform.scale : 1;

        ctx.clearRect(0, 0, W, H);

        if (elements.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '18px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Select at least one generator', W / 2, H / 2);
            return;
        }

        // Positions passed in now
        if (!positions || positions.length !== elements.length) {
            // Fallback if positions invalid (should not happen if logic is correct)
            return;
        }

        // Recalculate node radius based on count (or pass it in?)
        // Consistent with layout
        const nodeRadius = Math.max(12, Math.min(24, 300 / elements.length));

        ctx.save();
        // Apply zoom/pan centered on canvas center
        // Transform: Screen = (Logical - W/2) * Scale + W/2 + T
        // So Logical = (Screen - W/2 - T) / Scale + W/2

        ctx.translate(W / 2 + tx, H / 2 + ty);
        ctx.scale(scale, scale);
        ctx.translate(-W / 2, -H / 2);

        // Draw edges first
        for (let g = 0; g < multiplicationTable.length; g++) {
            const color = generatorColors[g] || '#888';
            const edgeMap = multiplicationTable[g];

            // Check if generator is self-inverse (Order 2)
            const gMapsIdTo = edgeMap[0];
            const gSquaredMapsIdTo = edgeMap[gMapsIdTo];
            const isSelfInverse = (gSquaredMapsIdTo === 0);

            if (isSelfInverse) {
                const visited = new Set();
                for (let i = 0; i < elements.length; i++) {
                    if (visited.has(i)) continue;
                    const from = i;
                    const to = edgeMap[from];

                    if (from === to) {
                        const p = positions[from];
                        drawSelfLoop(ctx, p.x, p.y, color, nodeRadius, g);
                        visited.add(from);
                    } else {
                        if (from < to) {
                            const p1 = positions[from];
                            const p2 = positions[to];
                            drawArrow(ctx, p1.x, p1.y, p2.x, p2.y, color, nodeRadius, g, multiplicationTable.length, true);
                        }
                    }
                }
            } else {
                for (const [fromStr, to] of Object.entries(edgeMap)) {
                    const from = parseInt(fromStr);
                    if (from === to) continue;
                    const p1 = positions[from];
                    const p2 = positions[to];
                    drawArrow(ctx, p1.x, p1.y, p2.x, p2.y, color, nodeRadius, g, multiplicationTable.length, false);
                }
                for (const [fromStr, to] of Object.entries(edgeMap)) {
                    const from = parseInt(fromStr);
                    if (from === to) {
                        const p = positions[from];
                        drawSelfLoop(ctx, p.x, p.y, color, nodeRadius, g);
                    }
                }
            }
        }

        // Draw nodes
        for (let i = 0; i < elements.length; i++) {
            const p = positions[i];
            const label = formatLabel(elements[i]);
            const isIdentity = (i === 0);

            ctx.beginPath();
            ctx.arc(p.x, p.y, nodeRadius, 0, 2 * Math.PI);

            if (nodeColors && nodeColors[i]) {
                ctx.fillStyle = nodeColors[i];
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1.5;
            } else if (isIdentity) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3;
            } else {
                ctx.fillStyle = 'rgba(30, 41, 59, 1.0)'; // Increase opacity to cover lines
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1.5;
            }
            ctx.fill();
            ctx.stroke();

            // Contrast text color if we have a background color
            ctx.fillStyle = (nodeColors && nodeColors[i]) ? '#000000' : (isIdentity ? '#69f0ae' : '#f8fafc');
            const fontSize = Math.max(9, Math.min(13, 180 / elements.length));
            ctx.font = `${fontSize}px Outfit, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x, p.y);
        }

        ctx.restore();

        drawLegend(ctx, W, H, generatorLabels, generatorColors);
    }

    function drawArrow(ctx, x1, y1, x2, y2, color, nodeRadius, genIndex, totalGens, isBidirectional) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.1) return;

        // Offset for multiple edges between same pair
        const offset = (genIndex - (totalGens - 1) / 2) * 8;
        const mx = (x1 + x2) / 2 - (dy / dist) * offset;
        const my = (y1 + y2) / 2 + (dx / dist) * offset;

        // Start and end points (adjusted for node radius)
        const angle1 = Math.atan2(my - y1, mx - x1);
        const sx = x1 + nodeRadius * Math.cos(angle1);
        const sy = y1 + nodeRadius * Math.sin(angle1);

        const angle2 = Math.atan2(my - y2, mx - x2);
        const ex = x2 + nodeRadius * Math.cos(angle2);
        const ey = y2 + nodeRadius * Math.sin(angle2);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;

        if (Math.abs(offset) < 2) {
            // Straight line
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
        } else {
            // Quadratic curve through midpoint
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(mx, my, ex, ey);
        }
        ctx.stroke();

        // Arrowhead at End
        const headLen = 8;
        const headAngle = Math.atan2(ey - my, ex - mx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(headAngle - 0.4), ey - headLen * Math.sin(headAngle - 0.4));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(headAngle + 0.4), ey - headLen * Math.sin(headAngle + 0.4));
        ctx.stroke();

        // Arrowhead at Start (if bidirectional)
        if (isBidirectional) {
            const startHeadAngle = Math.atan2(sy - my, sx - mx);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - headLen * Math.cos(startHeadAngle - 0.4), sy - headLen * Math.sin(startHeadAngle - 0.4));
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - headLen * Math.cos(startHeadAngle + 0.4), sy - headLen * Math.sin(startHeadAngle + 0.4));
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    function drawSelfLoop(ctx, x, y, color, nodeRadius, genIndex) {
        const angle = -Math.PI / 4 + (genIndex * 0.2);
        const rx = x + Math.cos(angle) * nodeRadius * 1.5;
        const ry = y + Math.sin(angle) * nodeRadius * 1.5;
        ctx.beginPath();
        ctx.arc(rx, ry, nodeRadius * 0.8, 0, 2 * Math.PI);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // --------------------------------------------------
    // 3D Rendering Support
    // --------------------------------------------------

    let globalGraph3DInstance = null;
    let globalGraph3DContainer = null;
    let globalGraph3DBackground = null;

    function setup3DContainer(parent) {
        if (!globalGraph3DBackground) {
            // Full-viewport dark background — stays at left:0 so it fills behind the panel
            globalGraph3DBackground = document.createElement('div');
            globalGraph3DBackground.style.position = 'fixed';
            globalGraph3DBackground.style.top = '0';
            globalGraph3DBackground.style.left = '0';
            globalGraph3DBackground.style.width = '100vw';
            globalGraph3DBackground.style.height = '100vh';
            globalGraph3DBackground.style.zIndex = '1';
            globalGraph3DBackground.style.backgroundColor = '#0f172a';
            globalGraph3DBackground.style.pointerEvents = 'none';
            globalGraph3DBackground.style.display = 'none';
            globalGraph3DBackground.id = 'cayley-3d-background';
            document.body.appendChild(globalGraph3DBackground);
        }
        if (!globalGraph3DContainer) {
            // Hit-test container — positioned to match the visible graph area so hover is correct
            globalGraph3DContainer = document.createElement('div');
            globalGraph3DContainer.style.position = 'fixed';
            globalGraph3DContainer.style.top = '0';
            globalGraph3DContainer.style.left = '0';
            globalGraph3DContainer.style.width = '100vw';
            globalGraph3DContainer.style.height = '100vh';
            globalGraph3DContainer.style.zIndex = '2';
            globalGraph3DContainer.style.backgroundColor = 'transparent';
            globalGraph3DContainer.style.display = 'none';
            globalGraph3DContainer.id = 'cayley-3d-container';
            document.body.appendChild(globalGraph3DContainer);
        }
        return globalGraph3DContainer;
    }

    function render3DCayleyGraph(parent, elements, multiplicationTable, generators, options = {}, fixedPositions = null, surfaceType = null) {
        console.log('[render3DCayleyGraph] called — elements:', elements.length, '| generators:', generators.length, '| globalGraph3DContainer:', globalGraph3DContainer, '| globalGraph3DInstance:', !!globalGraph3DInstance);
        if (!window.ForceGraph3D) {
            console.warn("ForceGraph3D not found. Please include 3d-force-graph.js");
            return;
        }

        const { formatLabel, nodeColors } = options;
        const format = formatLabel || (p => JSON.stringify(p));

        const nodes = elements.map((el, i) => {
            const labelText = format(el, i);
            const base = {
                id: i,
                label: `<div style="font-size: 1.2rem; padding: 4px; line-height: 1.4;">${labelText}</div>`,
                isIdentity: i === 0,
                val: i === 0 ? 2 : 1
            };
            if (nodeColors) base.color = nodeColors[i];
            if (fixedPositions && fixedPositions[i]) {
                base.fx = fixedPositions[i].fx;
                base.fy = fixedPositions[i].fy;
                base.fz = fixedPositions[i].fz;
            }
            return base;
        });

        const links = [];
        generators.forEach((gen, gIndex) => {
            const color = gen.color || '#ccc';
            const map = multiplicationTable[gIndex];
            let isOrder2 = true;
            for (let i = 0; i < elements.length; i++) {
                if (map[map[i]] !== i) { isOrder2 = false; break; }
            }
            for (let i = 0; i < elements.length; i++) {
                const source = i;
                const target = map[i];
                if (isOrder2) {
                    if (source <= target) {
                        links.push({ source, target, color, label: gen.label, isUndirected: true });
                    }
                } else {
                    links.push({ source, target, color, label: gen.label, isUndirected: false });
                }
            }
        });

        const container = setup3DContainer(parent);
        if (globalGraph3DBackground) globalGraph3DBackground.style.display = 'block';
        container.style.display = 'block';
        console.log('[render3DCayleyGraph] 3D container:', container, '| offsetWidth:', container.offsetWidth, '| offsetHeight:', container.offsetHeight);

        if (!globalGraph3DInstance) {
            console.log('[render3DCayleyGraph] Creating new ForceGraph3D instance');
            globalGraph3DInstance = ForceGraph3D()(container)
                .backgroundColor('#0f172a')
                .nodeLabel('label')
                .nodeColor(node => node.color ? node.color : (node.isIdentity ? '#fbbf24' : '#38bdf8'))
                .nodeVal('val')
                .linkColor('color')
                .linkWidth(1.5)
                .linkOpacity(0.4)
                .linkDirectionalArrowLength(d => d.isUndirected ? 0 : 3.5)
                .linkDirectionalArrowRelPos(1)
                .nodeResolution(16);
            window.globalGraph3DInstance = globalGraph3DInstance; // Export for debugging
            console.log('[render3DCayleyGraph] ForceGraph3D instance created:', !!globalGraph3DInstance);
        }

        globalGraph3DInstance.graphData({ nodes, links });
        console.log('[render3DCayleyGraph] graphData set — nodes:', nodes.length, '| links:', links.length);

        const scene = globalGraph3DInstance.scene();
        if (globalGraph3DInstance.__customMesh) {
            scene.remove(globalGraph3DInstance.__customMesh);
            globalGraph3DInstance.__customMesh = null;
        }

        if (surfaceType && window.THREE) {
            let geometry, material;
            if (surfaceType === 'torus') {
                geometry = new THREE.TorusGeometry(80, 25, 16, 50);
                material = new THREE.MeshBasicMaterial({ color: 0x555555, wireframe: true, opacity: 0.2, transparent: true });
            } else if (surfaceType === 'cylinder') {
                geometry = new THREE.CylinderGeometry(90, 90, 80, 32, 1, true);
                material = new THREE.MeshBasicMaterial({ color: 0x555555, wireframe: true, opacity: 0.15, transparent: true, side: THREE.DoubleSide });
            }
            if (geometry && material) {
                const mesh = new THREE.Mesh(geometry, material);
                if (surfaceType === 'cylinder') mesh.rotation.x = Math.PI / 2;
                scene.add(mesh);
                globalGraph3DInstance.__customMesh = mesh;
            }
        }

        if (surfaceType === 'torus' || surfaceType === 'cylinder') {
            globalGraph3DInstance.cameraPosition({ x: 150, y: 150, z: 150 });
        } else {
            globalGraph3DInstance.cameraPosition({ x: 0, y: 0, z: 250 });
        }
    }

    function drawLegend(ctx, W, H, labels, colors) {
        const padding = 12;
        const lineHeight = 22;
        const columnWidth = 160;
        const spacingX = 10;
        const titleHeight = 25; // Space for title

        // Fixed position
        const x = 360; // Slightly adjust if needed, or keep as is
        const y = 20;

        // Calculate available height
        const availableHeight = H - y - 20 - titleHeight;
        const maxPerColumn = Math.max(1, Math.floor((availableHeight - 2 * padding) / lineHeight));
        const numColumns = Math.ceil(labels.length / maxPerColumn);

        const totalWidth = numColumns * columnWidth + (numColumns - 1) * spacingX;
        const totalHeight = Math.min(labels.length, maxPerColumn) * lineHeight + padding * 2 + titleHeight;

        // Background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        // Use rect if roundRect is not supported, but roundRect is standard in recent browsers
        if (ctx.roundRect) {
            ctx.roundRect(x, y, totalWidth, totalHeight, 8);
        } else {
            ctx.rect(x, y, totalWidth, totalHeight);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title
        ctx.fillStyle = '#94a3b8'; // SLate-400
        ctx.font = 'bold 14px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText("Generators", x + padding, y + padding);

        // Entries
        for (let i = 0; i < labels.length; i++) {
            const col = Math.floor(i / maxPerColumn);
            const row = i % maxPerColumn;

            const ex = x + padding + col * (columnWidth + spacingX);
            const ey = y + padding + titleHeight + row * lineHeight + lineHeight / 2;

            // Color swatch line
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex + 20, ey);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 3;
            ctx.stroke();

            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '12px Outfit, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            let label = labels[i].replace(/<[^>]*>/g, '');
            const maxTextWidth = columnWidth - 35;
            if (ctx.measureText(label).width > maxTextWidth) {
                // Simple truncation
                while (label.length > 0 && ctx.measureText(label + "...").width > maxTextWidth) {
                    label = label.substring(0, label.length - 1);
                }
                label += "...";
            }
            ctx.fillText(label, ex + 28, ey);
        }
    }

    // --------------------------------------------------
    // Setup and Interaction
    // --------------------------------------------------

    function setupSubgroupBuilder(config) {
        let isActive = false;
        const { getButtonGenerators, canvasContainer, cayleyCanvas, orderDisplay, toggleButton, logicOptions } = config;

        let captureListeners = [];
        let selectedSet = new Set();

        // State for Layout & Interaction
        let currentElements = [];
        let currentMultiplicationTable = [];
        let currentPositions = []; // {x, y} in logical canvas coords
        let currentRadius = 20;
        let currentSymbolicLabels = null;
        let currentGenObjs = [];

        let transform = { scale: 1, x: 0, y: 0 };
        let isPanning = false;
        let isDraggingNode = false;
        let draggedNodeIndex = -1;

        let startX = 0;
        let startY = 0;
        let startTransform = { ...transform };

        let currentOptions = {};

        toggleButton.addEventListener('click', () => {
            isActive = !isActive;
            if (isActive) {
                enterCayleyMode();
            } else {
                exitCayleyMode();
            }
        });

        function enterCayleyMode() {
            toggleButton.textContent = '← Back to Shape';
            toggleButton.classList.add('active');
            selectedSet.clear();

            // Hide non-generator controls marked with data-subgroup-hide
            const controlsSection = toggleButton.closest('.controls-section');
            if (controlsSection) {
                controlsSection.querySelectorAll('[data-subgroup-hide]').forEach(el => {
                    el._prevDisplay = el.style.display;
                    el.style.display = 'none';
                });
            }

            // Reset Transform
            transform = { scale: 1, x: 0, y: 0 };

            // Hide 3D canvas children (but not the cayley canvas or 3D graph container)
            for (const child of canvasContainer.children) {
                if (child !== cayleyCanvas && child.id !== 'cayley-canvas' && child.id !== 'cayley-3d-container') {
                    child.style.visibility = 'hidden';
                }
            }

            console.log('[SubgroupBuilder] enterCayleyMode — window.ForceGraph3D:', !!window.ForceGraph3D, '| globalGraph3DContainer:', globalGraph3DContainer, '| cayleyCanvas:', cayleyCanvas);

            if (window.ForceGraph3D) {
                if (cayleyCanvas) cayleyCanvas.style.display = 'none';
                if (globalGraph3DBackground) globalGraph3DBackground.style.display = 'block';
                if (globalGraph3DContainer) globalGraph3DContainer.style.display = 'block';
                console.log('[SubgroupBuilder] 3D mode: hiding cayleyCanvas, showing 3D container (if exists)');
            } else if (cayleyCanvas) {
                // Move canvas to body so it covers the full viewport, including behind the panel
                document.body.appendChild(cayleyCanvas);
                cayleyCanvas.style.position = 'fixed';
                cayleyCanvas.style.left = '0';
                cayleyCanvas.style.top = '0';
                cayleyCanvas.style.zIndex = '1';
                // Show Cayley canvas and order display
                cayleyCanvas.style.display = 'block';
                cayleyCanvas.style.cursor = 'grab';
                // Size cayley canvas to full viewport so it covers behind the panel
                cayleyCanvas.width = window.innerWidth;
                cayleyCanvas.height = window.innerHeight;
                // Attach Zoom/Pan Listeners
                cayleyCanvas.addEventListener('wheel', handleWheel);
                cayleyCanvas.addEventListener('mousedown', handleMouseDown);
                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
                console.log('[SubgroupBuilder] 2D fallback mode: cayleyCanvas sized to', cayleyCanvas.width, 'x', cayleyCanvas.height);
            }

            if (orderDisplay) orderDisplay.style.display = 'block';

            // Intercept button clicks
            const generators = getButtonGenerators();
            generators.forEach((gen, i) => {
                const handler = (e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();

                    if (selectedSet.has(i)) {
                        selectedSet.delete(i);
                        gen.button.classList.remove('cayley-selected');
                    } else {
                        selectedSet.add(i);
                        gen.button.classList.add('cayley-selected');
                    }
                    buildAndRender();
                };
                gen.button.addEventListener('click', handler, true); // capture phase
                captureListeners.push({ button: gen.button, handler });
            });

            // Initial render (just the identity)
            buildAndRender();

            // On desktop, offset the graph so it is centred in the non-panel area
            if (window.ForceGraph3D && window.innerWidth > 640) {
                requestAnimationFrame(() => {
                    if (globalGraph3DInstance && globalGraph3DContainer) {
                        const panelW = 340;
                        globalGraph3DInstance.width(window.innerWidth - panelW);
                        globalGraph3DContainer.style.left = panelW + 'px';
                        globalGraph3DContainer.style.width = (window.innerWidth - panelW) + 'px';
                    }
                });
            }
        }

        function exitCayleyMode() {
            toggleButton.textContent = 'Subgroup Builder';
            toggleButton.classList.remove('active');

            // Restore non-generator controls
            const controlsSection = toggleButton.closest('.controls-section');
            if (controlsSection) {
                controlsSection.querySelectorAll('[data-subgroup-hide]').forEach(el => {
                    el.style.display = el._prevDisplay !== undefined ? el._prevDisplay : '';
                    delete el._prevDisplay;
                });
            }

            // Remove all capture listeners and selection styling
            captureListeners.forEach(({ button, handler }) => {
                button.removeEventListener('click', handler, true);
                button.classList.remove('cayley-selected');
            });
            captureListeners = [];
            selectedSet.clear();

            if (!window.ForceGraph3D && cayleyCanvas) {
                // Remove Zoom/Pan Listeners
                cayleyCanvas.removeEventListener('wheel', handleWheel);
                cayleyCanvas.removeEventListener('mousedown', handleMouseDown);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                cayleyCanvas.style.cursor = '';
                // Move canvas back to its original container
                cayleyCanvas.style.position = '';
                cayleyCanvas.style.left = '';
                cayleyCanvas.style.top = '';
                cayleyCanvas.style.zIndex = '';
                canvasContainer.appendChild(cayleyCanvas);
            }

            // Show 3D canvas children
            for (const child of canvasContainer.children) {
                if (child !== cayleyCanvas && child.id !== 'cayley-canvas' && child.id !== 'cayley-3d-container') {
                    child.style.visibility = '';
                }
            }

            // Hide Cayley canvas and order display
            if (cayleyCanvas) cayleyCanvas.style.display = 'none';
            if (globalGraph3DBackground) globalGraph3DBackground.style.display = 'none';
            if (globalGraph3DContainer) {
                globalGraph3DContainer.style.display = 'none';
                if (globalGraph3DInstance) {
                    // Reset graph width to full viewport for next time
                    if (window.ForceGraph3D) {
                        globalGraph3DInstance.width(window.innerWidth);
                        globalGraph3DContainer.style.left = '0';
                        globalGraph3DContainer.style.width = '100vw';
                    }
                    // Clear data to remove nodes/links from the scene
                    globalGraph3DInstance.graphData({ nodes: [], links: [] });
                }
            }
            if (orderDisplay) orderDisplay.style.display = 'none';
        }

        const handleWheel = (e) => {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.max(0.1, Math.min(5, transform.scale * (1 + delta)));
            transform.scale = newScale;
            requestAnimationFrame(() => draw());
        };

        const getLogicalPos = (ex, ey) => {
            const rect = cayleyCanvas.getBoundingClientRect();
            const x = ex - rect.left;
            const y = ey - rect.top;

            const W = cayleyCanvas.width;
            const H = cayleyCanvas.height;

            // Inverse of Draw Transform:
            // ScreenX = (LogicalX - W/2) * Scale + W/2 + Tx
            // LogicalX = (ScreenX - Tx - W/2) / Scale + W/2

            const lx = (x - transform.x - W / 2) / transform.scale + W / 2;
            const ly = (y - transform.y - H / 2) / transform.scale + H / 2;
            return { x: lx, y: ly };
        };

        const handleMouseDown = (e) => {
            const pos = getLogicalPos(e.clientX, e.clientY);

            // Check for node hit
            let hitIndex = -1;
            // Scan in reverse order (top rendered nodes first)
            for (let i = currentPositions.length - 1; i >= 0; i--) {
                const nodePos = currentPositions[i];
                const dx = pos.x - nodePos.x;
                const dy = pos.y - nodePos.y;
                // Use a slightly generous hit radius
                if (Math.sqrt(dx * dx + dy * dy) < currentRadius * 1.5) {
                    hitIndex = i;
                    break;
                }
            }

            if (hitIndex !== -1) {
                isDraggingNode = true;
                draggedNodeIndex = hitIndex;
                cayleyCanvas.style.cursor = 'grabbing';
            } else {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                startTransform = { ...transform };
                cayleyCanvas.style.cursor = 'move';
            }
        };

        const handleMouseMove = (e) => {
            if (isDraggingNode && draggedNodeIndex !== -1) {
                const pos = getLogicalPos(e.clientX, e.clientY);
                currentPositions[draggedNodeIndex] = pos;
                requestAnimationFrame(() => draw());
            } else if (isPanning) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                transform.x = startTransform.x + dx;
                transform.y = startTransform.y + dy;
                requestAnimationFrame(() => draw());
            }
        };

        const handleMouseUp = () => {
            isPanning = false;
            isDraggingNode = false;
            draggedNodeIndex = -1;
            cayleyCanvas.style.cursor = 'default';
        };

        cayleyCanvas.addEventListener('wheel', handleWheel);
        cayleyCanvas.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove); // Window to handle drag outside canvas
        window.addEventListener('mouseup', handleMouseUp);

        function handleResize() {
            cayleyCanvas.width = window.innerWidth;
            cayleyCanvas.height = window.innerHeight;
            draw();
        }

        function resetTransform() {
            transform = { scale: 1, x: 0, y: 0 };
        }

        function draw() {
            if (!isActive) return;
            const generators = getButtonGenerators();
            const selectedLabels = [];
            const selectedColors = [];
            for (const i of selectedSet) {
                const gen = generators[i];
                selectedLabels.push(gen.label);
                selectedColors.push(gen.color);
            }

            const formatFn = (p, idx) => {
                if (logicOptions && logicOptions.formatLabel) return logicOptions.formatLabel(p);
                if (currentSymbolicLabels && idx !== undefined) return currentSymbolicLabels[idx];
                return permToCycleString(p);
            };

            console.log('[SubgroupBuilder] draw() — ForceGraph3D available:', !!window.ForceGraph3D, '| elements:', currentElements.length, '| generators:', currentGenObjs.length);
            if (window.ForceGraph3D) {
                console.log('[SubgroupBuilder] → calling render3DCayleyGraph, canvasContainer:', canvasContainer);
                render3DCayleyGraph(canvasContainer, currentElements, currentMultiplicationTable, currentGenObjs, {
                    formatLabel: formatFn,
                    nodeColors: currentOptions ? currentOptions.nodeColors : null
                });
            } else if (cayleyCanvas) {
                console.log('[SubgroupBuilder] → falling back to 2D renderCayleyGraph');
                renderCayleyGraph(cayleyCanvas, currentElements, currentMultiplicationTable, selectedLabels, selectedColors, formatFn, currentPositions, transform);
            }
        }

        function buildAndRender() {
            const generators = getButtonGenerators();

            const selectedGens = [];
            console.log("--- Rebuilding Group ---");
            for (const i of selectedSet) {
                const gen = generators[i];
                selectedGens.push(gen.permutation);

                let genStr = "";
                if (Array.isArray(gen.permutation)) {
                    genStr = permToCycleString(gen.permutation);
                } else {
                    genStr = JSON.stringify(gen.permutation);
                }
                console.log(`Generator ${gen.label || i}: ${genStr}`);
            }

            currentGenObjs = Array.from(selectedSet).map(i => {
                const gen = generators[i];
                return {
                    label: gen.label,
                    color: gen.color,
                    permutation: gen.permutation
                };
            });

            // Ensure Identity
            currentOptions = Object.assign({}, logicOptions || {});
            if (!currentOptions.identity && generators.length > 0) {
                const sample = generators[0].permutation;
                if (Array.isArray(sample)) {
                    currentOptions.identity = identityPerm(sample.length);
                }
            }

            const { elements, multiplicationTable } = generateSubgroup(selectedGens, currentOptions);
            currentElements = elements;
            currentMultiplicationTable = multiplicationTable;

            // Pre-compute symbolic labels if not explicitly opting out or if we want it by default
            // For Subgroup Builder, symbolic labels are generally preferred
            currentSymbolicLabels = getSymbolicLabels(elements, multiplicationTable, currentGenObjs);

            // Analyze Group Structure (before layout)
            const analysis = detectS4A4(elements, selectedGens, currentOptions);

            // Layout
            const W = cayleyCanvas.width;
            const H = cayleyCanvas.height;
            let layout;

            // }
            layout = layoutCayleyGraph(elements.length, multiplicationTable, W, H);
            currentPositions = layout.positions;

            // Update current radius metadata for hit testing
            currentRadius = Math.max(12, Math.min(24, 300 / elements.length));

            const groupName = identifyStructure(elements, multiplicationTable, currentOptions);
            updateOrderDisplay(elements.length, groupName);

            draw();
        }

        function updateOrderDisplay(order, groupName) {
            let html = '';

            if (currentGenObjs.length > 0) {
                html += '<div style="font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.05em;color:#38bdf8;margin-bottom:8px;">Generators</div>';
                currentGenObjs.forEach(gen => {
                    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.85rem;">` +
                        `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${gen.color};flex-shrink:0;"></span>` +
                        `<span style="color:#f1f5f9;">${gen.label}</span>` +
                        `</div>`;
                });
                html += '<div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;padding-top:8px;">';
            }

            html += `<div style="text-align:center;color:#69f0ae;font-weight:600;font-size:0.95rem;">Subgroup order: ${order}</div>`;
            if (groupName) {
                html += `<div style="text-align:center;color:#ffd740;font-size:0.9rem;margin-top:4px;">≅ ${groupName}</div>`;
            }

            if (currentGenObjs.length > 0) html += '</div>';

            orderDisplay.innerHTML = html;
        }

        function reset() {
            // Deselect all buttons
            const generators = getButtonGenerators();
            for (const i of selectedSet) {
                if (generators[i] && generators[i].button) {
                    generators[i].button.classList.remove('cayley-selected');
                }
            }
            selectedSet.clear();

            // Reset view transform
            transform = { scale: 1, x: 0, y: 0 };

            // Rebuild (back to identity)
            buildAndRender();
        }

        function exit() {
            if (isActive) {
                exitCayleyMode();
            }
        }

        return {
            reset,
            exit
        };
    }

    function render3DCayleyGraphPublic(parent, elements, multiplicationTable, generators, options = {}, fixedPositions = null, surfaceType = null) {
        return render3DCayleyGraph(parent, elements, multiplicationTable, generators, options, fixedPositions, surfaceType);
    }


    // --------------------------------------------------
    // Cayley Table Generation & Rendering
    // --------------------------------------------------

    /**
     * Generate the N x N multiplication table for a given set of elements.
     * @param {any[]} elements - Array of group elements.
     * @param {object} options
     * @param {Function} options.multiply - (a, b) => product
     * @param {Function} options.serialize - (a) => unique string
     * @returns {object} { table: number[][], labels: string[] }
     */
    function generateCayleyTable(elements, options = {}) {
        const multiply = options.multiply || composePerm;
        const serialize = options.serialize || (el => el.join(","));
        const elementMap = new Map();
        elements.forEach((el, idx) => elementMap.set(serialize(el), idx));

        const n = elements.length;
        const table = Array.from({ length: n }, () => new Array(n));

        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const product = multiply(elements[r], elements[c]);
                const prodKey = serialize(product);
                const prodIdx = elementMap.get(prodKey);
                table[r][c] = prodIdx !== undefined ? prodIdx : -1;
            }
        }

        return { table };
    }

    /**
     * Render the Cayley Table into a container.
     * @param {HTMLElement} container - The container element.
     * @param {any[]} elements - Group elements.
     * @param {number[][]} table - Multiplication table indices.
     * @param {object} options
     * @param {string} [options.mode='view'] - 'view' or 'test'
     * @param {Function} [options.formatLabel] - (element, index) => string label
     * @returns {object} { checkAnswers: Function, revealAnswers: Function }
     */
    function renderCayleyTable(container, elements, table, options = {}) {
        const mode = options.mode || 'view'; // 'view' or 'test'
        const formatLabel = options.formatLabel || ((el, i) => (i === 0 ? "e" : `g${i}`));

        container.innerHTML = '';
        const tableEl = document.createElement('table');
        tableEl.className = 'cayley-table';

        // Header Row
        const headerRow = document.createElement('tr');
        // Top-left corner cell
        const cornerCell = document.createElement('th');
        cornerCell.innerHTML = '&#8728;'; // Composition symbol
        cornerCell.className = 'cayley-corner';
        headerRow.appendChild(cornerCell);

        const labels = elements.map((el, i) => formatLabel(el, i));

        labels.forEach(label => {
            const th = document.createElement('th');
            th.innerHTML = label; // Allow HTML in labels (subscripts)
            headerRow.appendChild(th);
        });
        tableEl.appendChild(headerRow);

        const inputs = []; // Store inputs for verification

        // Data Rows
        for (let r = 0; r < elements.length; r++) {
            const row = document.createElement('tr');

            // Row Header
            const rowHeader = document.createElement('th');
            rowHeader.innerHTML = labels[r];
            row.appendChild(rowHeader);

            for (let c = 0; c < elements.length; c++) {
                const cell = document.createElement('td');
                const prodIdx = table[r][c];
                const prodLabel = labels[prodIdx];

                if (mode === 'test') {
                    const isIdentityOp = (r === 0 || c === 0);
                    // Mask if not identity op AND random chance
                    const maskChance = Math.min(0.6, 15 / (elements.length * elements.length));
                    if (!isIdentityOp && Math.random() < maskChance) {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'cayley-input';
                        input.dataset.correctIdx = prodIdx;

                        cell.appendChild(input);
                        inputs.push({ input, correctIdx: prodIdx });
                    } else {
                        cell.innerHTML = prodLabel;
                        cell.className = 'cayley-cell-given';
                    }
                } else {
                    cell.innerHTML = prodLabel;
                }

                // Highlight identity in grid (only in view mode, or if revealed)
                if (prodIdx === 0 && mode !== 'test') {
                    cell.classList.add('cayley-identity-cell');
                }

                row.appendChild(cell);
            }
            tableEl.appendChild(row);
        }

        container.appendChild(tableEl);

        // Validation Logic
        const getPlainText = (htmlLabel) => {
            // Replace <sup>k</sup> with ^k
            return htmlLabel.replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<sub>(.*?)<\/sub>/g, '_$1');
        };

        const checkAnswers = () => {
            let correctCount = 0;
            inputs.forEach(item => {
                const val = item.input.value.trim().replace(/\s+/g, ''); // Remove whitespace
                const labelHtml = labels[item.correctIdx];

                // Expected formats:
                // 1. "r^2" (from r<sup>2</sup>)
                // 2. "r2" (loose typing)
                // 3. "rs" (from rs)

                const correctPlain = getPlainText(labelHtml); // e.g. "r^2"
                const correctLoose = correctPlain.replace(/\^/g, ''); // "r2"

                const inputNorm = val; // Already trimmed

                // Allow exact match with plain text, or loose match
                if (inputNorm === correctPlain || inputNorm === correctLoose) {
                    item.input.classList.add('correct');
                    item.input.classList.remove('incorrect');
                    correctCount++;

                    // Optional: If correct and identity, maybe highlight?
                    // User only asked for reveal.
                } else {
                    item.input.classList.add('incorrect');
                    item.input.classList.remove('correct');
                }
            });
            return { total: inputs.length, correct: correctCount };
        };

        const revealAnswers = () => {
            let correctCount = 0;
            inputs.forEach(item => {
                const val = item.input.value.trim().replace(/\s+/g, ''); // Remove whitespace
                const labelHtml = labels[item.correctIdx];

                const correctPlain = getPlainText(labelHtml); // e.g. "r^2"
                const correctLoose = correctPlain.replace(/\^/g, ''); // "r2"
                const inputNorm = val; // Already trimmed

                if (inputNorm === correctPlain || inputNorm === correctLoose) {
                    correctCount++;
                }

                const parent = item.input.parentNode;

                // Replace input with the rendered HTML label
                parent.innerHTML = labelHtml;
                parent.className = 'cayley-cell-given cayley-cell-revealed';

                // Restore identity highlight if applicable
                if (item.correctIdx === 0) {
                    parent.classList.add('cayley-identity-cell');
                }
            });
            return { total: inputs.length, correct: correctCount };
        };

        return { checkAnswers, revealAnswers };
    }

    /**
     * Attempt to decompose G as a direct product H × K.
     * Returns "Name(H) × Name(K)" (larger factor first) or null.
     * Conditions: H∩K = {e}, |H|·|K| = |G|, every h∈H commutes with every k∈K.
     */
    function tryDirectProductDecomposition(elements, multiply, equals, identity) {
        const n = elements.length;
        if (n < 4 || n > 120) return null;

        // Build fast element serialization and index lookup
        const e0 = elements[0];
        const ser = typeof e0 === 'number' ? String
                  : Array.isArray(e0)      ? (e) => e.join(',')
                  :                          JSON.stringify;

        const elemMap = new Map(elements.map((e, i) => [ser(e), i]));
        const toIdx   = (el) => { const k = ser(el); return elemMap.has(k) ? elemMap.get(k) : -1; };
        const idxMul  = (i, j) => toIdx(multiply(elements[i], elements[j]));
        const idxId   = toIdx(identity);
        if (idxId === -1) return null;

        // BFS-generate the closed subgroup from a set of seed indices
        function genSubgroup(seeds) {
            const sg = new Set([idxId, ...seeds]);
            const queue = [idxId, ...seeds];
            let head = 0;
            while (head < queue.length) {
                const i = queue[head++];
                for (const j of sg) {
                    for (const p of [idxMul(i, j), idxMul(j, i)]) {
                        if (p !== -1 && !sg.has(p)) { sg.add(p); queue.push(p); }
                    }
                }
            }
            return sg;
        }

        const seenKeys = new Set();
        const subgroups = [];
        function addSg(sg) {
            const key = [...sg].sort((a, b) => a - b).join(',');
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                subgroups.push([...sg].sort((a, b) => a - b));
            }
        }

        for (let i = 0; i < n; i++) {
            if (i !== idxId) addSg(genSubgroup([i]));
        }
        if (n <= 120) {
            for (let i = 0; i < n; i++) {
                if (i === idxId) continue;
                for (let j = i + 1; j < n; j++) {
                    if (j === idxId) continue;
                    addSg(genSubgroup([i, j]));
                }
            }
        }
        subgroups.sort((a, b) => a.length - b.length);

        for (let i = 0; i < subgroups.length; i++) {
            const H = subgroups[i];
            const hSize = H.length;
            if (hSize <= 1 || hSize >= n || n % hSize !== 0) continue;
            const hSet = new Set(H);

            for (let j = i + 1; j < subgroups.length; j++) {
                const K = subgroups[j];
                const kSize = K.length;
                if (kSize <= 1 || kSize >= n || hSize * kSize !== n) continue;

                // H ∩ K = {e}?
                let ok = true;
                for (const ki of K) {
                    if (ki !== idxId && hSet.has(ki)) { ok = false; break; }
                }
                if (!ok) continue;

                // Every h centralizes every k?
                outer: for (const hi of H) {
                    for (const ki of K) {
                        if (idxMul(hi, ki) !== idxMul(ki, hi)) { ok = false; break outer; }
                    }
                }
                if (!ok) continue;

                // Direct product found — identify each factor recursively
                const hElems = H.map(idx => elements[idx]);
                const kElems = K.map(idx => elements[idx]);
                const hName  = identifyStructure(hElems, null, { multiply, equals, identity });
                const kName  = identifyStructure(kElems, null, { multiply, equals, identity });

                // Larger factor first (matches existing convention)
                return kSize >= hSize ? `${kName} × ${hName}` : `${hName} × ${kName}`;
            }
        }
        return null;
    }

    /**
     * Identify a group's isomorphism class based on its order and element orders.
     * @param {any[]} elements
     * @param {number[][]} table - multiplication table
     * @param {object} options
     */
    function identifyStructure(elements, table, options = {}) {
        const order = elements.length;
        if (order === 1) return "Trivial {e}";

        const multiply = options.multiply || composePerm;
        const identity = options.identity || elements[0];
        const serialize = options.serialize || null;
        const equals = options.equals || (serialize ? ((a, b) => serialize(a) === serialize(b)) : permsEqual);

        // 1. Check if Abelian
        let isAbelian = true;
        for (let i = 0; i < order; i++) {
            for (let j = i + 1; j < order; j++) {
                if (!equals(multiply(elements[i], elements[j]), multiply(elements[j], elements[i]))) {
                    isAbelian = false;
                    break;
                }
            }
            if (!isAbelian) break;
        }

        // 2. Count element orders
        const orders = {};
        for (let i = 0; i < order; i++) {
            let curr = elements[i];
            let k = 1;
            while (!equals(curr, identity) && k <= order) {
                curr = multiply(curr, elements[i]);
                k++;
            }
            orders[k] = (orders[k] || 0) + 1;
        }

        const check = (map) => {
            for (let k in map) {
                if ((orders[k] || 0) !== map[k]) return false;
            }
            return true;
        };

        const isPrime = (n) => {
            if (n < 2) return false;
            for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
            return true;
        };

        if (isAbelian) {
            if (orders[order]) return `C${toUnicodeSubscript(order)}`;
            if (order === 4) return "V₄ (C₂ × C₂)";
            if (order === 8) {
                if (orders[2] === 7) return "C₂ × C₂ × C₂";
                if (orders[4]) return "C₄ × C₂";
            }
            if (order === 12) return "C₂ × C₆";
            if (order === 16) {
                if (check({ 1: 1, 2: 3, 4: 4, 8: 8 })) return "C₂ × C₈";
                if (check({ 1: 1, 2: 3, 4: 12 })) return "C₄ × C₄";
                if (check({ 1: 1, 2: 7, 4: 8 })) return "C₂² × C₄";
                if (orders[2] === 15) return "C₂⁴";
            }
            if (order === 18) return "C₃ × C₆";
            if (order === 20) return "C₂ × C₁₀";
            // General: order = p² (p prime) → C_p × C_p (C_{p²} already caught by cyclic check)
            const sqrtOrder = Math.round(Math.sqrt(order));
            if (sqrtOrder * sqrtOrder === order && isPrime(sqrtOrder)) {
                return `C${toUnicodeSubscript(sqrtOrder)} × C${toUnicodeSubscript(sqrtOrder)}`;
            }
            const dpAbelian = tryDirectProductDecomposition(elements, multiply, equals, identity);
            if (dpAbelian) return dpAbelian;
            return `Abelian (Order ${order})`;
        } else {
            // General check for Dihedral groups D_n (order 2n)
            if (order % 2 === 0) {
                const n = order / 2;
                if (n >= 3) {
                    const expectedOrder2 = (n % 2 === 0) ? (n + 1) : n;
                    if (orders[n] >= 2 && orders[2] === expectedOrder2) {
                        return `D${toUnicodeSubscript(n)}${n === 3 ? " (S₃)" : ""}`;
                    }
                }
            }

            if (order === 8 && orders[4] === 6) return "Q₈";

            if (order === 12) {
                if (check({ 1: 1, 2: 3, 3: 8 })) return "A₄";
                if (check({ 1: 1, 2: 1, 3: 2, 4: 6, 6: 2 })) return "Dic₃";
            }

            if (order === 16) {
                if (check({ 1: 1, 2: 1, 4: 10, 8: 4 })) return "Q₁₆";
                if (check({ 1: 1, 2: 11, 4: 4 })) return "D₄ × C₂";
                if (check({ 1: 1, 2: 5, 4: 6, 8: 4 })) return "SD₁₆";
                if (check({ 1: 1, 2: 3, 4: 4, 8: 8 })) return "M₁₆";
                if (check({ 1: 1, 2: 3, 4: 12 })) {
                    const centre = elements.filter(g => elements.every(h => equals(multiply(g, h), multiply(h, g))));
                    const isSquare = g => elements.some(h => equals(multiply(h, h), g));
                    const nontrivialCentralSquares = centre.filter(g => !equals(g, identity) && isSquare(g)).length;
                    return nontrivialCentralSquares === 1 ? "Q₈ × C₂" : "C₄ ⋊ C₄";
                }
                if (check({ 1: 1, 2: 7, 4: 8 })) {
                    const centre = elements.filter(g => elements.every(h => equals(multiply(g, h), multiply(h, g))));
                    const hasCyclicCentre = centre.some(g => {
                        const g2 = multiply(g, g);
                        return !equals(g2, identity) && equals(multiply(g2, g2), identity);
                    });
                    return hasCyclicCentre ? "Q₈ ⋊ C₂" : "(C₂)² ⋊ C₄";
                }
            }
            if (order === 18) {
                if (check({ 1: 1, 2: 3, 3: 8, 6: 6 })) return "S₃ × C₃";
                if (check({ 1: 1, 2: 9, 3: 8 })) return "Dih(C₃ × C₃)";
            }
            if (order === 20) {
                if (check({ 1: 1, 2: 5, 4: 10, 5: 4 })) return "F₂₀ (Frobenius)";
                if (check({ 1: 1, 2: 1, 4: 10, 5: 4, 10: 4 })) return "Dic₅";
            }
            if (order === 21) {
                if (check({ 1: 1, 3: 14, 7: 6 })) return "C₇ ⋊ C₃";
            }
            if (order === 24) {
                if (check({ 1: 1, 2: 9, 3: 8, 4: 6 })) return "S₄";
                if (check({ 1: 1, 2: 1, 3: 8, 4: 6, 6: 8 })) return "SL(2,3)";
                if (check({ 1: 1, 2: 7, 3: 8, 6: 8 })) return "A₄ × C₂";
                if (check({ 1: 1, 2: 1, 3: 2, 4: 2, 6: 2, 8: 12, 12: 4 })) return "C₃ ⋊ C₈";
                if (check({ 1: 1, 2: 1, 3: 2, 4: 14, 6: 2, 12: 4 })) return "Dic₆";
                if (check({ 1: 1, 2: 1, 3: 2, 4: 18, 6: 2 })) return "C₃ ⋊ Q₈";
            }
            if (order === 27) {
                if (check({ 1: 1, 3: 26 })) return "H₃ (Heisenberg)";
                if (check({ 1: 1, 3: 8, 9: 18 })) return "C₉ ⋊ C₃";
            }
            if (order === 28) {
                if (check({ 1: 1, 2: 1, 4: 14, 7: 6, 14: 6 })) return "Dic₇";
            }
            if (order === 60 && check({ 1: 1, 2: 15, 3: 20, 5: 24 })) return "A₅ / PSL(2,5)";
            if (order === 120) {
                if (check({ 1: 1, 2: 25, 3: 20, 4: 30, 5: 24, 6: 20 })) return "S₅";
                if (check({ 1: 1, 2: 1, 3: 20, 4: 30, 5: 24, 6: 20, 10: 24 })) return "SL(2,5)";
                if (check({ 1: 1, 2: 31, 3: 20, 5: 24, 6: 20, 10: 24 })) return "A\u2085 \u00d7 C\u2082 (I\u2095)";
            }
            if (order === 168 && check({ 1: 1, 2: 21, 3: 56, 4: 42, 7: 48 })) return "PSL(2,7)";
            if (order === 336 && check({ 1: 1, 2: 1, 3: 56, 4: 42, 6: 56, 7: 48, 8: 84, 14: 48 })) return "SL(2,7)";
            if (order === 360 && check({ 1: 1, 2: 45, 3: 80, 4: 90, 5: 144 })) return "A₆";
            if (order === 720 && check({ 1: 1, 2: 75, 3: 80, 4: 180, 5: 144, 6: 240 })) return "S₆";
            if (order === 2520 && check({ 1: 1, 2: 105, 3: 350, 4: 630, 5: 504, 6: 210, 7: 720 })) return "A₇";
            if (order === 5040 && check({ 1: 1, 2: 231, 3: 350, 4: 840, 5: 504, 6: 1470, 7: 720, 10: 504, 12: 420 })) return "S₇";

            const dpNonAbelian = tryDirectProductDecomposition(elements, multiply, equals, identity);
            if (dpNonAbelian) return dpNonAbelian;
            return `Non-Abelian (Order ${order})`;
        }
    }

    function toUnicodeSubscript(n) {
        const subs = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
        return n.toString().split('').map(c => subs[c] || c).join('');
    }

    function checkIfAbelian(elements, multiplicationTable, options = {}) {
        const numGens = multiplicationTable.length;
        if (numGens < 2) return true;
        const numNodes = elements.length;
        for (let i = 0; i < numGens; i++) {
            for (let j = i + 1; j < numGens; j++) {
                for (let k = 0; k < numNodes; k++) {
                    if (multiplicationTable[i][multiplicationTable[j][k]] !== multiplicationTable[j][multiplicationTable[i][k]]) return false;
                }
            }
        }
        return true;
    }

    function formatWord(word, generators, toSuperscriptFn) {
        if (!word || word.length === 0) return "e";
        const parts = [];
        let currentGen = word[0];
        let count = 1;

        for (let i = 1; i <= word.length; i++) {
            if (i < word.length && word[i] === currentGen) {
                count++;
            } else {
                const label = generators[currentGen].label || `g${toSuperscriptFn(currentGen + 1)}`;
                if (count === 1) parts.push(label);
                else parts.push(`${label}${toSuperscriptFn(count)}`);
                if (i < word.length) {
                    currentGen = word[i];
                    count = 1;
                }
            }
        }
        return parts.join('');
    }

    function getSymbolicLabels(elements, multiplicationTable, generators) {
        const n = elements.length;
        const labels = new Array(n).fill(null);
        const words = new Array(n).fill(null);

        const isAbelian = checkIfAbelian(elements, multiplicationTable);

        labels[0] = "e";
        words[0] = [];

        const queue = [0];
        const visited = new Set([0]);

        let head = 0;
        while (head < queue.length) {
            const u = queue[head++];
            generators.forEach((gen, gIdx) => {
                const v = multiplicationTable[gIdx][u];
                if (!visited.has(v)) {
                    visited.add(v);
                    words[v] = [...words[u], gIdx];
                    queue.push(v);
                }
            });
        }

        const toSuperscript = (text) => {
            const sups = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
            return text.toString().split('').map(c => sups[c] || c).join('');
        };

        for (let i = 1; i < n; i++) {
            let word = words[i];
            if (isAbelian) {
                word = [...word].sort((a, b) => a - b);
            }
            labels[i] = formatWord(word, generators, toSuperscript);
        }
        return labels;
    }

    // Public API
    return {
        identityPerm,
        composePerm,
        invertPerm,
        permsEqual,
        permToCycleString,
        getCycleLengths,

        generateSubgroup,
        detectS4A4,
        identifyStructure,
        setupSubgroupBuilder,

        layoutCayleyGraph,
        generateCayleyTable,
        renderCayleyTable,
        renderCayleyGraph,
        render3DCayleyGraph: render3DCayleyGraphPublic,
        getSymbolicLabels
    };

})();

// If in Node environment (for testing), export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CayleyGraph;
}
