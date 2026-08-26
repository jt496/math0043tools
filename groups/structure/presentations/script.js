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

/**
 * Group Presentation Explorer
 * Implements Todd-Coxeter Algorithm to enumerate cosets.
 */

class CosetEnumerator {
    constructor(generators, relations) {
        this.generators = generators; // Array of chars ['a', 'b']
        this.relations = relations;   // Array of strings ['aaaa', 'bb', 'abab']

        // Map generator char to column index (0..n-1) and inverse (n..2n-1)
        this.genMap = new Map();
        this.generators.forEach((g, i) => {
            this.genMap.set(g, i);
            this.genMap.set(g.toUpperCase(), i + this.generators.length);
        });

        this.numGens = this.generators.length;
        this.numCols = 2 * this.numGens;

        // Coset table: rows are cosets, cols are generators and inverses
        // table[coset][char_cloumn] = next_coset
        this.table = [];
        this.cosetCount = 0;

        // Canonical words for each coset
        this.canonicalWords = [];

        // Merge queue for coincidences
        this.mergeQueue = [];
        // Union-find representative array for deleted cosets
        this.representative = [];
    }

    async solve(limit = 5040, onProgress = null) {
        // Initialize coset 1 (identity)
        this.addCoset();
        this.canonicalWords[0] = "";

        let tableChanged = true;
        let lastYield = performance.now();

        while (tableChanged) {
            tableChanged = false;

            // Scan all existing cosets
            for (let i = 0; i < this.cosetCount; i++) {
                if (this.table[i] === undefined) continue;
                for (let rel of this.relations) {
                    // Check validity again in case prev relation deleted i
                    if (this.table[i] === undefined) break;

                    this.scanRelation(i, rel);
                    this.processMerges();
                }
            }

            if (this.isComplete()) return "Finite";

            // Check active cosets against user limit
            let activeCount = 0;
            for (let i = 0; i < this.cosetCount; i++) {
                if (this.table[i] !== undefined) activeCount++;
            }

            if (onProgress && performance.now() - lastYield > 50) {
                onProgress(activeCount);
                await new Promise(r => setTimeout(r, 0));
                lastYield = performance.now();
            }

            if (activeCount > limit) return "Limit Reached";

            // Hard cap on total generated cosets to prevent infinite loops (working space limit)
            if (this.cosetCount > Math.max(limit * 10, 10000)) return "Limit Reached";

            if (!this.defineNextCoset()) {
                if (this.isComplete()) return "Finite";
                // If we can't define new coset and not complete, we might be done?
                // Or we need to loop again?
                // If defineNextCoset returns false, it means all defined cosets have all transitions defined? 
                // Yes. So it is complete.
                return "Finite";
            }
            tableChanged = true;
        }
        return this.isComplete() ? "Finite" : "Incomplete";
    }

    addCoset() {
        this.table[this.cosetCount] = new Array(this.numCols).fill(undefined);
        this.canonicalWords[this.cosetCount] = null;
        this.representative[this.cosetCount] = this.cosetCount;
        this.cosetCount++;
        return this.cosetCount - 1;
    }

    find(c) {
        while (this.representative[c] !== c) c = this.representative[c];
        return c;
    }

    getCol(char) {
        if (this.genMap.has(char)) return this.genMap.get(char);
        return -1;
    }

    getInvCol(colIdx) {
        if (colIdx < this.numGens) return colIdx + this.numGens;
        return colIdx - this.numGens;
    }

    defineTransition(coset, col, nextCoset) {
        // Valid check
        if (this.table[coset] === undefined || this.table[nextCoset] === undefined) return;

        if (this.table[coset][col] === undefined) {
            this.table[coset][col] = nextCoset;

            // Define inverse
            const invCol = this.getInvCol(col);
            if (this.table[nextCoset][invCol] === undefined) {
                this.table[nextCoset][invCol] = coset;
            } else if (this.table[nextCoset][invCol] !== coset) {
                // Conflict
                this.mergeCosets(coset, this.table[nextCoset][invCol]);
            }
        } else if (this.table[coset][col] !== nextCoset) {
            // Conflict
            this.mergeCosets(this.table[coset][col], nextCoset);
        }
        this.processMerges();
    }

    // Scan relation starting at coset i
    scanRelation(startCoset, rel) {
        if (this.table[startCoset] === undefined) return;

        let f = startCoset;
        let fIdx = 0;
        const len = rel.length;

        while (fIdx < len) {
            const char = rel[fIdx];
            const col = this.getCol(char);
            if (this.table[f][col] === undefined) break; // Stuck
            f = this.table[f][col];
            fIdx++;
        }

        if (fIdx === len) {
            if (f !== startCoset) {
                this.mergeCosets(f, startCoset);
            }
            return;
        }

        let b = startCoset;
        let bIdx = len;

        while (bIdx > fIdx + 1) {
            const char = rel[bIdx - 1];
            const col = this.getCol(char);
            const invCol = this.getInvCol(col);

            if (this.table[b][invCol] === undefined) break;
            b = this.table[b][invCol];
            bIdx--;
        }

        if (bIdx === fIdx + 1) {
            const char = rel[fIdx];
            const col = this.getCol(char);
            this.defineTransition(f, col, b);
        }
    }

