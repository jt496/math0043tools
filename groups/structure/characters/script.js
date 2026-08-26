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
 * Character Explorer Script
 *
 * A homework tool: type a class function, or a whole character table, and have
 * it checked against the group. The representation catalogue, conjugacy classes
 * and matrix machinery come from ../rep-core.js.
 */

document.addEventListener('DOMContentLoaded', () => {

    const {
        PERM_GENS, REPS, cAbs2, cAdd, cMul,
        evalWord, fmtC, getGroupCharTableHTML, getGroupData, matInverseFinite,
        matTrace, phi, tau, wordToCycleNotation
    } = window.RepCore;

    // ══════════════════════════════════════════════════════════════════════════
    //  Student character checker
    //  Lets a student type a class function (or a whole character table) and
    //  checks it against the group: ⟨χ,χ⟩, the multiplicities n_r = ⟨χ,χ_r⟩,
    //  Σdᵢ² = |G|, row orthonormality and column orthogonality.
    // ══════════════════════════════════════════════════════════════════════════

    // ── Complex arithmetic beyond the matrix helpers above ────────────────────
    function cSub([a, b], [c, d]) { return [a - c, b - d]; }
    function cConj([a, b]) { return [a, -b]; }
    function cDiv([a, b], [c, d]) {
        const q = c * c + d * d;
        if (q === 0) throw new Error('division by zero');
        return [(a * c + b * d) / q, (b * c - a * d) / q];
    }
    function cExp([a, b]) { const r = Math.exp(a); return [r * Math.cos(b), r * Math.sin(b)]; }
    function cLog([a, b]) {
        const m = Math.hypot(a, b);
        if (m === 0) throw new Error('log of 0');
        return [Math.log(m), Math.atan2(b, a)];
    }
    function cSqrt(z) {
        if (Math.abs(z[1]) < 1e-15 && z[0] >= 0) return [Math.sqrt(z[0]), 0];
        return cExp(cMul([0.5, 0], cLog(z)));
    }
    function cPow(z, w) {
        if (z[0] === 0 && z[1] === 0) return (w[0] === 0 && w[1] === 0) ? [1, 0] : [0, 0];
        if (Math.abs(w[1]) < 1e-15 && Number.isInteger(w[0]) && Math.abs(w[0]) <= 64) {
            let acc = [1, 0];
            for (let k = 0; k < Math.abs(w[0]); k++) acc = cMul(acc, z);
            return w[0] < 0 ? cDiv([1, 0], acc) : acc;
        }
        return cExp(cMul(w, cLog(z)));
    }
    function cCos([a, b]) { return [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)]; }
    function cSin([a, b]) { return [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)]; }

    // ── A tiny expression parser over ℂ ───────────────────────────────────────
    // Grammar:  expr := term (('+'|'-') term)*
    //           term := unary (('*'|'/'|<implicit>) unary)*
    //          unary := ('-'|'+') unary | power
    //          power := atom ('^' unary)?
    //           atom := number | const | func atom | func '(' expr ')' | '(' expr ')'
    const CC_CONSTS = {
        i: [0, 1],
        pi: [Math.PI, 0],
        e: [Math.E, 0],
        w: [Math.cos(tau / 3), Math.sin(tau / 3)],
        omega: [Math.cos(tau / 3), Math.sin(tau / 3)],
        phi: [phi, 0]
    };
    const CC_FUNCS = { sqrt: cSqrt, exp: cExp, log: cLog, cos: cCos, sin: cSin, conj: cConj };

    function ccTokenize(src) {
        const s = src
            .replace(/−/g, '-')                       // −
            .replace(/[–—]/g, '-')               // – —
            .replace(/[·×∗]/g, '*')         // · × ∗
            .replace(/÷/g, '/')                       // ÷
            .replace(/√/g, 'sqrt')                    // √
            .replace(/π/g, 'pi')                      // π
            .replace(/[ωϖ]/g, 'omega')           // ω
            .replace(/[φϕ]/g, 'phi')             // φ ϕ
            .replace(/²/g, '^2').replace(/³/g, '^3')
            .replace(/[[{]/g, '(').replace(/[\]}]/g, ')');
        const toks = [];
        let k = 0;
        while (k < s.length) {
            const ch = s[k];
            if (/\s/.test(ch)) { k++; continue; }
            if (/[0-9.]/.test(ch)) {
                let j = k;
                while (j < s.length && /[0-9.]/.test(s[j])) j++;
                const raw = s.slice(k, j);
                const num = Number(raw);
                if (!isFinite(num)) throw new Error(`"${raw}" is not a number`);
                toks.push({ t: 'num', v: num });
                k = j;
                continue;
            }
            if (/[a-zA-Z]/.test(ch)) {
                let j = k;
                while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
                toks.push({ t: 'id', v: s.slice(k, j).toLowerCase() });
                k = j;
                continue;
            }
            if ('+-*/^()'.includes(ch)) { toks.push({ t: ch }); k++; continue; }
            throw new Error(`unexpected character "${ch}"`);
        }
        return toks;
    }

    function ccParse(src) {
        const toks = ccTokenize(src);
        if (toks.length === 0) throw new Error('empty');
        let p = 0;
        const peek = () => toks[p];
        const eat = t => { if (toks[p] && toks[p].t === t) { p++; return true; } return false; };

        const startsAtom = () => {
            const t = peek();
            return !!t && (t.t === 'num' || t.t === 'id' || t.t === '(');
        };

        function parseAtom() {
            const t = peek();
            if (!t) throw new Error('expression ends too early');
            if (t.t === 'num') { p++; return [t.v, 0]; }
            if (t.t === '(') {
                p++;
                const v = parseExpr();
                if (!eat(')')) throw new Error('missing ")"');
                return v;
            }
            if (t.t === 'id') {
                p++;
                const fn = CC_FUNCS[t.v];
                if (fn) {
                    if (eat('(')) {
                        const a = parseExpr();
                        if (!eat(')')) throw new Error('missing ")"');
                        return fn(a);
                    }
                    return fn(parseAtom());   // bare application, e.g. sqrt5
                }
                if (CC_CONSTS[t.v]) return CC_CONSTS[t.v].slice();
                throw new Error(`unknown symbol "${t.v}"`);
            }
            throw new Error(`unexpected "${t.t}"`);
        }
        function parsePower() {
            const base = parseAtom();
            return eat('^') ? cPow(base, parseUnary()) : base;
        }
        function parseUnary() {
            if (eat('-')) return cSub([0, 0], parseUnary());
            if (eat('+')) return parseUnary();
            return parsePower();
        }
        function parseTerm() {
            let v = parseUnary();
            for (;;) {
                if (eat('*')) v = cMul(v, parseUnary());
                else if (eat('/')) v = cDiv(v, parseUnary());
                else if (startsAtom()) v = cMul(v, parseUnary());   // implicit product
                else return v;
            }
        }
        function parseExpr() {
            let v = parseTerm();
            for (;;) {
                if (eat('+')) v = cAdd(v, parseTerm());
                else if (eat('-')) v = cSub(v, parseTerm());
                else return v;
            }
        }

        const val = parseExpr();
        if (p < toks.length) throw new Error('unexpected extra input');
        if (!isFinite(val[0]) || !isFinite(val[1])) throw new Error('value is not finite');
        return val;
    }

    // ── Numeric character data for a group ────────────────────────────────────
    const ccDataCache = new Map();
    async function getCharacterData(group) {
        if (ccDataCache.has(group)) return ccDataCache.get(group);
        const { words, classes, size, classInv } = await getGroupData(group);
        const classInfo = classes.map(cls => {
            const word = words[cls[0]];
            return {
                word,
                size: cls.length,
                label: PERM_GENS[group] ? wordToCycleNotation(word, PERM_GENS[group]) : formatWord(word)
            };
        });
        const irreps = REPS.filter(r => r.gPreset === group && !r.isReducible).map(rep => {
            const genMap = {};
            for (const [gen, mat] of Object.entries(rep.genMatrices)) {
                genMap[gen] = mat;
                const up = gen.toUpperCase();
                if (up !== gen) genMap[up] = matInverseFinite(mat);
            }
            return {
                name: rep.label.replace(/^.+—\s*/, ''),
                dim: rep.dim,
                chi: classInfo.map(({ word }) => matTrace(evalWord(word, genMap)))
            };
        });
        const data = { classInfo, irreps, order: size, classInv };
        ccDataCache.set(group, data);
        return data;
    }

    // ⟨χ,ψ⟩ = (1/|G|) Σ_C |C| χ(C) conj(ψ(C))
    function ccInner(chi, psi, classInfo, order) {
        let re = 0, im = 0;
        classInfo.forEach(({ size }, c) => {
            const t = cMul(chi[c], cConj(psi[c]));
            re += size * t[0];
            im += size * t[1];
        });
        return [re / order, im / order];
    }

    const CC_TOL = 1e-4;
    const ccIsReal = z => Math.abs(z[1]) < CC_TOL;
    const ccIsInt = z => ccIsReal(z) && Math.abs(z[0] - Math.round(z[0])) < CC_TOL;
    const ccEq = (z, w) => Math.abs(z[0] - w[0]) < CC_TOL && Math.abs(z[1] - w[1]) < CC_TOL;
    // Short real formatter for inner products (which are real for genuine characters)
    function ccFmtReal(z) {
        if (!ccIsReal(z)) return fmtC(z);
        const r = Math.round(z[0]);
        return Math.abs(z[0] - r) < CC_TOL ? String(r) : String(Math.round(z[0] * 1000) / 1000);
    }

    // Class labels are HTML (r<sup>2</sup>, or cycle notation like (1 2 3)); turn
    // one into something that can go inside \( … \).
    function ccLabel(label) {
        const txt = label.replace(/<sup>(.*?)<\/sup>/g, '^{$1}').replace(/<[^>]+>/g, '');
        return /^[a-zA-Z](\^\{\d+\})?$/.test(txt) ? txt : `\\text{${txt}}`;
    }

    // ── Checker UI ────────────────────────────────────────────────────────────
    const ccSection = document.getElementById('cc-section');
    const ccGridWrap = document.getElementById('cc-grid-wrap');
    const ccResults = document.getElementById('cc-results');
    const ccResultsBody = document.getElementById('cc-results-body');
    const ccTabSingle = document.getElementById('cc-tab-single');
    const ccTabTable = document.getElementById('cc-tab-table');
    const ccBtnCheck = document.getElementById('cc-check');
    const ccBtnExample = document.getElementById('cc-example');
    const ccBtnClear = document.getElementById('cc-clear');

    let ccMode = 'single';
    let ccGroup = '';
    let ccData = null;

    function ccInputs() {
        return Array.from(ccGridWrap.querySelectorAll('input[type="text"]'));
    }

    function ccBuildGrid() {
        ccResults.classList.add('hidden');
        ccResultsBody.innerHTML = '';
        if (!ccData) { ccGridWrap.innerHTML = ''; return; }

        const { classInfo } = ccData;
        const r = classInfo.length;
        const rows = ccMode === 'single' ? 1 : r;

        let html = '<table class="cc-grid"><thead><tr><th class="cc-rowhead"></th>';
        classInfo.forEach(({ label, size }) => {
            html += `<th>${label}<br><span class="cc-size">${size}</span></th>`;
        });
        html += '</tr></thead><tbody>';
        for (let i = 0; i < rows; i++) {
            const name = ccMode === 'single' ? '\\(\\chi\\)' : `\\(\\chi_{${i + 1}}\\)`;
            html += `<tr><th class="cc-rowhead">${name}</th>`;
            for (let c = 0; c < r; c++) {
                const aria = ccMode === 'single'
                    ? `value of chi on class ${c + 1}`
                    : `row ${i + 1}, class ${c + 1}`;
                html += `<td><input type="text" inputmode="text" autocomplete="off" spellcheck="false"` +
                    ` data-row="${i}" data-col="${c}" aria-label="${aria}"></td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        ccGridWrap.innerHTML = html;

        ccInputs().forEach(inp => {
            inp.addEventListener('input', () => inp.classList.remove('cc-bad'));
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); ccCheck(); }
            });
        });
        if (window.MathJax) MathJax.typesetPromise([ccGridWrap]).catch(e => console.log(e));
    }

    // Read the grid; returns { rows: [[complex,…],…] } or { error, cell }
    function ccReadGrid() {
        const r = ccData.classInfo.length;
        const rows = ccMode === 'single' ? 1 : r;
        const out = [];
        const errors = [];
        ccInputs().forEach(inp => inp.classList.remove('cc-bad'));
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let c = 0; c < r; c++) {
                const inp = ccGridWrap.querySelector(`input[data-row="${i}"][data-col="${c}"]`);
                const raw = inp.value.trim();
                if (raw === '') {
                    inp.classList.add('cc-bad');
                    errors.push(rows === 1
                        ? `class ${c + 1} is empty`
                        : `row ${i + 1}, class ${c + 1} is empty`);
                    row.push([0, 0]);
                    continue;
                }
                try {
                    row.push(ccParse(raw));
                } catch (err) {
                    inp.classList.add('cc-bad');
                    errors.push(rows === 1
                        ? `class ${c + 1} ("${raw}"): ${err.message}`
                        : `row ${i + 1}, class ${c + 1} ("${raw}"): ${err.message}`);
                    row.push([0, 0]);
                }
            }
            out.push(row);
        }
        return { rows: out, errors };
    }

    function ccShow(html) {
        ccResultsBody.innerHTML = html;
        ccResults.classList.remove('hidden');
        if (window.MathJax) MathJax.typesetPromise([ccResultsBody]).catch(e => console.log(e));
    }

    const ccVerdict = (ok, text) =>
        `<p style="margin-top:0.75rem;"><span class="${ok ? 'eval-pass' : 'eval-fail'}">` +
        `${ok ? '✔' : '✘'} ${text}</span></p>`;

    // ── Mode 1: a single class function ───────────────────────────────────────
    function ccCheckSingle(chi) {
        const { classInfo, irreps, order, classInv } = ccData;
        const norm = ccInner(chi, chi, classInfo, order);
        const mults = irreps.map(ir => ccInner(chi, ir.chi, classInfo, order));

        let html = `<p>\\(|G| = ${order}\\), &ensp; \\(\\chi(e) = ${fmtC(chi[0])}\\)</p>`;
        html += `<p style="margin-top:0.75rem;"><strong>Norm</strong> &mdash; ` +
            `\\(\\langle\\chi,\\chi\\rangle = \\dfrac{1}{|G|}\\displaystyle\\sum_{g\\in G}|\\chi(g)|^2 = ` +
            `${ccFmtReal(norm)}\\)</p>`;

        // A character satisfies χ(g⁻¹) = conj(χ(g)). When something is wrong this
        // usually pinpoints the offending class far better than a bad multiplicity.
        const invFails = [];
        classInfo.forEach((ci, c) => {
            const d = classInv[c];
            if (d < c) return;                       // report each inverse pair once
            const here = ccLabel(ci.label);
            if (d === c) {
                if (!ccIsReal(chi[c])) invFails.push(
                    `\\(\\chi(${here})\\) must be real, because \\(${here}\\) is its own inverse ` +
                    `class \u2014 but you entered \\(${fmtC(chi[c])}\\).`);
            } else if (!ccEq(chi[d], cConj(chi[c]))) {
                const there = ccLabel(classInfo[d].label);
                invFails.push(
                    `\\(\\chi(${there})\\) should be \\(\\overline{\\chi(${here})} = ` +
                    `${fmtC(cConj(chi[c]))}\\), because \\(${there}\\) is the class of the inverses ` +
                    `of \\(${here}\\) \u2014 but you entered \\(${fmtC(chi[d])}\\).`);
            }
        });

        // Multiplicities n_r = ⟨χ, χ_r⟩
        const badMults = [];
        mults.forEach((n, k) => {
            if (!ccIsInt(n) || n[0] < -CC_TOL) badMults.push(irreps[k].name);
        });

        html += `<p style="margin-top:1rem;"><strong>Multiplicities</strong> &mdash; ` +
            `\\(n_r = \\langle\\chi,\\chi_r\\rangle\\) against the irreducible characters of \\(G\\)</p>`;
        html += '<table class="char-table"><thead><tr>' +
            '<th style="text-transform:none;letter-spacing:normal">\\(\\chi_r\\)</th>' +
            '<th style="text-transform:none;letter-spacing:normal">Irrep</th>' +
            '<th style="text-transform:none;letter-spacing:normal">\\(d_r\\)</th>' +
            '<th style="text-transform:none;letter-spacing:normal">\\(n_r\\)</th></tr></thead><tbody>';
        irreps.forEach((ir, k) => {
            const n = mults[k];
            const good = ccIsInt(n) && n[0] > -CC_TOL;
            html += `<tr><td style="text-transform:none;letter-spacing:normal">\\(\\chi_{${k + 1}}\\)</td>` +
                `<td style="text-transform:none;letter-spacing:normal">${ir.name}</td>` +
                `<td>${ir.dim}</td>` +
                `<td class="${good ? '' : 'cc-err'}">\\(${ccFmtReal(n)}\\)</td></tr>`;
        });
        html += '</tbody></table>';

        if (badMults.length > 0) {
            html += ccVerdict(false,
                `Not the character of any representation of \\(G\\) &mdash; the multiplicit${badMults.length === 1 ? 'y' : 'ies'} ` +
                `for ${badMults.map(n => `<em>${n}</em>`).join(', ')} ${badMults.length === 1 ? 'is' : 'are'} ` +
                `not a non-negative integer. Every character is \\(\\sum_r n_r\\chi_r\\) with \\(n_r\\in\\mathbb{Z}_{\\ge 0}\\).`);
            if (Math.abs(norm[0] - 1) < 0.01 && ccIsReal(norm)) {
                html += `<p class="help-text" style="margin-top:0.5rem;">Note \\(\\langle\\chi,\\chi\\rangle = 1\\) ` +
                    `above: that is necessary for an irreducible character but not sufficient, and this ` +
                    `\\(\\chi\\) is not a character at all.</p>`;
            }
            if (invFails.length > 0) {
                html += `<p style="margin-top:0.75rem;"><strong>Where it goes wrong</strong></p><ul style="margin-top:0.25rem;">` +
                    invFails.map(f => `<li style="margin-bottom:0.35rem;">${f}</li>`).join('') + '</ul>';
            }
            html += `<p class="help-text" style="margin-top:0.5rem;">Check the values you entered, and remember ` +
                `\\(\\chi\\) must be constant on each conjugacy class &mdash; one entry per column above.</p>`;
            return html;
        }

        const terms = [];
        const named = [];
        let degCheck = 0;
        mults.forEach((n, k) => {
            const m = Math.round(n[0]);
            if (m === 0) return;
            degCheck += m * irreps[k].dim;
            terms.push((m === 1 ? '' : `${m}\\,`) + `\\chi_{${k + 1}}`);
            named.push(`\\(\\chi_{${k + 1}}\\) = ${irreps[k].name}`);
        });

        if (terms.length === 0) {
            html += ccVerdict(false, 'This is the zero class function &mdash; not a character.');
            return html;
        }

        const sumSq = mults.reduce((a, n) => a + Math.round(n[0]) ** 2, 0);
        if (sumSq === 1) {
            html += ccVerdict(true,
                `<strong>Irreducible.</strong> \\(\\langle\\chi,\\chi\\rangle = 1\\), and \\(\\chi = ${terms[0]}\\).`);
        } else {
            html += ccVerdict(true,
                `<strong>A character, but reducible.</strong> \\(\\langle\\chi,\\chi\\rangle = ${sumSq} > 1\\).`);
            html += `<p style="margin-top:0.5rem;font-size:1.05rem;">\\(\\chi \\;=\\; ${terms.join(' + ')}\\)</p>`;
        }
        html += `<p class="help-text" style="margin-top:0.5rem;">${named.join(', &ensp;')}</p>`;
        html += `<p class="help-text" style="margin-top:0.5rem;">Degree check: ` +
            `\\(\\sum_r n_r d_r = ${degCheck} = \\chi(e)\\).</p>`;
        return html;
    }

    // ── Mode 2: a whole character table ───────────────────────────────────────
    function ccCheckTable(rows) {
        const { classInfo, irreps, order } = ccData;
        const r = classInfo.length;
        let allOk = true;
        let html = `<p>\\(|G| = ${order}\\), &ensp; ${r} conjugacy classes, so a character table has ` +
            `${r} rows and ${r} columns.</p>`;

        // (1) Degrees: Σ dᵢ² = |G|
        const degs = rows.map(row => row[0]);
        const badDeg = degs.some(d => !ccIsInt(d) || d[0] < 0.5);
        const sumSq = degs.reduce((a, d) => a + (ccIsReal(d) ? d[0] * d[0] : cAbs2(d)), 0);
        const degOk = !badDeg && Math.abs(sumSq - order) < CC_TOL;
        allOk = allOk && degOk;
        html += `<p style="margin-top:1rem;"><strong>Degrees</strong> &mdash; ` +
            `\\(d_i = \\chi_i(e)\\) is the first column</p>`;
        html += `<p>\\(\\sum_i d_i^2 = ${degs.map(d => `${ccFmtReal(d)}^2`).join(' + ')} = ` +
            `${Math.round(sumSq * 1000) / 1000}\\), &ensp; \\(|G| = ${order}\\)</p>`;
        html += ccVerdict(degOk, badDeg
            ? 'Each \\(d_i = \\chi_i(e)\\) must be a positive integer.'
            : (degOk ? '\\(\\sum_i d_i^2 = |G|\\)' : '\\(\\sum_i d_i^2 \\neq |G|\\)'));

        // (2) Row orthonormality ⟨χᵢ,χⱼ⟩ = δᵢⱼ
        const gram = rows.map(a => rows.map(b => ccInner(a, b, classInfo, order)));
        let rowOk = true;
        html += `<p style="margin-top:1.25rem;"><strong>Row orthogonality</strong> &mdash; ` +
            `\\(\\langle\\chi_i,\\chi_j\\rangle = \\delta_{ij}\\)</p>`;
        html += '<table class="char-table"><thead><tr><th></th>';
        for (let j = 0; j < r; j++) html += `<th style="text-transform:none;letter-spacing:normal">\\(\\chi_{${j + 1}}\\)</th>`;
        html += '</tr></thead><tbody>';
        for (let i = 0; i < r; i++) {
            html += `<tr><td style="text-transform:none;letter-spacing:normal">\\(\\chi_{${i + 1}}\\)</td>`;
            for (let j = 0; j < r; j++) {
                const want = i === j ? [1, 0] : [0, 0];
                const ok = ccEq(gram[i][j], want);
                if (!ok) rowOk = false;
                html += `<td class="${ok ? 'cc-ok' : 'cc-err'}">\\(${ccFmtReal(gram[i][j])}\\)</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        allOk = allOk && rowOk;
        html += ccVerdict(rowOk, rowOk
            ? 'The rows are orthonormal.'
            : 'The rows are not orthonormal &mdash; the off-diagonal entries should all be \\(0\\) and the diagonal all \\(1\\).');

        // (3) Column orthogonality  Σᵢ χᵢ(C) conj(χᵢ(C')) = δ_{CC'} |G|/|C|
        let colOk = true;
        html += `<p style="margin-top:1.25rem;"><strong>Column orthogonality</strong> &mdash; ` +
            `\\(\\sum_i \\chi_i(g)\\overline{\\chi_i(h)} = \\delta\\,|C_G(g)|\\), where ` +
            `\\(|C_G(g)| = |G|/|\\text{class}|\\)</p>`;
        html += '<table class="char-table"><thead><tr><th></th>';
        classInfo.forEach(({ label }) => {
            html += `<th style="text-transform:none;letter-spacing:normal">${label}</th>`;
        });
        html += '</tr></thead><tbody>';
        for (let c = 0; c < r; c++) {
            html += `<tr><td style="text-transform:none;letter-spacing:normal">${classInfo[c].label}</td>`;
            for (let d = 0; d < r; d++) {
                let s = [0, 0];
                for (let i = 0; i < r; i++) s = cAdd(s, cMul(rows[i][c], cConj(rows[i][d])));
                const want = c === d ? [order / classInfo[c].size, 0] : [0, 0];
                const ok = ccEq(s, want);
                if (!ok) colOk = false;
                html += `<td class="${ok ? 'cc-ok' : 'cc-err'}">\\(${ccFmtReal(s)}\\)</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        allOk = allOk && colOk;
        const wanted = classInfo.map(ci => order / ci.size).join(', ');
        html += ccVerdict(colOk, colOk
            ? `The columns are orthogonal, with squared norms \\(${wanted}\\) as they should be.`
            : `The columns fail orthogonality &mdash; the diagonal should read \\(${wanted}\\) and everything off it \\(0\\).`);

        // (4) Match each row against the catalogue of irreducible characters
        const used = new Array(irreps.length).fill(-1);
        const matched = rows.map((row, i) => {
            const k = irreps.findIndex(ir => ir.chi.every((z, c) => ccEq(z, row[c])));
            if (k >= 0 && used[k] === -1) used[k] = i;
            return k;
        });
        const dupes = matched.some((k, i) => k >= 0 && used[k] !== i);
        const rowsOkVsCatalogue = matched.every(k => k >= 0) && !dupes;
        html += `<p style="margin-top:1.25rem;"><strong>Against the character table of \\(G\\)</strong></p>`;
        html += '<table class="char-table"><thead><tr>' +
            '<th style="text-transform:none;letter-spacing:normal">Your row</th>' +
            '<th style="text-transform:none;letter-spacing:normal">Irreducible character it equals</th>' +
            '</tr></thead><tbody>';
        matched.forEach((k, i) => {
            const dup = k >= 0 && used[k] !== i;
            const cell = k < 0
                ? '<span class="cc-err">no irreducible character of \\(G\\) has these values</span>'
                : (dup
                    ? `<span class="cc-err">${irreps[k].name} &mdash; but so does row ${used[k] + 1}</span>`
                    : `<span class="cc-ok">${irreps[k].name}</span>`);
            html += `<tr><td style="text-transform:none;letter-spacing:normal">\\(\\chi_{${i + 1}}\\)</td><td>${cell}</td></tr>`;
        });
        html += '</tbody></table>';
        allOk = allOk && rowsOkVsCatalogue;

        html += `<p style="margin-top:1.25rem;font-size:1.05rem;"><span class="${allOk ? 'eval-pass' : 'eval-fail'}">` +
            (allOk
                ? '✔ This is the character table of \\(G\\), up to the order of the rows.'
                : '✘ This is not the character table of \\(G\\). The failures above show where to look.') +
            '</span></p>';
        if (!allOk) {
            html += `<p class="help-text" style="margin-top:0.5rem;">The <strong>Group Character Table</strong> ` +
                `button at the top shows the answer &mdash; but the three orthogonality checks tell you which ` +
                `row or column is wrong without giving it away.</p>`;
        }
        return html;
    }

    function ccCheck() {
        if (!ccData) return;
        const { rows, errors } = ccReadGrid();
        if (errors.length > 0) {
            ccShow('<p><span class="eval-fail">✘ Could not read every entry:</span></p><ul>' +
                errors.map(e => `<li>${e}</li>`).join('') + '</ul>');
            return;
        }
        ccShow(ccMode === 'single' ? ccCheckSingle(rows[0]) : ccCheckTable(rows));
    }

    function ccSetMode(mode) {
        ccMode = mode;
        ccTabSingle.setAttribute('aria-selected', String(mode === 'single'));
        ccTabTable.setAttribute('aria-selected', String(mode === 'table'));
        ccBuildGrid();
    }

    ccTabSingle.addEventListener('click', () => ccSetMode('single'));
    ccTabTable.addEventListener('click', () => ccSetMode('table'));
    ccBtnCheck.addEventListener('click', ccCheck);
    ccBtnClear.addEventListener('click', () => {
        ccInputs().forEach(inp => { inp.value = ''; inp.classList.remove('cc-bad'); });
        ccResults.classList.add('hidden');
        ccResultsBody.innerHTML = '';
    });
    ccBtnExample.addEventListener('click', () => {
        if (!ccData) return;
        ccInputs().forEach(inp => { inp.value = ''; inp.classList.remove('cc-bad'); });
        const r = ccData.classInfo.length;
        if (ccMode === 'single') {
            // Character of the regular representation: |G| on e, 0 elsewhere.
            for (let c = 0; c < r; c++) {
                const inp = ccGridWrap.querySelector(`input[data-row="0"][data-col="${c}"]`);
                inp.value = c === 0 ? String(ccData.order) : '0';
            }
        } else {
            // Just the trivial character, to show the format — the rest is the exercise.
            for (let c = 0; c < r; c++) {
                ccGridWrap.querySelector(`input[data-row="0"][data-col="${c}"]`).value = '1';
            }
        }
        ccResults.classList.add('hidden');
        ccResultsBody.innerHTML = '';
    });

    async function ccOnGroupChange(group) {
        ccGroup = group;
        ccResults.classList.add('hidden');
        ccResultsBody.innerHTML = '';
        if (!group) {
            ccSection.classList.add('hidden');
            ccData = null;
            ccGridWrap.innerHTML = '';
            return;
        }
        ccSection.classList.remove('hidden');
        ccGridWrap.innerHTML = '<p class="help-text">Finding the conjugacy classes…</p>';
        try {
            const data = await getCharacterData(group);
            if (ccGroup !== group) return;   // a later selection won the race
            ccData = data;
            ccBuildGrid();
        } catch (e) {
            console.error(e);
            ccData = null;
            ccGridWrap.innerHTML = '<p class="eval-fail">Could not compute the conjugacy classes of this group.</p>';
        }
    }

    // ── Group selector and the reference character table ──────────────────────
    const groupSelect = document.getElementById('char-group-select');
    const btnShowTable = document.getElementById('btn-show-group-char-table');
    const modal = document.getElementById('char-table-modal');
    const modalTitle = document.getElementById('modal-group-name');
    const modalBody = document.getElementById('modal-char-table-container');
    document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') modal.classList.add('hidden');
    });

    btnShowTable.addEventListener('click', async () => {
        const group = groupSelect.value;
        if (!group) return;
        modalTitle.textContent = (GROUP_PRESETS[group]?.label ?? group) + ' \u2014 Character Table';
        modalBody.innerHTML = '<p>Computing character table\u2026</p>';
        modal.classList.remove('hidden');
        try {
            modalBody.innerHTML = await getGroupCharTableHTML(group);
            if (window.MathJax) MathJax.typesetPromise([modalBody]);
        } catch (e) {
            console.error(e);
            modalBody.innerHTML = '<p class="eval-fail">Error generating character table.</p>';
        }
    });

    // Populate the group dropdown, ordered by |G|
    const groupOrderMap = {};
    const availableGroups = [];
    REPS.forEach(rep => {
        if (!(rep.gPreset in groupOrderMap)) groupOrderMap[rep.gPreset] = rep.gOrder;
        if (!availableGroups.includes(rep.gPreset)) availableGroups.push(rep.gPreset);
    });
    availableGroups
        .sort((a, b) => (groupOrderMap[a] || 0) - (groupOrderMap[b] || 0))
        .forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = GROUP_PRESETS[key]?.label ?? key;
            groupSelect.appendChild(opt);
        });

    groupSelect.addEventListener('change', () => {
        const group = groupSelect.value;
        btnShowTable.classList[group ? 'remove' : 'add']('hidden');
        ccOnGroupChange(group);
    });
});
