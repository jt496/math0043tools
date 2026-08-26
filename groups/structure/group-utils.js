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

// group-utils.js — shared utilities for the Cosets and Subgroup Lattice pages.
//
// Each group object has the shape:
//   { name (HTML), nameText (plain), order, elements (HTML labels),
//     table[i][j] = i*j index, inverse[i] = i^{-1} index, abelian }
//
// Convention: table[i][j] = i * j  (standard right-to-left / function-composition order:
// (i·j)(x) = i(j(x))).  The row label is the LEFT factor; the column label is the RIGHT factor.

// ─── Internal permutation helpers (0-indexed) ────────────────────────────────

// _composePerm(p, q)(x) = p[q[x]] = p(q(x)) = (p ∘ q)(x)  →  p * q  (row * col).
function _composePerm(p, q) { return q.map(x => p[x]); }

function _invertPerm(p) {
    const v = new Array(p.length);
    for (let i = 0; i < p.length; i++) v[p[i]] = i;
    return v;
}

function _keyPerm(p) { return p.join(','); }

// Convert a 0-indexed permutation array to cycle notation (1-indexed display).
function toCycleNotation(p) {
    const n = p.length;
    const vis = new Array(n).fill(false);
    const cycles = [];
    for (let i = 0; i < n; i++) {
        if (vis[i] || p[i] === i) { vis[i] = true; continue; }
        const c = [];
        let cur = i;
        while (!vis[cur]) { vis[cur] = true; c.push(cur + 1); cur = p[cur]; }
        if (c.length > 1) cycles.push(c);
    }
    return cycles.length === 0 ? 'e' : cycles.map(c => '(' + c.join('') + ')').join('');
}

// ─── Group factories ──────────────────────────────────────────────────────────

function makeCn(n) {
    const toSub = s => String(s).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);
    const elements = [];
    for (let k = 0; k < n; k++)
        elements.push(k === 0 ? 'e' : k === 1 ? 'r' : `r<sup>${k}</sup>`);
    const table = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i + j) % n));
    const inverse = Array.from({ length: n }, (_, i) => (n - i) % n);
    return {
        name: `C<sub>${n}</sub>`, nameText: `C${toSub(n)}`,
        order: n, elements, table, inverse, abelian: true
    };
}

// D_n: indices 0..n-1 are rotations r^0..r^{n-1},
//       indices n..2n-1 are reflections r^0s..r^{n-1}s.
// Relations: r^n = s^2 = e,  s r = r^{n-1} s.
function makeDn(n) {
    const toSub = s => String(s).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);
    const order = 2 * n;
    const elems = [];
    for (let k = 0; k < n; k++)
        elems.push(k === 0 ? 'e' : k === 1 ? 'r' : `r<sup>${k}</sup>`);
    for (let k = 0; k < n; k++)
        elems.push(k === 0 ? 's' : k === 1 ? 'rs' : `r<sup>${k}</sup>s`);

    function mult(i, j) {
        if (i < n && j < n) return (i + j) % n;
        if (i < n && j >= n) return n + (i + j - n) % n;
        if (i >= n && j < n) return n + (i - n - j + 2 * n) % n;
        return (i - j + 2 * n) % n;
    }
    const table = Array.from({ length: order }, (_, i) =>
        Array.from({ length: order }, (_, j) => mult(i, j)));
    const inverse = Array.from({ length: order }, (_, i) => i < n ? (n - i) % n : i);
    return {
        name: `D<sub>${n}</sub>`, nameText: `D${toSub(n)}`,
        order, elements: elems, table, inverse, abelian: n <= 2
    };
}

// V₄ = ℤ₂ × ℤ₂  (Klein four-group)
function makeV4() {
    return {
        name: 'V<sub>4</sub>', nameText: 'V₄', order: 4, abelian: true,
        elements: ['e', 'a', 'b', 'ab'],
        table: [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0]],
        inverse: [0, 1, 2, 3]
    };
}

// Q₈  elements: 1(0), −1(1), i(2), −i(3), j(4), −j(5), k(6), −k(7)
function makeQ8() {
    return {
        name: 'Q<sub>8</sub>', nameText: 'Q₈', order: 8, abelian: false,
        elements: ['1', '−1', 'i', '−i', 'j', '−j', 'k', '−k'],
        table: [
            [0, 1, 2, 3, 4, 5, 6, 7],
            [1, 0, 3, 2, 5, 4, 7, 6],
            [2, 3, 1, 0, 6, 7, 5, 4],
            [3, 2, 0, 1, 7, 6, 4, 5],
            [4, 5, 7, 6, 1, 0, 2, 3],
            [5, 4, 6, 7, 0, 1, 3, 2],
            [6, 7, 4, 5, 3, 2, 1, 0],
            [7, 6, 5, 4, 2, 3, 0, 1],
        ],
        inverse: [0, 1, 3, 2, 5, 4, 7, 6]
    };
}