    mergeCosets(c1, c2) {
        this.mergeQueue.push([c1, c2]);
    }

    processMerges() {
        while (this.mergeQueue.length > 0) {
            const [c1, c2] = this.mergeQueue.pop();
            // Resolve to current representatives via union-find so stale queue
            // entries (where one coset was already merged away) are handled correctly.
            const r1 = this.find(c1);
            const r2 = this.find(c2);
            if (r1 === r2) continue;
            this.performMerge(r1, r2);
        }
    }

    performMerge(c1, c2) {
        if (c1 === c2) return;

        const keep = Math.min(c1, c2);
        const discard = Math.max(c1, c2);

        if (this.table[discard] === undefined || this.table[keep] === undefined) return;

        // Replace all occurrences of discard with keep in the table
        for (let i = 0; i < this.cosetCount; i++) {
            if (this.table[i] === undefined) continue;
            for (let j = 0; j < this.numCols; j++) {
                if (this.table[i][j] === discard) {
                    this.table[i][j] = keep;
                }
            }
        }

        // Move definitions from discard to keep
        const discardRow = this.table[discard];
        this.table[discard] = undefined; // Delete immediately
        this.representative[discard] = keep; // Union-find: point discard → keep

        const keepRow = this.table[keep];

        for (let j = 0; j < this.numCols; j++) {
            const dest = discardRow[j];
            if (dest !== undefined) {
                // dest matches discard, but discard is now keep (already replaced above if loop order correct? 
                // No, discardRow is a reference or copy? Reference. 
                // But we replaced occurrences in *rows*. discardRow is the row *of* discard.
                // Its contents might point to discard?
                // We should map dest too: if dest == discard, it's keep.

                let finalDest = dest === discard ? keep : dest;

                if (keepRow[j] !== undefined) {
                    if (keepRow[j] !== finalDest) {
                        // Conflict!
                        this.mergeQueue.push([keepRow[j], finalDest]);
                    }
                } else {
                    keepRow[j] = finalDest;
                    // Fix inverse
                    const inv = this.getInvCol(j);
                    // table[finalDest] might be undefined if finalDest was discard? 
                    // No, finalDest is keep or some other. 
                    // If finalDest is keep, table[keep] is keepRow.

                    if (this.table[finalDest] !== undefined) {
                        if (this.table[finalDest][inv] === undefined) {
                            this.table[finalDest][inv] = keep;
                        } else if (this.table[finalDest][inv] !== keep) {
                            this.mergeQueue.push([this.table[finalDest][inv], keep]);
                        }
                    }
                }
            }
        }

    }

    defineNextCoset() {
        // Find first undefined entry in table
        for (let i = 0; i < this.cosetCount; i++) {
            if (this.table[i] === undefined) continue;

            for (let j = 0; j < this.numGens; j++) { // Only define forward gens? Or all? Usually generators.
                if (this.table[i][j] === undefined) {
                    const next = this.addCoset();
                    this.defineTransition(i, j, next);

                    // Track word: word(next) = word(i) + char(j)
                    if (this.canonicalWords[i] !== null) {
                        this.canonicalWords[next] = this.canonicalWords[i] + this.generators[j];
                    }
                    return true;
                }
            }
        }
        return false;
    }

    isComplete() {
        for (let i = 0; i < this.cosetCount; i++) {
            if (this.table[i] === undefined) continue;
            for (let j = 0; j < this.numCols; j++) {
                if (this.table[i][j] === undefined) return false;
            }
        }
        return true;
    }

    compactTable() {
        // Remove undefined rows and remap indices to 0..N-1
        const map = new Map();
        let newIdx = 0;
        for (let i = 0; i < this.cosetCount; i++) {
            if (this.table[i] !== undefined) {
                map.set(i, newIdx++);
            }
        }

        const validRows = [];
        const words = [];

        for (let i = 0; i < this.cosetCount; i++) {
            if (this.table[i] !== undefined) {
                const row = this.table[i].map(x => map.get(x));
                validRows.push(row);
                // Reconstruct words (BFS for shortest words would be better here)
                words.push("");
            }
        }

        // Re-compute canonical words using BFS on the finalized table
        const q = [0];
        const dist = new Array(newIdx).fill(-1);
        dist[0] = 0;
        words[0] = "";

        let head = 0;
        while (head < q.length) {
            const u = q[head++];
            if (u === undefined) continue;

            const w = words[u];

            for (let j = 0; j < this.numGens; j++) {
                const v = validRows[u][j];
                if (v !== undefined && dist[v] === -1) {
                    dist[v] = dist[u] + 1;
                    const char = this.generators[j];
                    words[v] = w + char;
                    q.push(v);
                }
            }

            // Also check inverses for shortest path? Standard presentation words usually just use generators.
            // But if we want shortest unique words, we might use inverses too if allowed.
            // let's stick to positive generators if possible, or support inverses if needed.
        }

        return { table: validRows, words: words, size: newIdx };
    }
}

// ── Shared relation-parsing utilities (also used by homomorphisms and representations) ──

