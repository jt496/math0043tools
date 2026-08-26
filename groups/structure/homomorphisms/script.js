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
 * Homomorphisms Explorer Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // G presets: GROUP_PRESETS is defined globally in presentations/script.js
    const gSelect = document.getElementById('g-example-select');
    const gensInput = document.getElementById('generators-input');
    const relsInput = document.getElementById('relations-input');
    const hSelect = document.getElementById('h-select');
    const hInfo = document.getElementById('h-info');
    const mappingControls = document.getElementById('mapping-controls');
    const checkBtn = document.getElementById('check-hom-btn');
    const resultsSection = document.getElementById('results-section');

    let currentHGroup = null;

    gSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (GROUP_PRESETS[val]) {
            gensInput.value = GROUP_PRESETS[val].gens;
            relsInput.value = GROUP_PRESETS[val].rels;
            updateMappingUI();
        }
    });

    gensInput.addEventListener('input', updateMappingUI);

    // Theory Modal Logic
    const theoryBtn = document.getElementById('theory-btn');
    const theoryModal = document.getElementById('theory-modal');
    const closeTheoryBtn = document.getElementById('close-theory-btn');

    if (theoryBtn && theoryModal && closeTheoryBtn) {
        theoryBtn.addEventListener('click', () => {
            theoryModal.classList.remove('hidden');
        });

        closeTheoryBtn.addEventListener('click', () => {
            theoryModal.classList.add('hidden');
        });

        theoryModal.addEventListener('click', (e) => {
            if (e.target === theoryModal) {
                theoryModal.classList.add('hidden');
            }
        });
    }

    const theoryIsoBtn = document.getElementById('theory-iso-btn');
    const theoryIsoModal = document.getElementById('theory-iso-modal');
    const closeTheoryIsoBtn = document.getElementById('close-theory-iso-btn');

    if (theoryIsoBtn && theoryIsoModal && closeTheoryIsoBtn) {
        theoryIsoBtn.addEventListener('click', () => {
            theoryIsoModal.classList.remove('hidden');
        });

        closeTheoryIsoBtn.addEventListener('click', () => {
            theoryIsoModal.classList.add('hidden');
        });

        theoryIsoModal.addEventListener('click', (e) => {
            if (e.target === theoryIsoModal) {
                theoryIsoModal.classList.add('hidden');
            }
        });
    }

    // 2. Setup H Select
    if (typeof GROUP_CATALOG !== 'undefined') {
        GROUP_CATALOG.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerHTML = item.label; // Use innerHTML for subscripts
            hSelect.appendChild(opt);
        });
    }

    hSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === "") {
            currentHGroup = null;
            hInfo.innerHTML = "Please select a target group.";
            updateMappingUI();
            return;
        }

        const catalogItem = GROUP_CATALOG[val];
        currentHGroup = catalogItem.make();
        hInfo.innerHTML = `Selected ${currentHGroup.name} of order ${currentHGroup.order}.`;
        updateMappingUI();
    });

    // 3. Update Mapping UI
    function getGenerators() {
        return gensInput.value.split(',').map(s => s.trim().replace(/[^a-zA-Z]/g, '').slice(0, 1)).filter(s => s.length > 0);
    }

    function updateMappingUI() {
        resultsSection.classList.add('hidden');

        const gens = getGenerators();
        if (gens.length === 0 || !currentHGroup) {
            mappingControls.innerHTML = '<p class="help-text">Waiting for Domain and Target Groups to be defined...</p>';
            checkBtn.disabled = true;
            return;
        }

        // Helper to convert HTML <sup> tags to unicode superscripts for select options
        const htmlToUnicodeSuperscript = (htmlStr) => {
            const supMap = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
            return htmlStr.replace(/<sup>(\d+)<\/sup>/g, (match, digits) => {
                return digits.split('').map(d => supMap[d] || d).join('');
            }).replace(/<sub>(\d+)<\/sub>/g, (match, digits) => {
                const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
                return digits.split('').map(d => subMap[d] || d).join('');
            });
        };

        mappingControls.innerHTML = '';
        gens.forEach(g => {
            const row = document.createElement('div');
            row.className = 'mapping-row';

            const label = document.createElement('label');
            label.innerHTML = `\\(\\phi(\\text{${g}}) = \\)`;
            label.style.width = "80px";
            label.style.textAlign = "right";

            const select = document.createElement('select');
            select.dataset.gen = g;
            select.className = 'mapping-select';

            currentHGroup.elements.forEach((elName, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = htmlToUnicodeSuperscript(elName);
                select.appendChild(opt);
            });

            row.appendChild(label);
            row.appendChild(select);
            mappingControls.appendChild(row);
        });

        // Trigger MathJax typesetting for the new labels
        if (window.MathJax) {
            MathJax.typesetPromise([mappingControls]).catch((err) => console.log(err));
        }

        checkBtn.disabled = false;
    }

    // 4. Evaluate Mapping
    checkBtn.addEventListener('click', async () => {
        if (!currentHGroup) return;

        resultsSection.classList.remove('hidden');
        const statusBar = document.getElementById('hom-status-bar');
        const statusText = document.getElementById('status-text');
        const relsCheckList = document.getElementById('relations-check-list');
        const isoContent = document.getElementById('iso-check-content');
        const imageContent = document.getElementById('image-content');

        statusBar.className = 'status-bar pulsing';
        statusText.textContent = 'Evaluating mapping...';

        const gens = getGenerators();

        // Build mapping dictionary
        const mapping = {}; // char -> index in H
        document.querySelectorAll('.mapping-select').forEach(sel => {
            mapping[sel.dataset.gen] = parseInt(sel.value);
            // Also map uppercase to inverse
            const upper = sel.dataset.gen.toUpperCase();
            if (upper !== sel.dataset.gen) {
                mapping[upper] = currentHGroup.inverse[parseInt(sel.value)];
            }
        });

        const relations = parseRelations(relsInput.value);
        const parsedRels = relations.map(rel => relToWord(rel));

        // Evaluate each relation in H
        let allValid = true;
        relsCheckList.innerHTML = '';

        parsedRels.forEach((relWord, idx) => {
            let curr = 0; // Identity in H
            let isValidWord = true;

            for (let char of relWord) {
                const mappedVal = mapping[char];
                if (mappedVal === undefined) {
                    isValidWord = false;
                    break;
                }
                curr = currentHGroup.table[curr][mappedVal];
            }

            const div = document.createElement('div');
            div.className = 'relation-eval';

            const originalRel = relations[idx];
            const escapedRel = originalRel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const formattedRel = escapedRel.replace(/\^(-?\d+)/g, '^{$1}');

            const isEquation = formattedRel.includes('=');
            let displayHTML;
            if (isEquation) {
                const parts = formattedRel.split('=');
                displayHTML = `\\phi(${parts[0].trim()}) = \\phi(${parts[1].trim()})`;
            } else {
                displayHTML = `\\phi(${formattedRel}) =`;
            }

            if (!isValidWord) {
                div.innerHTML = `<span class="eval-string">\\( ${displayHTML} \\text{ ???} \\)</span> <span class="eval-result eval-fail">Undefined Generator</span>`;
                allValid = false;
            } else {
                const isId = (curr === 0);
                if (!isId) allValid = false;

                const valStr = isId ? 'e' : currentHGroup.elements[curr];
                const latexVal = valStr.replace(/<sup>(.*?)<\/sup>/g, '^{$1}')
                    .replace(/<sub>(.*?)<\/sub>/g, '_{$1}');

                // If it's an equation relation (e.g. A=B), we don't need to append "= e" or "= val" 
                // since the relation being satisfied literally means A*B^-1 = e. We just show satisfied.
                // However, if it fails, maybe we show what it evaluated to? For now, we'll just check if it's satisfied.
                if (isEquation) {
                    div.innerHTML = `<span class="eval-string">\\( ${displayHTML} \\)</span> <span class="eval-result ${isId ? 'eval-pass' : 'eval-fail'}">${isId ? '\u2714 Satisfied' : '\u2718 Failed'}</span>`;
                } else {
                    div.innerHTML = `<span class="eval-string">\\( ${displayHTML} ${latexVal} \\)</span> <span class="eval-result ${isId ? 'eval-pass' : 'eval-fail'}">${isId ? '\u2714 Satisfied' : '\u2718 Failed'}</span>`;
                }
            }
            relsCheckList.appendChild(div);
        });

        if (window.MathJax) {
            MathJax.typesetPromise([relsCheckList]).catch(err => console.log(err));
        }

        // Image Subgroup
        const mappedIndices = Object.values(mapping); // includes inverses, but generateSubgroup only needs generators
        const imageSubgroup = generateSubgroup(mappedIndices.filter(x => x !== undefined), currentHGroup.table);
        const imageSize = imageSubgroup.size;

        if (!allValid) {
            imageContent.innerHTML = `<p style="color: var(--error);">Not a well-defined homomorphism.</p>`;
        } else {
            imageContent.innerHTML = `<p>The image \\(\\phi(G)\\) is a subgroup of ${currentHGroup.name} with order <strong>${imageSize}</strong>.</p>
                                      <p style="margin-top: 0.5rem; color: var(--text-secondary);">Using Lagrange's Theorem, the order of the image must divide the order of ${currentHGroup.name} which is ${currentHGroup.order}.</p>`;
            if (window.MathJax) {
                MathJax.typesetPromise([imageContent]).catch(err => console.log(err));
            }
        }

        // Check Isomorphism
        isoContent.innerHTML = `<p>Calculating \(|G|\)...</p>`;

        // Wait a tick for UI update, then run Todd Coxeter
        await new Promise(r => setTimeout(r, 50));

        if (!allValid) {
            statusBar.className = 'status-bar status-error';
            statusText.textContent = '\u2718 Not a Homomorphism (Relations not satisfied)';
            isoContent.innerHTML = `<p style="color: var(--error);">Since the map is not a valid homomorphism, it cannot be an isomorphism.</p>`;
        } else {
            statusBar.className = 'status-bar status-success';
            statusText.textContent = '\u2714 Valid Homomorphism!';

            try {
                // Use CosetEnumerator from presentations/script.js
                // We assume it's loaded in the global scope
                if (typeof CosetEnumerator !== 'undefined') {
                    const solver = new CosetEnumerator(gens, parsedRels);
                    const result = await solver.solve(5000);

                    if (result === "Finite") {
                        const { size } = solver.compactTable();
                        const isSurjective = (imageSize === currentHGroup.order);
                        const isInjective = (size === imageSize);
                        const isIso = isSurjective && isInjective;

                        const hOrder = currentHGroup.order;
                        const hLatexName = currentHGroup.name.replace(/<sup>(.*?)<\/sup>/g, '^{$1}').replace(/<sub>(.*?)<\/sub>/g, '_{$1}');

                        // Get a nice name for G
                        let gName = "G";
                        if (gSelect.value !== "") {
                            const latexNames = {
                                "C3": "C_3", "C4": "C_4", "C6": "C_6", "C2xC2": "V_4",
                                "S3": "S_3", "D4": "D_4", "Q8": "Q_8", "D6": "D_6",
                                "A4": "A_4", "S4": "S_4", "F20": "F_{20}", "A5": "A_5", "S5": "S_5"
                            };
                            gName = latexNames[gSelect.value] || gSelect.value;
                        }

                        let summaryMsg = "";
                        if (size > hOrder) {
                            summaryMsg = `Since \\(|${gName}| > |${hLatexName}|\\) (${size} > ${hOrder}), this map <strong>cannot</strong> be an isomorphism as it cannot be injective (by the Pigeonhole Principle).`;
                        } else if (size < hOrder) {
                            summaryMsg = `Since \\(|${gName}| < |${hLatexName}|\\) (${size} < ${hOrder}), this map <strong>cannot</strong> be an isomorphism as it cannot be surjective.`;
                        } else if (size === hOrder && !isIso) {
                            summaryMsg = `Although \\(|${gName}| = |${hLatexName}| = ${size}\\), this map is not an isomorphism because it is not bijective.`;
                        } else {
                            summaryMsg = `We found \\(|${gName}| = |${hLatexName}| = ${size}\\).`;
                        }

                        let isoHTML = `<p>${summaryMsg}</p>
                                       <ul style="margin-top: 0.8rem; margin-left: 1.5rem; line-height: 1.6; color: var(--text-secondary);">
                                           <li>Surjective? ${isSurjective ? '<span class="eval-pass">\u2714 Yes</span> (Image order = Target order)' : '<span class="eval-fail">\u2718 No</span>' + (imageSize < hOrder ? ` (Image order ${imageSize} < ${hOrder})` : '')}</li>
                                           <li>Injective? ${isInjective ? '<span class="eval-pass">\u2714 Yes</span> (Domain order = Image order)' : '<span class="eval-fail">\u2718 No</span>' + (size > imageSize ? ` (Domain order ${size} > Image order ${imageSize})` : '')}</li>
                                       </ul>
                                       <p style="margin-top: 1rem; font-weight: bold; font-size: 1.1rem; color: ${isIso ? 'var(--success)' : 'var(--text-primary)'}">
                                           ${isIso ? '\u2714 This map IS an isomorphism!' : '\u2718 This map is NOT an isomorphism.'}
                                       </p>`;
                        isoContent.innerHTML = isoHTML;
                    } else {
                        // Possibly infinite
                        const hOrder = currentHGroup.order;
                        const hLatexName = currentHGroup.name.replace(/<sup>(.*?)<\/sup>/g, '^{$1}').replace(/<sub>(.*?)<\/sub>/g, '_{$1}');
                        
                        let infiniteReason = null;
                        if (typeof checkDefinitelyInfinite !== 'undefined') {
                            infiniteReason = checkDefinitelyInfinite(gens, parsedRels);
                        }

                        if (infiniteReason) {
                            isoContent.innerHTML = `
                                <div style="padding: 1rem; background: rgba(244, 63, 94, 0.1); border-left: 4px solid var(--error); border-radius: 4px; margin-bottom: 1rem;">
                                    <p style="color: var(--error); font-weight: 600; margin-bottom: 0.5rem;">Domain \\(G\\) is infinite</p>
                                    <p style="font-size: 0.95rem; line-height: 1.5;">${infiniteReason}</p>
                                </div>
                                <p>Since \\(G\\) is an <strong>infinite group</strong> and the target group \\(${hLatexName}\\) is <strong>finite</strong> (order ${hOrder}), there can be no bijection between them.</p>
                                <p style="margin-top: 1rem; font-weight: bold; font-size: 1.1rem; color: var(--error);">
                                    \u2718 This map is NOT an isomorphism.
                                </p>`;
                        } else {
                            isoContent.innerHTML = `
                                <p style="color: var(--text-secondary); margin-bottom: 1rem;">Could not determine a finite order for \\(G\\) (it may be infinite or too large for the current computational limit).</p>
                                <p>If \\(G\\) is indeed infinite or simply larger than \\(|${hLatexName}| = ${hOrder}\\), then any map to \\(${hLatexName}\\) is <strong>obviously not an isomorphism</strong> as it fails to be injective.</p>
                                <p style="margin-top: 1rem; font-weight: bold; font-size: 1.1rem; color: var(--text-primary);">
                                    \u2718 This map is likely NOT an isomorphism.
                                </p>`;
                        }
                    }
                } else {
                    isoContent.innerHTML = `<p style="color: var(--error);">Todd-Coxeter solver not found.</p>`;
                }
            } catch (e) {
                console.error(e);
                const safeMsg = e.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                isoContent.innerHTML = `<p style="color: var(--error);">Error calculating \\(|G|\\): ${safeMsg}</p>`;
            }
        }

        if (window.MathJax) {
            MathJax.typesetPromise([isoContent]).catch(err => console.log(err));
        }

    });
});