function _makePermGroup(gens, nameHtml, nameText) {
    const d = gens[0].length;
    const id = Array.from({ length: d }, (_, i) => i);
    const map = new Map();
    const perms = [id];
    map.set(_keyPerm(id), 0);
    const queue = [0];
    while (queue.length) {
        const p = perms[queue.shift()];
        for (const gen of gens) {
            for (const g of [gen, _invertPerm(gen)]) {
                const prod = _composePerm(p, g);
                const k = _keyPerm(prod);
                if (!map.has(k)) {
                    const ni = perms.length;
                    map.set(k, ni);
                    perms.push(prod);
                    queue.push(ni);
                }
            }
        }
    }
    const n = perms.length;
    const elements = perms.map(p => toCycleNotation(p));
    const table = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
            map.get(_keyPerm(_composePerm(perms[i], perms[j])))));
    const inverse = perms.map(p => map.get(_keyPerm(_invertPerm(p))));
    return { name: nameHtml, nameText, order: n, elements, table, inverse, abelian: false };
}

// A₄: generated by (0 1 2) and (0 1)(2 3) — 0-indexed
function makeA4() { return _makePermGroup([[1, 2, 0, 3], [1, 0, 3, 2]], 'A<sub>4</sub>', 'A₄'); }

// S₄: generated by (0 1) and (0 1 2 3) — 0-indexed
function makeS4() { return _makePermGroup([[1, 0, 2, 3], [1, 2, 3, 0]], 'S<sub>4</sub>', 'S₄'); }

// A₅: generated by (0 1 2) and (0 1 2 3 4) — 0-indexed
function makeA5() { return _makePermGroup([[1, 2, 0, 3, 4], [1, 2, 3, 4, 0]], 'A<sub>5</sub>', 'A₅'); }

// S₅: generated by (0 1) and (0 1 2 3 4) — 0-indexed
function makeS5() { return _makePermGroup([[1, 0, 2, 3, 4], [1, 2, 3, 4, 0]], 'S<sub>5</sub>', 'S₅'); }

// ─── Group catalogue ──────────────────────────────────────────────────────────

const GROUP_CATALOG = [
    { id: 'C2', label: 'C₂  (order 2)', cat: 'Cyclic Groups', make: () => makeCn(2) },
    { id: 'C3', label: 'C₃  (order 3)', cat: 'Cyclic Groups', make: () => makeCn(3) },
    { id: 'C4', label: 'C₄  (order 4)', cat: 'Cyclic Groups', make: () => makeCn(4) },
    { id: 'C6', label: 'C₆  (order 6)', cat: 'Cyclic Groups', make: () => makeCn(6) },
    { id: 'C8', label: 'C₈  (order 8)', cat: 'Cyclic Groups', make: () => makeCn(8) },
    { id: 'C12', label: 'C₁₂ (order 12)', cat: 'Cyclic Groups', make: () => makeCn(12) },
    { id: 'V4', label: 'V₄  (order 4)', cat: 'Other Groups', make: () => makeV4() },
    { id: 'D3', label: 'D₃ ≅ S₃  (order 6)', cat: 'Dihedral Groups', make: () => makeDn(3) },
    { id: 'D4', label: 'D₄  (order 8)', cat: 'Dihedral Groups', make: () => makeDn(4) },
    { id: 'D5', label: 'D₅  (order 10)', cat: 'Dihedral Groups', make: () => makeDn(5) },
    { id: 'D6', label: 'D₆  (order 12)', cat: 'Dihedral Groups', make: () => makeDn(6) },
    { id: 'Q8', label: 'Q₈  (order 8)', cat: 'Other Groups', make: () => makeQ8() },
    { id: 'A4', label: 'A₄  (order 12)', cat: 'Other Groups', make: () => makeA4() },
    { id: 'S4', label: 'S₄  (order 24)', cat: 'Other Groups', make: () => makeS4() },
    { id: 'A5', label: 'A₅  (order 60)', cat: 'Other Groups', make: () => makeA5() },
    { id: 'S5', label: 'S₅  (order 120)', cat: 'Other Groups', make: () => makeS5() },
];

// ─── Subgroup computation ─────────────────────────────────────────────────────