function expandRelation(str, knownOrders = null) {
    let expanded = str.replace(/\s+/g, '');
    // Handle identity symbols early
    if (expanded === '1' || expanded === 'e' || expanded === '') return '';

    let changed = true;
    while (changed) {
        changed = false;
        if (expanded.match(/([a-zA-Z])\^(-?\d+)/)) {
            expanded = expanded.replace(/([a-zA-Z])\^(-?\d+)/g, (_, char, pow) => {
                let p = parseInt(pow);
                // Smart Reduction: If we know the order of this generator, reduce the power
                if (knownOrders && knownOrders.has(char)) {
                    const n = knownOrders.get(char);
                    p = ((p % n) + n) % n; // Canonical power in [0, n-1]
                    if (p > n / 2) p -= n; // Shift to [-n/2, n/2] to minimize word length
                }
                if (p === 0) return '';
                if (p > 0) return char.repeat(p);
                const invChar = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
                return invChar.repeat(Math.abs(p));
            });
            changed = true;
        }
        if (expanded.match(/\(([^()]+)\)\^(-?\d+)/)) {
            expanded = expanded.replace(/\(([^()]+)\)\^(-?\d+)/g, (_, content, pow) => {
                const p = parseInt(pow);
                if (p >= 0) return content.repeat(p);
                const invContent = content.split('').reverse().map(c =>
                    c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()
                ).join('');
                return invContent.repeat(Math.abs(p));
            });
            changed = true;
        }
        if (expanded.match(/\[([^,]+),([^\]]+)\]/)) {
            expanded = expanded.replace(/\[([^,]+),([^\]]+)\]/g, (_, A, B) =>
                `(${A}${B}(${A})^-1(${B})^-1)`
            );
            changed = true;
        }
    }
    // Final cleanup of identity symbols if they appeared during expansion
    expanded = expanded.replace(/[()]/g, '').replace(/1|e/g, '');
    return expanded;
}

