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
 * Representation Explorer Script
 *
 * Page wiring only. The representation catalogue, conjugacy classes and all
 * of the matrix machinery live in ../rep-core.js.
 */

document.addEventListener('DOMContentLoaded', () => {

    const {
        C, PERM_GENS, REPS, blockDiagToLatex, cAbs2,
        cAdd, cMul, evalWord, factorMatrix, fmtC,
        formatExp, getGroupCharTableHTML, getGroupData, gramSchmidt, makeZero,
        matAdd, matAdjoint, matCScale, matInverseFinite, matIsIdentity,
        matMul, matToLatex, matTrace, matVec, vecCScale,
        vecNorm2, wordToCycleNotation
    } = window.RepCore;

    const repSelect = document.getElementById('rep-select');
    const repDesc = document.getElementById('rep-description');
    const repDetail = document.getElementById('rep-detail-section');
    const repDimSpan = document.getElementById('rep-dim');
    const repGenMats = document.getElementById('rep-gen-matrices');
    const repPresEl = document.getElementById('rep-presentation');
    const repResults = document.getElementById('rep-results');
    const repRelsEl = document.getElementById('rep-relations-check');
    const repCharEl = document.getElementById('rep-char-table');
    const repAnalysisEl = document.getElementById('rep-analysis');
    const repHeader = document.getElementById('rep-header');


    // gPresentations and GROUP_LABELS removed — use GROUP_PRESETS[key].label (defined globally in presentations/script.js)


    // ── Change-of-basis computation ───────────────────────────────────────────
    // Uses Wigner matrix-element projectors: Π^(j)_{a,b} = (d_j/|G|) Σ_g conj(D_j(g)_{ab}) ρ(g)
    // Image of Π^(j)_{0,0} spans the "row-0" part of all n_j copies of irrep j.
    // Applying Π^(j)_{a,0} to each basis vector yields the remaining d_j-1 partner vectors.
    async function computeChangeOfBasis(rep) {
        const { gPreset } = rep;
        const { words, classes, size: G } = await getGroupData(gPreset);

        // Fast path: rep defined by known multiplicities — skip matrix construction
        if (rep.charFromIrrepMults) {
            const mults = rep.charFromIrrepMults;
            const irreps = REPS.filter(r => r.gPreset === rep.gPreset && !r.isReducible);
            const decomp = [];
            irreps.forEach((irrep, i) => {
                if (mults[i] > 0) {
                    const irepLabel = irrep.label.replace(/^.+\u2014\s*/, '');
                    decomp.push({ irrep, irepLabel, mult: mults[i], d_j: irrep.dim, basisVecs: [], terms: null });
                }
            });
            return { decomp, P: null, Pinv: null };
        }

        const { genMatrices } = rep;
        const n = rep.dim;

        const genMap = {};
        for (const [gen, mat] of Object.entries(genMatrices)) {
            genMap[gen] = mat;
            const upper = gen.toUpperCase();
            if (upper !== gen) genMap[upper] = matAdjoint(mat);
        }

        const rhoMats = words.map(w => evalWord(w, genMap));
        const chiRho = rhoMats.map(M => matTrace(M));

        const irreps = REPS.filter(r => r.gPreset === gPreset && !r.isReducible);
        const decomp = [];

        for (const irrep of irreps) {
            const d_j = irrep.dim;
            const irGenMap = {};
            for (const [gen, mat] of Object.entries(irrep.genMatrices)) {
                irGenMap[gen] = mat;
                const upper = gen.toUpperCase();
                if (upper !== gen) irGenMap[upper] = matAdjoint(mat);
            }

            const irMats = words.map(w => evalWord(w, irGenMap));

            // Multiplicity: n_j = (1/|G|) Σ_g χ_ρ(g) conj(χ_j(g))
            let mulSum = [0, 0];
            const terms = [];
            for (let i = 0; i < classes.length; i++) {
                const head = classes[i][0];
                const clsSize = classes[i].length;
                const chiJVal = matTrace(irMats[head]);
                const chiRVal = chiRho[head];
                const term = cMul(chiRVal, [chiJVal[0], -chiJVal[1]]);
                mulSum = cAdd(mulSum, [term[0] * clsSize, term[1] * clsSize]);
                terms.push({ clsSize, chiRVal, chiJVal });
            }
            const mult = Math.round(mulSum[0] / G);
            if (mult === 0) continue;

            // Projector Π^(j)_{a,b} = (d_j/|G|) Σ_g conj(D_j(g)_{ab}) ρ(g)
            function pi(a, b) {
                let proj = makeZero(n);
                for (let i = 0; i < G; i++) {
                    const [re, im] = irMats[i][a][b];
                    proj = matAdd(proj, matCScale(rhoMats[i], [re, -im]));
                }
                return matCScale(proj, [d_j / G, 0]);
            }

            // Find orthonormal basis of image(Π_{0,0}) — should have dimension mult
            const pi00 = pi(0, 0);
            const candidates = Array.from({ length: n }, (_, k) => {
                const ek = Array.from({ length: n }, (_, i) => (i === k ? [1, 0] : [0, 0]));
                return matVec(pi00, ek);
            });
            const basis00 = gramSchmidt(candidates);

            // For each basis vector v, apply Π_{a,0} to get the d_j partner vectors
            const basisVecs = [];
            for (const v of basis00) {
                for (let a = 0; a < d_j; a++) {
                    if (a === 0) {
                        basisVecs.push(v);
                    } else {
                        let vec = matVec(pi(a, 0), v);
                        const nm2 = vecNorm2(vec);
                        if (nm2 > 1e-8) vec = vecCScale(vec, [1 / Math.sqrt(nm2), 0]);
                        basisVecs.push(vec);
                    }
                }
            }

            const irepLabel = irrep.label.replace(/^.+\u2014\s*/, '');
            decomp.push({ irrep, irepLabel, mult, d_j, basisVecs, terms });
        }

        // Assemble P: columns = basisVecs in order [irrep1 copy1 rows, copy2 rows, ..., irrep2 ...]
        const cols = [];
        for (const { basisVecs } of decomp) cols.push(...basisVecs);
        const P = Array.from({ length: n }, (_, i) => cols.map(col => col[i]));
        const Pinv = matAdjoint(P); // P is unitary so P^{-1} = P†

        return { decomp, P, Pinv };
    }

    async function showChangeOfBasis() {
        const cobCard = document.getElementById('rep-cob-card');
        const cobContent = document.getElementById('rep-cob-content');
        cobCard.classList.remove('hidden');
        cobContent.innerHTML = '<p style="color:var(--text-secondary);">Decomposing representation\u2026</p>';

        try {
            const { decomp, P, Pinv } = await computeChangeOfBasis(currentRep);
            const { size: G } = await getGroupData(currentRep.gPreset);

            let html = '';

            // Group Character Table
            html += `<h4 style="margin-top:0.5rem;margin-bottom:1rem;color:var(--text-primary);">Group Character Table</h4>`;
            html += await getGroupCharTableHTML(currentRep.gPreset);
            html += `<hr style="border:none; border-top:1px solid var(--border-color); margin:2rem 0;">`;

            // Multiplicity displayed equations
            html += `<h4 style="margin-top:0.5rem;margin-bottom:1rem;color:var(--text-primary);">Multiplicity Calculations</h4>`;
            decomp.forEach(({ irepLabel, mult, d_j, terms }) => {
                const chiJ = `\\chi_{\\text{${irepLabel}}}`;
                if (!terms) {
                    html += `<p style="margin-bottom:1rem;">\\(n_{\\text{${irepLabel}}} = \\langle \\chi_\\rho, ${chiJ} \\rangle = ${mult}\\) <span class="help-text">(by construction)</span></p>`;
                    return;
                }
                
                let eq = `n_{\\text{${irepLabel}}} = \\langle \\chi_\\rho, ${chiJ} \\rangle = \\frac{1}{${G}} \\left[ `;
                const termStrings = terms.map(t => {
                    const cR = fmtC(t.chiRVal);
                    const cJ = fmtC([t.chiJVal[0], -t.chiJVal[1]]); // conjugate
                    return `${t.clsSize}(${cR})(${cJ})`;
                });
                eq += termStrings.join(' + ') + ` \\right] = ${mult}`;
                html += `<div class="gen-matrix-block" style="overflow-x:auto; margin-bottom:1.25rem; padding-bottom:0.5rem; white-space:nowrap;">\\(${eq}\\)</div>`;
            });

            // Decomposition summary
            const decompStr = decomp.map(({ irepLabel, mult, d_j }) => {
                const sym = d_j > 1 ? `\\rho_{\\text{${irepLabel}}}` : `\\chi_{\\text{${irepLabel}}}`;
                return mult > 1 ? `${mult}\\,${sym}` : sym;
            }).join(' \\oplus ');
            html += `<p style="font-size:1.1rem;margin:1.5rem 0 1rem;font-weight:500;">\\(\\rho \\;\\cong\\; ${decompStr}\\)</p>`;

            if (P !== null) {
                html += `<button id="btn-show-cob" class="btn primary" style="margin-top:1rem;">Show Change of Basis Details</button>`;
                html += `<div id="cob-details" class="hidden" style="margin-top:1.5rem; border-top:1px dashed var(--border-color); padding-top:1.5rem;">`;

                // Transformed generators
                html += `<p><strong>Generators in the new basis</strong> \\(P^{-1}\\rho(\\cdot)\\,P\\) (block-diagonal):</p>`;
                html += `<div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-start;margin-top:0.5rem;margin-bottom:1.25rem;">`;
                for (const [gen, mat] of Object.entries(currentRep.genMatrices)) {
                    const T = matMul(Pinv, matMul(mat, P));
                    html += `<div class="gen-matrix-block">\\(P^{-1}\\rho(${gen})P = ${blockDiagToLatex(T, decomp)}\\)</div>`;
                }
                html += `</div>`;

                // Change of basis matrix P (omit for large reps)
                html += `<p><strong>Change of basis matrix \\(P\\)</strong> (columns are the new basis vectors):</p>`;
                if (currentRep.dim <= 15) {
                    const { factorLatex: fP, scaledM: sP } = factorMatrix(P);
                    const Platex = fP ? `${fP}\\,${matToLatex(sP)}` : matToLatex(P);
                    html += `<div class="gen-matrix-block" style="margin:0.5rem 0 1.25rem;">\\(P = ${Platex}\\)</div>`;
                } else {
                    html += `<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.25rem;">Matrix omitted: too large to display (${currentRep.dim}\u00d7${currentRep.dim}). Limit is 15\u00d715.</p>`;
                }
                html += `</div>`;
            } else {
                html += `<p style="color:var(--text-secondary);font-size:0.9rem;margin-top:1rem;">Change of basis matrix omitted: explicit 180\u00d7180 generator matrices are not stored for this representation.</p>`;
            }

            cobContent.innerHTML = html;

            const btnShowCob = document.getElementById('btn-show-cob');
            if (btnShowCob) {
                btnShowCob.addEventListener('click', () => {
                    const details = document.getElementById('cob-details');
                    if (details.classList.contains('hidden')) {
                        details.classList.remove('hidden');
                        btnShowCob.textContent = 'Hide Change of Basis Details';
                    } else {
                        details.classList.add('hidden');
                        btnShowCob.textContent = 'Show Change of Basis Details';
                    }
                });
            }
            if (window.MathJax) MathJax.typesetPromise([cobContent]).catch(e => console.log(e));

        } catch (e) {
            console.error(e);
            cobContent.innerHTML = `<p class="status-error">Error: ${e.message}</p>`;
        }
    }

    const repGroupSelect = document.getElementById('rep-group-select');
    const repSelectWrapper = document.getElementById('rep-select-wrapper');
    const btnShowGroupCharTable = document.getElementById('btn-show-group-char-table');
    const charTableModal = document.getElementById('char-table-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalGroupName = document.getElementById('modal-group-name');
    const modalCharTableContainer = document.getElementById('modal-char-table-container');

    const btnFindCob = document.getElementById('btn-decompose');
    const cobCard = document.getElementById('rep-cob-card');
    const cobContent = document.getElementById('rep-cob-content');
    btnFindCob.addEventListener('click', showChangeOfBasis);

    closeModalBtn.addEventListener('click', () => charTableModal.classList.add('hidden'));
    charTableModal.addEventListener('click', (e) => {
        if (e.target === charTableModal) charTableModal.classList.add('hidden');
    });

    btnShowGroupCharTable.addEventListener('click', async () => {
        const group = repGroupSelect.value;
        if (!group) return;

        modalGroupName.textContent = (GROUP_PRESETS[group]?.label ?? group) + ' \u2014 Character Table';
        modalCharTableContainer.innerHTML = '<p>Computing character table...</p>';
        charTableModal.classList.remove('hidden');

        try {
            modalCharTableContainer.innerHTML = await getGroupCharTableHTML(group);
            if (window.MathJax) {
                MathJax.typesetPromise([modalCharTableContainer]);
            }
        } catch (e) {
            console.error(e);
            modalCharTableContainer.innerHTML = '<p class="status-error">Error generating character table.</p>';
        }
    });

    // Populate group dropdown sorted by group order
    const groupOrderMap = {};
    REPS.forEach(rep => { if (!(rep.gPreset in groupOrderMap)) groupOrderMap[rep.gPreset] = rep.gOrder; });

    const availableGroups = [];
    REPS.forEach(rep => { if (!availableGroups.includes(rep.gPreset)) availableGroups.push(rep.gPreset); });

    const sortedGroups = [...availableGroups].sort((a, b) => (groupOrderMap[a] || 0) - (groupOrderMap[b] || 0));

    sortedGroups.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = GROUP_PRESETS[key]?.label ?? key;
        repGroupSelect.appendChild(opt);
    });

    repGroupSelect.addEventListener('change', () => {
        const group = repGroupSelect.value;
        repSelect.innerHTML = '<option value="">-- Choose a representation --</option>';
        repDesc.style.display = 'none';
        repDetail.classList.add('hidden');
        repResults.classList.add('hidden');
        btnFindCob.classList.add('hidden');
        cobCard.classList.add('hidden');
        cobContent.innerHTML = '';
        currentRep = null;
        if (!group) {
            repSelectWrapper.style.display = 'none';
            btnShowGroupCharTable.classList.add('hidden');
            return;
        }

        btnShowGroupCharTable.classList.remove('hidden');

        REPS.forEach((rep, idx) => {
            if (rep.gPreset !== group) return;
            const opt = document.createElement('option');
            opt.value = idx;
            // Strip the "G — " group prefix so the dropdown shows only the rep name
            opt.textContent = rep.label.replace(/^.+\u2014\s*/, '');
            repSelect.appendChild(opt);
        });
        repSelectWrapper.style.display = '';
    });

    let currentRep = null;

    repSelect.addEventListener('change', async () => {
        const val = repSelect.value;
        if (val === '') {
            repDetail.classList.add('hidden');
            repDesc.style.display = 'none';
            repResults.classList.add('hidden');
            btnFindCob.classList.add('hidden');
            cobCard.classList.add('hidden');
            cobContent.innerHTML = '';
            currentRep = null;
            return;
        }

        currentRep = REPS[parseInt(val)];
        const { genMatrices, gPreset, gOrder } = currentRep;
        const pres = GROUP_PRESETS[gPreset];

        repDesc.style.display = 'block';
        repDesc.innerHTML = currentRep.description;
        if (currentRep.dim === 1) {
            repHeader.innerHTML = `\u03c1 : G \u2192 \u2102<sup style="font-size:0.75em; vertical-align:top; position:relative; top:-0.1em; left:0.1em;">\u00d7</sup>`;
        } else {
            repHeader.innerHTML = `\u03c1 : G \u2192 GL(${currentRep.dim}, \u2102)`;
        }
        const formattedRels = pres.rels.replace(/\^(-?\d+)/g, '<sup>$1</sup>');
        repPresEl.innerHTML = `Generators: \u003cstrong\u003e${pres.gens}\u003c/strong\u003e\u0026nbsp;\u0026nbsp;|\u0026nbsp;\u0026nbsp;Relations: \u003cstrong\u003e${formattedRels}\u003c/strong\u003e`;

        repGenMats.innerHTML = '';
        if (genMatrices) {
            const dsRaw = currentRep.displayScale;
            for (const [gen, mat] of Object.entries(genMatrices)) {
                const ds = !dsRaw ? 1 : (typeof dsRaw === 'object' ? (dsRaw[gen] || 1) : dsRaw);
                let latexMat;
                if (currentRep.latexGen && currentRep.latexGen[gen]) {
                    latexMat = currentRep.latexGen[gen];
                } else if (ds !== 1) {
                    latexMat = matToLatex(mat, ds); // legacy displayScale (e.g. A5)
                } else {
                    const { factorLatex, scaledM } = factorMatrix(mat);
                    latexMat = factorLatex ? `${factorLatex}\\,${matToLatex(scaledM)}` : matToLatex(mat);
                }
                const block = document.createElement('div');
                block.className = 'gen-matrix-block';
                block.innerHTML = `\\(\\rho(${gen}) = ${latexMat}\\)`;
                repGenMats.appendChild(block);
            }
        } else {
            repGenMats.innerHTML = '<p class="help-text" style="margin:0;">Defined via known multiplicities \u2014 no explicit 180\u00d7180 generator matrices.</p>';
        }

        repDetail.classList.remove('hidden');
        repResults.classList.remove('hidden');

        // genMap: lowercase → matrix, UPPERCASE → true finite-group inverse
        const genMap = {};
        if (genMatrices) {
            for (const [gen, mat] of Object.entries(genMatrices)) {
                genMap[gen] = mat;
                const upper = gen.toUpperCase();
                if (upper !== gen) genMap[upper] = matInverseFinite(mat);
            }
        }

        // ── Check relations ───────────────────────────────────────────────────
        const rels = parseRelations(pres.rels);
        repRelsEl.innerHTML = '';

        if (!genMatrices) {
            repRelsEl.innerHTML = '<p class="help-text" style="margin:0;">Relations satisfied by construction \u2014 defined via irrep multiplicities.</p>';
        } else {
            rels.forEach(rel => {
                const word = relToWord(rel);
                const M = evalWord(word, genMap);
                const isId = M ? matIsIdentity(M) : false;

                const fmt = rel.replace(/\^(-?\d+)/g, '^{$1}');
                const isEq = fmt.includes('=');
                let dispStr;
                if (isEq) {
                    const [l, r] = fmt.split('=').map(s => s.trim());
                    dispStr = `\\rho(${l}) = \\rho(${r})`;
                } else {
                    dispStr = `\\rho(${fmt}) = ${currentRep.dim === 1 ? '1' : 'I'}`;
                }

                const div = document.createElement('div');
                div.className = 'relation-eval';
                div.innerHTML = `<span class="eval-string">\\(${dispStr}\\)</span>
                                 <span class="eval-result ${isId ? 'eval-pass' : 'eval-fail'}">${isId ? '\u2714 Satisfied' : '\u2718 Failed'}</span>`;
                repRelsEl.appendChild(div);
            });
        }

        const { words, classes, size } = await getGroupData(gPreset);

        // evaluate trace
        let classData;
        if (currentRep.charFromIrrepMults) {
            // Compute χ_total(g) = Σ mults[i] × χ_i(g) using the Ih irrep matrices
            const ihIrreps = REPS.filter(r => r.gPreset === gPreset && !r.isReducible);
            const mults = currentRep.charFromIrrepMults;
            const ihGenMaps = ihIrreps.map(irrep => {
                const gm = {};
                for (const [gen, mat] of Object.entries(irrep.genMatrices)) {
                    gm[gen] = mat;
                    const upper = gen.toUpperCase();
                    if (upper !== gen) gm[upper] = matInverseFinite(mat);
                }
                return gm;
            });
            classData = classes.map(cls => {
                const word = words[cls[0]];
                let re = 0, im = 0;
                ihIrreps.forEach((_, i) => {
                    const tr = matTrace(evalWord(word, ihGenMaps[i]));
                    re += mults[i] * tr[0];
                    im += mults[i] * tr[1];
                });
                const tr = [re, im];
                return { chi: fmtC(tr), count: cls.length, typicalWord: word, matrix: null, absSq: cAbs2(tr) };
            });
        } else {
            classData = classes.map(cls => {
                const repIdx = cls[0];
                const word = words[repIdx];
                const matrix = evalWord(word, genMatrices);
                const tr = matTrace(matrix);

                let chiStr = fmtC(tr);
                if (currentRep.dim === 1 && currentRep.latexGen) {
                    // If it's a 1D rep with explicit latexGen (e.g., C_n e^{2πi...})
                    // Build the character symbolically from the word
                    if (!word) {
                        chiStr = '1';
                    } else {
                        let totalPow = 0;
                        let baseLatex = '';
                        for (const char of word) {
                            if (currentRep.latexGen[char]) {
                                baseLatex = currentRep.latexGen[char];
                                totalPow++;
                            }
                        }
                        if (baseLatex === '1') chiStr = '1';
                        else if (baseLatex === '-1') chiStr = (totalPow % 2 === 0) ? '1' : '-1';
                        else if (baseLatex === 'i') chiStr = ['1', 'i', '-1', '-i'][totalPow % 4];
                        else if (baseLatex === '-i') chiStr = ['1', '-i', '-1', 'i'][totalPow % 4];
                        else if (currentRep.cyclicK !== undefined) {
                            const k = currentRep.cyclicK;
                            const n = currentRep.subGOrder || currentRep.gOrder;
                            const power = (k * totalPow) % n;
                            if (power === 0) chiStr = '1';
                            else if (power * 2 === n) chiStr = '-1';
                            else if (power * 4 === n) chiStr = 'i';
                            else if (power * 4 === 3 * n) chiStr = '-i';
                            else chiStr = formatExp(power, n);
                        }
                    }
                }

                return {
                    chi: chiStr,
                    count: cls.length,
                    typicalWord: word,
                    matrix: matrix,
                    absSq: cAbs2(tr)
                };
            });
        }

        // ── Character table ───────────────────────────────────────────────────
        let tableHTML = `<table class="char-table"><thead><tr><th>Typical element</th><th># elements</th><th style="text-transform: none; letter-spacing: normal;">\\(\\chi(g)\\)</th></tr></thead><tbody>`;
        classData.forEach(({ chi, count, typicalWord }) => {
            const display = PERM_GENS[gPreset] ? wordToCycleNotation(typicalWord, PERM_GENS[gPreset]) : formatWord(typicalWord);
            tableHTML += `<tr><td>${display}</td><td>${count}</td><td>\\(${chi}\\)</td></tr>`;
        });
        tableHTML += '</tbody></table>';

        if (classData.some(d => d.chi === '\\omega' || d.chi.includes('\\omega'))) {
            tableHTML += `<p class="help-text" style="margin-top:0.5rem;">\u03c9 = e<sup>2\u03c0i/3</sup></p>`;
        }
        if (classData.some(d => d.chi.includes('\\varphi'))) {
            tableHTML += `<p class="help-text" style="margin-top:0.5rem;">\u03c6 = (1+\u221a5)/2 (golden ratio)</p>`;
        }
        repCharEl.innerHTML = tableHTML;

        // ── Analysis ──────────────────────────────────────────────────────────
        // ⟨χ,χ⟩_G = (1/|G|) \sum_{C} |C| * |χ(rep_C)|^2
        let sumAbsSq = 0;
        classData.forEach(d => { sumAbsSq += d.count * d.absSq; });
        const innerProd = Math.round((sumAbsSq / size) * 1000) / 1000;
        const isIrred = Math.abs(innerProd - 1) < 0.01;

        // Faithfulness: ker ρ = { g | ρ(g) = I }
        let kernelCount = 0;
        classData.forEach(d => {
            if (d.matrix !== null) {
                if (matIsIdentity(d.matrix)) kernelCount += d.count;
            } else {
                // charFromIrrepMults path: kernel = elements where χ(g) = dim
                if (Math.abs(d.absSq - currentRep.dim * currentRep.dim) < 0.5) kernelCount += d.count;
            }
        });
        const isFaithful = kernelCount === 1;

        repAnalysisEl.innerHTML = `
            <p>\\(|G| = ${size}\\), &ensp; \\(\\dim\\,\\rho = ${currentRep.dim}\\)</p>
            <p style="margin-top:0.75rem;">
                <strong>Irreducibility</strong> &mdash;
                \\(\\langle\\chi,\\chi\\rangle = \\dfrac{1}{|G|}\\displaystyle\\sum_{g\\in G}|\\chi(g)|^2 = ${innerProd}\\)
            </p>
            <p style="margin-top:0.25rem;"><span class="${isIrred ? 'eval-pass' : 'eval-fail'}">${isIrred
                ? '\u2714 Irreducible'
                : `\u2718 Reducible \u2014 decomposes into irreps whose squared multiplicities sum to ${innerProd}`
            }</span></p>
            <p style="margin-top:0.75rem;"><strong>Faithfulness</strong></p>
            <p><span class="${isFaithful ? 'eval-pass' : 'eval-fail'}">${isFaithful
                ? '\u2714 Faithful \u2014 ker \u03c1 = {e}'
                : `\u2718 Not faithful \u2014 |ker \u03c1| = ${kernelCount}`
            }</span></p>
        `;

        // Show COB button only for reducible reps; reset any previous output
        cobCard.classList.add('hidden');
        cobContent.innerHTML = '';
        btnFindCob.classList[currentRep.isReducible ? 'remove' : 'add']('hidden');

        repResults.classList.remove('hidden');
        if (window.MathJax) {
            MathJax.typesetPromise([repGenMats, repRelsEl, repCharEl, repAnalysisEl]).catch(e => console.log(e));
        }
    });
});