// Generate the subgroup ⟨gens⟩ given a multiplication table.
function generateSubgroup(gens, table) {
    const S = new Set([0]);
    for (const g of gens) S.add(g);
    let changed = true;
    while (changed) {
        changed = false;
        for (const a of [...S]) {
            for (const b of [...S]) {
                const c = table[a][b];
                if (!S.has(c)) { S.add(c); changed = true; }
            }
        }
    }
    return S;
}

// Return all subgroups of group, sorted by ascending order.
function findAllSubgroups(group) {
    const { order, table } = group;
    const key = S => [...S].sort((a, b) => a - b).join(',');
    const known = new Map();
    const add = S => { const k = key(S); if (!known.has(k)) known.set(k, new Set(S)); };

    add(new Set([0]));
    add(new Set(Array.from({ length: order }, (_, i) => i)));
    for (let g = 1; g < order; g++) add(generateSubgroup([g], table));

    // Enlarge by taking joins of pairs of known subgroups until stable.
    let prev = 0;
    while (known.size !== prev) {
        prev = known.size;
        const arr = [...known.values()];
        for (let a = 0; a < arr.length; a++)
            for (let b = a + 1; b < arr.length; b++)
                add(generateSubgroup([...arr[a], ...arr[b]], table));
    }
    return [...known.values()].sort((a, b) => a.size - b.size);
}

// ─── Coset computation ────────────────────────────────────────────────────────

function computeLeftCosets(group, H) {
    const { order, table } = group;
    const assigned = new Set();
    const cosets = [];
    for (let g = 0; g < order; g++) {
        if (assigned.has(g)) continue;
        const coset = new Set([...H].map(h => table[g][h]));
        cosets.push({ repr: g, elements: coset });
        for (const x of coset) assigned.add(x);
    }
    return cosets;
}

function computeRightCosets(group, H) {
    const { order, table } = group;
    const assigned = new Set();
    const cosets = [];
    for (let g = 0; g < order; g++) {
        if (assigned.has(g)) continue;
        const coset = new Set([...H].map(h => table[h][g]));
        cosets.push({ repr: g, elements: coset });
        for (const x of coset) assigned.add(x);
    }
    return cosets;
}

function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
}

// H is normal iff every left coset is also a right coset (both are partitions
// of the same size, so this suffices).
function isNormalSubgroup(leftCosets, rightCosets) {
    for (const lc of leftCosets)
        if (!rightCosets.some(rc => setsEqual(lc.elements, rc.elements))) return false;
    return true;
}

// Check normality directly via conjugation: g h g⁻¹ ∈ H for all g ∈ G, h ∈ H.
function checkNormalInG(group, H) {
    const { order, table, inverse } = group;
    for (let g = 0; g < order; g++)
        for (const h of H)
            if (!H.has(table[table[g][h]][inverse[g]])) return false;
    return true;
}

// Return the order of element g within a group defined by table, up to maxOrd.
function _elementOrder(g, table, maxOrd) {
    if (g === 0) return 1;
    let cur = g;
    for (let k = 1; k <= maxOrd; k++) {
        if (cur === 0) return k;
        cur = table[cur][g];
    }
    return maxOrd;
}