function parseRelations(relsStr) {
    const out = []; let cur = '', bl = 0;
    for (const ch of relsStr) {
        if (ch === '[') bl++; else if (ch === ']') bl--;
        if (ch === ',' && bl === 0) {
            if (cur.trim()) {
                const multiPart = cur.trim();
                if (multiPart.includes('=')) {
                    const parts = multiPart.split('=');
                    for (let i = 0; i < parts.length - 1; i++) {
                        out.push(`${parts[i].trim()} = ${parts[i + 1].trim()}`);
                    }
                } else {
                    out.push(multiPart);
                }
            }
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) {
        const multiPart = cur.trim();
        if (multiPart.includes('=')) {
            const parts = multiPart.split('=');
            for (let i = 0; i < parts.length - 1; i++) {
                out.push(`${parts[i].trim()} = ${parts[i + 1].trim()}`);
            }
        } else {
            out.push(multiPart);
        }
    }
    return out;
}

function relToWord(rel, knownOrders = null) {
    if (rel.includes('=')) {
        const parts = rel.split('=');
        // Now parseRelations handles multiple =, so we only expect 2 parts here
        const lhs = expandRelation(parts[0].trim(), knownOrders);
        const rhs = expandRelation(parts[1].trim(), knownOrders);

        if (rhs === '') return lhs;
        if (lhs === '') {
            // If lhs is identity, relation is rhs = 1
            return rhs;
        }

        const invRhs = rhs.split('').reverse().map(c =>
            c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()
        ).join('');
        return lhs + invRhs;
    }
    return expandRelation(rel, knownOrders);
}

/**
 * If the compact coset table represents a dihedral group D_n, returns
 * { table, words } with elements in the standard order:
 *   e, r, r², …, r^(n-1), s, rs, r²s, …, r^(n-1)s
 * where generators[0] is the rotation and generators[1] is the reflection.
 * Returns null if the structure is not dihedral.
 */
function getDihedralCanonical(table, size, generators) {
    if (generators.length !== 2 || size % 2 !== 0) return null;
    const n = size / 2;
    if (n < 2) return null;

    const rCol = 0; // column for generators[0] (rotation)
    const sCol = 1; // column for generators[1] (reflection)

    // Build powers of r: rPowers[k] = element index of r^k
    const rPowers = [0];
    let curr = table[0][rCol];
    for (let k = 1; k < n; k++) {
        rPowers.push(curr);
        curr = table[curr][rCol];
    }
    // Verify r has order exactly n
    if (curr !== 0) return null;

    const sElem = table[0][sCol];
    // Verify s² = e
    if (table[sElem][sCol] !== 0) return null;

    // Verify dihedral relation: s·r·s = r⁻¹ = r^(n-1)
    const srElem  = table[sElem][rCol];      // s·r
    const srsElem = table[srElem][sCol];     // s·r·s
    if (srsElem !== rPowers[n - 1]) return null;

    // Build new ordering: [e, r, …, r^(n-1), s, rs, …, r^(n-1)s]
    const perm     = [];  // perm[newIdx] = oldIdx
    const newWords = [];
    const rChar = generators[0];
    const sChar = generators[1];

    for (let k = 0; k < n; k++) {
        perm.push(rPowers[k]);
        newWords.push(rChar.repeat(k));
    }
    for (let k = 0; k < n; k++) {
        perm.push(table[rPowers[k]][sCol]);
        newWords.push(rChar.repeat(k) + sChar);
    }

    // Verify all 2n indices are distinct (sanity check)
    if (new Set(perm).size !== size) return null;

    // Build inverse permutation: oldIdx → newIdx
    const invPerm = new Array(size);
    for (let i = 0; i < size; i++) invPerm[perm[i]] = i;

    // Remap the table rows and targets to the new indices
    const newTable = perm.map(oldIdx => table[oldIdx].map(x => invPerm[x]));

    return { table: newTable, words: newWords };
}

// ── Definite infinity detection ───────────────────────────────────────────────

/** Rank of an integer matrix treated as a ℚ-matrix (Gaussian elimination). */
function matrixRankOverQ(rows, cols) {
    if (rows.length === 0 || cols === 0) return 0;
    const m = rows.map(r => r.slice());
    let rank = 0;
    for (let col = 0; col < cols; col++) {
        let pivotRow = -1;
        for (let row = rank; row < m.length; row++) {
            if (m[row][col] !== 0) { pivotRow = row; break; }
        }
        if (pivotRow === -1) continue;
        [m[rank], m[pivotRow]] = [m[pivotRow], m[rank]];
        const pivot = m[rank][col];
        for (let row = 0; row < m.length; row++) {
            if (row !== rank && m[row][col] !== 0) {
                const f = m[row][col] / pivot;
                for (let c = 0; c < cols; c++) m[row][c] -= f * m[rank][c];
            }
        }
        rank++;
    }
    return rank;
}

/**
 * Condition 4: Free product decomposition.
 *
 * Builds a generator–relation incidence graph and finds its connected
 * components using union-find.  If there are ≥ 2 components that each
 * present a non-trivial group, the whole group is a non-trivial free
 * product and therefore infinite.
 *
 * A component is "definitely non-trivial" if it has ≥ 1 generator and
 * none of its relations is a length-1 word (which would trivialise that
 * generator immediately).
 */
function checkFreeProduct(generators, nonEmptyRels) {
    const n = generators.length;
    if (n < 2) return null;

    const genIdx = new Map(generators.map((g, i) => [g, i]));

    // For each relation, collect which generator indices it mentions
    const relGenSets = nonEmptyRels.map(word => {
        const s = new Set();
        for (const ch of word) {
            const lower = ch.toLowerCase();
            if (genIdx.has(lower)) s.add(genIdx.get(lower));
        }
        return s;
    });

    // Union-Find: merge generators that share a relation
    const parent = generators.map((_, i) => i);
    function find(x) {
        while (parent[x] !== x) x = parent[x] = parent[parent[x]];
        return x;
    }
    function union(x, y) { parent[find(x)] = find(y); }

    for (const s of relGenSets) {
        const arr = [...s];
        for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
    }

    // Group generators and relations by component root
    const compGens = new Map();
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!compGens.has(root)) compGens.set(root, []);
        compGens.get(root).push(generators[i]);
    }
    if (compGens.size < 2) return null;

    const compRels = new Map();
    compGens.forEach((_, root) => compRels.set(root, []));
    for (let ri = 0; ri < nonEmptyRels.length; ri++) {
        const s = relGenSets[ri];
        if (s.size === 0) continue;
        compRels.get(find([...s][0])).push(nonEmptyRels[ri]);
    }

    // A component is non-trivial if it has no length-1 relator (g = e)
    const roots = [...compGens.keys()];
    const nonTrivialCount = roots.filter(root =>
        !compRels.get(root).some(w => w.length === 1)
    ).length;
    if (nonTrivialCount < 2) return null;

    // Build a readable label for each factor
    function factorLabel(root) {
        const gens = compGens.get(root);
        const rels = compRels.get(root);
        // Single generator, single power relation g^n → identify as Cₙ or ℤ
        if (gens.length === 1 && rels.length === 0) return 'ℤ';
        if (gens.length === 1 && rels.length === 1) {
            const w = rels[0];
            const g = gens[0];
            if ([...w].every(c => c === g)) {
                const order = w.length;
                return `C<sub>${order}</sub>`;
            }
        }
        const relsStr = rels.length === 0 ? '' : ` | ${rels.length} relation${rels.length > 1 ? 's' : ''}`;
        return `⟨${gens.join(', ')}${relsStr}⟩`;
    }

    const factorLabels = roots.map(factorLabel);
    const last = factorLabels.pop();
    const factorsStr = factorLabels.length
        ? factorLabels.join(', ') + ' and ' + last
        : last;

    return `The generators and relations split into ${compGens.size} independent factors — `
         + `${factorsStr} — with no relation linking generators from different factors. `
         + `The group is the free product of these factors. `
         + `A free product of two or more non-trivial groups always contains elements of `
         + `infinite order and is therefore infinite.`;
}

/**
 * Returns a human-readable reason string if the group is definitely infinite,
 * or null if no simple sufficient condition applies.
 *
 * Conditions checked (in order):
 *   1. No non-trivial relations → free group.
 *   2. Some generator absent from every relation → infinite cyclic factor.
 *   3. Abelianisation has free rank > 0 (exponent-matrix rank < n generators).
 *   4. Free product decomposition: generators/relations split into ≥ 2 independent
 *      subpresentations, each presenting a non-trivial group.
 */
