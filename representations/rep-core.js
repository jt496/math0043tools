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
 * Representation core.
 *
 * The group-and-representation library shared by the Representation Explorer
 * and the Character Explorer: complex matrix arithmetic, the catalogue of
 * representations (REPS), conjugacy classes via coset enumeration, and LaTeX
 * formatting of complex numbers and matrices.
 *
 * Pure — nothing here touches the DOM. Everything is reached through the
 * window.RepCore namespace, so page scripts start with a destructuring line.
 *
 * Load presentations/script.js first: this file uses CosetEnumerator,
 * GROUP_PRESETS, parseRelations and relToWord from it.
 */

(function () {
    'use strict';

    // ── Complex matrix arithmetic ─────────────────────────────────────────────
    // Complex numbers as [re, im]
    function cMul([a, b], [c, d]) { return [a * c - b * d, a * d + b * c]; }
    function cAdd([a, b], [c, d]) { return [a + c, b + d]; }
    function cAbs2([a, b]) { return a * a + b * b; }

    function matMul(A, B) {
        const n = A.length, m = B[0].length;
        return Array.from({ length: n }, (_, i) =>
            Array.from({ length: m }, (_, j) =>
                A[i].reduce((acc, aik, k) => cAdd(acc, cMul(aik, B[k][j])), [0, 0])
            )
        );
    }

    function matTrace(M) {
        return M.reduce((acc, row, i) => cAdd(acc, row[i]), [0, 0]);
    }

    function makeIdentity(n) {
        return Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => i === j ? [1, 0] : [0, 0])
        );
    }

    function matIsIdentity(M, tol = 1e-5) {
        for (let i = 0; i < M.length; i++)
            for (let j = 0; j < M[i].length; j++) {
                const exp = i === j ? 1 : 0;
                if (Math.abs(M[i][j][0] - exp) > tol || Math.abs(M[i][j][1]) > tol) return false;
            }
        return true;
    }

    function matKey(M, dp = 4) {
        return M.map(row => row.map(([re, im]) =>
            `${Math.round(re * 10 ** dp) / 10 ** dp}|${Math.round(im * 10 ** dp) / 10 ** dp}`
        ).join(',')).join(';');
    }

    // Extract 0-indexed permutation from a permutation matrix (entries are [re,im] complex)
    function matToPerm(M) {
        return M[0].map((_, j) => M.findIndex(row => row[j][0] > 0.5));
    }

    // Convert 0-indexed permutation to cycle notation string (1-indexed display)
    function permToCycleNotation(p) {
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
        return cycles.length === 0 ? 'e' : cycles.map(c => '(' + c.join(' ') + ')').join('');
    }

    // M^{-1} = M† for unitary matrices (all finite-group reps can be made unitary)
    function matAdjoint(M) {
        const n = M.length;
        return Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => [M[j][i][0], -M[j][i][1]])
        );
    }

    // True inverse for finite-group matrices: find k s.t. M^k = I, return M^{k-1}.
    // Works for any representation, not just unitary ones.
    function matInverseFinite(M, maxOrder = 60) {
        let Mpow = makeIdentity(M.length);
        for (let k = 0; k < maxOrder; k++) {
            const next = matMul(Mpow, M);
            if (matIsIdentity(next)) return Mpow;
            Mpow = next;
        }
        return matAdjoint(M); // fallback
    }

    // ── Additional helpers for change-of-basis ────────────────────────────────
    function makeZero(n) {
        return Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0]));
    }
    function matAdd(A, B) { return A.map((row, i) => row.map((aij, j) => cAdd(aij, B[i][j]))); }
    function matCScale(M, c) { return M.map(row => row.map(mij => cMul(mij, c))); }
    function matVec(M, v) { return M.map(row => row.reduce((acc, Mij, j) => cAdd(acc, cMul(Mij, v[j])), [0, 0])); }
    function vecInner(u, v) { return u.reduce((acc, ui, i) => cAdd(acc, cMul([ui[0], -ui[1]], v[i])), [0, 0]); }
    function vecCScale(v, c) { return v.map(vi => cMul(vi, c)); }
    function vecSub(u, v) { return u.map((ui, i) => [ui[0] - v[i][0], ui[1] - v[i][1]]); }
    function vecNorm2(v) { return v.reduce((acc, vi) => acc + cAbs2(vi), 0); }

    function gramSchmidt(vecs, tol = 1e-8) {
        const basis = [];
        for (const v of vecs) {
            let u = v.map(x => [...x]);
            for (const q of basis) {
                const proj = vecInner(q, u);
                u = vecSub(u, vecCScale(q, proj));
            }
            const norm2 = vecNorm2(u);
            if (norm2 > tol) basis.push(vecCScale(u, [1 / Math.sqrt(norm2), 0]));
        }
        return basis;
    }

    // ── BFS over the image of ρ ───────────────────────────────────────────────
    function enumerateImage(genMatrices, maxEls = 300) {
        const genEntries = Object.entries(genMatrices);
        const dim = genEntries[0][1].length;
        const identity = makeIdentity(dim);
        const elements = [{ matrix: identity, word: '' }];
        const seen = new Set([matKey(identity)]);
        let i = 0;
        while (i < elements.length && elements.length < maxEls) {
            const current = elements[i++];
            for (const [char, G] of genEntries) {
                const MG = matMul(current.matrix, G);
                const key = matKey(MG);
                if (!seen.has(key)) {
                    seen.add(key);
                    elements.push({ matrix: MG, word: current.word + char });
                }
            }
        }
        return elements;
    }

    // ── LaTeX formatting ──────────────────────────────────────────────────────
    const _sq3o2 = Math.sqrt(3) / 2;
    const _sq2o2 = Math.sqrt(2) / 2;
    const _phi = (1 + Math.sqrt(5)) / 2;
    const _sq5 = Math.sqrt(5);
    const _i5 = 1 / _sq5;
    const _i5x2 = 2 / _sq5;

    const SYMBOLS = [
        { v: 1, s: '1' },
        { v: 0.5, s: '\\tfrac{1}{2}' },
        { v: _sq3o2, s: '\\tfrac{\\sqrt{3}}{2}' },
        { v: _sq2o2, s: '\\tfrac{\\sqrt{2}}{2}' },
        { v: _phi, s: '\\varphi' },
        { v: _phi - 1, s: '\\varphi-1' },
        { v: 1 - _phi, s: '1-\\varphi' },
        { v: Math.sqrt(2), s: '\\sqrt{2}' },
        { v: Math.sqrt(3), s: '\\sqrt{3}' },
        { v: Math.sqrt(2 + _phi), s: '\\sqrt{2+\\varphi}' },
        { v: Math.sqrt(3 - _phi), s: '\\sqrt{3-\\varphi}' },
        { v: _phi / 2, s: '\\tfrac{\\varphi}{2}' },
        { v: (_phi - 1) / 2, s: '\\tfrac{\\varphi-1}{2}' },
        { v: Math.sqrt(2 + _phi) / 2, s: '\\tfrac{\\sqrt{2+\\varphi}}{2}' },
        { v: Math.sqrt(3 - _phi) / 2, s: '\\tfrac{\\sqrt{3-\\varphi}}{2}' },
        { v: _i5, s: '\\tfrac{1}{\\sqrt{5}}' },
        { v: _i5x2, s: '\\tfrac{2}{\\sqrt{5}}' },
        { v: _phi / _sq5, s: '\\tfrac{\\varphi}{\\sqrt{5}}' },
        { v: (_phi - 1) / _sq5, s: '\\tfrac{\\varphi-1}{\\sqrt{5}}' },
        { v: 1 / 3, s: '\\tfrac{1}{3}' },
        { v: 2 / 3, s: '\\tfrac{2}{3}' },
        { v: 1 / 4, s: '\\tfrac{1}{4}' },
        { v: 1 / 6, s: '\\tfrac{1}{6}' },
        { v: 0.2, s: '\\tfrac{1}{5}' },
        { v: 0.4, s: '\\tfrac{2}{5}' },
        { v: 0.6, s: '\\tfrac{3}{5}' },
        { v: 0.8, s: '\\tfrac{4}{5}' },
        { v: 0.4 * Math.sqrt(3), s: '\\tfrac{2\\sqrt{3}}{5}' },
        { v: 0.2 * Math.sqrt(3), s: '\\tfrac{\\sqrt{3}}{5}' },
        { v: 1 / Math.sqrt(2), s: '\\tfrac{1}{\\sqrt{2}}' },
        { v: 1 / Math.sqrt(6), s: '\\tfrac{1}{\\sqrt{6}}' },
        { v: 1 / Math.sqrt(10), s: '\\tfrac{1}{\\sqrt{10}}' },
        { v: 2 / Math.sqrt(6), s: '\\tfrac{2}{\\sqrt{6}}' },
        { v: 1 / Math.sqrt(3), s: '\\tfrac{1}{\\sqrt{3}}' },
        { v: _i5 / 2, s: '\\tfrac{1}{2\\sqrt{5}}' },
        { v: Math.sqrt(3) / 6, s: '\\tfrac{\\sqrt{3}}{6}' },
        { v: Math.sqrt(6) / 4, s: '\\tfrac{\\sqrt{6}}{4}' },
        { v: Math.sqrt(6) / 12, s: '\\tfrac{\\sqrt{6}}{12}' },
        { v: Math.sqrt(2) / 4, s: '\\tfrac{\\sqrt{2}}{4}' },
        { v: Math.sqrt(2) / 6, s: '\\tfrac{\\sqrt{2}}{6}' },
        { v: Math.sqrt(2) / 3, s: '\\tfrac{\\sqrt{2}}{3}' },
        { v: Math.sqrt(30) / 10, s: '\\tfrac{\\sqrt{30}}{10}' },
        { v: Math.sqrt(30) / 15, s: '\\tfrac{\\sqrt{30}}{15}' },
        { v: 3 * Math.sqrt(6) / 2, s: '\\tfrac{3\\sqrt{6}}{2}' },
        { v: _phi / 5, s: '\\tfrac{\\varphi}{5}' },
        { v: (_phi - 1) / 5, s: '\\tfrac{\\varphi-1}{5}' },
        { v: Math.sqrt(2 + _phi) / 5, s: '\\tfrac{\\sqrt{2+\\varphi}}{5}' },
        { v: Math.sqrt(3 - _phi) / 5, s: '\\tfrac{\\sqrt{3-\\varphi}}{5}' },
        { v: Math.sqrt(3) * _phi / 5, s: '\\tfrac{\\sqrt{3}\\varphi}{5}' },
        { v: Math.sqrt(3) * (_phi - 1) / 5, s: '\\tfrac{\\sqrt{3}(\\varphi-1)}{5}' },
        { v: Math.sqrt(2 + _phi) / _sq5, s: '\\tfrac{\\sqrt{2+\\varphi}}{\\sqrt{5}}' },
        { v: Math.sqrt(3 - _phi) / _sq5, s: '\\tfrac{\\sqrt{3-\\varphi}}{\\sqrt{5}}' },
        { v: Math.sqrt(3 - _phi) / (2 * _sq5), s: '\\tfrac{\\sqrt{3-\\varphi}}{2\\sqrt{5}}' },
        { v: Math.sqrt(2 + _phi) / (2 * _sq5), s: '\\tfrac{\\sqrt{2+\\varphi}}{2\\sqrt{5}}' },
        { v: (_phi - 1) / (2 * _sq5), s: '\\tfrac{\\varphi-1}{2\\sqrt{5}}' },
        { v: _phi / (2 * _sq5), s: '\\tfrac{\\varphi}{2\\sqrt{5}}' },
        // D5 pentagon vertex COB entries (1/sqrt(10) family)
        { v: Math.sqrt(10) / 5, s: '\\tfrac{\\sqrt{10}}{5}' },
        { v: (_phi - 1) / Math.sqrt(10), s: '\\tfrac{\\varphi-1}{\\sqrt{10}}' },
        { v: _phi / Math.sqrt(10), s: '\\tfrac{\\varphi}{\\sqrt{10}}' },
        { v: Math.sqrt(2 + _phi) / Math.sqrt(10), s: '\\tfrac{\\sqrt{2+\\varphi}}{\\sqrt{10}}' },
        { v: Math.sqrt(3 - _phi) / Math.sqrt(10), s: '\\tfrac{\\sqrt{3-\\varphi}}{\\sqrt{10}}' },
        { v: 3 * _phi / 10, s: '\\tfrac{3\\varphi}{10}' },
        { v: (3 * _phi - 3) / 10, s: '\\tfrac{3(\\varphi-1)}{10}' },
        { v: Math.sqrt(3) * Math.sqrt(2 + _phi) / 5, s: '\\tfrac{\\sqrt{3}\\sqrt{2+\\varphi}}{5}' },
        { v: Math.sqrt(3) * Math.sqrt(3 - _phi) / 5, s: '\\tfrac{\\sqrt{3}\\sqrt{3-\\varphi}}{5}' },
        { v: (2 * _phi + 1) / 10, s: '\\tfrac{2\\varphi+1}{10}' },
        { v: (4 - 2 * _phi) / 10, s: '\\tfrac{4-2\\varphi}{10}' },
        { v: Math.sqrt(3) * (2 * _phi - 1) / 10, s: '\\tfrac{\\sqrt{3}(2\\varphi-1)}{10}' },
        { v: 3 * Math.sqrt(3 - _phi) / 10, s: '\\tfrac{3\\sqrt{3-\\varphi}}{10}' },
        { v: 3 * Math.sqrt(2 + _phi) / 10, s: '\\tfrac{3\\sqrt{2+\\varphi}}{10}' },
        { v: _phi / _sq5 / 2, s: '\\tfrac{\\varphi}{2\\sqrt{5}}' },
        { v: (_phi - 1) / _sq5 / 2, s: '\\tfrac{\\varphi-1}{2\\sqrt{5}}' },
        { v: Math.sqrt(2 + _phi) / _sq5 / 2, s: '\\tfrac{\\sqrt{2+\\varphi}}{2\\sqrt{5}}' },
        { v: Math.sqrt(3 - _phi) / _sq5 / 2, s: '\\tfrac{\\sqrt{3-\\varphi}}{2\\sqrt{5}}' },
        { v: 2 * Math.sqrt(2 + _phi) / _sq5, s: '\\tfrac{2\\sqrt{2+\\varphi}}{\\sqrt{5}}' },
        { v: 2 * Math.sqrt(3 - _phi) / _sq5, s: '\\tfrac{2\\sqrt{3-\\varphi}}{\\sqrt{5}}' },
        // ×5 scaled A5-3D entries (for displayScale:5)
        { v: _sq5, s: '\\sqrt{5}' },
        { v: 2 * _sq5, s: '2\\sqrt{5}' },
        { v: (_phi - 1) * _sq5 / 2, s: '\\tfrac{(\\varphi-1)\\sqrt{5}}{2}' },
        { v: Math.sqrt(2 + _phi) * _sq5 / 2, s: '\\tfrac{\\sqrt{5(2+\\varphi)}}{2}' },
        { v: 5 * (_phi - 1) / 2, s: '\\tfrac{5(\\varphi-1)}{2}' },
        { v: 5 * Math.sqrt(2 + _phi) / 2, s: '\\tfrac{5\\sqrt{2+\\varphi}}{2}' },
        { v: (_phi - 1) * _sq5, s: '(\\varphi-1)\\sqrt{5}' },
        { v: Math.sqrt(2 + _phi) * _sq5, s: '\\sqrt{5(2+\\varphi)}' },
        { v: Math.sqrt(3 - _phi) * _sq5 / 2, s: '\\tfrac{\\sqrt{5(3-\\varphi)}}{2}' },
        { v: 5 * Math.sqrt(3 - _phi) / 2, s: '\\tfrac{5\\sqrt{3-\\varphi}}{2}' },
        { v: Math.sqrt(3 - _phi) * _sq5, s: '\\sqrt{5(3-\\varphi)}' },
        // \u03c1\u2082-specific
        { v: _phi * _sq5 / 2, s: '\\tfrac{\\varphi\\sqrt{5}}{2}' },
        { v: 5 * _phi / 2, s: '\\tfrac{5\\varphi}{2}' },
        { v: _phi * _sq5, s: '\\varphi\\sqrt{5}' },
        // \u00d710 scaled entries
        { v: 4 * _sq5, s: '4\\sqrt{5}' },
        { v: 5 * (_phi - 1), s: '5(\\varphi-1)' },
        { v: 5 * Math.sqrt(2 + _phi), s: '5\\sqrt{2+\\varphi}' },
        { v: 5 * Math.sqrt(3 - _phi), s: '5\\sqrt{3-\\varphi}' },
        { v: 2 * (_phi - 1) * _sq5, s: '2(\\varphi-1)\\sqrt{5}' },
        { v: 2 * Math.sqrt(5 * (2 + _phi)), s: '2\\sqrt{5(2+\\varphi)}' },
        { v: 2 * Math.sqrt(5 * (3 - _phi)), s: '2\\sqrt{5(3-\\varphi)}' },
        { v: 5 * _phi, s: '5\\varphi' },
        // ×5 / ×10 entries for 5D a-matrix and 3D b-matrix
        { v: 2 * Math.sqrt(3), s: '2\\sqrt{3}' },
        { v: 4 * Math.sqrt(3), s: '4\\sqrt{3}' },
        { v: 3 * _phi, s: '3\\varphi' },
        { v: 2 * _phi, s: '2\\varphi' },
        { v: 3 * (_phi - 1), s: '3(\\varphi-1)' },
        { v: 2 * (_phi - 1), s: '2(\\varphi-1)' },
        { v: 2 * Math.sqrt(2 + _phi), s: '2\\sqrt{2+\\varphi}' },
        { v: 3 * Math.sqrt(3 - _phi), s: '3\\sqrt{3-\\varphi}' },
        { v: 2 * _phi * _sq5, s: '2\\varphi\\sqrt{5}' },
        // 5D b ×10 entries involving √3
        { v: Math.sqrt(3) * _phi, s: '\\sqrt{3}\\varphi' },
        { v: Math.sqrt(3) * (_phi - 1), s: '\\sqrt{3}(\\varphi-1)' },
        { v: Math.sqrt(3) * (2 * _phi - 1), s: '\\sqrt{3}(2\\varphi-1)' },
        { v: 3 * Math.sqrt(3) * _phi / _sq5, s: '\\tfrac{3\\sqrt{3}\\varphi}{\\sqrt{5}}' },
        { v: Math.sqrt(3) * Math.sqrt(2 + _phi) * 2, s: '2\\sqrt{3(2+\\varphi)}' },
        { v: Math.sqrt(3) * Math.sqrt(3 - _phi) * 2, s: '2\\sqrt{3(3-\\varphi)}' },
        { v: Math.sqrt(3) * (1 + _phi), s: '\\sqrt{3}(1+\\varphi)' },
        // Final 4 unresolved 5D bx10 values
        { v: 2 * _phi * Math.sqrt(3), s: '2\\sqrt{3}\\varphi' },
        { v: 2 * (_phi - 1) * Math.sqrt(3), s: '2\\sqrt{3}(\\varphi-1)' },
        { v: 2 * Math.sqrt(3 - _phi), s: '2\\sqrt{3-\\varphi}' },
        { v: 3 * Math.sqrt(2 + _phi), s: '3\\sqrt{2+\\varphi}' }
    ];

    // True when a LaTeX symbol is a bare sum at top level (e.g. \varphi-1), so that
    // negating it or multiplying it by i needs brackets: -(\varphi-1), not -\varphi-1.
    function isBareSum(s) {
        let depth = 0;
        for (let k = 0; k < s.length; k++) {
            const c = s[k];
            if (c === '{' || c === '(') depth++;
            else if (c === '}' || c === ')') depth--;
            else if ((c === '+' || c === '-') && depth === 0 && k > 0) return true;
        }
        return false;
    }
    const bracketed = s => isBareSum(s) ? `(${s})` : s;

    function fmtC([re, im], tol = 1e-4) {
        const isZ = x => Math.abs(x) < tol;
        const fR = x => {
            const mag = Math.abs(x);
            const neg = x < 0;
            for (const { v, s } of SYMBOLS) {
                if (Math.abs(mag - v) < tol) return neg ? '-' + bracketed(s) : s;
            }
            if (isZ(mag - Math.round(mag))) { const r = Math.round(mag); return r === 0 ? '0' : (neg ? '-' : '') + r; }
            return String(Math.round(x * 10000) / 10000 || 0);
        };

        // Special: ω = e^{2πi/3}
        if (isZ(re + 0.5) && isZ(Math.abs(im) - _sq3o2)) {
            return im > 0 ? '\\omega' : '\\bar{\\omega}';
        }

        if (isZ(im)) return fR(re);
        if (isZ(re)) {
            if (isZ(Math.abs(im) - 1)) return im > 0 ? 'i' : '-i';
            return bracketed(fR(im)) + 'i';
        }
        const rePart = fR(re);
        const imMag = Math.abs(im);
        const imFmt = isZ(imMag - 1) ? 'i' : bracketed(fR(imMag)) + 'i';
        return rePart + (im > 0 ? '+' : '-') + imFmt;
    }

    function matToLatex(M, scale = 1) {
        if (M.length === 1 && M[0].length === 1) {
            // For 1D, scale doesn't apply (it's just a scalar already)
            return fmtC(M[0][0]);
        }
        const rows = M.map(row => row.map(([re, im]) => fmtC([re * scale, im * scale])).join(' & ')).join(' \\\\ ');
        const mat = `\\begin{pmatrix} ${rows} \\end{pmatrix}`;
        if (scale === 1) return mat;
        return `\\tfrac{1}{${scale}} ${mat}`;
    }

    // Factor out a common scalar f (from SYMBOLS, 0<f<1) so all entries of M/f are fraction-free.
    function factorMatrix(M) {
        if (M.length <= 2) return { factorLatex: null, scaledM: M };
        const tol = 1e-4;
        function isFF(entry) {
            const s = fmtC(entry);
            return !s.includes('\\tfrac') && !/\d\.\d/.test(s);
        }
        if (M.every(row => row.every(isFF))) return { factorLatex: null, scaledM: M };
        const cands = SYMBOLS.filter(({ v, s }) => v < 1 - tol && v > tol && !s.includes('\\varphi')).sort((a, b) => b.v - a.v);
        for (const { v: f, s: fs } of cands) {
            const inv = 1 / f;
            const sc = M.map(row => row.map(([re, im]) => [re * inv, im * inv]));
            if (sc.every(row => row.every(isFF))) return { factorLatex: fs, scaledM: sc };
        }
        return { factorLatex: null, scaledM: M };
    }

    function blockDiagToLatex(T, decomp) {
        const parts = [];
        let offset = 0;
        for (const { mult, d_j } of decomp) {
            for (let k = 0; k < mult; k++) {
                const block = T.slice(offset, offset + d_j).map(row => row.slice(offset, offset + d_j));
                parts.push(matToLatex(block));
                offset += d_j;
            }
        }
        return parts.join(' \\oplus ');
    }

    function evalWord(word, genMap) {
        const dim = Object.values(genMap)[0].length;
        let result = makeIdentity(dim);
        for (const ch of word) {
            const mat = genMap[ch];
            if (!mat) return null;
            result = matMul(result, mat);
        }
        return result;
    }

    // ── Representations catalog ───────────────────────────────────────────────
    const tau = 2 * Math.PI;
    const R = a => [a, 0];
    const C = (a, b) => [a, b];
    const sq3 = Math.sqrt(3) / 2;
    const phi = (1 + Math.sqrt(5)) / 2;

    function rot2D(theta) {
        const c = Math.cos(theta), s = Math.sin(theta);
        return [[R(c), R(-s)], [R(s), R(c)]];
    }

    function formatExp(k, n) {
        if (k === 0) return '1';
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        let num = 2 * k;
        let den = n;
        const g = gcd(num, den);
        num /= g;
        den /= g;

        let numStr = num === 1 ? '' : num;
        if (den === 1) return `e^{${numStr}\\pi i}`;
        return `e^{${numStr}\\pi i/${den}}`;
    }

    const REPS = [];

    // --- Cyclic Groups C2 - C6 ---
    [2, 3, 4, 5, 6].forEach(n => {
        const subN = String.fromCharCode(0x2080 + n);
        const irreps = [];
        for (let k = 0; k < n; k++) {
            const label = `C${subN} \u2014 ${k === 0 ? 'Trivial' : 'Character \u03c7' + k} (1D${k === 0 ? '' : ', complex'})`;
            let rLatex = '1';
            let descExp = '1';
            if (k > 0) {
                if (k * 2 === n) rLatex = '-1';
                else if (k * 4 === n) rLatex = 'i';
                else if (k * 4 === 3 * n) rLatex = '-i';
                else rLatex = formatExp(k, n);
                descExp = rLatex.replace(/\^\{/g, '<sup>').replace(/\}/g, '</sup>').replace(/\\pi/g, '\u03c0');
            }
            const rep = {
                label, gPreset: 'C' + n, gOrder: n, dim: 1,
                description: k === 0 ? `The trivial representation of C${subN}.` : `An irreducible representation sending the generator r to ${descExp}.`,
                latexGen: { r: rLatex },
                cyclicK: k,
                genMatrices: { r: [[C(Math.cos(tau * k / n), Math.sin(tau * k / n))]] }
            };
            REPS.push(rep);
            irreps.push(rep);
        }
        if (n > 2) {
            REPS.push({
                label: `C${subN} \u2014 Standard 2D real`,
                gPreset: 'C' + n, gOrder: n, dim: 2, isReducible: true,
                description: `Rotation by 2\u03c0/${n}. Reducible over \u2102.`,
                genMatrices: { r: rot2D(tau / n) }
            });
        }
        // Regular representation for order <= 6
        if (n <= 6) {
            const regMat = Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => (i === (j + 1) % n) ? R(1) : R(0))
            );
            REPS.push({
                label: `C${subN} \u2014 Regular rep (${n}D)`,
                gPreset: 'C' + n, gOrder: n, dim: n, isReducible: true,
                description: `The left regular representation of C${subN} on itself (|G|=${n} basis vectors, one per element).`,
                genMatrices: { r: regMat }
            });
        }
    });

    // --- Klein Four Group V4 (C2xC2) ---
    REPS.push({
        label: `C\u2082\u00d7C\u2082 (V\u2084) \u2014 Trivial (1D)`,
        gPreset: 'C2xC2', gOrder: 4, dim: 1,
        description: `All elements map to 1.`,
        genMatrices: { a: [[R(1)]], b: [[R(1)]] }
    });
    REPS.push({
        label: `C\u2082\u00d7C\u2082 (V\u2084) \u2014 Sign on a (1D)`,
        gPreset: 'C2xC2', gOrder: 4, dim: 1,
        description: `a \u21a6 \u22121, b \u21a6 1.`,
        genMatrices: { a: [[R(-1)]], b: [[R(1)]] }
    });
    REPS.push({
        label: `C\u2082\u00d7C\u2082 (V\u2084) \u2014 Sign on b (1D)`,
        gPreset: 'C2xC2', gOrder: 4, dim: 1,
        description: `a \u21a6 1, b \u21a6 \u22121.`,
        genMatrices: { a: [[R(1)]], b: [[R(-1)]] }
    });
    REPS.push({
        label: `C\u2082\u00d7C\u2082 (V\u2084) \u2014 Sign on ab (1D)`,
        gPreset: 'C2xC2', gOrder: 4, dim: 1,
        description: `a \u21a6 \u22121, b \u21a6 \u22121.`,
        genMatrices: { a: [[R(-1)]], b: [[R(-1)]] }
    });
    REPS.push({
        label: `C\u2082\u00d7C\u2082 (V\u2084) \u2014 Standard 2D real`,
        gPreset: 'C2xC2', gOrder: 4, dim: 2, isReducible: true,
        description: `Symmetries of a non-square rectangle. Reducible into (Sign on a) \u2295 (Sign on b).`,
        genMatrices: {
            a: [[R(-1), R(0)], [R(0), R(1)]], // Reflect x
            b: [[R(1), R(0)], [R(0), R(-1)]]  // Reflect y
        }
    });
    // V4 regular representation (4D)
    // Elements ordered: e=0, a=1, b=2, ab=3
    REPS.push({
        label: 'C\u2082\u00d7C\u2082 (V\u2084) \u2014 Regular rep (4D)',
        gPreset: 'C2xC2', gOrder: 4, dim: 4, isReducible: true,
        description: 'The left regular representation of V\u2084 on itself (|G|=4 basis vectors, one per element). ',
        // + 'Decomposes as the direct sum of all four 1D irreps: Trivial \u2295 Sign-a \u2295 Sign-b \u2295 Sign-ab.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)], [R(0), R(0), R(1), R(0)]],
            b: [[R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1)], [R(1), R(0), R(0), R(0)], [R(0), R(1), R(0), R(0)]]
        }
    });

    // H2O vibrational modes: 9D rep of V4 = C2xC2 (C2v symmetry)
    // Basis: (xO,yO,zO, xH1,yH1,zH1, xH2,yH2,zH2). a=C2(z), b=σv(xz). H1,H2 in xz-plane.
    REPS.push({
        label: 'C\u2082\u00d7C\u2082 (V\u2084) \u2014 H\u2082O vibrational modes (9D)',
        gPreset: 'C2xC2', gOrder: 4, dim: 9, isReducible: true,
        description: 'The 3N=9 dimensional representation on atomic displacements of water (H\u2082O, C\u2082\u1d65 symmetry). ',
        // + 'Basis: (x,y,z) for O, H\u2081, H\u2082 in order. Generator a\u200a=\u200aC\u2082(z) swaps H\u2081\u2194H\u2082 and flips x,y; '
        // + 'b\u200a=\u200a\u03c3\u1d65(xz) fixes all atoms and flips y. '
        // + 'Decomposes as 3(Trivial) \u2295 3(Sign-a) \u2295 (Sign-b) \u2295 2(Sign-ab), '
        // + 'i.e. 3A\u2081 \u2295 3B\u2081 \u2295 A\u2082 \u2295 2B\u2082 in C\u2082\u1d65 notation. '
        // + 'Vibrational modes: 2A\u2081 \u2295 B\u2081 (3 modes = 3N\u22126).',
        genMatrices: {
            a: [
                [R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)]
            ],
            b: [
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)]
            ]
        }
    });


    // --- Dihedral Groups S3(D3), D4, D5, D6 ---
    [{ key: 'S3', n: 3 }, { key: 'D4', n: 4 }, { key: 'D5', n: 5 }, { key: 'D6', n: 6 }].forEach(({ key, n }) => {
        REPS.push({
            label: `${key} \u2014 Trivial (1D)`,
            gPreset: key, gOrder: 2 * n, dim: 1,
            description: `All elements map to 1.`,
            genMatrices: { r: [[R(1)]], s: [[R(1)]] }
        });
        REPS.push({
            label: `${key} \u2014 Sign (1D)`,
            gPreset: key, gOrder: 2 * n, dim: 1,
            description: `Rotations map to 1, reflections map to \u22121.`,
            genMatrices: { r: [[R(1)]], s: [[R(-1)]] }
        });
        if (n % 2 === 0) {
            REPS.push({
                label: `${key} \u2014 Rotation Sign (1D)`,
                gPreset: key, gOrder: 2 * n, dim: 1,
                description: `Mirror reflections map to 1, rotation generator r maps to \u22121.`,
                genMatrices: { r: [[R(-1)]], s: [[R(1)]] }
            });
            REPS.push({
                label: `${key} \u2014 Mixed Sign (1D)`,
                gPreset: key, gOrder: 2 * n, dim: 1,
                description: `Both r and s map to \u22121.`,
                genMatrices: { r: [[R(-1)]], s: [[R(-1)]] }
            });
        }
        for (let k = 1; k <= (n - 1) / 2; k++) {
            REPS.push({
                label: `${key} \u2014 Irrep 2D (k=${k})`,
                gPreset: key, gOrder: 2 * n, dim: 2,
                description: `The irreducible 2D representation with \u03c1(r) = rot(2\u03c0k/${n}).`,
                genMatrices: { r: rot2D(tau * k / n), s: [[R(1), R(0)], [R(0), R(-1)]] }
            });
        }
    });

    // Reducible permutation representation for S3 over 3 elements
    REPS.push({
        label: 'S\u2083 \u2014 Natural 3D permutation',
        gPreset: 'S3', gOrder: 6, dim: 3, isReducible: true,
        description: 'The natural permutation representation of S\u2083 on {1,2,3}. This representation is reducible and decomposes as Trivial \u2295 Standard 2D.',
        genMatrices: {
            r: [[R(0), R(0), R(1)], [R(1), R(0), R(0)], [R(0), R(1), R(0)]],
            s: [[R(0), R(1), R(0)], [R(1), R(0), R(0)], [R(0), R(0), R(1)]]
        }
    });

    // S3 regular representation (6D)
    // Elements ordered: e=0, r=1, r²=2, s=3, sr=4, sr²=5
    REPS.push({
        label: 'S\u2083 \u2014 Regular rep (6D)',
        gPreset: 'S3', gOrder: 6, dim: 6, isReducible: true,
        description: 'The left regular representation of S\u2083 on itself (|G|=6 basis vectors, one per element). ',
        //    + 'Decomposes as Trivial \u2295 Sign \u2295 2\u00b7E\u2082D.',
        genMatrices: {
            r: [
                [R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(1), R(0), R(0)]
            ],
            s: [
                [R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0)]
            ]
        }
    });
    // NH3 vibrational modes: 12D rep of S3 = C3v
    // Basis: (xN,yN,zN, xH1,yH1,zH1, xH2,yH2,zH2, xH3,yH3,zH3).
    // r=C3 (120° CCW, H1→H2→H3→H1), s=σv(xz) (H2↔H3, H1 fixed).
    REPS.push({
        label: 'S\u2083 \u2014 NH\u2083 vibrational modes (12D)',
        gPreset: 'S3', gOrder: 6, dim: 12, isReducible: true,
        description: 'The 3N=12 dimensional representation on atomic displacements of ammonia (NH\u2083, C\u2083\u1d65 symmetry). ',
        // + 'Basis: (x,y,z) for N, H\u2081, H\u2082, H\u2083 in order. Generator r\u200a=\u200aC\u2083 rotates 120\u00b0 and cycles H\u2081\u2192H\u2082\u2192H\u2083; '
        // + 's\u200a=\u200a\u03c3\u1d65(xz) fixes N,H\u2081 and swaps H\u2082\u2194H\u2083. '
        // + 'Decomposes as 3A\u2081 \u2295 A\u2082 \u2295 4E in C\u2083\u1d65 notation. '
        // + 'Vibrational modes: 2A\u2081 \u2295 2E (6 modes = 3N\u22126).',
        genMatrices: {
            r: [
                [R(-0.5), R(-_sq3o2), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(_sq3o2), R(-0.5), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-0.5), R(-_sq3o2), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(_sq3o2), R(-0.5), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(-0.5), R(-_sq3o2), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(_sq3o2), R(-0.5), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(-0.5), R(-_sq3o2), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(_sq3o2), R(-0.5), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)]
            ],
            s: [
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)]
            ]
        }
    });


    // D4 permutation rep on square vertices (4D)
    // Vertices labelled 0,1,2,3 counterclockwise. r: 0→1→2→3→0; s: fixes 0,2, swaps 1↔3.
    REPS.push({
        label: 'D\u2084 \u2014 Square vertices (4D)',
        gPreset: 'D4', gOrder: 8, dim: 4, isReducible: true,
        description: 'The natural permutation representation of D\u2084 on the 4 vertices of a square. ',
        // + 'r rotates vertices 90\u00b0 (v\u2081\u2192v\u2082\u2192v\u2083\u2192v\u2084), '
        // + 's is a reflection fixing v\u2081,v\u2083 and swapping v\u2082\u2194v\u2084. '
        // + 'Decomposes as Trivial \u2295 RotSign \u2295 E\u2082D(k=1).',
        genMatrices: {
            r: [[R(0), R(0), R(0), R(1)], [R(1), R(0), R(0), R(0)], [R(0), R(1), R(0), R(0)], [R(0), R(0), R(1), R(0)]],
            s: [[R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)], [R(0), R(0), R(1), R(0)], [R(0), R(1), R(0), R(0)]]
        }
    });

    // D5 permutation rep on pentagon vertices (5D)
    // Vertices labelled 0..4 counterclockwise. r: 0→1→2→3→4→0; s: fixes 0, reverses rest (k→5-k mod 5).
    REPS.push({
        label: 'D\u2085 \u2014 Pentagon vertices (5D)',
        gPreset: 'D5', gOrder: 10, dim: 5, isReducible: true,
        description: 'The natural permutation representation of D\u2085 on the 5 vertices of a regular pentagon. ',
        // + 'r rotates vertices 72\u00b0 (v\u2081\u2192\u22ef\u2192v\u2085\u2192v\u2081), '
        // + 's is a reflection fixing v\u2081 and reversing the cyclic order. '
        // + 'Decomposes as Trivial \u2295 E\u2082D(k=1) \u2295 E\u2082D(k=2).',
        genMatrices: {
            r: [
                [R(0), R(0), R(0), R(0), R(1)],
                [R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0)]
            ],
            s: [
                [R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0)]
            ]
        }
    });

    // D6 permutation rep on hexagon vertices (6D)
    // Vertices 0..5 counterclockwise. r: 0→1→…→5→0; s: fixes 0,3, reverses rest (k→6-k mod 6).
    REPS.push({
        label: 'D\u2086 \u2014 Hexagon vertices (6D)',
        gPreset: 'D6', gOrder: 12, dim: 6, isReducible: true,
        description: 'The natural permutation representation of D\u2086 on the 6 vertices of a regular hexagon. ',
        // + 'r rotates vertices 60\u00b0 (v\u2081\u2192\u22ef\u2192v\u2086\u2192v\u2081), '
        // + 's is a reflection fixing v\u2081,v\u2084 and reversing the cyclic order. '
        // + 'Decomposes as Trivial \u2295 RotSign \u2295 E\u2082D(k=1) \u2295 E\u2082D(k=2).',
        genMatrices: {
            r: [
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1), R(0)]
            ],
            s: [
                [R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0)]
            ]
        }
    });

    // D4 regular representation (8D)
    // Elements ordered: e=0, r=1, r²=2, r³=3, s=4, sr=5, sr²=6, sr³=7
    REPS.push({
        label: 'D\u2084 \u2014 Regular rep (8D)',
        gPreset: 'D4', gOrder: 8, dim: 8, isReducible: true,
        description: 'The left regular representation of D\u2084 on itself (|G|=8 basis vectors, one per element). ',
        // + 'Decomposes as Trivial \u2295 Sign \u2295 RotSign \u2295 MixedSign \u2295 2\u00b7E\u2082D(k=1).',
        genMatrices: {
            r: [
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)]
            ],
            s: [
                [R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0)]
            ]
        }
    });

    // --- Quaternion Group Q8 ---
    [0, 1, 2, 3].forEach(k => {
        const mats = [
            { i: [[R(1)]], j: [[R(1)]], desc: 'Trivial' },
            { i: [[R(-1)]], j: [[R(1)]], desc: 'Sign \u03c1\u2081: i \u21a6 \u22121, j \u21a6 1' },
            { i: [[R(1)]], j: [[R(-1)]], desc: 'Sign \u03c1\u2082: i \u21a6 1, j \u21a6 \u22121' },
            { i: [[R(-1)]], j: [[R(-1)]], desc: 'Sign \u03c1\u2083: i \u21a6 \u22121, j \u21a6 \u22121' }
        ][k];
        REPS.push({
            label: `Q\u2088 \u2014 ${mats.desc}`,
            gPreset: 'Q8', gOrder: 8, dim: 1, description: `A 1D irrep of Q\u2088.`,
            genMatrices: { i: mats.i, j: mats.j }
        });
    });
    REPS.push({
        label: 'Q\u2088 \u2014 Faithful 2D complex',
        gPreset: 'Q8', gOrder: 8, dim: 2,
        description: 'The unique 2D irrep, realizing Q\u2088 \u2282 SU(2).',
        genMatrices: {
            i: [[C(0, 1), R(0)], [R(0), C(0, -1)]],
            j: [[R(0), R(1)], [R(-1), R(0)]]
        }
    });

    // Q8 regular representation (8D)
    // Elements ordered: e=0, i=1, i²=2, i³=3, j=4, ij=5, i²j=6, i³j=7
    REPS.push({
        label: 'Q\u2088 \u2014 Regular rep (8D)',
        gPreset: 'Q8', gOrder: 8, dim: 8, isReducible: true,
        description: 'The left regular representation of Q\u2088 on itself (|G|=8 basis vectors, one per element). ',
        genMatrices: {
            i: [
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0)]
            ],
            j: [
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0)]
            ]
        }
    });

    // --- Alternating Group A4 ---
    [0, 1, 2].forEach(k => {
        let bLatex = '1';
        let descExp = '1';
        if (k > 0) {
            bLatex = formatExp(k, 3);
            descExp = bLatex.replace(/\^\{/g, '<sup>').replace(/\}/g, '</sup>').replace(/\\pi/g, '\u03c0');
        }
        REPS.push({
            label: `A\u2084 \u2014 ${k === 0 ? 'Trivial' : 'Character \u03c7' + k} (1D)`,
            gPreset: 'A4', gOrder: 12, dim: 1,
            description: k === 0 ? `A 1D irrep.` : `An irreducible representation sending the generator b to ${descExp}.`,
            latexGen: { b: bLatex },
            cyclicK: k,
            subGOrder: 3, // to pass to formatExp during character table eval
            genMatrices: { a: [[R(1)]], b: [[C(Math.cos(tau * k / 3), Math.sin(tau * k / 3))]] }
        });
    });
    REPS.push({
        label: 'A\u2084 \u2014 Standard 3D (faithful)',
        gPreset: 'A4', gOrder: 12, dim: 3,
        description: 'Rotational symmetries of the tetrahedron.',
        genMatrices: {
            a: [[R(-1), R(0), R(0)], [R(0), R(-1), R(0)], [R(0), R(0), R(1)]],
            b: [[R(0), R(0), R(1)], [R(1), R(0), R(0)], [R(0), R(1), R(0)]]
        }
    });
    REPS.push({
        label: 'A\u2084 \u2014 Natural 4D permutation',
        gPreset: 'A4', gOrder: 12, dim: 4, isReducible: true,
        description: 'The natural permutation representation of A\u2084 on {1,2,3,4}. This representation is reducible and decomposes as Trivial \u2295 Standard 3D.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)], [R(0), R(0), R(1), R(0)]],
            b: [[R(0), R(0), R(1), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(1)]]
        }
    });

    // --- Symmetric Group S4 ---
    REPS.push({ label: 'S\u2084 \u2014 Trivial (1D)', gPreset: 'S4', gOrder: 24, dim: 1, description: 'Trivial rep.', genMatrices: { a: [[R(1)]], b: [[R(1)]] } });
    REPS.push({ label: 'S\u2084 \u2014 Sign (1D)', gPreset: 'S4', gOrder: 24, dim: 1, description: 'Alternating char.', genMatrices: { a: [[R(-1)]], b: [[R(-1)]] } });
    REPS.push({
        label: 'S\u2084 \u2014 Standard 2D',
        gPreset: 'S4', gOrder: 24, dim: 2, description: 'Factors through S\u2083.',
        genMatrices: { a: [[R(1), R(0)], [R(0), R(-1)]], b: [[R(-0.5), R(sq3)], [R(sq3), R(0.5)]] }
    });
    REPS.push({
        label: 'S\u2084 \u2014 Standard 3D (faithful)',
        gPreset: 'S4', gOrder: 24, dim: 3, description: 'Complement of the trivial in the 4D permutation rep.',
        genMatrices: {
            a: [[R(0), R(1), R(0)], [R(1), R(0), R(0)], [R(0), R(0), R(1)]],
            b: [[R(-1), R(-1), R(-1)], [R(1), R(0), R(0)], [R(0), R(1), R(0)]]
        }
    });
    REPS.push({
        label: 'S\u2084 \u2014 Sign \u2297 Standard 3D',
        gPreset: 'S4', gOrder: 24, dim: 3, description: 'Tensor product with sign char.',
        genMatrices: {
            a: [[R(0), R(-1), R(0)], [R(-1), R(0), R(0)], [R(0), R(0), R(-1)]],
            b: [[R(1), R(1), R(1)], [R(-1), R(0), R(0)], [R(0), R(-1), R(0)]]
        }
    });
    REPS.push({
        label: 'S\u2084 \u2014 Natural 4D permutation',
        gPreset: 'S4', gOrder: 24, dim: 4, isReducible: true,
        description: 'The natural permutation representation of S\u2084 on {1,2,3,4}. This representation is reducible and decomposes as Trivial \u2295 Standard 3D.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1)]],
            b: [[R(0), R(1), R(0), R(0)], [R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1)], [R(1), R(0), R(0), R(0)]]
        }
    });

    // Octahedral σ-SALCs: 6D permutation rep of S4 ≅ O (octahedral rotation group)
    // Ligands at ±x,±y,±z. Labelled: L1=(+x)=0, L2=(-x)=1, L3=(+y)=2, L4=(-y)=3, L5=(+z)=4, L6=(-z)=5.
    // a = C2' rotation (180° around (0,1,1)/√2): swaps ±x pair, and also 3↔5, 4↔2 direction pairs.
    //   σa: (01)(24)(35) — permutes as (L1↔L2)(L3↔L5)(L4↔L6).
    // b = C4 rotation (90° around y-axis): σb: (0 5 1 4) — L1→L6→L2→L5→L1, L3,L4 fixed.
    // Decomposes as Trivial ⊕ Std2D ⊕ Sign⊗Std3D = A1 ⊕ E ⊕ T1 (in Oh restricted to O).
    REPS.push({
        label: 'S\u2084 \u2014 Octahedral \u03c3-SALCs (6D)',
        gPreset: 'S4', gOrder: 24, dim: 6, isReducible: true,
        description: 'The permutation representation on 6 \u03c3-donor orbitals of an octahedral complex ',
        // + '(S\u2084 \u2245 O, the octahedral proper rotation group). '
        // + 'Ligand basis: \u00b1x, \u00b1y, \u00b1z positions (L\u2081=+x, L\u2082=\u2212x, L\u2083=+y, L\u2084=\u2212y, L\u2085=+z, L\u2086=\u2212z). '
        // + 'Generator a\u200a=\u200aC\u2082\u2019 (180\u00b0 around (0,1,1)/\u221a2), b\u200a=\u200aC\u2084 (90\u00b0 around y-axis). '
        // + 'Decomposes as A\u2081 \u2295 E \u2295 T\u2081 = Trivial \u2295 Std2D \u2295 Sign\u2297Std3D.',
        genMatrices: {
            a: [
                [R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0)]
            ],
            b: [
                [R(0), R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(1)],
                [R(0), R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0)]
            ]
        }
    });

    // CH4 vibrational modes: 15D rep of S4 = Td (tetrahedral symmetry).
    // Basis: (xC,yC,zC, xH1,yH1,zH1, xH2,..., xH3,..., xH4,...).
    // H atoms at (±1,±1,±1)/√3 (alternating signs), C at origin.
    // a = σd reflection swapping H1↔H2: 3D matrix [[1,0,0],[0,0,-1],[0,-1,0]].
    // b = S4 improper rotation cycling H1→H4→H3→H2: 3D matrix [[0,0,-1],[0,-1,0],[1,0,0]].
    // Γ_3N = A1 ⊕ E ⊕ T1 ⊕ 3T2 = Trivial ⊕ Std2D ⊕ Sign⊗Std3D ⊕ 3·Std3D.
    // Γ_vib = A1 ⊕ E ⊕ 2T2 (9 modes = 3N−6).
    REPS.push({
        label: 'S\u2084 \u2014 CH\u2084 vibrational modes (15D)',
        gPreset: 'S4', gOrder: 24, dim: 15, isReducible: true,
        description: 'The 3N=15 dimensional representation on atomic displacements of methane (CH\u2084, T\u2064 \u2245 S\u2084 symmetry). ',
        // + 'Basis: (x,y,z) for C, H\u2081, H\u2082, H\u2083, H\u2084 in order. '
        // + 'H atoms at vertices of a regular tetrahedron: H\u2081=(1,1,1)/\u221a3, H\u2082=(1,\u22121,\u22121)/\u221a3, H\u2083=(\u22121,1,\u22121)/\u221a3, H\u2084=(\u22121,\u22121,1)/\u221a3. '
        // + 'Generator a\u200a=\u200a\u03c3\u2064 swaps H\u2081\u2194H\u2082 (reflection through y+z=0); '
        // + 'b\u200a=\u200aS\u2084 cycles H\u2081\u2192H\u2084\u2192H\u2083\u2192H\u2082 (improper rotation). '
        // + 'Decomposes as A\u2081 \u2295 E \u2295 T\u2081 \u2295 3T\u2082 = Trivial \u2295 Std2D \u2295 Sign\u2297Std3D \u2295 3\u00b7Std3D. '
        // + 'Vibrational modes: A\u2081 \u2295 E \u2295 2T\u2082 (9 modes = 3N\u22126).',
        genMatrices: {
            a: [
                // C block: 3D matrix [[1,0,0],[0,0,-1],[0,-1,0]] in cols 0-2
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                // H1 block (rows 3-5): same 3D matrix, in H2-cols (6-8)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                // H2 block (rows 6-8): in H1-cols (3-5)
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                // H3 block (rows 9-11): in H3-cols (9-11)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0)],
                // H4 block (rows 12-14): in H4-cols (12-14)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0)]
            ],
            b: [
                // C block: 3D matrix [[0,0,-1],[0,-1,0],[1,0,0]] in cols 0-2
                [R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                // H1 block (rows 3-5): in H2-cols (6-8)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                // H2 block (rows 6-8): in H3-cols (9-11)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0)],
                // H3 block (rows 9-11): in H4-cols (12-14)
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(-1), R(0)],
                [R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(1), R(0), R(0)],
                // H4 block (rows 12-14): in H1-cols (3-5)
                [R(0), R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(-1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0), R(0)]
            ]
        }
    });

    // --- Octahedral Group Oh = O × Z₂ (order 48) ---
    // Generators: a (C₂' rotation, order 2), b (C₄ rotation, order 4), c (inversion, order 2).
    // S₄ ≅ O (proper rotations of octahedron): a,b use same matrices as S₄ irreps.
    // Gerade (g) irreps: c → +identity. Ungerade (u) irreps: c → −identity.
    REPS.push({ label: 'O\u2095 \u2014 A\u2081g (1D)', gPreset: 'Oh', gOrder: 48, dim: 1, description: 'Trivial representation. All group elements \u21a6 +1.', genMatrices: { a: [[R(1)]], b: [[R(1)]], c: [[R(1)]] } });
    REPS.push({ label: 'O\u2095 \u2014 A\u2082g (1D)', gPreset: 'Oh', gOrder: 48, dim: 1, description: 'a, b \u21a6 \u22121; inversion c \u21a6 +1.', genMatrices: { a: [[R(-1)]], b: [[R(-1)]], c: [[R(1)]] } });
    REPS.push({
        label: 'O\u2095 \u2014 Eg (2D)',
        gPreset: 'Oh', gOrder: 48, dim: 2,
        description: 'Two-dimensional gerade irrep. Spanned by d\u1d63\u00b2 and d\u1d64\u00b2\u207b\u1d65\u00b2 orbitals; forms the upper e\u1d67 set in crystal field splitting.',
        genMatrices: {
            a: [[R(1), R(0)], [R(0), R(-1)]],
            b: [[R(-0.5), R(sq3)], [R(sq3), R(0.5)]],
            c: [[R(1), R(0)], [R(0), R(1)]]
        }
    });
    REPS.push({
        label: 'O\u2095 \u2014 T\u2081g (3D)',
        gPreset: 'Oh', gOrder: 48, dim: 3,
        description: 'Three-dimensional gerade irrep. Transforms as the rotations (R\u1d63, R\u1d67, R\u1d68).',
        genMatrices: {
            a: [[R(0), R(-1), R(0)], [R(-1), R(0), R(0)], [R(0), R(0), R(-1)]],
            b: [[R(1), R(1), R(1)], [R(-1), R(0), R(0)], [R(0), R(-1), R(0)]],
            c: [[R(1), R(0), R(0)], [R(0), R(1), R(0)], [R(0), R(0), R(1)]]
        }
    });
    REPS.push({
        label: 'O\u2095 \u2014 T\u2082g (3D)',
        gPreset: 'Oh', gOrder: 48, dim: 3,
        description: 'Three-dimensional gerade irrep. Spanned by (d\u1d4f\u1d67, d\u1d4f\u1d68, d\u1d67\u1d68); forms the lower t\u2082\u1d67 set in crystal field splitting.',
        genMatrices: {
            a: [[R(0), R(1), R(0)], [R(1), R(0), R(0)], [R(0), R(0), R(1)]],
            b: [[R(-1), R(-1), R(-1)], [R(1), R(0), R(0)], [R(0), R(1), R(0)]],
            c: [[R(1), R(0), R(0)], [R(0), R(1), R(0)], [R(0), R(0), R(1)]]
        }
    });
    REPS.push({ label: 'O\u2095 \u2014 A\u2081u (1D)', gPreset: 'Oh', gOrder: 48, dim: 1, description: 'a, b \u21a6 +1; inversion c \u21a6 \u22121.', genMatrices: { a: [[R(1)]], b: [[R(1)]], c: [[R(-1)]] } });
    REPS.push({ label: 'O\u2095 \u2014 A\u2082u (1D)', gPreset: 'Oh', gOrder: 48, dim: 1, description: 'a, b \u21a6 \u22121; inversion c \u21a6 \u22121.', genMatrices: { a: [[R(-1)]], b: [[R(-1)]], c: [[R(-1)]] } });
    REPS.push({
        label: 'O\u2095 \u2014 Eu (2D)',
        gPreset: 'Oh', gOrder: 48, dim: 2,
        description: 'Two-dimensional ungerade irrep. Same rotation matrices as Eg; inversion c \u21a6 \u2212I\u2082.',
        genMatrices: {
            a: [[R(1), R(0)], [R(0), R(-1)]],
            b: [[R(-0.5), R(sq3)], [R(sq3), R(0.5)]],
            c: [[R(-1), R(0)], [R(0), R(-1)]]
        }
    });
    REPS.push({
        label: 'O\u2095 \u2014 T\u2081u (3D)',
        gPreset: 'Oh', gOrder: 48, dim: 3,
        description: 'Three-dimensional ungerade irrep. Transforms as (x, y, z) translations. IR-active: dipole-allowed transitions.',
        genMatrices: {
            a: [[R(0), R(-1), R(0)], [R(-1), R(0), R(0)], [R(0), R(0), R(-1)]],
            b: [[R(1), R(1), R(1)], [R(-1), R(0), R(0)], [R(0), R(-1), R(0)]],
            c: [[R(-1), R(0), R(0)], [R(0), R(-1), R(0)], [R(0), R(0), R(-1)]]
        }
    });
    REPS.push({
        label: 'O\u2095 \u2014 T\u2082u (3D)',
        gPreset: 'Oh', gOrder: 48, dim: 3,
        description: 'Three-dimensional ungerade irrep. Same rotation matrices as T\u2082g; inversion c \u21a6 \u2212I\u2083.',
        genMatrices: {
            a: [[R(0), R(1), R(0)], [R(1), R(0), R(0)], [R(0), R(0), R(1)]],
            b: [[R(-1), R(-1), R(-1)], [R(1), R(0), R(0)], [R(0), R(1), R(0)]],
            c: [[R(-1), R(0), R(0)], [R(0), R(-1), R(0)], [R(0), R(0), R(-1)]]
        }
    });
    // D^(2) restricted to Oh: 5D reducible representation on d-orbitals.
    // Decomposes as Eg ⊕ T₂g (block-diagonal). Basis: (dz², dx²-y², dxy, dxz, dyz).
    // Inversion c → +I₅ since d-orbitals are gerade (l=2 even, parity = (-1)^2 = +1).
    REPS.push({
        label: 'O\u2095 \u2014 D\u207d\u00b2\u207e = Eg \u2295 T\u2082g (5D crystal field)',
        gPreset: 'Oh', gOrder: 48, dim: 5, isReducible: true,
        description: 'The D\u207d\u00b2\u207e Wigner representation of d-orbitals restricted from SO(3) to O\u2095. Decomposes as the e\u1d67 set (d\u1d63\u00b2, d\u1d64\u00b2\u207b\u1d65\u00b2) \u2295 t\u2082\u1d67 set (d\u1d4f\u1d67, d\u1d4f\u1d68, d\u1d67\u1d68), explaining the crystal field splitting into two energy levels.',
        genMatrices: {
            a: [
                [R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(-1), R(0), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(0), R(1)]
            ],
            b: [
                [R(-0.5), R(sq3), R(0), R(0), R(0)],
                [R(sq3), R(0.5), R(0), R(0), R(0)],
                [R(0), R(0), R(-1), R(-1), R(-1)],
                [R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0)]
            ],
            c: [
                [R(1), R(0), R(0), R(0), R(0)],
                [R(0), R(1), R(0), R(0), R(0)],
                [R(0), R(0), R(1), R(0), R(0)],
                [R(0), R(0), R(0), R(1), R(0)],
                [R(0), R(0), R(0), R(0), R(1)]
            ]
        }
    });

    // --- Icosahedral Group Ih = I × Z₂ (order 120) ---
    // Generators: a (C₂, order 2), b (C₃, order 3), c (inversion, order 2).
    // I ≅ A₅: a,b use identical matrices to the A₅ irreps already above.
    // Gerade (g): c → +I.  Ungerade (u): c → −I.
    (() => {
        // Shared helper — builds the 5D H matrices from Sym²(ρ₁)
        function makeH5(sign) {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c72 = Math.cos(2 * Math.PI / 5), s72 = Math.sin(2 * Math.PI / 5);
            const m3a = [[-i5, 0, i5x2], [0, -1, 0], [i5x2, 0, i5]];
            const m3b = [[-c72 * i5, s72 * i5, i5x2], [-s72, -c72, 0], [2 * c72 * i5, -2 * s72 * i5, i5]];
            function symSq(M) {
                const pairs = [[0, 0], [1, 1], [2, 2], [0, 1], [1, 2], [0, 2]];
                const S = Array.from({ length: 6 }, () => new Array(6));
                for (let r = 0; r < 6; r++) for (let ci = 0; ci < 6; ci++) {
                    if (ci < 3) { const k = pairs[ci][0]; S[r][ci] = r < 3 ? M[pairs[r][0]][k] * M[pairs[r][1]][k] : Math.sqrt(2) * M[pairs[r][0]][k] * M[pairs[r][1]][k]; }
                    else { const [k, l] = pairs[ci]; S[r][ci] = r < 3 ? Math.sqrt(2) * M[pairs[r][0]][k] * M[pairs[r][0]][l] : M[pairs[r][0]][k] * M[pairs[r][1]][l] + M[pairs[r][0]][l] * M[pairs[r][1]][k]; }
                }
                return S;
            }
            const P = [[1 / Math.sqrt(2), -1 / Math.sqrt(2), 0, 0, 0, 0], [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6), 0, 0, 0], [0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3), 0, 0, 0]];
            const mul = (A, B) => A.map(row => B[0].map((_, i) => row.reduce((s, x, j) => s + x * B[j][i], 0)));
            const trM = A => A[0].map((_, i) => A.map(row => row[i]));
            const Ma = mul(P, mul(symSq(m3a), trM(P))), Mb = mul(P, mul(symSq(m3b), trM(P)));
            const toC = m => m.slice(0, 5).map(row => row.slice(0, 5).map(x => R(x)));
            const cMat = [[R(sign), R(0), R(0), R(0), R(0)], [R(0), R(sign), R(0), R(0), R(0)], [R(0), R(0), R(sign), R(0), R(0)], [R(0), R(0), R(0), R(sign), R(0)], [R(0), R(0), R(0), R(0), R(sign)]];
            return { a: toC(Ma), b: toC(Mb), c: cMat };
        }

        // 1D
        REPS.push({ label: 'I\u2095 \u2014 Ag (1D)', gPreset: 'Ih', gOrder: 120, dim: 1, description: 'Trivial representation. All group elements \u21a6 +1.', genMatrices: { a: [[R(1)]], b: [[R(1)]], c: [[R(1)]] } });
        REPS.push({ label: 'I\u2095 \u2014 Au (1D)', gPreset: 'Ih', gOrder: 120, dim: 1, description: 'Trivial on rotations; inversion c \u21a6 \u22121 (pseudoscalar).', genMatrices: { a: [[R(1)]], b: [[R(1)]], c: [[R(-1)]] } });

        // T₁g / T₁u  (ρ₁, χ(ab) = φ)
        const makeT1 = (sign) => (() => {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c72 = Math.cos(2 * Math.PI / 5), s72 = Math.sin(2 * Math.PI / 5);
            return {
                a: [[R(-i5), R(0), R(i5x2)], [R(0), R(-1), R(0)], [R(i5x2), R(0), R(i5)]],
                b: [[R(-c72 * i5), R(s72 * i5), R(i5x2)], [R(-s72), R(-c72), R(0)], [R(2 * c72 * i5), R(-2 * s72 * i5), R(i5)]],
                c: [[R(sign), R(0), R(0)], [R(0), R(sign), R(0)], [R(0), R(0), R(sign)]]
            };
        })();
        REPS.push({ label: 'I\u2095 \u2014 T\u2081g (3D)', gPreset: 'Ih', gOrder: 120, dim: 3, description: 'Gerade; transforms as (R\u1d63,R\u1d67,R\u1d68). \u03c7(ab)=\u03c6=(1+\u221a5)/2.', displayScale: { a: 5, b: 10 }, genMatrices: makeT1(1) });
        REPS.push({ label: 'I\u2095 \u2014 T\u2081u (3D)', gPreset: 'Ih', gOrder: 120, dim: 3, description: 'Ungerade; transforms as (x,y,z). IR-active. \u03c7(ab)=\u03c6.', displayScale: { a: 5, b: 10 }, genMatrices: makeT1(-1) });

        // T₂g / T₂u  (ρ₂, χ(ab) = 1−φ)
        const makeT2 = (sign) => (() => {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c144 = Math.cos(4 * Math.PI / 5), s144 = Math.sin(4 * Math.PI / 5);
            return {
                a: [[R(i5), R(0), R(i5x2)], [R(0), R(-1), R(0)], [R(i5x2), R(0), R(-i5)]],
                b: [[R(c144 * i5), R(-s144 * i5), R(i5x2)], [R(-s144), R(-c144), R(0)], [R(2 * c144 * i5), R(-2 * s144 * i5), R(-i5)]],
                c: [[R(sign), R(0), R(0)], [R(0), R(sign), R(0)], [R(0), R(0), R(sign)]]
            };
        })();
        REPS.push({ label: 'I\u2095 \u2014 T\u2082g (3D)', gPreset: 'Ih', gOrder: 120, dim: 3, description: 'Gerade; algebraic conjugate of T\u2081g. \u03c7(ab)=1\u2212\u03c6.', displayScale: { a: 5, b: 10 }, genMatrices: makeT2(1) });
        REPS.push({ label: 'I\u2095 \u2014 T\u2082u (3D)', gPreset: 'Ih', gOrder: 120, dim: 3, description: 'Ungerade; algebraic conjugate of T\u2081u. \u03c7(ab)=1\u2212\u03c6.', displayScale: { a: 5, b: 10 }, genMatrices: makeT2(-1) });

        // Gg / Gu  (4D)
        const gA = [[R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)], [R(0), R(0), R(1), R(0)]];
        const gB = [[R(-1), R(-1), R(-1), R(-1)], [R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)]];
        REPS.push({ label: 'I\u2095 \u2014 Gg (4D)', gPreset: 'Ih', gOrder: 120, dim: 4, description: 'Gerade 4D irrep. Complement of trivial in the 5D permutation rep on {1,2,3,4,5}.', genMatrices: { a: gA, b: gB, c: [[R(1), R(0), R(0), R(0)], [R(0), R(1), R(0), R(0)], [R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1)]] } });
        REPS.push({ label: 'I\u2095 \u2014 Gu (4D)', gPreset: 'Ih', gOrder: 120, dim: 4, description: 'Ungerade 4D irrep. Same rotation matrices as Gg; inversion c \u21a6 \u2212I\u2084.', genMatrices: { a: gA, b: gB, c: [[R(-1), R(0), R(0), R(0)], [R(0), R(-1), R(0), R(0)], [R(0), R(0), R(-1), R(0)], [R(0), R(0), R(0), R(-1)]] } });

        // Hg / Hu  (5D)
        REPS.push({ label: 'I\u2095 \u2014 Hg (5D)', gPreset: 'Ih', gOrder: 120, dim: 5, description: 'Gerade 5D irrep. Spanned by d-orbital functions; Raman-active in C\u2086\u2080.', displayScale: { a: 5, b: 10 }, genMatrices: makeH5(1) });
        REPS.push({ label: 'I\u2095 \u2014 Hu (5D)', gPreset: 'Ih', gOrder: 120, dim: 5, description: 'Ungerade 5D irrep. Same rotation matrices as Hg; inversion c \u21a6 \u2212I\u2085.', displayScale: { a: 5, b: 10 }, genMatrices: makeH5(-1) });
    })();

    // Ih \u0393_total \u2014 C\u2086\u2080 reducible 3N = 180 representation
    // Decomposition: 2Ag + Au + 4T\u2081g + 5T\u2081u + 4T\u2082g + 5T\u2082u + 6Gg + 6Gu + 8Hg + 7Hu
    // Characters: \u03c7(E)=180, \u03c7(\u03c3)=4, all others = 0
    REPS.push({
        label: 'I\u2095 \u2014 \u0393_total (C\u2086\u2080, 180D)',
        gPreset: 'Ih', gOrder: 120, dim: 180,
        isReducible: true,
        description: 'Reducible 3N\u202f=\u202f180 dimensional representation for all 60 atomic displacements in C\u2086\u2080 (Buckminsterfullerene). Characters computed as \u03a3\u2009m\u1d62\u00d7\u03c7\u1d62(g) from known multiplicities; no explicit 180\u00d7180 matrices.',
        charFromIrrepMults: [2, 1, 4, 5, 4, 5, 6, 6, 8, 7]
        // order matches Ih irreps in REPS: Ag, Au, T\u2081g, T\u2081u, T\u2082g, T\u2082u, Gg, Gu, Hg, Hu
    });

    // --- Alternating Group A5 ---
    REPS.push({ label: 'A\u2085 \u2014 Trivial (1D)', gPreset: 'A5', gOrder: 60, dim: 1, description: 'Trivial rep.', genMatrices: { a: [[R(1)]], b: [[R(1)]] } });
    REPS.push({
        label: 'A\u2085 \u2014 3D Icosahedral \u03c1\u2081',
        gPreset: 'A5', gOrder: 60, dim: 3,
        description: 'Rotations of icosahedron, \u03c7(ab) = \u03c6. (where \u03c6 = (1+\u221a5)/2 is the golden ratio)',
        displayScale: { a: 5, b: 10 },
        genMatrices: (() => {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c72 = Math.cos(2 * Math.PI / 5), s72 = Math.sin(2 * Math.PI / 5);
            return {
                a: [[R(-i5), R(0), R(i5x2)], [R(0), R(-1), R(0)], [R(i5x2), R(0), R(i5)]],
                b: [[R(-c72 * i5), R(s72 * i5), R(i5x2)], [R(-s72), R(-c72), R(0)], [R(2 * c72 * i5), R(-2 * s72 * i5), R(i5)]]
            };
        })()
    });
    REPS.push({
        label: 'A\u2085 \u2014 3D Icosahedral \u03c1\u2082',
        gPreset: 'A5', gOrder: 60, dim: 3,
        description: 'Algebraic conjugate of \u03c1\u2081, \u03c7(ab) = 1\u2212\u03c6.',
        displayScale: { a: 5, b: 10 },
        genMatrices: (() => {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c144 = Math.cos(4 * Math.PI / 5), s144 = Math.sin(4 * Math.PI / 5);
            return {
                a: [[R(i5), R(0), R(i5x2)], [R(0), R(-1), R(0)], [R(i5x2), R(0), R(-i5)]],
                b: [[R(c144 * i5), R(-s144 * i5), R(i5x2)], [R(-s144), R(-c144), R(0)], [R(2 * c144 * i5), R(-2 * s144 * i5), R(-i5)]]
            };
        })()
    });
    REPS.push({
        label: 'A\u2085 \u2014 4D Irrep',
        gPreset: 'A5', gOrder: 60, dim: 4,
        description: 'Complement of the trivial in the 5D permutation representation on {1,2,3,4,5}.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)], [R(0), R(0), R(1), R(0)]],
            b: [[R(-1), R(-1), R(-1), R(-1)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)]]
        }
    });
    // Wait, b matrix for 4D was: row1=(-1,-1,-1,-1), row2=(0,1,0,0), row3=(1,0,0,0), row4=(0,0,0,1)?
    // My previous derivation: b = [[-1, -1, -1, -1], [0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1]]
    // Let's use that.
    REPS[REPS.length - 1].genMatrices.b = [[R(-1), R(-1), R(-1), R(-1)], [R(0), R(1), R(0), R(0)], [R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1)]];

    REPS.push({
        label: 'A\u2085 \u2014 5D Irrep',
        gPreset: 'A5', gOrder: 60, dim: 5,
        description: 'The unique 5-dimensional irreducible representation of A\u2085, realized as the complement of the trivial in Sym\u00b2(\u03c1\u2081) (the 6-dimensional symmetric square of the 3D icosahedral representation).',
        displayScale: { a: 5, b: 10 },
        genMatrices: (() => {
            const i5 = 1 / Math.sqrt(5), i5x2 = 2 / Math.sqrt(5);
            const c72 = Math.cos(2 * Math.PI / 5), s72 = Math.sin(2 * Math.PI / 5);
            // icosahedral 3D
            const m3a = [[-i5, 0, i5x2], [0, -1, 0], [i5x2, 0, i5]];
            const m3b = [[-c72 * i5, s72 * i5, i5x2], [-s72, -c72, 0], [2 * c72 * i5, -2 * s72 * i5, i5]];

            function symSq(M) {
                const pairs = [[0, 0], [1, 1], [2, 2], [0, 1], [1, 2], [0, 2]];
                const S = Array.from({ length: 6 }, () => new Array(6));
                for (let r = 0; r < 6; r++) {
                    for (let c = 0; c < 6; c++) {
                        if (c < 3) {
                            const k = pairs[c][0];
                            if (r < 3) S[r][c] = M[pairs[r][0]][k] * M[pairs[r][1]][k];
                            else S[r][c] = Math.sqrt(2) * M[pairs[r][0]][k] * M[pairs[r][1]][k];
                        } else {
                            const [k, l] = pairs[c];
                            if (r < 3) S[r][c] = Math.sqrt(2) * M[pairs[r][0]][k] * M[pairs[r][0]][l];
                            else S[r][c] = M[pairs[r][0]][k] * M[pairs[r][1]][l] + M[pairs[r][0]][l] * M[pairs[r][1]][k];
                        }
                    }
                }
                return S;
            }

            const s2a = symSq(m3a), s2b = symSq(m3b);
            const P = [
                [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0, 0, 0, 0],
                [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6), 0, 0, 0],
                [0, 0, 0, 1, 0, 0],
                [0, 0, 0, 0, 1, 0],
                [0, 0, 0, 0, 0, 1],
                [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3), 0, 0, 0]
            ];

            function mul(A, B) {
                return A.map(row => B[0].map((_, i) => row.reduce((sum, cell, j) => sum + cell * B[j][i], 0)));
            }
            function tr(A) { return A[0].map((_, i) => A.map(row => row[i])); }
            const Ma = mul(P, mul(s2a, tr(P))), Mb = mul(P, mul(s2b, tr(P)));

            const toC = mat => mat.slice(0, 5).map(row => row.slice(0, 5).map(x => R(x)));
            return { a: toC(Ma), b: toC(Mb) };
        })()
    });

    REPS.push({
        label: 'A\u2085 \u2014 Natural 5D permutation',
        gPreset: 'A5', gOrder: 60, dim: 5, isReducible: true,
        description: 'The natural permutation representation of A\u2085 on {1,2,3,4,5}. This representation is reducible and decomposes as Trivial \u2295 Standard 4D.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0), R(0)], [R(1), R(0), R(0), R(0), R(0)], [R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(0), R(1)]],
            b: [[R(0), R(0), R(1), R(0), R(0)], [R(0), R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(0), R(1)], [R(0), R(0), R(0), R(1), R(0)], [R(1), R(0), R(0), R(0), R(0)]]
        }
    });

    // --- Symmetric Group S5 ---
    REPS.push({ label: 'S\u2085 \u2014 Trivial (1D)', gPreset: 'S5', gOrder: 120, dim: 1, description: 'Trivial representation.', genMatrices: { a: [[R(1)]], b: [[R(1)]] } });
    REPS.push({ label: 'S\u2085 \u2014 Sign (1D)', gPreset: 'S5', gOrder: 120, dim: 1, description: 'Alternating representation.', genMatrices: { a: [[R(-1)]], b: [[R(1)]] } });
    REPS.push({
        label: 'S\u2085 \u2014 Standard 4D',
        gPreset: 'S5', gOrder: 120, dim: 4,
        description: 'Complement of the trivial to the 5D permutation rep.',
        genMatrices: {
            a: [[R(-1), R(1), R(0), R(0)], [R(0), R(1), R(0), R(0)], [R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1)]],
            b: [[R(0), R(0), R(0), R(-1)], [R(1), R(0), R(0), R(-1)], [R(0), R(1), R(0), R(-1)], [R(0), R(0), R(1), R(-1)]]
        }
    });
    REPS.push({
        label: 'S\u2085 \u2014 Sign \u2297 Standard 4D',
        gPreset: 'S5', gOrder: 120, dim: 4,
        description: 'Tensor product of the Standard 4D rep with the sign representation.',
        genMatrices: {
            a: [[R(1), R(-1), R(0), R(0)], [R(0), R(-1), R(0), R(0)], [R(0), R(0), R(-1), R(0)], [R(0), R(0), R(0), R(-1)]],
            b: [[R(0), R(0), R(0), R(-1)], [R(1), R(0), R(0), R(-1)], [R(0), R(1), R(0), R(-1)], [R(0), R(0), R(1), R(-1)]]
        }
    });
    REPS.push({
        label: 'S\u2085 \u2014 5D Irrep \u03c1\u2081',
        gPreset: 'S5', gOrder: 120, dim: 5,
        description: 'The irreducible 5D representation of S\u2085 associated with the partition (3,2). Acts on the edges of K\u2085.',
        genMatrices: {
            a: [[R(-1), R(0), R(-1), R(0), R(-1)], [R(0), R(-1), R(0), R(-1), R(-1)], [R(0), R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(0), R(1)]],
            b: [[R(1), R(1), R(0), R(0), R(1)], [R(-1), R(0), R(-1), R(0), R(-1)], [R(-1), R(-1), R(-1), R(-1), R(-1)], [R(1), R(0), R(0), R(0), R(0)], [R(0), R(0), R(1), R(0), R(0)]]
        }
    });
    REPS.push({
        label: 'S\u2085 \u2014 5D Irrep \u03c1\u2082',
        gPreset: 'S5', gOrder: 120, dim: 5,
        description: 'Tensor product of \u03c1\u2081 with the sign representation.',
        genMatrices: {
            a: [[R(1), R(0), R(1), R(0), R(1)], [R(0), R(1), R(0), R(1), R(1)], [R(0), R(0), R(-1), R(0), R(0)], [R(0), R(0), R(0), R(-1), R(0)], [R(0), R(0), R(0), R(0), R(-1)]],
            b: [[R(1), R(1), R(0), R(0), R(1)], [R(-1), R(0), R(-1), R(0), R(-1)], [R(-1), R(-1), R(-1), R(-1), R(-1)], [R(1), R(0), R(0), R(0), R(0)], [R(0), R(0), R(1), R(0), R(0)]]
        }
    });
    REPS.push({
        label: 'S\u2085 \u2014 6D Irrep',
        gPreset: 'S5', gOrder: 120, dim: 6,
        description: 'The "exterior square" representation of the standard 4D representation.',
        genMatrices: {
            a: [[R(-1), R(0), R(0), R(0), R(0), R(0)], [R(0), R(-1), R(0), R(1), R(0), R(0)], [R(0), R(0), R(-1), R(0), R(1), R(0)], [R(0), R(0), R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(0), R(0), R(1)]],
            b: [[R(0), R(0), R(1), R(0), R(0), R(0)], [R(0), R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(0), R(0), R(1)], [R(1), R(0), R(-1), R(0), R(1), R(0)], [R(0), R(1), R(-1), R(0), R(0), R(1)], [R(0), R(0), R(0), R(1), R(-1), R(1)]]
        }
    });

    REPS.push({
        label: 'S\u2085 \u2014 Natural 5D permutation',
        gPreset: 'S5', gOrder: 120, dim: 5, isReducible: true,
        description: 'The natural permutation representation of S\u2085 on {1,2,3,4,5}. This representation is reducible and decomposes as Trivial \u2295 Standard 4D.',
        genMatrices: {
            a: [[R(0), R(1), R(0), R(0), R(0)], [R(1), R(0), R(0), R(0), R(0)], [R(0), R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(0), R(1)]],
            b: [[R(0), R(1), R(0), R(0), R(0)], [R(0), R(0), R(1), R(0), R(0)], [R(0), R(0), R(0), R(1), R(0)], [R(0), R(0), R(0), R(0), R(1)], [R(1), R(0), R(0), R(0), R(0)]]
        }
    });

    // ── Permutation generators for permutation groups ─────────────────────────
    // Keyed by gPreset; genMatrices taken from the "Standard Nd permutation" rep.
    const PERM_GENS = {};
    const PERM_GROUP_KEYS = new Set(['S3', 'A4', 'S4', 'A5', 'S5']);
    REPS.forEach(rep => {
        if (PERM_GROUP_KEYS.has(rep.gPreset) && rep.isReducible && rep.label.includes('permutation')) {
            PERM_GENS[rep.gPreset] = rep.genMatrices;
        }
    });

    // For a word in generators, return cycle-notation string using perm rep matrices
    function wordToCycleNotation(word, permGens) {
        if (!word) return 'e';
        const M = evalWord(word, permGens);
        if (!M) return word;
        return permToCycleNotation(matToPerm(M));
    }


    // ── Group Data (Conjugacy Classes) ────────────────────────────────────
    const getGroupData = async (gPreset) => {
        if (window._groupDataCache?.has(gPreset)) return window._groupDataCache.get(gPreset);
        if (!window._groupDataCache) window._groupDataCache = new Map();

        const pres = GROUP_PRESETS[gPreset];
        const generators = pres.gens.split(',').map(s => s.trim());
        const expandedRels = parseRelations(pres.rels).map(rel => relToWord(rel));

        const solver = new CosetEnumerator(generators, expandedRels);
        await solver.solve();
        const { table, words, size } = solver.compactTable();

        // Full multiplication table
        const fullTable = Array.from({ length: size }, () => new Int32Array(size));
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                let curr = i;
                for (const char of words[j]) {
                    const col = solver.getCol(char);
                    curr = table[curr][col];
                }
                fullTable[i][j] = curr;
            }
        }

        // Inverses
        const inverses = new Int32Array(size);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (fullTable[i][j] === 0) {
                    inverses[i] = j;
                    break;
                }
            }
        }

        // Conjugacy classes
        const classes = [];
        const visited = new Array(size).fill(false);
        for (let i = 0; i < size; i++) {
            if (visited[i]) continue;
            const cls = [];
            // Elements in the class of i: { g * i * g^-1 | g in G }
            for (let g = 0; g < size; g++) {
                const g_inv = inverses[g];
                const conj = fullTable[fullTable[g][i]][g_inv];
                if (!visited[conj]) {
                    visited[conj] = true;
                    cls.push(conj);
                }
            }
            classes.push(cls);
        }

        // classInv[c] is the class of the inverses of class c: a character must
        // satisfy chi(g^-1) = conj(chi(g)), which pins down each such pair.
        const classOf = new Int32Array(size);
        classes.forEach((cls, ci) => cls.forEach(el => { classOf[el] = ci; }));
        const classInv = classes.map(cls => classOf[inverses[cls[0]]]);

        const data = { words, classes, size, classInv };
        window._groupDataCache.set(gPreset, data);
        return data;
    };

    const getGroupCharTableHTML = async (group) => {
        const { words, classes } = await getGroupData(group);
        const groupReps = REPS.filter(r => r.gPreset === group && !r.isReducible);
        const classInfo = classes.map(cls => ({ word: words[cls[0]], size: cls.length }));

        const getChiStr = (rep, word) => {
            const matrix = evalWord(word, rep.genMatrices);
            const tr = matTrace(matrix);
            let chiStr = fmtC(tr);
            if (rep.dim === 1 && rep.latexGen) {
                if (!word) {
                    chiStr = '1';
                } else {
                    let totalPow = 0;
                    let baseLatex = '';
                    for (const char of word) {
                        if (rep.latexGen[char]) {
                            baseLatex = rep.latexGen[char];
                            totalPow++;
                        }
                    }
                    if (baseLatex === '1') chiStr = '1';
                    else if (baseLatex === '-1') chiStr = (totalPow % 2 === 0) ? '1' : '-1';
                    else if (baseLatex === 'i') chiStr = ['1', 'i', '-1', '-i'][totalPow % 4];
                    else if (baseLatex === '-i') chiStr = ['1', '-i', '-1', 'i'][totalPow % 4];
                    else if (rep.cyclicK !== undefined) {
                        const k = rep.cyclicK;
                        const n = rep.subGOrder || rep.gOrder;
                        const power = (k * totalPow) % n;
                        if (power === 0) chiStr = '1';
                        else if (power * 2 === n) chiStr = '-1';
                        else if (power * 4 === n) chiStr = 'i';
                        else if (power * 4 === 3 * n) chiStr = '-i';
                        else chiStr = formatExp(power, n);
                    }
                }
            }
            return chiStr;
        };

        // Rows = irreps, columns = conjugacy classes
        let tableHTML = `<table class="char-table"><thead>` +
            `<tr><th rowspan="2">Irrep</th>` +
            `<th colspan="${classInfo.length}" class="class-group-header" style="border-bottom:none">Conjugacy class representative / Class size</th></tr>` +
            `<tr>`;
        classInfo.forEach(({ word, size }) => {
            const display = PERM_GENS[group] ? wordToCycleNotation(word, PERM_GENS[group]) : formatWord(word);
            tableHTML += `<th style="text-transform:none;letter-spacing:normal">${display}<br><span style="font-weight:normal;font-size:0.85em">${size}</span></th>`;
        });
        tableHTML += `</tr></thead><tbody>`;

        let usesOmega = false;
        let usesPhi = false;

        groupReps.forEach(rep => {
            const parts = rep.label.split('\u2014');
            const repName = parts.length > 1 ? parts[1].trim() : rep.label;
            tableHTML += `<tr><td style="text-transform:none;letter-spacing:normal">\\(\\chi_{\\text{${repName}}}\\)</td>`;
            classInfo.forEach(({ word }) => {
                const chiStr = getChiStr(rep, word);
                if (chiStr === '\\omega' || chiStr.includes('\\omega')) usesOmega = true;
                if (chiStr.includes('\\varphi')) usesPhi = true;
                tableHTML += `<td>\\(${chiStr}\\)</td>`;
            });
            tableHTML += `</tr>`;
        });
        tableHTML += '</tbody></table>';

        if (usesOmega) {
            tableHTML += `<p class="help-text" style="margin-top:0.5rem;">\u03c9 = e<sup>2\u03c0i/3</sup></p>`;
        }
        if (usesPhi) {
            tableHTML += `<p class="help-text" style="margin-top:0.5rem;">\u03c6 = (1+\u221a5)/2 (golden ratio)</p>`;
        }
        return tableHTML;
    };

    window.RepCore = {
        C, PERM_GENS, PERM_GROUP_KEYS, R, REPS, SYMBOLS,
        _i5, _i5x2, _phi, _sq2o2, _sq3o2, _sq5,
        blockDiagToLatex, bracketed, cAbs2, cAdd, cMul, enumerateImage,
        evalWord, factorMatrix, fmtC, formatExp, getGroupCharTableHTML, getGroupData,
        gramSchmidt, isBareSum, makeIdentity, makeZero, matAdd, matAdjoint,
        matCScale, matInverseFinite, matIsIdentity, matKey, matMul, matToLatex,
        matToPerm, matTrace, matVec, permToCycleNotation, phi, rot2D,
        sq3, tau, vecCScale, vecInner, vecNorm2, vecSub,
        wordToCycleNotation
    };

})();