// Identify the isomorphism type of subgroup H as an HTML string,
// e.g. "C<sub>4</sub>", "D<sub>3</sub>", "V<sub>4</sub>".
// Returns empty string if the type cannot be determined.
function identifySubgroup(group, H) {
    const n = H.size;
    const { table } = group;
    const elems = [...H];

    if (n === 1) return 'trivial';
    if (n === group.order) return group.name;

    // Build order-count map and find max element order.
    const orderCounts = {};
    let maxOrder = 0;
    for (const g of elems) {
        const o = _elementOrder(g, table, n);
        orderCounts[o] = (orderCounts[o] || 0) + 1;
        if (o > maxOrder) maxOrder = o;
    }

    // Check commutativity within H.
    function isHAbelian() {
        for (const a of elems)
            for (const b of elems)
                if (table[a][b] !== table[b][a]) return false;
        return true;
    }

    // A cyclic group of order n has an element of that order.
    if (maxOrder === n) return `C<sub>${n}</sub>`;

    // Groups of prime order are always cyclic.
    const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23];
    if (PRIMES.includes(n)) return `C<sub>${n}</sub>`;

    if (n === 4) {
        // V₄: all non-identity elements have order 2; C₄: has an element of order 4.
        return maxOrder <= 2 ? 'V<sub>4</sub>' : 'C<sub>4</sub>';
    }

    if (n === 6) {
        return isHAbelian() ? 'C<sub>6</sub>' : 'S<sub>3</sub>';
    }

    if (n === 8) {
        if (maxOrder <= 2) return 'C<sub>2</sub> × C<sub>2</sub> × C<sub>2</sub>';
        if (maxOrder === 8) return 'C<sub>8</sub>';
        // maxOrder === 4 — three possibilities.
        if (isHAbelian()) return 'C<sub>4</sub> × C<sub>2</sub>';
        // Non-abelian: Q₈ has six elements of order 4; D₄ has only two.
        return (orderCounts[4] || 0) === 6 ? 'Q<sub>8</sub>' : 'D<sub>4</sub>';
    }

    if (n === 9) {
        return maxOrder === 9 ? 'C<sub>9</sub>' : 'C<sub>3</sub> × C<sub>3</sub>';
    }

    if (n === 10) {
        return isHAbelian() ? 'C<sub>10</sub>' : 'D<sub>5</sub>';
    }

    if (n === 12) {
        if (maxOrder === 12) return 'C<sub>12</sub>';
        if (isHAbelian()) return 'C<sub>2</sub> × C<sub>6</sub>';
        // A₄: element orders 1,2,3 only (8 elements of order 3).
        if ((orderCounts[3] || 0) === 8) return 'A<sub>4</sub>';
        // D₆ vs Dic₃: D₆ has 7 elements of order 2; Dic₃ has only 1.
        return (orderCounts[2] || 0) >= 4 ? 'D<sub>6</sub>' : 'Dic<sub>3</sub>';
    }

    if (n === 16) {
        if (maxOrder <= 2) return 'C<sub>2</sub><sup>4</sup>';
        if (!isHAbelian()) {
            if (maxOrder === 8) return 'QD<sub>16</sub>';
            if ((orderCounts[4] || 0) === 10) return 'Q<sub>16</sub>';
            return 'D<sub>8</sub>';
        }
    }

    if (n === 18) {
        return isHAbelian() ? 'C<sub>18</sub>' : 'D<sub>9</sub>';
    }

    if (n === 20) {
        if (maxOrder === 20) return 'C<sub>20</sub>';
        if (isHAbelian()) return 'C<sub>2</sub> × C<sub>10</sub>';
        // D₁₀ has max element order 10; F₂₀ = AGL(1,5) has max element order 5 (no order-10 elements)
        return maxOrder >= 10 ? 'D<sub>10</sub>' : 'F<sub>20</sub>';
    }

    if (n === 24) {
        if (maxOrder === 24) return 'C<sub>24</sub>';
        if (isHAbelian()) return 'C<sub>2</sub> × C<sub>12</sub>';
        // S₄: has elements of orders 1,2,3,4; many order-4 elements (6 of them)
        // SL(2,3): has elements of orders 1,2,3,4,6; no order-4 elements from centre extension
        return (orderCounts[3] || 0) >= 8 ? 'S<sub>4</sub>' : 'SL(2,3)';
    }

    if (n === 60) {
        if (maxOrder === 60) return 'C<sub>60</sub>';
        if (isHAbelian()) return 'C<sub>2</sub> × C<sub>30</sub>';
        // A₅ is the unique simple group of order 60; it has 24 elements of order 5
        return 'A<sub>5</sub>';
    }

    // Fallback: non-abelian group of order 2p (p odd prime) → dihedral D_p.
    if (n % 2 === 0 && !isHAbelian()) {
        const half = n / 2;
        if (PRIMES.includes(half) && (orderCounts[half] || 0) >= 1)
            return `D<sub>${half}</sub>`;
    }

    return ''; // unable to determine
}

// Return an HTML string describing the subgroup H (e.g. "⟨r²⟩  cyclic of order 4").
function describeSubgroup(group, H) {
    const n = H.size;
    if (n === 1) return 'Trivial subgroup';
    if (n === group.order) return group.nameText + ' (full group)';
    const { table, elements } = group;
    for (const g of H) {
        if (g === 0) continue;
        if (generateSubgroup([g], table).size === n)
            return `⟨${elements[g]}⟩ &nbsp; cyclic of order ${n}`;
    }
    const arr = [...H].filter(x => x !== 0);
    for (let a = 0; a < arr.length; a++)
        for (let b = a + 1; b < arr.length; b++)
            if (generateSubgroup([arr[a], arr[b]], table).size === n)
                return `⟨${elements[arr[a]]}, ${elements[arr[b]]}⟩ &nbsp; order ${n}`;
    return `order ${n}`;
}