function checkDefinitelyInfinite(generators, parsedRels) {
    const n = generators.length;
    if (n === 0) return null;

    const nonEmpty = parsedRels.filter(w => w.length > 0);

    // Condition 1: no relations
    if (nonEmpty.length === 0) {
        if (n === 1)
            return `No relation is imposed on the generator, so it has infinite order. `
                 + `This is the infinite cyclic group ℤ.`;
        return `No relations are imposed on any generator. `
             + `This is the free group on ${n} generators F<sub>${n}</sub>, which is infinite.`;
    }

    // Condition 2: some generator absent from every relation
    for (const g of generators) {
        const G = g.toUpperCase();
        if (!nonEmpty.some(w => w.includes(g) || w.includes(G))) {
            return `Generator '${g}' does not appear in any relation, so no relation `
                 + `bounds its order. The subgroup ⟨${g}⟩ ≅ ℤ is an infinite cyclic `
                 + `subgroup, so the group is infinite.`;
        }
    }

    // Condition 3: abelianisation has a free part
    // Compute the exponent vector of each relator in ℤⁿ.
    const expMatrix = nonEmpty.map(word => {
        const v = new Array(n).fill(0);
        for (const ch of word) {
            const lower = ch.toLowerCase();
            const idx = generators.indexOf(lower);
            if (idx !== -1) v[idx] += (ch === lower) ? 1 : -1;
        }
        return v;
    });

    const rank = matrixRankOverQ(expMatrix, n);
    if (rank < n) {
        const freeRank = n - rank;
        return `The abelianisation of this group (obtained by requiring all generators `
             + `to commute) has free rank ${freeRank}: the relation matrix has rank `
             + `${rank} &lt; ${n} generators. Because the abelianisation is infinite, `
             + `the group itself is infinite.`;
    }

    // Condition 4: free product decomposition
    const freeProductReason = checkFreeProduct(generators, nonEmpty);
    if (freeProductReason) return freeProductReason;

    return null;
}

// ── Canonical group presentations (superset of all pages' group lists) ────────
const GROUP_PRESETS = {
    C2: { label: 'C\u2082 \u2014 Cyclic (order 2)', gens: 'r', rels: 'r^2' },
    C3: { label: 'C\u2083 \u2014 Cyclic (order 3)', gens: 'r', rels: 'r^3' },
    C4: { label: 'C\u2084 \u2014 Cyclic (order 4)', gens: 'r', rels: 'r^4' },
    C5: { label: 'C\u2085 \u2014 Cyclic (order 5)', gens: 'r', rels: 'r^5' },
    C6: { label: 'C\u2086 \u2014 Cyclic (order 6)', gens: 'r', rels: 'r^6' },
    C2xC2: { label: 'C\u2082\u00d7C\u2082 \u2014 Klein four (order 4)', gens: 'a, b', rels: 'a^2, b^2, ba = ab' },
    S3: { label: 'S\u2083 \u2014 Symmetric (order 6)', gens: 'r, s', rels: 'r^3, s^2, sr = r^2s' },
    D4: { label: 'D\u2084 \u2014 Dihedral (order 8)', gens: 'r, s', rels: 'r^4, s^2, sr = r^3s' },
    D5: { label: 'D\u2085 \u2014 Dihedral (order 10)', gens: 'r, s', rels: 'r^5, s^2, sr = r^4s' },
    D6: { label: 'D\u2086 \u2014 Dihedral (order 12)', gens: 'r, s', rels: 'r^6, s^2, sr = r^5s' },
    Q8: { label: 'Q\u2088 \u2014 Quaternion (order 8)', gens: 'i, j', rels: 'i^4, i^2j^2, ijij^-1' },
    A4: { label: 'A\u2084 \u2014 Alternating (order 12)', gens: 'a, b', rels: 'a^2, b^3, (ab)^3' },
    S4: { label: 'S\u2084 \u2014 Symmetric (order 24)', gens: 'a, b', rels: 'a^2, b^4, (ab)^3' },
    Oh: { label: 'O\u2095 \u2014 Octahedral (order 48)', gens: 'a, b, c', rels: 'a^2, b^4, (ab)^3, c^2, ac = ca, bc = cb' },
    Ih: { label: 'I\u2095 \u2014 Icosahedral (order 120)', gens: 'a, b, c', rels: 'a^2, b^3, (ab)^5, c^2, ac = ca, bc = cb' },
    F20: { label: 'F\u2082\u2080 \u2014 Frobenius (order 20)', gens: 'a, b', rels: 'a^5, b^4, ba = a^2b' },
    Dic5: { label: 'Dic\u2085 \u2014 Dicyclic (order 20)', gens: 'a, b', rels: 'a^10, b^2 = a^5, ba = Ab' },
    C7C3: { label: 'C\u2087\u22caC\u2083 \u2014 Non-abelian (order 21)', gens: 'a, b', rels: 'a^7, b^3, ba = a^2b' },
    C3C8: { label: 'C\u2083\u22caC\u2088 \u2014 Semidirect (order 24)', gens: 'a, b', rels: 'a^3, b^8, ba = Ab' },
    Dic6: { label: 'Dic\u2086 \u2014 Dicyclic (order 24)', gens: 'a, b', rels: 'a^12, b^2 = a^6, ba = Ab' },
    C3Q8: { label: 'C\u2083\u22caQ\u2088 \u2014 Semidirect (order 24)', gens: 'a, b, c', rels: 'a^3, b^4, b^2 = c^2, cb = Bc, ba = Ab, ca = Ac' },
    Heis: { label: 'H\u2083 \u2014 Heisenberg (order 27)', gens: 'a, b, c', rels: 'a^3, b^3, c^3, [a,b] = c, [a,c], [b,c]' },
    C9C3: { label: 'C\u2089\u22caC\u2083 \u2014 Semidirect (order 27)', gens: 'a, b', rels: 'a^9, b^3, ba = a^4b' },
    Dic7: { label: 'Dic\u2087 \u2014 Dicyclic (order 28)', gens: 'a, b', rels: 'a^14, b^2 = a^7, ba = Ab' },
    A5: { label: 'A\u2085 \u2014 Alternating (order 60)', gens: 'a, b', rels: 'a^2, b^3, (ab)^5' },
    S5: { label: 'S\u2085 \u2014 Symmetric (order 120)', gens: 'a, b', rels: 'a^2, b^5, (ab)^4, (bab^3ab)^2' },
    A6: { label: 'A\u2086 \u2014 Alternating (order 360)', gens: 'a, b', rels: 'a^2, b^4, (ab)^5, (ab^2)^5' },
    A7: { label: 'A\u2087 \u2014 Alternating (order 2520)', gens: 'a, b', rels: 'a^3, b^5, (ab)^7, (aBab)^2, (aBBabb)^2' },
    S6: { label: 'S\u2086 \u2014 Symmetric (order 720)', gens: 'a, b', rels: 'a^2, b^6, (ab)^5, (aBab)^3, (aBBabb)^2' },
    S7: { label: 'S\u2087 \u2014 Symmetric (order 5040)', gens: 'a, b', rels: 'a^2, b^7, (ab)^6, (aBab)^3, (aB^2ab^2)^2' },
    SL23: { label: 'SL(2,3) \u2014 Special linear (order 24)', gens: 'a, b', rels: 'a^3 = b^3, b^3 = (ab)^2' },
    PSL23: { label: 'PSL(2,3) \u2014 Projective special linear (order 12)', gens: 'a, b', rels: 'a^2, b^3, (ab)^3' },
    SL25: { label: 'SL(2,5) \u2014 Special linear (order 120)', gens: 'a, b', rels: 'a^2 = b^3, b^3 = (ab)^5, a^4 = 1' },
    PSL25: { label: 'PSL(2,5) \u2014 Projective special linear (order 60)', gens: 'a, b', rels: 'a^2, b^3, (ab)^5' },
    SL27: { label: 'SL(2,7) \u2014 Special linear (order 336)', gens: 'a, b', rels: 'a^2 = b^3, b^3 = (ab)^7, b^3 = [a, b]^4' },
    PSL27: { label: 'PSL(2,7) \u2014 Projective special linear (order 168)', gens: 'a, b', rels: 'a^2, b^3, (ab)^7, [a, b]^4' }
};

// === UI Logic ===

const analyzeBtn = document.getElementById('analyze-btn');
if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
        const statusText = document.getElementById('status-text');
        const resultsSection = document.getElementById('results-section');
        const orderEl = document.getElementById('group-order');
        const listEl = document.getElementById('elements-list');
        const tableContainer = document.getElementById('cayley-table-container');
        const structureEl = document.getElementById('group-structure');
        const cayleyTableSection = document.getElementById('cayley-table-section');
        const wordProblemSection = document.getElementById('word-problem-section');
        const wordProblemResult = document.getElementById('word-problem-result');

        // Clear previous
        resultsSection.classList.remove('hidden');
        orderEl.textContent = "Calculating...";
        structureEl.textContent = "-";
        listEl.innerHTML = "";
        tableContainer.innerHTML = "";
        cayleyTableSection.style.display = 'none';
        wordProblemSection.style.display = 'none';
        wordProblemResult.textContent = 'Waiting for input...';
        statusText.textContent = "Running Todd-Coxeter...";
        statusText.style.color = "#fbbf24"; // Warning/Processing color
        statusText.classList.add('pulsing');

        // Parse Inputs
        const gensInput = document.getElementById('generators-input').value;
        const relsInput = document.getElementById('relations-input').value;
        const limitInput = 5040;

        const generators = gensInput.split(',').map(s => s.trim().replace(/[^a-zA-Z]/g, '').slice(0, 1)).filter(s => s.length > 0);

        const relations = parseRelations(relsInput);

        // --- Smart Power Reduction (Two-Pass Parsing) ---
        const knownOrders = new Map();
        // Pass 1: Find pure power relations g^n = 1 or g^n = e
        relations.forEach(rel => {
            const trimmed = rel.replace(/\s+/g, '');
            const parts = trimmed.split('=');
            if (parts.length === 2 && (parts[1] === '1' || parts[1] === 'e' || parts[1] === '')) {
                const match = parts[0].match(/^([a-zA-Z])\^(\d+)$/);
                if (match) {
                    const gen = match[1];
                    const order = parseInt(match[2]);
                    if (order > 0) knownOrders.set(gen, order);
                }
            } else {
                const match = trimmed.match(/^([a-zA-Z])\^(\d+)$/);
                if (match) {
                    const gen = match[1];
                    const order = parseInt(match[2]);
                    if (order > 0) knownOrders.set(gen, order);
                }
            }
        });

        const parsedRels = relations.map(rel => {
            const word = relToWord(rel, knownOrders);
            // If the relation was simplified to identity (empty string), but it wasn't
            // originally empty/identity, it means we likely simplified a full defining relation
            // like r^50 = 1. In this case, we MUST keep the full expansion for Todd-Coxeter to work.
            if (word === "") {
                const expanded = relToWord(rel, null);
                if (expanded !== "") return expanded;
            }
            return word;
        });

        // Run Algorithm (Async to update UI)
        setTimeout(async () => {
            try {
                // ── Definite infinity check ──────────────────────────────────
                const infiniteReason = checkDefinitelyInfinite(generators, parsedRels);
                if (infiniteReason) {
                    statusText.textContent = "Group is infinite";
                    statusText.style.color = "#a78bfa";
                    statusText.classList.remove('pulsing');
                    orderEl.textContent = "∞";
                    structureEl.textContent = "Infinite group";
                    listEl.innerHTML = `<span style="color:var(--text-secondary); font-style:italic;">${infiniteReason}</span>`;
                    tableContainer.innerHTML = '';
                    window.currentSolver = null;
                    window.currentTable = null;
                    window.currentWords = null;
                    return;
                }

                const solver = new CosetEnumerator(generators, parsedRels);
                const result = await solver.solve(limitInput, (count) => {
                    statusText.textContent = `Running Todd-Coxeter... (${count} elements found)`;
                });

                if (result === "Finite") {
                    const { table: rawTable, words: rawWords, size } = solver.compactTable();

                    // Apply dihedral canonical ordering if applicable
                    const dihedral = getDihedralCanonical(rawTable, size, generators);
                    const table = dihedral ? dihedral.table : rawTable;
                    const words = dihedral ? dihedral.words : rawWords;

                    // Expose for Word Problem
                    window.currentSolver = solver;
                    window.currentTable = table;
                    window.currentWords = words;

                    statusText.textContent = "Calculation Complete";
                    statusText.style.color = "#22c55e"; // Success
                    statusText.classList.remove('pulsing');
                    orderEl.textContent = size;

                    // 1. Build Full Multiplication Table
                    const fullTable = Array.from({ length: size }, () => new Int32Array(size));
                    for (let r = 0; r < size; r++) {
                        for (let c = 0; c < size; c++) {
                            let curr = r;
                            const wordJ = words[c];
                            for (let char of wordJ) {
                                const col = solver.getCol(char);
                                curr = table[curr][col];
                            }
                            fullTable[r][c] = curr;
                        }
                    }

                    // 2. Identify Group using full table
                    const groupDesc = CayleyGraph.identifyStructure(
                        Array.from({ length: size }, (_, i) => i),
                        fullTable,
                        {
                            multiply: (i, j) => fullTable[i][j],
                            equals: (a, b) => a === b,
                            identity: 0
                        }
                    );
                    document.getElementById('group-structure').textContent = groupDesc;

                    // List elements
                    listEl.replaceChildren(); // clear
                    const listStr = words.map(w => w === "" ? "e" : formatWord(w)).join(", ");
                    listEl.innerHTML = listStr; // Use innerHTML for superscripts

                    // Render Table
                    if (size <= 60) {
                        renderCayleyTable(tableContainer, words, table, solver);
                    } else {
                        tableContainer.innerHTML = `<p style="padding: 1rem; color: var(--text-secondary); text-align: center;">Table too large to display (${size} x ${size}).</p>`;
                    }

                    // Show table and word problem sections now that we have a valid table
                    cayleyTableSection.style.display = '';
                    wordProblemSection.style.display = '';

                } else {
                    statusText.textContent = "Algorithm limit reached (Group may be infinite)";
                    statusText.style.color = "#ef4444";
                    statusText.classList.remove('pulsing');
                    orderEl.textContent = `> ${limitInput}`;
                }
            } catch (e) {
                console.error(e);
                statusText.textContent = "Error: " + e.message;
                statusText.style.color = "#ef4444";
                statusText.classList.remove('pulsing');
            }
        }, 100);
    });
}

function formatWord(word) {
    if (!word) return "e";
    return word.replace(/([a-zA-Z])\1+/g, (match, char) => {
        return char + "<sup>" + match.length + "</sup>";
    });
}


function renderCayleyTable(container, labels, cosetTable, solver) {
    const table = document.createElement('table');
    const n = labels.length;

    // Header
    const headerRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.innerHTML = '&#8728;';
    headerRow.appendChild(corner);

    labels.forEach(l => {
        const th = document.createElement('th');
        th.innerHTML = l === "" ? "e" : formatWord(l); // Use e for empty string
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Rows
    // cosetTable gives action of generators on cosets.
    // But we need the Multiplication Table: row i * col j.
    // row i corresponds to element 'words[i]'.
    // col j corresponds to element 'words[j]'.
    // product = coset obtained by applying word[j] to coset i?
    // Yes, if we view cosets as elements. Coset 0 is identity.
    // Element x is represented by coset x (reached by word x from 0).
    // x * y means apply word y to coset i (which represents x).

    // We need to simulate action of word[j] on coset i using the table.

    for (let i = 0; i < n; i++) {
        const tr = document.createElement('tr');

        // Row Header
        const th = document.createElement('th');
        th.innerHTML = labels[i] === "" ? "e" : formatWord(labels[i]);
        tr.appendChild(th);

        for (let j = 0; j < n; j++) {
            const td = document.createElement('td');

            // Calculate product i * j
            let curr = i;
            const wordJ = labels[j]; // String like "ab"

            for (let char of wordJ) {
                const col = solver.getCol(char);
                if (col === -1) {
                    // Should not happen for valid words
                    curr = -1; break;
                }
                curr = cosetTable[curr][col];
            }

            const prodLabel = (curr !== undefined && labels[curr] !== undefined)
                ? (labels[curr] === "" ? "e" : labels[curr])
                : "?";

            td.innerHTML = prodLabel === "e" ? "e" : formatWord(prodLabel);

            if (prodLabel === "e") {
                td.style.backgroundColor = "rgba(34, 197, 94, 0.1)";
            }

            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    container.appendChild(table);
}



// Example selection logic
document.addEventListener('DOMContentLoaded', () => {
    const exampleSelect = document.getElementById('example-select');
    const gensInput = document.getElementById('generators-input');
    const relsInput = document.getElementById('relations-input');

    if (exampleSelect) {
        // Clear existing hardcoded options except for the placeholder
        while (exampleSelect.options.length > 1) {
            exampleSelect.remove(1);
        }

        // Dynamically populate from GROUP_PRESETS
        for (const key in GROUP_PRESETS) {
            const preset = GROUP_PRESETS[key];
            const option = document.createElement('option');
            option.value = key;
            option.textContent = preset.label;
            exampleSelect.appendChild(option);
        }

        exampleSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (GROUP_PRESETS[val]) {
                gensInput.value = GROUP_PRESETS[val].gens;
                relsInput.value = GROUP_PRESETS[val].rels;
            }
        });
    }

    // Word Problem Logic
    const checkBtn = document.getElementById('check-equality-btn');
    const word1Input = document.getElementById('word1-input');
    const word2Input = document.getElementById('word2-input');
    const problemResult = document.getElementById('word-problem-result');

    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            // We need the solver and table from the last run!
            // Helper to get current solver state. 
            // We can attach it to the window or a global var when Analyze runs.
            const solver = window.currentSolver;
            const table = window.currentTable;
            const words = window.currentWords;

            if (!solver || !table) {
                problemResult.textContent = "Please run 'Analyze Group' first to generate the group table.";
                problemResult.style.color = "#ef4444";
                return;
            }

            const w1 = word1Input.value.trim();
            const w2 = word2Input.value.trim();

            if (!w1 && !w2) {
                problemResult.textContent = "Please enter at least one word.";
                return;
            }

            // Helper to trace word
            // Returns { final: coset, path: string }
            const trace = (wordStr) => {
                let expanded = wordStr.replace(/([a-zA-Z])\^(-?\d+)/g, (_, char, pow) => {
                    const p = parseInt(pow);
                    if (p >= 0) return char.repeat(p);
                    const invChar = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
                    return invChar.repeat(Math.abs(p));
                });
                // Also handle inverses A -> a^-1 handled by getCol logic.

                let curr = 0; // Identity
                let steps = [`Start at e`];

                for (let char of expanded) {
                    const col = solver.getCol(char);
                    if (col === -1) {
                        return { error: `Unknown generator: ${char}` };
                    }
                    const next = table[curr][col];
                    const nextCanon = words[next] === "" ? "e" : formatWord(words[next]);
                    steps.push(`Apply ${char} -> ${nextCanon}`);
                    curr = next;
                }
                return { final: curr, steps: steps };
            };

            const r1 = trace(w1 || "");
            const r2 = trace(w2 || "");

            if (r1.error) {
                problemResult.textContent = "Error in Word 1: " + r1.error;
                problemResult.style.color = "#ef4444";
                return;
            }
            if (r2.error) {
                problemResult.textContent = "Error in Word 2: " + r2.error;
                problemResult.style.color = "#ef4444";
                return;
            }

            const equal = r1.final === r2.final;
            const color = equal ? "#22c55e" : "#ef4444";
            const resultText = equal ? "EQUAL" : "NOT EQUAL";

            let output = `<strong style="color: ${color}; font-size: 1.2rem;">${resultText}</strong>\n`;
            const w1Canon = words[r1.final] || "e";
            const w2Canon = words[r2.final] || "e";

            output += `Word 1 reduces to: ${w1Canon}\n`;
            output += `Word 2 reduces to: ${w2Canon}\n`;

            if (equal) {
                output += `Both reduce to the same canonical element.\n`;
            }

            output += "\n--- Verification Steps ---\n";
            output += `Word 1 (${w1}):\n  ${r1.steps.join('\n  ')}\n\n`;
            output += `Word 2 (${w2}):\n  ${r2.steps.join('\n  ')}`;

            problemResult.innerHTML = output; // Use innerHTML for styling
            problemResult.style.color = "var(--text-primary)";
        });
    }
});