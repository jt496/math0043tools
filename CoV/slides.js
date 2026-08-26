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

// Presentation state
let currentSlide = 1;
// Compute total slides from DOM so inserting/removing slides doesn't require edits
// Slide definitions with unique IDs for easy reordering
const slideOrder = [
    'title-slide', // 1: Title Slide
    'symmetry', // 2: Symmetry
    'calculus-of-variations', // 3: Calculus of Variations
    'arc-length-of-curves', // 4: Arc Length of Curves
    'the-brachistochrone-problem', // 5: The Brachistochrone Problem
    'the-race', // 6: The Race!
    'the-cycloid', // 7: The Cycloid
    'tautochrone-demonstration', // 8: Tautochrone Demonstration
    'soap-bubbles', // 9: Soap Bubbles
    'surfaces-in-calculus-of-variations', // 10: Surfaces in Calculus of Variations
    'didos-problem', // 11: Dido's Problem
    'applications', // 12: Applications
    'from-functions-to-functionals', // 13: From Functions to Functionals
    'functionals', // 14: Functionals
    'what-is-a-functional', // 15: What is a Functional?
    'examples-of-functionals', // 16: Examples of Functionals
    'the-standard-problem', // 17: The Standard Problem
    'the-euler-lagrange-equation', // 18: The Euler-Lagrange Equation
    'candidate-extremals', // 19: Candidate Extremals
    'the-idea-of-variations', // 20: The Idea of Variations
    'fundamental-lemma-of-cov', // 21: Fundamental Lemma of CoV
    'derivation-sketch', // 22: Derivation Sketch
    'special-case-first-integral', // 23: Special Case: First Integral
    'deriving-the-arc-length-functional', // 24: Deriving the Arc Length Functional
    'shortest-path-in-the-plane', // 25: Shortest Path in the Plane
    'deriving-path-length-on-a-cylinder', // 26: Deriving Path Length on a Cylinder
    'geodesics-on-a-cylinder', // 27: Geodesics on a Cylinder
    'deriving-path-length-on-a-sphere', // 28: Deriving Path Length on a Sphere
    'example-geodesic-on-a-sphere', // 29: Example: Geodesic on a Sphere
    'deriving-keplers-second-law', // 30: Deriving Kepler's Second Law
    'keplers-second-law', // 31: Kepler's Second Law
    'the-two-body-problem', // 32: The Two-Body Problem
    'the-three-body-problem', // 33: The Three-Body Problem
    'the-four-body-problem', // 34: The Four-Body Problem
    // 'the-beltrami-identity', // 35: The Beltrami Identity
    // 'beltrami-identity', // 36: Beltrami Identity
    // 'setting-up-the-problem', // 37: Setting Up the Problem
    // 'isoperimetric-problems', // 38: Isoperimetric Problems
    // 'lagrange-multipliers-for-functionals', // 39: Lagrange Multipliers for Functionals
    // 'what-weve-learned', // 40: What We've Learned
    // 'interactive-solver', // 41: Try the Interactive Solver
];

const totalSlides = slideOrder.length;

// Initialize progress display and slide input max dynamically
try {
    const prog = document.getElementById('progressText');
    if (prog) prog.textContent = `1 / ${totalSlides}`;
    const slideInputInit = document.getElementById('slideInput');
    if (slideInputInit) slideInputInit.max = totalSlides;
} catch (e) { }
let raceAnimation = null;
let racePaused = false;
let raceStartT = 0; // ms
let racePausedElapsed = 0; // seconds accumulated while paused
let raceMarkerIdx = null;
let raceMarkerTraces = null;
let raceTimesList = null;
let racePathTraces = null;
let racePrepared = false;
let raceFinishOrder = [];
let raceFinishedFlags = null;
let cycloidAnim = null;
let fragmentModeEnabled = false;
let blackoutEnabled = false;

function toggleBlackout() {
    blackoutEnabled = !blackoutEnabled;
    let overlay = document.getElementById('blackoutOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'blackoutOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'black';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
    }
    overlay.style.display = blackoutEnabled ? 'block' : 'none';
}

// Toggle fragment mode
function toggleFragmentMode() {
    fragmentModeEnabled = !fragmentModeEnabled;
    const btn = document.getElementById('fragmentToggle');
    if (btn) btn.classList.toggle('active', fragmentModeEnabled);

    if (!fragmentModeEnabled) {
        // Show all fragments on current slide
        showAllFragments(currentSlide);
        // Reinitialize any plots that appear on the current slide (element-detection)
        const slideEl = document.querySelector(`.slide[data-slide="${currentSlide}"]`);
        if (slideEl) {
            if (slideEl.querySelector('#dsPlotPlane') || slideEl.querySelector('[data-show-plot="dsPlotPlane"]')) {
                const container = document.getElementById('dsPlotPlaneContainer');
                if (container) container.style.opacity = '1';
                setupDsPlotPlane();
            }
            if (slideEl.querySelector('#dsPlotCylinder') || slideEl.querySelector('[data-show-plot="dsPlotCylinder"]')) {
                const container = document.getElementById('dsPlotCylinderContainer');
                if (container) container.style.opacity = '1';
                setupDsPlotCylinder();
            }
            if (slideEl.querySelector('#dsPlotSphere') || slideEl.querySelector('[data-show-plot="dsPlotSphere"]')) {
                const container = document.getElementById('dsPlotSphereContainer');
                if (container) container.style.opacity = '1';
                setupDsPlotSphere();
            }
        }
    }
    updateStepHint();
}

// Fragment navigation
// Fragment navigation
function getSlideFragments(slideNum) {
    let selector;
    if (typeof slideNum === 'number') {
        const id = slideOrder[slideNum - 1];
        selector = `[data-slide="${id}"]`;
    } else {
        selector = `[data-slide="${slideNum}"]`;
    }
    const slide = document.querySelector(selector);
    return slide ? Array.from(slide.querySelectorAll('.fragment')) : [];
}

function getVisibleFragmentCount(slideNum) {
    const fragments = getSlideFragments(slideNum);
    return fragments.filter(f => f.classList.contains('visible')).length;
}

function showNextFragment() {
    const fragments = getSlideFragments(currentSlide);
    const visibleCount = getVisibleFragmentCount(currentSlide);

    if (visibleCount < fragments.length) {
        fragments[visibleCount].classList.add('visible');
        updateStepHint();
        // Check if fragment contains a plot that needs initialization
        initFragmentContent(fragments[visibleCount]);
        return true; // Fragment was revealed
    }
    return false; // No more fragments
}

function initFragmentContent(fragment) {
    // Check for plot containers in the fragment and initialize them
    if (fragment.querySelector('#variationPlot')) {
        setTimeout(setupVariationDemo, 50);
    }
    if (fragment.querySelector('#shortestPathPlot')) {
        setTimeout(setupShortestPathPlot, 50);
    }
    if (fragment.querySelector('#brachistochroneSetupPlot')) {
        setTimeout(setupBrachistochroneSetup, 50);
    }
    if (fragment.querySelector('#cycloidAnimPlot')) {
        setTimeout(setupCycloidPlot, 50);
    }

    if (fragment.id === 'flcvPlotColumn') {
        if (window.gotoFLCVStep) window.gotoFLCVStep(0);
    }
    // Reveal Dido arc when the explanatory fragment is shown
    if (fragment.id === 'didoArcTrigger' || fragment.querySelector('#didoArcTrigger')) {
        didoArcVisible = true;
        setTimeout(updateDido, 50);
    }
    const flcvStep = fragment.getAttribute('data-flcv-step');
    if (flcvStep && window.gotoFLCVStep) {
        window.gotoFLCVStep(parseInt(flcvStep));
    }

    const showPlotId = fragment.getAttribute('data-show-plot');
    if (showPlotId) {
        switchStackPlot(showPlotId);
        // Also ensure it's initialized
        setTimeout(() => {
            if (showPlotId === 'dsPlotPlane') setupDsPlotPlane();
            else if (showPlotId === 'dsPlotCylinder') setupDsPlotCylinder();
            else if (showPlotId === 'dsPlotSphere') setupDsPlotSphere();
            else if (showPlotId === 'cylPolarsPlot') setupCylPolarsPlot();
            else if (showPlotId === 'spherePolarsPlot') setupSpherePolarsPlot();
        }, 50);
    }
}

function togglePlotStack(stackId) {
    const stack = document.getElementById(stackId);
    if (!stack) return;

    // Determine IDs based on stack
    let coordsId, derivationId;
    if (stackId === 'slide22Stack') {
        coordsId = 'cylPolarsPlot';
        derivationId = 'dsPlotCylinder';
    } else if (stackId === 'slide24Stack') {
        coordsId = 'spherePolarsPlot';
        derivationId = 'dsPlotSphere';
    } else return;

    const coordsVisible = document.getElementById(coordsId + 'Container').classList.contains('visible');
    const targetId = coordsVisible ? derivationId : coordsId;

    switchStackPlot(targetId);
}

function switchStackPlot(showPlotId) {
    const container = document.getElementById(showPlotId + 'Container');
    if (!container) return;

    // Find the stack this container belongs to
    const stack = container.closest('.plot-stack');
    if (!stack) {
        // Not in a stack, just make visible
        container.classList.add('visible');
        container.style.opacity = '1';
        return;
    }

    // Hide all other items in this stack
    stack.querySelectorAll('.plot-stack-item').forEach(item => {
        item.classList.remove('visible');
        item.style.opacity = ''; // Reset inline opacity
    });

    // Show target container
    container.classList.add('visible');
    container.style.opacity = '1';

    // Handle the single toggle button text
    const toggleBtn = stack.querySelector('.mini-toggle-btn');
    if (toggleBtn) {
        const isDerivation = showPlotId.startsWith('dsPlot');
        toggleBtn.textContent = isDerivation ? 'Show Coordinates' : 'Show Derivation';
    }

    // Reset and set active state for OLD multi-button style (if any still exist)
    stack.querySelectorAll('.multi-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === 'btn-' + showPlotId) {
            btn.classList.add('active');
        }
    });

    // Initialize plot if needed
    if (showPlotId === 'dsPlotPlane') setupDsPlotPlane();
    else if (showPlotId === 'dsPlotCylinder') setupDsPlotCylinder();
    else if (showPlotId === 'dsPlotSphere') setupDsPlotSphere();
    else if (showPlotId === 'cylPolarsPlot') setupCylPolarsPlot();
    else if (showPlotId === 'spherePolarsPlot') setupSpherePolarsPlot();
}

function hidePrevFragment() {
    const fragments = getSlideFragments(currentSlide);
    const visibleCount = getVisibleFragmentCount(currentSlide);

    if (visibleCount > 0) {
        const hiddenFrag = fragments[visibleCount - 1];
        hiddenFrag.classList.remove('visible');
        updateStepHint();

        // Revert FLCV step logic
        if (hiddenFrag.hasAttribute('data-flcv-step')) {
            const stepNum = parseInt(hiddenFrag.getAttribute('data-flcv-step'));
            if (window.gotoFLCVStep) window.gotoFLCVStep(stepNum - 1);
        } else if (hiddenFrag.id === 'flcvPlotColumn') {
            // Just hidden the plot column itself
        }

        return true; // Fragment was hidden
    }
    return false; // No fragments to hide
}

function showAllFragments(slideNum) {
    const fragments = getSlideFragments(slideNum);
    fragments.forEach(f => {
        f.classList.add('visible');
        // Handle data-show-plot fragments
        const showPlotId = f.getAttribute('data-show-plot');
        if (showPlotId) {
            switchStackPlot(showPlotId);
        }
    });
}

function hideAllFragments(slideNum) {
    const fragments = getSlideFragments(slideNum);
    fragments.forEach(f => f.classList.remove('visible'));
}

function updateStepHint() {
    const fragments = getSlideFragments(currentSlide);
    const visibleCount = getVisibleFragmentCount(currentSlide);
    const stepHint = document.getElementById('stepHint');

    // Update bottom step hint (small floating hint)
    if (fragmentModeEnabled && fragments.length > 0 && visibleCount < fragments.length) {
        stepHint.classList.add('show');
        stepHint.innerHTML = `Step ${visibleCount + 1}/${fragments.length} — Press <kbd>→</kbd> for next`;
    } else {
        stepHint.classList.remove('show');
    }

    // Update header step progress next to the slide number when Steps mode is on
    const activeHeader = document.querySelector('.slide.active .slide-header');
    if (activeHeader) {
        const slideNumberEl = activeHeader.querySelector('.slide-number');
        let progEl = activeHeader.querySelector('.header-step-progress');

        if (fragmentModeEnabled && fragments.length > 0) {
            const stepIdx = Math.min(visibleCount + 1, fragments.length);
            const txt = `Step ${stepIdx}/${fragments.length}`;
            if (!progEl) {
                progEl = document.createElement('span');
                progEl.className = 'header-step-progress';
                progEl.textContent = txt;
                if (slideNumberEl && slideNumberEl.parentNode) {
                    slideNumberEl.insertAdjacentElement('afterend', progEl);
                } else if (activeHeader) {
                    activeHeader.appendChild(progEl);
                }
            } else {
                progEl.textContent = txt;
            }
        } else {
            if (progEl && progEl.parentNode) progEl.parentNode.removeChild(progEl);
        }
    }
}

// Navigation
function showSlide(idOrIndex) {
    // Determine target ID and index
    let n; // 1-based index
    let id;

    if (typeof idOrIndex === 'string') {
        // Check if it's a numeric string first (legacy or user input)
        if (/^\d+$/.test(idOrIndex)) {
            n = parseInt(idOrIndex, 10);
            if (n < 1) n = 1;
            if (n > totalSlides) n = totalSlides;
            id = slideOrder[n - 1];
        } else {
            // Assume it's an ID
            let idx = slideOrder.indexOf(idOrIndex);
            if (idx === -1) {
                // Fallback: check if we can partial match or just go to 1
                console.warn('Slide ID not found:', idOrIndex);
                idx = 0;
            }
            n = idx + 1;
            id = slideOrder[idx];
        }
    } else {
        // Numeric index
        n = idOrIndex;
        if (n < 1) n = 1;
        if (n > totalSlides) n = totalSlides;
        id = slideOrder[n - 1];
    }

    document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
    // Try matching by ID first, then fallback to index (legacy compatibility during migration)
    let el = document.querySelector(`[data-slide="${id}"]`);
    if (!el) {
        // If HTML hasn't been updated yet, try legacy numeric data-slide
        el = document.querySelector(`[data-slide="${n}"]`);
    }

    if (el) el.classList.add('active');
    currentSlide = n; // Keep numeric index for progress bars etc.
    // But we can store ID as the canonical current slide if we want global access
    // window.currentSlideId = id;

    // Update numeric badge inside the slide-number element (top-left)
    try {
        // remove any existing badges (cleanup)
        document.querySelectorAll('.slide .slide-number .current-slide-badge').forEach(b => b.remove());
        const slideNumberEl = document.querySelector('.slide.active .slide-number');
        if (slideNumberEl) {
            const badge = document.createElement('span');
            badge.className = 'current-slide-badge';
            badge.textContent = String(n);
            slideNumberEl.insertAdjacentElement('afterbegin', badge);
        }
    } catch (e) { }

    // Update progress UI
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = `${(n / totalSlides) * 100}%`;
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = `${n} / ${totalSlides}`;

    const slideInput = document.getElementById('slideInput');
    if (slideInput) { slideInput.value = n; slideInput.max = totalSlides; }

    // Update nav buttons
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.disabled = (n === 1);
    if (nextBtn) nextBtn.disabled = (n === totalSlides && (!fragmentModeEnabled || getVisibleFragmentCount(n) === getSlideFragments(n).length));

    updateStepHint();

    // Initialize any slide-specific content
    initSlideContent(n);
    // Persist current slide ID so reloads restore position regardless of order
    try { localStorage.setItem('currentSlide', id); } catch (e) { }
}

function jumpToSlide(idOrIndex) {
    // showSlide handles validation for both IDs and indices
    showSlide(idOrIndex);
    if (!fragmentModeEnabled) {
        // currentSlide is updated by showSlide to be the numeric index
        showAllFragments(currentSlide);
    }
}

function nextSlide() {
    if (fragmentModeEnabled) {
        // Try to reveal next fragment first
        if (!showNextFragment()) {
            // No more fragments, go to next slide
            if (currentSlide < totalSlides) {
                hideAllFragments(currentSlide);
                showSlide(currentSlide + 1);
            }
        }
    } else {
        // Fragment mode off - just go to next slide
        if (currentSlide < totalSlides) {
            showSlide(currentSlide + 1);
            showAllFragments(currentSlide);
        }
    }
    // Update next button state (nav bar may be commented out, so guard)
    const nextBtnEl = document.getElementById('nextBtn');
    if (nextBtnEl) nextBtnEl.disabled = (currentSlide === totalSlides && (!fragmentModeEnabled || getVisibleFragmentCount(currentSlide) === getSlideFragments(currentSlide).length));
}

function prevSlide() {
    if (fragmentModeEnabled) {
        // Try to hide previous fragment first
        if (!hidePrevFragment()) {
            // No fragments to hide, go to previous slide
            if (currentSlide > 1) {
                showSlide(currentSlide - 1);
                // Show all fragments on previous slide
                showAllFragments(currentSlide);
                updateStepHint();
            }
        }
    } else {
        // Fragment mode off - just go to previous slide
        if (currentSlide > 1) {
            showSlide(currentSlide - 1);
            showAllFragments(currentSlide);
        }
    }
}

function prepareForPrint() {
    // Disable fragment mode so all content shows
    if (fragmentModeEnabled) {
        toggleFragmentMode();
    }

    // Reveal every slide listed in slideOrder. Slides commented out of
    // slideOrder are deliberately excluded, so they stay out of the PDF.
    slideOrder.forEach((id, i) => {
        const slide = document.querySelector(`.slide[data-slide="${id}"]`);
        if (!slide) return;
        slide.style.opacity = '1';
        slide.classList.add('active');
        showAllFragments(i + 1);
        initSlideContent(i + 1);
    });

    // Give some time for plots/mathjax to render before opening dialog
    setTimeout(() => {
        window.print();
        // Restore current slide visibility after printing dialog is closed
        document.querySelectorAll('.slide').forEach((slide) => {
            slide.style.display = '';
            slide.style.opacity = '';
            slide.classList.remove('active');
        });
        showSlide(currentSlide);
    }, 3000);
}

function resetAllSlides() {
    // Reset fragment state for all slides
    for (let i = 1; i <= totalSlides; i++) {
        hideAllFragments(i);
    }
    // Return to the first slide
    jumpToSlide(1);
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    // Ignore shortcuts while typing in form fields or contenteditable elements
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextSlide();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevSlide();
    } else if (e.key === 'b' || e.key === '.') {
        e.preventDefault();
        toggleBlackout();
    } else if (typeof e.key === 'string' && e.key.toLowerCase() === 's') {
        // Toggle 'Steps' (fragment) mode
        e.preventDefault();
        toggleFragmentMode();
    } else if (typeof e.key === 'string' && e.key.toLowerCase() === 'p') {
        // Print all slides
        e.preventDefault();
        if (confirm('Prepare all slides for printing? (This will reveal all fragments and may take a moment to initialize all plots)')) {
            prepareForPrint();
        }
    } else if (typeof e.key === 'string' && e.key.toLowerCase() === 'r') {
        // Reset all slides
        e.preventDefault();
        resetAllSlides();
    } else if (typeof e.key === 'string' && e.key.toLowerCase() === 'g') {
        // Prompt for slide number and jump
        e.preventDefault();
        const val = window.prompt('Go to slide (1 - ' + totalSlides + '):', String(currentSlide));
        if (val !== null) {
            const n = parseInt(val);
            if (!isNaN(n)) jumpToSlide(n);
        }
    }
});

// Initialize slide content
function initSlideContent(n) {
    // Map numeric index to ID if necessary
    let selector;
    if (typeof n === 'number') {
        const id = slideOrder[n - 1];
        selector = `[data-slide="${id}"]`;
    } else {
        selector = `[data-slide="${n}"]`;
    }

    // Delay interactive content init to allow fragments to appear
    setTimeout(() => {
        // If this slide has opted into scroll-top behaviour, ensure it's scrolled to top
        const slideElTest = document.querySelector(`.slide${selector}`);
        if (slideElTest && slideElTest.classList.contains('scrolltop')) {
            const sc = slideElTest.querySelector('.slide-content');
            if (sc) sc.scrollTop = 0;
        }

        // Use element-detection rather than hard-coded slide numbers so
        // inserted/renumbered slides don't break initialization.
        const slideEl = document.querySelector(`.slide${selector}`);
        if (!slideEl) return;

        if (slideEl.querySelector('#arcLengthPlot')) setTimeout(setupArcLengthDemo, 50);
        if (slideEl.querySelector('#surfacePlot')) setTimeout(setupSurfaceDemo, 50);
        if (slideEl.querySelector('#soapPlot')) setTimeout(setupSoapBubblePlot, 50);
        if (slideEl.querySelector('#variationPlot')) setTimeout(setupVariationDemo, 50);
        if (slideEl.querySelector('#flcvPlot')) setTimeout(setupFLCVDemo, 50);
        if (slideEl.querySelector('#shortestPathPlot')) setTimeout(setupShortestPathPlot, 50);
        if (slideEl.querySelector('#dsPlotPlane') || slideEl.querySelector('[data-show-plot="dsPlotPlane"]')) {
            setTimeout(setupDsPlotPlane, 50);
        }
        if (slideEl.querySelector('#dsPlotCylinder') || slideEl.querySelector('[data-show-plot="dsPlotCylinder"]')) {
            setTimeout(setupDsPlotCylinder, 50);
        }
        if (slideEl.querySelector('#cylPolarsPlot') || slideEl.querySelector('[data-show-plot="cylPolarsPlot"]')) {
            setTimeout(setupCylPolarsPlot, 50);
        }
        if (slideEl.querySelector('#helixPlot')) setTimeout(setupHelixPlot, 50);
        if (slideEl.querySelector('#dsPlotSphere') || slideEl.querySelector('[data-show-plot="dsPlotSphere"]')) {
            setTimeout(setupDsPlotSphere, 50);
        }
        if (slideEl.querySelector('#spherePolarsPlot') || slideEl.querySelector('[data-show-plot="spherePolarsPlot"]')) {
            setTimeout(setupSpherePolarsPlot, 50);
        }
        if (slideEl.querySelector('#spherePlot')) setTimeout(setupSpherePlot, 50);
        if (slideEl.querySelector('#keplerPlot')) setTimeout(setupKeplerPlot, 50);
        if (slideEl.querySelector('#keplerFirstPlot')) setTimeout(setupKeplerFirstPlot, 50);
        if (slideEl.querySelector('#brachistochroneSetupPlot')) setTimeout(setupBrachistochroneSetup, 50);
        // Dido plot: ensure arc visibility state is respected when slide becomes active
        if (slideEl.querySelector('#didoPlot')) {
            const trigger = slideEl.querySelector('#didoArcTrigger');
            didoArcVisible = !!(trigger && trigger.classList.contains('visible'));
            // Redraw to reflect current arc visibility
            setTimeout(updateDido, 80);
        }
        if (slideEl.querySelector('#racePlot')) setTimeout(setupRacePlot, 50);
        if (slideEl.querySelector('#tautPlot')) setTimeout(setupTautochronePlot, 50);
        if (slideEl.querySelector('#twoBodyPlot')) setTimeout(setupTwoBodyPlot, 50);
        if (slideEl.querySelector('#threeBodyPlot')) setTimeout(setupThreeBodyPlot, 50);
        if (slideEl.querySelector('#fourBodyPlot')) setTimeout(setupFourBodyPlot, 50);
        if (slideEl.querySelector('#cycloidAnimPlot')) setTimeout(setupCycloidPlot, 50);
        if (slideEl.querySelector('#racePlot')) setTimeout(setupRaceControls, 60);
        if (slideEl.querySelector('#tautPlot')) setTimeout(setupTautochroneControls, 70);
        if (slideEl.querySelector('#threeBodySpeed')) setupThreeBodySpeedControl();
        if (slideEl.querySelector('#fourBodySpeed')) setupFourBodySpeedControl();
    }, 100);
}

// Three-Body Speed Control Listener
function setupThreeBodySpeedControl() {
    const slider = document.getElementById('threeBodySpeed');
    const display = document.getElementById('threeBodySpeedValue');
    if (!slider || !display) return;
    slider.addEventListener('input', () => {
        display.textContent = parseFloat(slider.value).toFixed(1) + "x";
    });
}

// Setup race controls (gravity slider)
function setupRaceControls() {
    const slider = document.getElementById('gravitySlider');
    const display = document.getElementById('gravityValue');
    if (!slider || !display) return;
    display.textContent = parseFloat(slider.value).toFixed(2);
    slider.addEventListener('input', () => {
        display.textContent = parseFloat(slider.value).toFixed(2);
    });
}

// Four-Body Speed Control Listener
function setupFourBodySpeedControl() {
    const slider = document.getElementById('fourBodySpeed');
    const display = document.getElementById('fourBodySpeedValue');
    if (!slider || !display) return;
    slider.addEventListener('input', () => {
        display.textContent = parseFloat(slider.value).toFixed(1) + "x";
    });
}

// Two-Body Problem Variables
let twoBodyAnimRunning = false;
let twoBodyAnimId = null;
let twoBodyScene, twoBodyCamera, twoBodyRenderer;
let twoBodyM1Mesh, twoBodyM2Mesh, twoBodyCommMesh;
let twoBodyM1Trail, twoBodyM2Trail;
let t2_theta_rot = 0, t2_phi_rot = Math.PI / 2 - 0.2, t2_dist = 40;
let t2_isDragging = false;
let t2_prevMouse = { x: 0, y: 0 };
let currentTwoBodyPhase = 0;
const T2_MAX_TRAIL = 200;
let currentSimSettings = {
    subSteps: 20,
    visualScale: 15.0,
    totalDt: 0.05,
    softening: 0.001
};
const MAX_TRAIL_POINTS = 200;

// --- N-Body Unified Physics Engine ---
class NBodySimulation {
    constructor(containerId, presetDropdownId, speedSliderId, descId) {
        this.containerId = containerId;
        this.presetDropdownId = presetDropdownId;
        this.speedSliderId = speedSliderId;
        this.descId = descId;

        this.animRunning = false;
        this.animId = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.bodies = [];
        this.simSettings = { subSteps: 20, visualScale: 15.0, totalDt: 0.05, softening: 0.001 };

        this.camDist = 80;
        this.camPhi = Math.PI / 2 - 0.2;
        this.camTheta = 0;
        this.isDragging = false;
        this.prevMouse = { x: 0, y: 0 };
        this.maxTrailPoints = 200;

        this.onResize = this.onResize.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.animate = this.animate.bind(this);
        this.resizeObserver = null;
    }

    setup(presetInitializer) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        while (container.firstChild) container.removeChild(container.firstChild);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        const width = container.clientWidth;
        const height = container.clientHeight || 400;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(container);

        container.addEventListener('wheel', this.onWheel);
        container.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);

        this.scene.add(new THREE.AmbientLight(0x404040));
        const dl = new THREE.DirectionalLight(0xffffff, 1);
        dl.position.set(20, 20, 20);
        this.scene.add(dl);

        presetInitializer(this);

        this.bodies.forEach(b => {
            b.trailPts = [];
            const radius = b.radius || 1.0;
            const geometry = new THREE.SphereGeometry(radius, 24, 24);
            const material = new THREE.MeshPhongMaterial({ color: b.color });
            b.mesh = new THREE.Mesh(geometry, material);
            b.mesh.position.copy(b.x.clone().multiplyScalar(this.simSettings.visualScale));
            this.scene.add(b.mesh);

            const trailGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(this.maxTrailPoints * 3);
            trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const trailMat = new THREE.LineBasicMaterial({ color: b.color, opacity: 0.5, transparent: true });
            b.trailMesh = new THREE.Line(trailGeo, trailMat);
            this.scene.add(b.trailMesh);
        });

        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const container = document.getElementById(this.containerId);
        if (!container || !this.renderer) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    onWheel(event) {
        event.preventDefault();
        this.camDist += event.deltaY * 0.02;
        this.camDist = Math.max(10, Math.min(500, this.camDist));
        this.updateCamera();
    }

    onMouseDown(e) {
        this.isDragging = true;
        this.prevMouse = { x: e.clientX, y: e.clientY };
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        const deltaX = e.clientX - this.prevMouse.x;
        const deltaY = e.clientY - this.prevMouse.y;
        this.camTheta -= deltaX * 0.01;
        this.camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.camPhi + deltaY * 0.01));
        this.prevMouse = { x: e.clientX, y: e.clientY };
        this.updateCamera();
    }

    onMouseUp() {
        this.isDragging = false;
    }

    updateCamera() {
        if (!this.camera) return;
        this.camera.position.x = this.camDist * Math.sin(this.camPhi) * Math.sin(this.camTheta);
        this.camera.position.y = this.camDist * Math.cos(this.camPhi);
        this.camera.position.z = this.camDist * Math.sin(this.camPhi) * Math.cos(this.camTheta);
        this.camera.lookAt(0, 0, 0);
    }

    toggleAnim() {
        if (this.animRunning) {
            cancelAnimationFrame(this.animId);
            this.animRunning = false;
        } else {
            this.animRunning = true;
            this.animate();
        }
    }

    resetAnim(presetInitializer) {
        cancelAnimationFrame(this.animId);
        this.animRunning = false;
        this.setup(presetInitializer);
    }

    getAcc(positions) {
        const accs = positions.map(() => new THREE.Vector3(0, 0, 0));
        const G = 1.0;
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = 0; j < this.bodies.length; j++) {
                if (i === j) continue;
                const r = new THREE.Vector3().subVectors(positions[j], positions[i]);
                const distSq = r.lengthSq() + this.simSettings.softening;
                const dist = Math.sqrt(distSq);
                const f = G * this.bodies[j].m / (distSq * dist);
                accs[i].add(r.multiplyScalar(f));
            }
        }
        return accs;
    }

    animate() {
        if (!this.animRunning) return;

        const speedFactor = parseFloat(document.getElementById(this.speedSliderId)?.value || 1.0);
        const { subSteps, totalDt, visualScale } = this.simSettings;
        const dt = (totalDt * speedFactor) / subSteps;

        for (let step = 0; step < subSteps; step++) {
            const accs = this.getAcc(this.bodies.map(b => b.x));
            this.bodies.forEach((b, i) => b.v.add(accs[i].multiplyScalar(0.5 * dt)));
            this.bodies.forEach(b => b.x.add(b.v.clone().multiplyScalar(dt)));
            const nextAccs = this.getAcc(this.bodies.map(b => b.x));
            this.bodies.forEach((b, i) => b.v.add(nextAccs[i].multiplyScalar(0.5 * dt)));
        }

        this.bodies.forEach(b => {
            b.mesh.position.copy(b.x.clone().multiplyScalar(visualScale));
            const visPos = b.mesh.position;
            b.trailPts.push(visPos.x, visPos.y, visPos.z);
            if (b.trailPts.length > this.maxTrailPoints * 3) {
                b.trailPts.splice(0, 3);
            }
            const positions = b.trailMesh.geometry.attributes.position.array;
            for (let k = 0; k < b.trailPts.length; k++) {
                positions[k] = b.trailPts[k];
            }
            b.trailMesh.geometry.attributes.position.needsUpdate = true;
            b.trailMesh.geometry.setDrawRange(0, b.trailPts.length / 3);
        });

        this.renderer.render(this.scene, this.camera);
        this.animId = requestAnimationFrame(this.animate);
    }
}

// Global Instances mapped to original function calls
let threeBodySim = null;
let fourBodySim = null;

function renderThreeBodyPreset(sim) {
    const preset = document.getElementById(sim.presetDropdownId)?.value || 'pythagorean';
    const descEl = document.getElementById(sim.descId);
    sim.bodies = [];
    sim.simSettings = { subSteps: 50, visualScale: 18.0, totalDt: 0.02, softening: 0.001 };

    switch (preset) {
        case 'figure8':
            if (descEl) descEl.innerHTML = 'Stable periodic orbit where all three bodies follow the same path. (<a href="https://arxiv.org/pdf/math/0011268" target="_blank">Chenciner & Montgomery, 2000</a>)';
            sim.simSettings = { subSteps: 20, visualScale: 15.0, totalDt: 0.05, softening: 0.001 };
            sim.camDist = 80; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            const x8 = 0.9700436; const y8 = -0.24308753; const vx8 = 0.466203685; const vy8 = 0.43236573;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(x8, y8, 0), v: new THREE.Vector3(vx8, vy8, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(-x8, -y8, 0), v: new THREE.Vector3(vx8, vy8, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(0, 0, 0), v: new THREE.Vector3(-2 * vx8, -2 * vy8, 0), color: 0xfbbf24 }
            ];
            break;
        case 'chaotic':
            if (descEl) descEl.innerHTML = "Standard chaotic interaction with sensitivity to initial conditions.";
            sim.simSettings = { subSteps: 20, visualScale: 15.0, totalDt: 0.05, softening: 0.001 };
            sim.camDist = 80; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0.8, 0.5), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, -0.8, 0.5), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0.8, 0, -1), color: 0xfbbf24 }
            ];
            break;
        case 'lagrange':
            if (descEl) descEl.innerHTML = "Hierarchical stability: A small mass orbits a planet, which orbits a sun.";
            sim.simSettings = { subSteps: 15, visualScale: 1.0, totalDt: 0.08, softening: 0.05 };
            sim.camDist = 60; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 5000, x: new THREE.Vector3(0, 0, 0), v: new THREE.Vector3(0, 0, 0), color: 0xfbbf24, radius: 3.5 },
                { m: 10, x: new THREE.Vector3(28, 0, 0), v: new THREE.Vector3(0, 13.36, 0), color: 0x00d9ff, radius: 1.2 },
                { m: 0.1, x: new THREE.Vector3(29.2, 0, 0), v: new THREE.Vector3(0, 16.25, 0), color: 0xffffff, radius: 0.3 }
            ];
            break;
        case 'lunar_escape':
            if (descEl) descEl.innerHTML = "Unstable hierarchy: The Moon starts outside the Hill sphere and is captured by the Sun.";
            sim.simSettings = { subSteps: 15, visualScale: 1.0, totalDt: 0.08, softening: 0.05 };
            sim.camDist = 60; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 5000, x: new THREE.Vector3(0, 0, 0), v: new THREE.Vector3(0, 0, 0), color: 0xfbbf24, radius: 3.5 },
                { m: 20, x: new THREE.Vector3(28, 0, 0), v: new THREE.Vector3(0, 13.36, 0), color: 0x00d9ff, radius: 1.2 },
                { m: 0.1, x: new THREE.Vector3(31, 0, 0), v: new THREE.Vector3(0, 15.18, 0), color: 0xffffff, radius: 0.3 }
            ];
            break;
        case 'pythagorean':
            if (descEl) descEl.innerHTML = 'Pythagorean 3-Body Problem: A classic example of non-periodic, chaotic motion. (<a href="https://zenodo.org/records/1424886" target="_blank">Burrau, 1913</a>)';
            sim.simSettings = { subSteps: 200, visualScale: 5.0, totalDt: 0.02, softening: 0.01 };
            sim.camDist = 60; sim.camPhi = Math.PI / 2; sim.camTheta = 0;
            sim.bodies = [
                { m: 3, x: new THREE.Vector3(1, 3, 0), v: new THREE.Vector3(0, 0, 0), color: 0x00d9ff, radius: 1.1 },
                { m: 4, x: new THREE.Vector3(-2, -1, 0), v: new THREE.Vector3(0, 0, 0), color: 0xff6b6b, radius: 1.2 },
                { m: 5, x: new THREE.Vector3(1, -1, 0), v: new THREE.Vector3(0, 0, 0), color: 0xfbbf24, radius: 1.3 }
            ];
            break;
        case 'criss_cross':
            if (descEl) descEl.innerHTML = 'Criss-cross Orbit: A stable planar 3-body choreography where two masses orbit each other while a third rotates retrograde. (<a href="https://sites.santafe.edu/~moore/pubs/braids-prl.pdf" target="_blank">Moore, 1993</a>)';
            sim.simSettings = { subSteps: 500, visualScale: 20.0, totalDt: 0.02, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(1.07590, 0, 0), v: new THREE.Vector3(0, 0.19509, 0), color: 0x00d9ff, radius: 0.8 },
                { m: 1, x: new THREE.Vector3(-0.07095, 0, 0), v: new THREE.Vector3(0, -1.23187, 0), color: 0xff6b6b, radius: 0.8 },
                { m: 1, x: new THREE.Vector3(-1.00496, 0, 0), v: new THREE.Vector3(0, 1.03678, 0), color: 0xfbbf24, radius: 0.8 }
            ];
            break;
    }
}

function renderFourBodyPreset(sim) {
    const preset = document.getElementById(sim.presetDropdownId)?.value || 'star_pentagon';
    const descEl = document.getElementById(sim.descId);
    sim.bodies = [];

    switch (preset) {
        case 'star_pentagon':
            if (descEl) descEl.innerHTML = "Stable 4-body choreography on a star-pentagon path <a href='https://doi.org/10.1016/j.physd.2015.05.015' target='_blank' rel='noopener'>(Ouyang & Xie, 2015)</a>.";
            sim.simSettings = { subSteps: 100, visualScale: 12.0, totalDt: 0.04, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(1.0598738926, 1.7699901770, 0), v: new THREE.Vector3(-0.5539138487, -0.3989507985, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, -0.8095113579, 0), v: new THREE.Vector3(1.0936551555, 0, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(-1.0598738926, 1.7699901770, 0), v: new THREE.Vector3(-0.5539155821, 0.3989537968, 0), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -2.7304689961, 0), v: new THREE.Vector3(0.0141742753, 0, 0), color: 0xffffff }
            ];
            break;
        case 'cubic_symmetry':
            if (descEl) descEl.innerHTML = "4-Body Cubic Symmetry: A highly symmetric 3D periodic orbit on four intersecting loops. <a href='https://arxiv.org/pdf/math/0511219' target='_blank' rel='noopener'> (Moore and Nauenberg, 2008)</a>";
            sim.simSettings = { subSteps: 1000, visualScale: 25.0, totalDt: 0.01, softening: 0 };
            sim.camDist = 80; sim.camPhi = 0.5; sim.camTheta = 0.5;
            const c_ry = -0.69548480391211, c_rz = 0.69548480391211;
            const c_vx = 0.8754648833912, c_vy = -0.31950345719912, c_vz = -0.31950345719912;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(0, c_ry, c_rz), v: new THREE.Vector3(c_vx, c_vy, c_vz), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, c_ry, -c_rz), v: new THREE.Vector3(-c_vx, c_vy, -c_vz), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(0, -c_ry, c_rz), v: new THREE.Vector3(-c_vx, -c_vy, c_vz), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -c_ry, -c_rz), v: new THREE.Vector3(c_vx, -c_vy, -c_vz), color: 0xffffff }
            ];
            break;
        case 'theta_3pi_7':
            if (descEl) descEl.innerHTML = "Periodic 4-body choreography (θ = 3π/7) <a href='https://doi.org/10.1016/j.physd.2015.05.015' target='_blank' rel='noopener'>(Ouyang & Xie, 2015)</a>.";
            sim.simSettings = { subSteps: 100, visualScale: 10.0, totalDt: 0.04, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(0.9421633223, 2.189470662, 0), v: new THREE.Vector3(-0.4908748479, -0.474846875, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, -1.300537268, 0), v: new THREE.Vector3(1.039561987, 0, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(-0.9421633223, 2.189470662, 0), v: new THREE.Vector3(-0.4908732773, 0.4748477727, 0), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -3.078404055, 0), v: new THREE.Vector3(-0.05781386229, 0, 0), color: 0xffffff }
            ];
            break;
        case 'theta_4pi_9':
            if (descEl) descEl.innerHTML = "Periodic 4-body choreography (θ = 4π/9) <a href='https://doi.org/10.1016/j.physd.2015.05.015' target='_blank' rel='noopener'>(Ouyang & Xie, 2015)</a>.";
            sim.simSettings = { subSteps: 100, visualScale: 9.0, totalDt: 0.04, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(0.886183635, 2.574192004, 0), v: new THREE.Vector3(-0.4491532002, -0.5077584354, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, -1.721056291, 0), v: new THREE.Vector3(1.002413363, 0, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(-0.886183635, 2.574192004, 0), v: new THREE.Vector3(-0.4491265528, 0.5077539042, 0), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -3.427327717, 0), v: new THREE.Vector3(-0.1041336098, 0, 0), color: 0xffffff }
            ];
            break;
        case 'theta_5pi_12':
            if (descEl) descEl.innerHTML = "Periodic 4-body choreography (θ = 5π/12) <a href='https://doi.org/10.1016/j.physd.2015.05.015' target='_blank' rel='noopener'>(Ouyang & Xie, 2015)</a>.";
            sim.simSettings = { subSteps: 100, visualScale: 10.0, totalDt: 0.04, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(0.9885667998, 1.984831768, 0), v: new THREE.Vector3(-0.5187341985, -0.4460463326, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, -1.067317853, 0), v: new THREE.Vector3(1.064058961, 0, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(-0.9885667998, 1.984831768, 0), v: new THREE.Vector3(-0.5187107584, 0.4460354291, 0), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -2.902345684, 0), v: new THREE.Vector3(-0.02661400412, 0, 0), color: 0xffffff }
            ];
            break;
        case 'theta_9pi_22':
            if (descEl) descEl.innerHTML = "Periodic 4-body choreography (θ = 9π/22) <a href='https://doi.org/10.1016/j.physd.2015.05.015' target='_blank' rel='noopener'>(Ouyang & Xie, 2015)</a>.";
            sim.simSettings = { subSteps: 100, visualScale: 10.0, totalDt: 0.04, softening: 0 };
            sim.camDist = 70; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(1.020078100, 1.878808307, 0), v: new THREE.Vector3(-0.5352327448, -0.4256795762, 0), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(0, -0.9422097516, 0), v: new THREE.Vector3(1.078223783, 0, 0), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(-1.02007810, 1.878808307, 0), v: new THREE.Vector3(-0.5352124256, 0.4256692972, 0), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -2.815406862, 0), v: new THREE.Vector3(-0.007778613051, 0, 0), color: 0xffffff }
            ];
            break;
        case 'hip_hop':
            if (descEl) descEl.innerHTML = "4-Body Hip-Hop Orbit: A stable periodic choreography with swapped vertical positions. <a href='https://link.springer.com/article/10.1023/A:1008381001328' target='_blank' rel='noopener'> (Chenciner & Venturelli, 2000)</a>";
            sim.simSettings = { subSteps: 1000, visualScale: 15.0, totalDt: 0.01, softening: 0 };
            sim.camDist = 80; sim.camPhi = Math.PI / 2 - 0.2; sim.camTheta = 0;
            const vy_hh = 0.612267; const vz_hh = 0.168140;
            sim.bodies = [
                { m: 1, x: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, vy_hh, vz_hh), color: 0x00d9ff },
                { m: 1, x: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, -vy_hh, vz_hh), color: 0xff6b6b },
                { m: 1, x: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(-vy_hh, 0, -vz_hh), color: 0xfbbf24 },
                { m: 1, x: new THREE.Vector3(0, -1, 0), v: new THREE.Vector3(vy_hh, 0, -vz_hh), color: 0xffffff }
            ];
            break;
    }

    sim.bodies.forEach(b => { if (!b.radius) b.radius = 0.8; });
}

function setupThreeBodyPlot() {
    if (!threeBodySim) {
        threeBodySim = new NBodySimulation('threeBodyPlot', 'threeBodyPreset', 'threeBodySpeed', 'threeBodyDesc');
    }
    threeBodySim.setup(renderThreeBodyPreset);
}
function toggleThreeBodyAnim() { if (threeBodySim) threeBodySim.toggleAnim(); }
function resetThreeBodyAnim() { if (threeBodySim) threeBodySim.resetAnim(renderThreeBodyPreset); }

function setupFourBodyPlot() {
    if (!fourBodySim) {
        fourBodySim = new NBodySimulation('fourBodyPlot', 'fourBodyPreset', 'fourBodySpeed', 'fourBodyDesc');
    }
    fourBodySim.setup(renderFourBodyPreset);
}
function toggleFourBodyAnim() { if (fourBodySim) fourBodySim.toggleAnim(); }
function resetFourBodyAnim() { if (fourBodySim) fourBodySim.resetAnim(renderFourBodyPreset); }


function setupTwoBodyPlot() {
    const container = document.getElementById('twoBodyPlot');
    if (!container) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    twoBodyScene = new THREE.Scene();
    twoBodyScene.background = new THREE.Color(0x0a0a1a);

    const width = container.clientWidth;
    const height = container.clientHeight || 400;
    twoBodyCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

    twoBodyRenderer = new THREE.WebGLRenderer({ antialias: true });
    twoBodyRenderer.setSize(width, height);
    container.appendChild(twoBodyRenderer.domElement);

    new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        twoBodyRenderer.setSize(w, h);
        twoBodyCamera.aspect = w / h;
        twoBodyCamera.updateProjectionMatrix();
    }).observe(container);

    container.addEventListener('wheel', (event) => {
        event.preventDefault();
        t2_dist += event.deltaY * 0.02;
        t2_dist = Math.max(10, Math.min(200, t2_dist));
        updateTwoBodyCamera();
    });

    container.addEventListener('mousedown', (e) => {
        t2_isDragging = true;
        t2_prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
        if (!t2_isDragging) return;
        const deltaX = e.clientX - t2_prevMouse.x;
        const deltaY = e.clientY - t2_prevMouse.y;
        t2_theta_rot -= deltaX * 0.01;
        t2_phi_rot = Math.max(0.1, Math.min(Math.PI - 0.1, t2_phi_rot + deltaY * 0.01));
        t2_prevMouse = { x: e.clientX, y: e.clientY };
        updateTwoBodyCamera();
    });

    window.addEventListener('mouseup', () => { t2_isDragging = false; });

    function updateTwoBodyCamera() {
        if (!twoBodyCamera) return;
        twoBodyCamera.position.x = t2_dist * Math.sin(t2_phi_rot) * Math.sin(t2_theta_rot);
        twoBodyCamera.position.y = t2_dist * Math.cos(t2_phi_rot);
        twoBodyCamera.position.z = t2_dist * Math.sin(t2_phi_rot) * Math.cos(t2_theta_rot);
        twoBodyCamera.lookAt(0, 0, 0);
    }

    const amb = new THREE.AmbientLight(0x404040);
    twoBodyScene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(10, 10, 10);
    twoBodyScene.add(dir);

    // Objects
    const m1Geom = new THREE.SphereGeometry(1, 32, 32);
    const m1Mat = new THREE.MeshPhongMaterial({ color: 0x00d9ff });
    twoBodyM1Mesh = new THREE.Mesh(m1Geom, m1Mat);
    twoBodyScene.add(twoBodyM1Mesh);

    const m2Geom = new THREE.SphereGeometry(1, 32, 32);
    const m2Mat = new THREE.MeshPhongMaterial({ color: 0xff6b6b });
    twoBodyM2Mesh = new THREE.Mesh(m2Geom, m2Mat);
    twoBodyScene.add(twoBodyM2Mesh);

    const comGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const comMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    twoBodyCommMesh = new THREE.Mesh(comGeom, comMat);
    twoBodyScene.add(twoBodyCommMesh);

    // Trails
    const trailMat1 = new THREE.LineBasicMaterial({ color: 0x00d9ff, opacity: 0.4, transparent: true });
    twoBodyM1Trail = new THREE.Line(new THREE.BufferGeometry(), trailMat1);
    twoBodyScene.add(twoBodyM1Trail);

    const trailMat2 = new THREE.LineBasicMaterial({ color: 0xff6b6b, opacity: 0.4, transparent: true });
    twoBodyM2Trail = new THREE.Line(new THREE.BufferGeometry(), trailMat2);
    twoBodyScene.add(twoBodyM2Trail);

    // Slider linkage
    const m1S = document.getElementById('m1Slider');
    const m2S = document.getElementById('m2Slider');
    const m1V = document.getElementById('m1Val');
    const m2V = document.getElementById('m2Val');

    const onUpdate = () => {
        if (m1V) m1V.textContent = parseFloat(m1S.value).toFixed(1);
        if (m2V) m2V.textContent = parseFloat(m2S.value).toFixed(1);
        updateTwoBodyObjects();
        if (!twoBodyAnimRunning) renderTwoBody();
    };
    if (m1S) m1S.oninput = onUpdate;
    if (m2S) m2S.oninput = onUpdate;

    currentTwoBodyPhase = 0;
    updateTwoBodyObjects();
    updateTwoBodyCamera();
    renderTwoBody();
}

function updateTwoBodyObjects() {
    const m1 = parseFloat(document.getElementById('m1Slider')?.value || 2);
    const m2 = parseFloat(document.getElementById('m2Slider')?.value || 1);
    twoBodyM1Mesh.scale.setScalar(m1 * 0.5 + 0.5);
    twoBodyM2Mesh.scale.setScalar(m2 * 0.5 + 0.5);

    const M = m1 + m2;
    const a = 10;
    const e = 0.5;
    const p = a * (1 - e * e);

    // Orbits
    const pts1 = [], pts2 = [];
    for (let t = 0; t <= 2 * Math.PI + 0.1; t += 0.1) {
        const r = p / (1 + e * Math.cos(t));
        const rx = r * Math.cos(t);
        const ry = r * Math.sin(t);
        pts1.push(new THREE.Vector3((m2 / M) * rx, (m2 / M) * ry, 0));
        pts2.push(new THREE.Vector3(-(m1 / M) * rx, -(m1 / M) * ry, 0));
    }
    twoBodyM1Trail.geometry.setFromPoints(pts1);
    twoBodyM2Trail.geometry.setFromPoints(pts2);

    // Current pos
    const r = p / (1 + e * Math.cos(currentTwoBodyPhase));
    const rx = r * Math.cos(currentTwoBodyPhase);
    const ry = r * Math.sin(currentTwoBodyPhase);
    twoBodyM1Mesh.position.set((m2 / M) * rx, (m2 / M) * ry, 0);
    twoBodyM2Mesh.position.set(-(m1 / M) * rx, -(m1 / M) * ry, 0);
}

function renderTwoBody() {
    if (twoBodyRenderer && twoBodyScene && twoBodyCamera) {
        twoBodyRenderer.render(twoBodyScene, twoBodyCamera);
    }
}

function toggleTwoBodyAnim() {
    if (twoBodyAnimRunning) {
        cancelAnimationFrame(twoBodyAnimId);
        twoBodyAnimRunning = false;
    } else {
        twoBodyAnimRunning = true;
        const animate = () => {
            if (!twoBodyAnimRunning) return;
            currentTwoBodyPhase += 0.03;
            updateTwoBodyObjects();
            renderTwoBody();
            twoBodyAnimId = requestAnimationFrame(animate);
        };
        animate();
    }
}

function resetTwoBodyAnim() {
    cancelAnimationFrame(twoBodyAnimId);
    twoBodyAnimRunning = false;
    currentTwoBodyPhase = 0;
    updateTwoBodyObjects();
    renderTwoBody();
}

// Arc Length Demo (Slide 7)
function setupArcLengthDemo() {
    const plot = document.getElementById('arcLengthPlot');
    if (!plot || plot.data) return;

    const curves = {
        line: x => x,
        parabola: x => x * x,
        cubic: x => x * x * x,
        sine: x => Math.sin(Math.PI * x / 2),
        exponential: x => (Math.exp(x) - 1) / (Math.exp(1) - 1)
    };

    function plotCurve(name) {
        const func = curves[name];
        const x = [], y = [];
        for (let xi = 0; xi <= 1; xi += 0.001) {
            x.push(xi);
            y.push(func(xi));
        }

        // Calculate arc length
        let arcLength = 0;
        for (let i = 1; i < x.length; i++) {
            const dx = x[i] - x[i - 1];
            const dy = y[i] - y[i - 1];
            arcLength += Math.sqrt(dx * dx + dy * dy);
        }

        Plotly.newPlot('arcLengthPlot', [{
            x: x, y: y,
            mode: 'lines',
            line: { color: '#00d9ff', width: 3 }
        }, {
            x: [0, 1], y: [0, 1],
            mode: 'markers',
            marker: { color: '#ff6b6b', size: 12 }
        }], {
            paper_bgcolor: '#1a1a2e',
            plot_bgcolor: '#1a1a2e',
            font: { color: '#eee' },
            xaxis: { gridcolor: '#2a3a5a', range: [-0.1, 1.1] },
            yaxis: { gridcolor: '#2a3a5a', range: [-0.1, 1.1], scaleanchor: 'x' },
            margin: { t: 20, r: 20, b: 40, l: 40 },
            showlegend: false
        }, { responsive: true });

        document.getElementById('arcLengthValue').textContent = arcLength.toFixed(3);
    }

    document.querySelectorAll('#curveSelector .control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#curveSelector .control-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            plotCurve(btn.dataset.curve);
        });
    });

    plotCurve('line');
}

// Surface of Revolution Demo (Slide 8)
function setupSurfaceDemo() {
    const plot = document.getElementById('surfacePlot');
    if (!plot || plot.data) return;

    const parametrizations = {
        gabriel: `$$\\mathbf{r}(u,v) = \\left( u, \\frac{1}{u}\\cos v, \\frac{1}{u}\\sin v \\right)$$`,
        newton: `$$\\mathbf{r}(z,\\theta) = \\left( r(z)\\cos\\theta, r(z)\\sin\\theta, h-z \\right), \\quad r(z) = R\\left[\\frac{z+a}{L+a}\\right]^{3/4}$$`,
        torus: `$$\\mathbf{r}(u,v) = \\left( (R+r\\cos v)\\cos u, (R+r\\cos v)\\sin u, r\\sin v \\right)$$`,
        catenoid: `$$\\mathbf{r}(z,\\theta) = \\left( z, a\\cosh(z/a)\\cos\\theta, a\\cosh(z/a)\\sin\\theta \\right)$$`,
        helicoid: `$$\\mathbf{r}(u,v) = \\left( v\\cos u, v\\sin u, au \\right)$$`,
        scherk: `$$z = \\ln\\left( \\frac{\\cos y}{\\cos x} \\right)$$`,
        costa: `$$x + iy = \\frac{1}{2}(-\\zeta(z) + \\pi z), \\quad w = \\frac{1}{4}\\sqrt{2\\pi}\\ln|P(z)-e_1|$$`,
        enneper: `$$\\mathbf{r}(u,v) = \\left( u-\\frac{u^3}{3}+uv^2, v-\\frac{v^3}{3}+vu^2, u^2-v^2 \\right)$$`
    };

    function updateParametrizationText(name) {
        const el = document.getElementById('surfaceParametrization');
        if (!el) return;
        el.style.opacity = 0;
        setTimeout(() => {
            el.innerHTML = parametrizations[name] || '';
            el.style.opacity = 1;
            if (window.MathJax) MathJax.typesetPromise([el]);
        }, 150);
    }

    function plotCurve(name) {
        updateParametrizationText(name);
        // Create surface data arrays
        const xGrid = [], yGrid = [], zGrid = [];

        if (name === 'catenoid') {
            // r(z) = a cosh(z/a)
            const a = 0.5;
            const zmin = -1.0, zmax = 1.0;
            const nz = 200, ntheta = 80;
            const dz = (zmax - zmin) / nz;
            const theta = [];
            for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);

            // surface grid for catenoid (area computation removed)

            for (let ti = 0; ti < theta.length; ti++) {
                const cosT = Math.cos(theta[ti]);
                const sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let i = 0; i <= nz; i++) {
                    const z = zmin + i * dz;
                    const r = a * Math.cosh(z / a);
                    rowX.push(z);
                    rowY.push(r * cosT);
                    rowZ.push(r * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'gabriel') {
            // Gabriel's Horn: y = 1/x, x in [1, Xmax]
            const xmin = 1.0, xmax = 30.0;
            const nx = 400, ntheta = 80;
            const dx = (xmax - xmin) / nx;
            const theta = [];
            for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);

            const xs = [];
            const rs = [];
            for (let i = 0; i <= nx; i++) {
                const xi = xmin + i * dx;
                const ri = 1 / xi;
                xs.push(xi);
                rs.push(ri);
                // area accumulation removed
            }

            for (let ti = 0; ti < theta.length; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j < xs.length; j++) {
                    rowX.push(xs[j]);
                    rowY.push(rs[j] * cosT);
                    rowZ.push(rs[j] * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'pseudosphere') {
            // Revolve tractrix: x = t - tanh t, r = sech t
            const tmax = 3.0, nt = 300, ntheta = 80;
            const dt = tmax / nt;
            const theta = [];
            for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);

            const xs = [], rs = [];
            for (let i = 0; i <= nt; i++) {
                const t = i * dt;
                const xi = t - Math.tanh(t);
                const ri = 1 / Math.cosh(t);
                xs.push(xi);
                rs.push(ri);
            }

            // normalize xs to center around 0 for display
            const xmid = (xs[0] + xs[xs.length - 1]) / 2;
            for (let i = 0; i < xs.length; i++) xs[i] = xs[i] - xmid;

            // approximate area removed; only build surface grid

            for (let ti = 0; ti < theta.length; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j < xs.length; j++) {
                    rowX.push(xs[j]);
                    rowY.push(rs[j] * cosT);
                    rowZ.push(rs[j] * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'newton') {
            // Newton solid: use the same 3/4-power profile as in newton.py
            // y = R * (x / L)^(3/4) rotated around the central axis. We'll orient
            // the axis upward (z) and reuse the same parametric law.
            const L = 10.0, R = 5.0, a = 1.0; // match newton.py parameters (with offset a)
            const nz = 220, ntheta = 80; // resolution
            const h = L; // height corresponds to L
            const dz = h / nz;
            const zs = [], rs = [];
            for (let i = 0; i <= nz; i++) {
                const zi = i * dz; // 0..L
                // same 3/4 power-law used in newton.py
                // Use the same 3/4-power law from newton.py with offset `a`:
                // ri = R * ((z + a) / (L + a))^(3/4)
                const ri = Math.max(1e-6, R * Math.pow((zi + a) / (L + a), 0.75));
                zs.push(zi); rs.push(ri);
            }
            // approximate surface area removed; build grid only
            // build rotational grid: x = r*cos, y = r*sin, z = z
            const theta = [];
            for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);
            for (let ti = 0; ti < theta.length; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j < zs.length; j++) {
                    rowX.push(rs[j] * cosT);
                    rowY.push(rs[j] * sinT);
                    // Flip z so the nose (small radius) points upward
                    rowZ.push(h - zs[j]);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'torus') {
            // Torus: major radius R, minor radius r
            const R = 0.8, r = 0.3;
            const nu = 80, nv = 40;
            for (let iu = 0; iu <= nu; iu++) {
                const u = 2 * Math.PI * iu / nu;
                const rowX = [], rowY = [], rowZ = [];
                for (let iv = 0; iv <= nv; iv++) {
                    const v = 2 * Math.PI * iv / nv;
                    const X = (R + r * Math.cos(v)) * Math.cos(u);
                    const Y = (R + r * Math.cos(v)) * Math.sin(u);
                    const Z = r * Math.sin(v);
                    rowX.push(X); rowY.push(Y); rowZ.push(Z);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }
            // analytic area omitted; only build torus grid

        } else if (name === 'helicoid') {
            // Helicoid: (v cos u, v sin u, a u)
            const a = 0.18;
            const umin = -4 * Math.PI, umax = 4 * Math.PI;
            const vmin = -1.2, vmax = 1.2;
            const nu = 160, nv = 80;
            const du = (umax - umin) / nu, dv = (vmax - vmin) / nv;
            for (let iu = 0; iu <= nu; iu++) {
                const u = umin + iu * du;
                const rowX = [], rowY = [], rowZ = [];
                for (let iv = 0; iv <= nv; iv++) {
                    const v = vmin + iv * dv;
                    const X = v * Math.cos(u);
                    const Y = v * Math.sin(u);
                    const Z = a * u;
                    rowX.push(X); rowY.push(Y); rowZ.push(Z);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'scherk') {
            // Scherk's minimal surface (one form): z = ln(cos(y)/cos(x)) for small domain
            const xmin = -1.2, xmax = 1.2, ymin = -1.2, ymax = 1.2;
            const nx = 120, ny = 120;
            const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny;
            for (let i = 0; i <= nx; i++) {
                const xi = xmin + i * dx;
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j <= ny; j++) {
                    const yj = ymin + j * dy;
                    const val = Math.log(Math.cos(yj) / Math.cos(xi));
                    rowX.push(xi); rowY.push(yj); rowZ.push(val);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'enneper') {
            // Enneper surface parametric form
            const umin = -1.6, umax = 1.6, vmin = -1.6, vmax = 1.6;
            const nu = 140, nv = 140;
            const du = (umax - umin) / nu, dv = (vmax - vmin) / nv;
            for (let iu = 0; iu <= nu; iu++) {
                const u = umin + iu * du;
                const rowX = [], rowY = [], rowZ = [];
                for (let iv = 0; iv <= nv; iv++) {
                    const v = vmin + iv * dv;
                    const x = u - (Math.pow(u, 3) / 3) + u * v * v;
                    const y = v - (Math.pow(v, 3) / 3) + v * u * u;
                    const z = u * u - v * v;
                    rowX.push(x); rowY.push(y); rowZ.push(z);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

        } else if (name === 'costa') {
            // Costa Surface explicit parameterization
            // Uses Weierstrass zeta and P functions on square lattice {1, i}
            // Parametrization from MathWorld:
            // x = 0.5 * Re( -zeta(z) + pi*u )
            // y = 0.5 * Re( -i*zeta(z) + pi*v )
            // z = 0.25 * sqrt(2*pi) * ln( |P(z) - e1| )

            // helper for complex algebra
            const add = (a, b) => ({ r: a.r + b.r, i: a.i + b.i });
            const sub = (a, b) => ({ r: a.r - b.r, i: a.i - b.i });
            const mul = (a, b) => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r });
            const div = (a, b) => {
                const d = b.r * b.r + b.i * b.i;
                if (d < 1e-14) return { r: 0, i: 0 };
                return { r: (a.r * b.r + a.i * b.i) / d, i: (a.i * b.r - a.r * b.i) / d };
            };

            // Weierstrass functions summation
            // Lattice L = Z[i] (periods 1, i)
            function wp_zeta(z) {
                // Check for pole close to lattice point
                const roundedR = Math.round(z.r);
                const roundedI = Math.round(z.i);
                const dr = z.r - roundedR;
                const di = z.i - roundedI;
                if (dr * dr + di * di < 1e-6) {
                    return { P: { r: 1e8, i: 0 }, Z: { r: 1e8, i: 0 } };
                }

                let P = { r: 0, i: 0 };
                let Z = { r: 0, i: 0 };

                // 1/z^2 term for P, 1/z for Z
                const z2 = mul(z, z);
                P = div({ r: 1, i: 0 }, z2);
                Z = div({ r: 1, i: 0 }, z);

                const N = 3; // sum range
                for (let n = -N; n <= N; n++) {
                    for (let m = -N; m <= N; m++) {
                        if (n === 0 && m === 0) continue;
                        const w = { r: m, i: n };
                        const zmw = sub(z, w);

                        // terms for P: 1/(z-w)^2 - 1/w^2
                        const zmw2 = mul(zmw, zmw);
                        const w2 = mul(w, w);
                        const tP = sub(div({ r: 1, i: 0 }, zmw2), div({ r: 1, i: 0 }, w2));
                        P = add(P, tP);

                        // terms for Z: 1/(z-w) + 1/w + z/w^2
                        const invZmw = div({ r: 1, i: 0 }, zmw);
                        const invW = div({ r: 1, i: 0 }, w);
                        // z/w^2
                        const term3 = div(z, w2);
                        let tZ = add(invZmw, invW);
                        tZ = add(tZ, term3);
                        Z = add(Z, tZ);
                    }
                }
                return { P, Z };
            }

            // Precompute e1 = P(0.5)
            // For square lattice, e1 is real.
            const resHalf = wp_zeta({ r: 0.5, i: 0 });
            const e1 = resHalf.P.r;

            // Generate grid
            // Avoid 0, 0.5, 0.5+0.5i and boundary issues by choosing typical domains
            // or just a uniform grid that doesn't hit poles exactly.
            // The unit square [0,1]x[0,1] gives the full topology.
            const steps = 70;
            const umin = 0.01, umax = 0.99;
            const vmin = 0.01, vmax = 0.99;

            const factorZ = 0.25 * Math.sqrt(2 * Math.PI);

            for (let i = 0; i <= steps; i++) {
                const u = umin + (umax - umin) * i / steps;
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j <= steps; j++) {
                    const v = vmin + (vmax - vmin) * j / steps;
                    const zIn = { r: u, i: v };

                    const res = wp_zeta(zIn);
                    const valZeta = res.Z;
                    const valP = res.P;

                    // x = 0.5 * Re( -zeta + pi*u )
                    const x = 0.5 * (-valZeta.r + Math.PI * u);

                    // y = 0.5 * Re( -i*zeta + pi*v )
                    // -i(Zr + iZi) = Zi - iZr
                    const y = 0.5 * (valZeta.i + Math.PI * v);

                    // z = C * ln |P - e1|
                    const diffP = sub(valP, { r: e1, i: 0 });
                    const modP = Math.sqrt(diffP.r * diffP.r + diffP.i * diffP.i);
                    const z = factorZ * Math.log(modP + 1e-10); // clamp min

                    // clamp large values for better plotting
                    const clamp = 4;
                    rowX.push(Math.max(-clamp, Math.min(clamp, x)));
                    rowY.push(Math.max(-clamp, Math.min(clamp, y)));
                    rowZ.push(Math.max(-clamp, Math.min(clamp, z)));
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }
        } else {
            // fallback: simple parabola profile
            const xmin = -1, xmax = 1, nx = 200, ntheta = 60;
            const dx = (xmax - xmin) / nx;
            const xs = [], rs = [];
            for (let i = 0; i <= nx; i++) {
                const xi = xmin + i * dx;
                xs.push(xi); rs.push(1 + (1 - xi * xi));
            }
            // fallback area computation removed; only build surface grid
            const theta = [];
            for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);
            for (let ti = 0; ti < theta.length; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let j = 0; j < xs.length; j++) {
                    rowX.push(xs[j]); rowY.push(rs[j] * cosT); rowZ.push(rs[j] * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }
        }

        const surfaceTrace = {
            type: 'surface', x: xGrid, y: yGrid, z: zGrid,
            colorscale: 'Viridis', showscale: false, opacity: 0.95
        };

        const layout = {
            paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', font: { color: '#eee' },
            margin: { t: 0, r: 0, b: 0, l: 0 },
            scene: { camera: { eye: { x: 1.5, y: -1.5, z: 1.0 } }, aspectmode: 'auto' }
        };

        Plotly.newPlot('surfacePlot', [surfaceTrace], layout, { responsive: true });

        // Update area display (some surfaces are approximated)
        // surface area display removed
    }

    // Keep track of currently displayed surface name
    let currentSurface = null;
    // animation state for morphs
    let morphAnimId = null;

    // Morph animation removed: always switch directly to the chosen surface.

    document.querySelectorAll('#surfCurveSelector .control-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#surfCurveSelector .control-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const newName = btn.dataset.curve;
            if (morphAnimId) { cancelAnimationFrame(morphAnimId); morphAnimId = null; }
            plotCurve(newName);
            currentSurface = newName;
        });
    });

    // Choose initial curve: show Gabriel's Horn when slide 10 is active
    const initialCurve = (typeof currentSlide !== 'undefined' && currentSlide === 10) ? 'gabriel' : 'catenoid';
    document.querySelectorAll('#surfCurveSelector .control-btn').forEach(b => b.classList.remove('active'));
    const initBtn = document.querySelector(`#surfCurveSelector .control-btn[data-curve="${initialCurve}"]`);
    if (initBtn) initBtn.classList.add('active');
    currentSurface = initialCurve;
    plotCurve(initialCurve);
}

// Soap bubble demo (Slide 6)
function setupSoapBubblePlot() {
    const plot = document.getElementById('soapPlot');
    const slider = document.getElementById('soapSeparation');
    const statusEl = document.getElementById('soapStatus');
    const criticalEl = document.getElementById('soapCritical');
    if (!plot || !slider) return;

    const R = 1.0;

    // Return all positive roots a of f(a)=a*cosh(H/(2a))-R (if any), plus the sampled minF
    function findCatenoidRoots(H) {
        const aMin = 1e-6, aMax = 10 * R, N = 500;
        const samples = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const a = Math.exp(Math.log(aMin) + t * (Math.log(aMax) - Math.log(aMin)));
            const f = a * Math.cosh(H / (2 * a)) - R;
            samples.push({ a, f });
        }

        // find sign-change brackets
        const brackets = [];
        for (let i = 0; i < samples.length - 1; i++) {
            const f0 = samples[i].f, f1 = samples[i + 1].f;
            if (isFinite(f0) && isFinite(f1) && f0 === 0) brackets.push([samples[i].a, samples[i].a]);
            else if (isFinite(f0) && isFinite(f1) && f0 * f1 < 0) brackets.push([samples[i].a, samples[i + 1].a]);
        }

        const roots = [];
        for (const br of brackets) {
            let lo = br[0], hi = br[1];
            for (let iter = 0; iter < 60; iter++) {
                const mid = 0.5 * (lo + hi);
                const fm = mid * Math.cosh(H / (2 * mid)) - R;
                if (!isFinite(fm)) break;
                if (fm > 0) lo = mid; else hi = mid;
            }
            roots.push(0.5 * (lo + hi));
        }

        // also compute min f for diagnostics
        let minF = Infinity, minIdx = 0;
        for (let i = 0; i < samples.length; i++) if (samples[i].f < minF) { minF = samples[i].f; minIdx = i; }

        return { roots, minF };
    }

    // approximate critical H by scanning and bisecting where minF crosses zero
    // approximate critical H by scanning and bisecting where minF crosses zero
    function computeCriticalH() {
        // Theoretical critical value for R=1 is defined by max of a*cosh(H/(2a)) = R
        // This occurs when coth(H/(2a)) = H/(2a).
        // Let u = H/(2a), then coth(u) = u => u ≈ 1.19967864
        // H_crit = 2 * R * u / cosh(u) ≈ 1.325487
        return 1.32548774;
    }

    // Helper: append Goldschmidt disk surfaces and rims to the given Plotly `data` array
    function addGoldschmidtTraces(data, z1, z2) {
        const nr = 40, ntheta_d = 80;
        const thetaD = [];
        for (let ti = 0; ti <= ntheta_d; ti++) thetaD.push(2 * Math.PI * ti / ntheta_d);
        const rVals = [];
        for (let ri = 0; ri <= nr; ri++) rVals.push(R * ri / nr);

        const eps = 1e-3; // small forward offset to avoid depth hiding

        // disk at z1
        const xGrid1 = [], yGrid1 = [], zGrid1 = [];
        for (let ti = 0; ti < thetaD.length; ti++) {
            const ct = Math.cos(thetaD[ti]), st = Math.sin(thetaD[ti]);
            const rowX = [], rowY = [], rowZ = [];
            for (let ri = 0; ri < rVals.length; ri++) {
                rowX.push(z1 + eps);
                rowY.push(rVals[ri] * ct);
                rowZ.push(rVals[ri] * st);
            }
            xGrid1.push(rowX); yGrid1.push(rowY); zGrid1.push(rowZ);
        }
        // make the disk semi-transparent so underlying geometry remains visible
        data.push({ type: 'surface', x: xGrid1, y: yGrid1, z: zGrid1, colorscale: [[0, '#ffd166'], [1, '#ffd166']], showscale: false, opacity: 0.45, name: 'Goldschmidt disk (z=-H/2)' });
        const rimX1 = [], rimY1 = [], rimZ1 = [];
        for (let ti = 0; ti < thetaD.length; ti++) { rimX1.push(z1 + eps); rimY1.push(R * Math.cos(thetaD[ti])); rimZ1.push(R * Math.sin(thetaD[ti])); }
        data.push({ x: rimX1, y: rimY1, z: rimZ1, mode: 'lines', line: { color: 'rgba(184,134,11,0.6)', width: 2 }, name: 'Goldschmidt rim (z=-H/2)', showlegend: false });

        // disk at z2
        const xGrid2 = [], yGrid2 = [], zGrid2 = [];
        for (let ti = 0; ti < thetaD.length; ti++) {
            const ct = Math.cos(thetaD[ti]), st = Math.sin(thetaD[ti]);
            const rowX = [], rowY = [], rowZ = [];
            for (let ri = 0; ri < rVals.length; ri++) {
                rowX.push(z2 + eps);
                rowY.push(rVals[ri] * ct);
                rowZ.push(rVals[ri] * st);
            }
            xGrid2.push(rowX); yGrid2.push(rowY); zGrid2.push(rowZ);
        }
        // make the disk semi-transparent so underlying geometry remains visible
        data.push({ type: 'surface', x: xGrid2, y: yGrid2, z: zGrid2, colorscale: [[0, '#ffd166'], [1, '#ffd166']], showscale: false, opacity: 0.45, name: 'Goldschmidt disk (z=+H/2)' });
        const rimX2 = [], rimY2 = [], rimZ2 = [];
        for (let ti = 0; ti < thetaD.length; ti++) { rimX2.push(z2 + eps); rimY2.push(R * Math.cos(thetaD[ti])); rimZ2.push(R * Math.sin(thetaD[ti])); }
        data.push({ x: rimX2, y: rimY2, z: rimZ2, mode: 'lines', line: { color: 'rgba(184,134,11,0.6)', width: 2 }, name: 'Goldschmidt rim (z=+H/2)', showlegend: false });
    }

    function render(H) {
        const res = findCatenoidRoots(H);
        const roots = res.roots;
        const ntheta = 80; const theta = [];
        for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);

        const z1 = -H / 2, z2 = H / 2;

        const data = [];

        // Always include the two support rings (wire-frame) so the initial plot shows them even when
        // catenoid solutions exist but are hidden by default.
        const baseRing1x = [], baseRing1y = [], baseRing1z = [];
        const baseRing2x = [], baseRing2y = [], baseRing2z = [];
        for (let i = 0; i < theta.length; i++) {
            const t = theta[i];
            baseRing1x.push(z1); baseRing1y.push(R * Math.cos(t)); baseRing1z.push(R * Math.sin(t));
            baseRing2x.push(z2); baseRing2y.push(R * Math.cos(t)); baseRing2z.push(R * Math.sin(t));
        }
        // make rings clearly visible as 3D line traces (wireframe)
        data.push({ type: 'scatter3d', x: baseRing1x, y: baseRing1y, z: baseRing1z, mode: 'lines', line: { color: '#ff6b6b', width: 4 }, name: 'Ring (z=-H/2)', showlegend: false });
        data.push({ type: 'scatter3d', x: baseRing2x, y: baseRing2y, z: baseRing2z, mode: 'lines', line: { color: '#fbbf24', width: 4 }, name: 'Ring (z=+H/2)', showlegend: false });

        // If there are no solutions, show the physical fixed rings at radius R and a helpful status
        // Preserve existing camera if user has rotated/zoomed the scene
        const existingCamera = (plot && plot._fullLayout && plot._fullLayout.scene && plot._fullLayout.scene.camera) ? plot._fullLayout.scene.camera : null;

        if (!roots || roots.length === 0) {
            // No catenoid solutions: optionally add Goldschmidt disks then show the support rings (already added)
            if (showGoldschmidt) addGoldschmidtTraces(data, z1, z2);
            if (statusEl) statusEl.textContent = '';
            const layoutObj = { paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', scene: { camera: existingCamera || { eye: { x: 1.8, y: -1.6, z: 1.1 } }, aspectmode: 'manual', aspectratio: { x: 1.8, y: 1, z: 1 } } };
            Plotly.react(plot, data, layoutObj, { responsive: true });
            return;
        }

        // build surface(s) for each root and draw rings that match the catenoid end-radius
        const surfColors = ['#7cf1a5', '#a78bfa', '#7fb3ff', '#ffb6c1'];
        for (let rIdx = 0; rIdx < roots.length; rIdx++) {
            const a = roots[rIdx];
            // compute radius at the ends (should be very close to R if root is accurate)
            const endR = a * Math.cosh(H / (2 * a));

            // ring at z = -H/2 for this solution
            const ring1x = [], ring1y = [], ring1z = [];
            const ring2x = [], ring2y = [], ring2z = [];
            for (let i = 0; i < theta.length; i++) {
                const t = theta[i];
                ring1x.push(z1); ring1y.push(endR * Math.cos(t)); ring1z.push(endR * Math.sin(t));
                ring2x.push(z2); ring2y.push(endR * Math.cos(t)); ring2z.push(endR * Math.sin(t));
            }

            // surface
            const nz = 120;
            const zmin = -H / 2, zmax = H / 2, dz = (zmax - zmin) / nz;
            const xGrid = [], yGrid = [], zGrid = [];
            for (let ti = 0; ti <= ntheta; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let i = 0; i <= nz; i++) {
                    const z = zmin + i * dz; const rr = a * Math.cosh(z / a);
                    rowX.push(z); rowY.push(rr * cosT); rowZ.push(rr * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

            data.push({ type: 'surface', x: xGrid, y: yGrid, z: zGrid, colorscale: 'Viridis', showscale: false, opacity: rIdx === 0 ? 0.9 : 0.6, name: 'Catenoid ' + (rIdx + 1) });

            // Add rings that match this surface's end-radius and color them to match the surface
            data.push({ x: ring1x, y: ring1y, z: ring1z, mode: 'lines', line: { color: surfColors[rIdx % surfColors.length], width: 4 }, name: 'Ring S' + (rIdx + 1) + ' (z=-H/2)', showlegend: true });
            data.push({ x: ring2x, y: ring2y, z: ring2z, mode: 'lines', line: { color: surfColors[rIdx % surfColors.length], width: 4 }, name: 'Ring S' + (rIdx + 1) + ' (z=+H/2)', showlegend: true });

            // neck marker + label
            const neckX = [0], neckY = [a], neckZ = [0];
            data.push({ x: neckX, y: neckY, z: neckZ, type: 'scatter3d', mode: 'markers+text', marker: { color: surfColors[rIdx % surfColors.length], size: 6 }, text: ['a=' + a.toFixed(3)], textposition: 'top center', name: 'Neck ' + (rIdx + 1) });
        }

        // If requested, add Goldschmidt disks after drawing catenoids so they appear on top
        if (showGoldschmidt) addGoldschmidtTraces(data, z1, z2);

        if (statusEl) statusEl.textContent = '';
        const layoutObj = { paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', scene: { camera: existingCamera || { eye: { x: 1.8, y: -1.6, z: 1.1 } }, aspectmode: 'manual', aspectratio: { x: 1.8, y: 1, z: 1 } } };
        Plotly.react(plot, data, layoutObj, { responsive: true });
    }

    // compute critical H once (approx) and display
    const Hcrit = computeCriticalH();
    if (criticalEl) criticalEl.textContent = Hcrit ? ('H ≈ ' + Hcrit.toFixed(3)) : '';

    // Elements for solution count and toggles
    const solCountEl = document.getElementById('soapSolutionCount');
    const togglesContainer = document.getElementById('soapSolutionToggles');
    const goldCheckbox = document.getElementById('soapShowGoldschmidt');
    const goldStatusEl = document.getElementById('soapGoldschmidtStatus');

    let visibleSolutions = []; // parallel array of booleans per root
    let currentH = parseFloat(slider.value) || 0.7;
    const valEl = document.getElementById('soapSepValue'); if (valEl) valEl.textContent = currentH.toFixed(2);

    // Goldschmidt (two flat disks) area
    const A_gold = 2 * Math.PI * R * R;
    let showGoldschmidt = undefined; // default to undefined so we can auto-set based on energetic preference

    function createToggles(roots) {
        // preserve previous visibility when possible; default to HIDE all solutions on first load
        const prev = visibleSolutions.slice();
        visibleSolutions = roots.map((_, i) => (typeof prev[i] === 'boolean' ? prev[i] : false));

        if (solCountEl) solCountEl.textContent = 'Catenoid solutions: ' + roots.length;
        if (!togglesContainer) return;
        togglesContainer.innerHTML = '';

        roots.forEach((a, i) => {
            const color = ['#7cf1a5', '#a78bfa', '#7fb3ff', '#ffb6c1'][i % 4];
            const id = 'soapSolToggle' + i;
            const wrapper = document.createElement('label');
            wrapper.style.display = 'inline-flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '6px';
            wrapper.style.fontSize = '0.9rem';
            wrapper.style.color = '#ddd';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.checked = !!visibleSolutions[i];
            cb.style.accentColor = color;
            cb.addEventListener('change', () => {
                visibleSolutions[i] = cb.checked;
                render(currentH);
                updateToggleAllBtn();
            });

            const dot = document.createElement('span');
            dot.style.display = 'inline-block';
            dot.style.width = '12px';
            dot.style.height = '8px';
            dot.style.background = color;
            dot.style.borderRadius = '3px';

            const lbl = document.createElement('span');
            // compute approximate surface area for this catenoid solution using currentH
            let area = NaN;
            try {
                if (typeof currentH === 'number' && currentH > 0) {
                    area = Math.PI * a * currentH + Math.PI * a * a * Math.sinh(currentH / a);
                }
            } catch (e) { area = NaN; }
            const areaStr = isFinite(area) ? area.toFixed(3) : '—';
            // use subscript digits for nicer C₁, C₂ labels
            const subDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
            function toSub(n) { return String(n).split('').map(d => subDigits[parseInt(d)] || d).join(''); }
            lbl.textContent = 'C' + toSub(i + 1) + ' (A = ' + areaStr + ')';
            lbl.title = 'Surface area ≈ ' + areaStr;
            lbl.style.marginLeft = '4px';

            wrapper.appendChild(cb);
            wrapper.appendChild(dot);
            wrapper.appendChild(lbl);
            togglesContainer.appendChild(wrapper);
        });
        updateToggleAllBtn();
    }

    // Goldschmidt checkbox wiring
    if (goldCheckbox) {
        goldCheckbox.addEventListener('change', () => {
            showGoldschmidt = goldCheckbox.checked;
            render(currentH);
        });
    }

    function updateToggleAllBtn() {
        // Toggle-all button removed; no-op kept for backward compatibility
    }

    function render(H) {
        currentH = H;
        // preserve any user-rotated camera so updates (toggles/slider) don't reset view
        const existingCamera = (plot && plot._fullLayout && plot._fullLayout.scene && plot._fullLayout.scene.camera) ? plot._fullLayout.scene.camera : null;
        const res = findCatenoidRoots(H);
        let roots = res.roots;

        // Force unique solution if explicitly at critical value (within tolerance)
        // The critical radius a is defined by H_crit / (2 * u_star) where u_star is solution to coth(u)=u (approx 1.19967864)
        if (Hcrit && Math.abs(H - Hcrit) < 1e-4) {
            // u* ≈ 1.199678640257734
            const uStar = 1.199678640257734;
            const aUnique = Hcrit / (2 * uStar);
            roots = [aUnique];
        }

        const ntheta = 80; const theta = [];
        for (let ti = 0; ti <= ntheta; ti++) theta.push(2 * Math.PI * ti / ntheta);

        // update toggles / solution count
        createToggles(roots);

        const data = [];

        const z1 = -H / 2, z2 = H / 2;

        // Always include the two support rings (wire-frame) so the user sees the fixed
        // boundary rings even when catenoid solutions are present but the per-solution
        // toggles default to hidden. This ensures the initial plot is not empty.
        const baseRing1x = [], baseRing1y = [], baseRing1z = [];
        const baseRing2x = [], baseRing2y = [], baseRing2z = [];
        for (let i = 0; i < theta.length; i++) {
            const t = theta[i];
            baseRing1x.push(z1); baseRing1y.push(R * Math.cos(t)); baseRing1z.push(R * Math.sin(t));
            baseRing2x.push(z2); baseRing2y.push(R * Math.cos(t)); baseRing2z.push(R * Math.sin(t));
        }
        // use scatter3d so rings are visible even when no surfaces are drawn
        data.push({ type: 'scatter3d', x: baseRing1x, y: baseRing1y, z: baseRing1z, mode: 'lines', line: { color: '#ff6b6b', width: 4 }, name: 'Ring (z=-H/2)', showlegend: false });
        data.push({ type: 'scatter3d', x: baseRing2x, y: baseRing2y, z: baseRing2z, mode: 'lines', line: { color: '#fbbf24', width: 4 }, name: 'Ring (z=+H/2)', showlegend: false });

        // decide about Goldschmidt preference (compare areas when catenoids exist)
        let minCatArea = Infinity;
        let goldPreferred = true;
        if (roots && roots.length > 0) {
            const catAreas = roots.map(a => (Math.PI * a * H + Math.PI * a * a * Math.sinh(H / a)));
            minCatArea = catAreas.length ? Math.min(...catAreas) : Infinity;
            goldPreferred = A_gold < minCatArea;
        } else {
            // no catenoid exists => Goldschmidt (two disks) is the only feasible static shape
            goldPreferred = true;
        }

        if (goldStatusEl) {
            const goldAreaStr = (isFinite(A_gold) ? A_gold.toFixed(3) : '—');
            if (!roots || roots.length === 0) goldStatusEl.textContent = 'Goldschmidt available (A = ' + goldAreaStr + ')';
            else goldStatusEl.textContent = (goldPreferred ? 'Goldschmidt preferred' : 'Goldschmidt') + ' (A = ' + goldAreaStr + ')';
        }
        // also update the checkbox label/title to include area for quick hover info
        if (goldCheckbox && goldCheckbox.parentElement) {
            goldCheckbox.parentElement.title = 'Goldschmidt area ≈ ' + (isFinite(A_gold) ? A_gold.toFixed(3) : '—');
        }
        // ensure default checkbox state reflects energetic preference on first render
        if (typeof showGoldschmidt !== 'boolean') {
            if (goldCheckbox) goldCheckbox.checked = goldPreferred;
            showGoldschmidt = goldPreferred;
        }

        // If there are no solutions, show the physical fixed rings at radius R and optionally Goldschmidt disks
        if (!roots || roots.length === 0) {
            // If the user requested Goldschmidt, draw the two flat disks
            if (showGoldschmidt) addGoldschmidtTraces(data, z1, z2);

            // Always draw the boundary rings so the user sees the fixed supports
            const ring1x = [], ring1y = [], ring1z = [];
            const ring2x = [], ring2y = [], ring2z = [];
            for (let i = 0; i < theta.length; i++) {
                const t = theta[i];
                ring1x.push(z1); ring1y.push(R * Math.cos(t)); ring1z.push(R * Math.sin(t));
                ring2x.push(z2); ring2y.push(R * Math.cos(t)); ring2z.push(R * Math.sin(t));
            }
            data.push({ x: ring1x, y: ring1y, z: ring1z, mode: 'lines', line: { color: '#ff6b6b', width: 4 }, name: 'Ring (z=-H/2)', showlegend: true });
            data.push({ x: ring2x, y: ring2y, z: ring2z, mode: 'lines', line: { color: '#fbbf24', width: 4 }, name: 'Ring (z=+H/2)', showlegend: true });

            if (statusEl) statusEl.textContent = '';
            const layoutObjNoRoots = { paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', scene: { camera: existingCamera || { eye: { x: 1.8, y: -1.6, z: 1.1 } }, aspectmode: 'manual', aspectratio: { x: 1.8, y: 1, z: 1 } } };
            try { Plotly.react(plot, data, layoutObjNoRoots, { responsive: true }); } catch (e) { Plotly.newPlot('soapPlot', data, layoutObjNoRoots, { responsive: true }); }
            return;
        }

        // build surface(s) for each root and draw rings that match the catenoid end-radius
        const surfColors = ['#7cf1a5', '#a78bfa', '#7fb3ff', '#ffb6c1'];

        for (let rIdx = 0; rIdx < roots.length; rIdx++) {
            if (visibleSolutions[rIdx] === false) continue; // skip hidden ones
            const a = roots[rIdx];
            // compute radius at the ends (should be very close to R if root is accurate)
            const endR = a * Math.cosh(H / (2 * a));

            // ring at z = -H/2 for this solution
            const ring1x = [], ring1y = [], ring1z = [];
            const ring2x = [], ring2y = [], ring2z = [];
            for (let i = 0; i < theta.length; i++) {
                const t = theta[i];
                ring1x.push(z1); ring1y.push(endR * Math.cos(t)); ring1z.push(endR * Math.sin(t));
                ring2x.push(z2); ring2y.push(endR * Math.cos(t)); ring2z.push(endR * Math.sin(t));
            }

            // surface
            const nz = 120;
            const zmin = -H / 2, zmax = H / 2, dz = (zmax - zmin) / nz;
            const xGrid = [], yGrid = [], zGrid = [];
            for (let ti = 0; ti <= ntheta; ti++) {
                const cosT = Math.cos(theta[ti]), sinT = Math.sin(theta[ti]);
                const rowX = [], rowY = [], rowZ = [];
                for (let i = 0; i <= nz; i++) {
                    const z = zmin + i * dz; const rr = a * Math.cosh(z / a);
                    rowX.push(z); rowY.push(rr * cosT); rowZ.push(rr * sinT);
                }
                xGrid.push(rowX); yGrid.push(rowY); zGrid.push(rowZ);
            }

            data.push({ type: 'surface', x: xGrid, y: yGrid, z: zGrid, colorscale: 'Viridis', showscale: false, opacity: rIdx === 0 ? 0.9 : 0.6, name: 'Catenoid ' + (rIdx + 1) });

            // Add rings that match this surface's end-radius and color them to match the surface
            data.push({ x: ring1x, y: ring1y, z: ring1z, mode: 'lines', line: { color: surfColors[rIdx % surfColors.length], width: 4 }, name: 'Ring S' + (rIdx + 1) + ' (z=-H/2)', showlegend: true });
            data.push({ x: ring2x, y: ring2y, z: ring2z, mode: 'lines', line: { color: surfColors[rIdx % surfColors.length], width: 4 }, name: 'Ring S' + (rIdx + 1) + ' (z=+H/2)', showlegend: true });

            // neck marker + label
            const neckX = [0], neckY = [a], neckZ = [0];
            data.push({ x: neckX, y: neckY, z: neckZ, type: 'scatter3d', mode: 'markers+text', marker: { color: surfColors[rIdx % surfColors.length], size: 6 }, text: ['a=' + a.toFixed(3)], textposition: 'top center', name: 'Neck ' + (rIdx + 1) });
        }

        // If requested, add Goldschmidt disks after drawing catenoids so they appear on top
        if (showGoldschmidt) addGoldschmidtTraces(data, z1, z2);

        if (statusEl) statusEl.textContent = '';
        const layoutObj = { paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', scene: { camera: existingCamera || { eye: { x: 1.8, y: -1.6, z: 1.1 } }, aspectmode: 'manual', aspectratio: { x: 1.8, y: 1, z: 1 } } };
        try { Plotly.react(plot, data, layoutObj, { responsive: true }); } catch (e) { Plotly.newPlot('soapPlot', data, layoutObj, { responsive: true }); }
    }

    // initial render and wiring
    render(currentH);
    // Increase slider precision to allow exact snap to Hcrit
    slider.step = '0.001';

    slider.addEventListener('input', () => {
        let h = parseFloat(slider.value);

        // Snap to critical value if close
        let snapped = false;
        if (Hcrit && Math.abs(h - Hcrit) < 0.05) {
            h = Hcrit;
            slider.value = h;
            snapped = true;
        }

        if (valEl) {
            valEl.textContent = h.toFixed(3);
            valEl.style.color = snapped ? '#7cf1a5' : '';
            valEl.style.fontWeight = snapped ? 'bold' : '';
        }
        render(h);
    });
}

// Variation Demo (Slide 11)
function setupVariationDemo() {
    const plot = document.getElementById('variationPlot');
    const slider = document.getElementById('epsilonSlider');
    const etaSelector = document.getElementById('etaSelector');
    if (!plot || !slider) return;

    function etaValue(name, xi) {
        switch (name) {
            case 'sin': return Math.sin(Math.PI * xi);
            case 'sin2': return Math.sin(2 * Math.PI * xi);
            case 'gauss': {
                // gaussian centered at 0.5, sigma ~ 0.09
                const sigma = 0.09;
                const u = (xi - 0.5) / sigma;
                return Math.exp(-0.5 * u * u);
            }
            case 'hat': return xi < 0.5 ? (xi * 2) : ((1 - xi) * 2);
            case 'poly': return xi * (1 - xi);
            default: return Math.sin(Math.PI * xi);
        }
    }

    function plotVariation(epsilon) {
        const x = [], yBar = [], yPerturbed = [];
        const sel = etaSelector ? etaSelector.value : 'sin';
        for (let xi = 0; xi <= 1; xi += 0.01) {
            x.push(xi);
            yBar.push(xi);
            yPerturbed.push(xi + epsilon * etaValue(sel, xi));
        }

        Plotly.newPlot('variationPlot', [{
            x: x, y: yBar,
            mode: 'lines',
            line: { color: '#00d9ff', width: 2, dash: 'dash' },
            name: 'y(x)'
        }, {
            x: x, y: yPerturbed,
            mode: 'lines',
            line: { color: '#ff6b6b', width: 3 },
            name: 'y + εη'
        }, {
            x: [0, 1], y: [0, 1],
            mode: 'markers',
            marker: { color: '#4ade80', size: 12 },
            showlegend: false
        }], {
            paper_bgcolor: '#1a1a2e',
            plot_bgcolor: '#1a1a2e',
            font: { color: '#eee', size: 16 },
            xaxis: { title: 'x', gridcolor: '#2a3a5a', titlefont: { size: 16 }, tickfont: { size: 14 } },
            yaxis: { gridcolor: '#2a3a5a', range: [-0.2, 1.8], titlefont: { size: 16 }, tickfont: { size: 14 } },
            margin: { t: 20, r: 20, b: 60, l: 60 },
            showlegend: true,
            legend: { x: 0.02, y: 0.98, font: { size: 18 } },
            annotations: [{ x: -0.08, y: 0.5, xref: 'paper', yref: 'paper', text: 'y', showarrow: false, font: { color: '#eee', size: 16 } }]
        }, { responsive: true });
    }

    slider.addEventListener('input', () => {
        const eps = parseFloat(slider.value);
        document.getElementById('epsilonValue').textContent = eps.toFixed(2);
        plotVariation(eps);
    });

    if (etaSelector) {
        etaSelector.addEventListener('change', () => {
            const eps = parseFloat(slider.value);
            plotVariation(eps);
        });
    }

    plotVariation(1);
}

// FLCV Proof Diagram (Slide 14)
// FLCV Proof Diagram (Slide 14)
function setupFLCVDemo() {
    const plotDiv = document.getElementById('flcvPlot');
    const nextBtn = document.getElementById('flcvNextBtn');
    const statusSpan = document.getElementById('flcvStatus');

    if (!plotDiv || plotDiv.data) return;

    // Domain [0, 1]
    const x = [];
    const M = [];
    const eta = [];
    const product = [];

    const x0 = 0.5;
    const delta = 0.15;

    for (let xi = 0; xi <= 1; xi += 0.005) {
        x.push(xi);
        // M(x): arbitrary continuous function positive at x0
        const mVal = 0.8 + 0.4 * Math.sin(10 * xi) * Math.cos(3 * xi);
        M.push(mVal);

        // eta(x): localized bump
        let etaVal = 0;
        if (Math.abs(xi - x0) < delta) {
            const u = (xi - x0) / delta;
            etaVal = Math.exp(2) * Math.exp(-1 / (1 - u * u));
        }
        eta.push(etaVal);

        product.push(mVal * etaVal);
    }

    const traceM = {
        x: x, y: M,
        mode: 'lines',
        line: { color: '#00d9ff', width: 2 },
        name: 'M(x)'
    };

    const traceEta = {
        x: x, y: eta,
        mode: 'lines',
        line: { color: '#4ade80', width: 3 },
        name: 'η(x)',
        fill: 'tozeroy',
        fillcolor: 'rgba(74, 222, 128, 0.1)',
        visible: false
    };

    const traceProduct = {
        x: x, y: product,
        mode: 'lines',
        line: { color: '#f59e0b', width: 0 },
        name: 'M(x)η(x)',
        fill: 'tozeroy',
        fillcolor: 'rgba(245, 158, 11, 0.4)',
        visible: false
    };

    // Helper to get M(x0) from array (approx)
    function TraceM_y_at_x0(val) {
        return 0.8 + 0.4 * Math.sin(10 * val) * Math.cos(3 * val);
    }

    const tracePoint = {
        x: [x0], y: [TraceM_y_at_x0(x0)], // approximate y
        mode: 'markers',
        marker: { color: '#eee', size: 8 },
        showlegend: false,
        visible: false
    };

    const layout = {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee', size: 30 },
        xaxis: {
            title: 'x',
            gridcolor: '#2a3a5a',
            range: [0, 1],
            showline: true,
            linecolor: '#eee',
            linewidth: 2,
            ticks: 'outside',
            tickfont: { size: 18 },
            titlefont: { size: 20 },
            zeroline: true,
            zerolinecolor: '#444'
        },
        yaxis: {
            gridcolor: '#2a3a5a',
            range: [0, 1.5],
            showticklabels: true,
            showline: true,
            linecolor: '#eee',
            linewidth: 2,
            ticks: 'outside',
            tickfont: { size: 18 },
            titlefont: { size: 20 },
            zeroline: true,
            zerolinecolor: '#444'
        },
        margin: { t: 30, r: 20, b: 40, l: 40 },
        showlegend: true,
        legend: { x: 0.8, y: 0.9, font: { size: 18 } },
        annotations: []
    };

    Plotly.newPlot('flcvPlot', [traceM, traceEta, traceProduct, tracePoint], layout, { responsive: true });

    // Animation State Machine
    const steps = [
        {
            text: "Step 1: Consider continuous M(x)",
            update: { visible: [true, false, false, false] },
            layout: { annotations: [] }
        },
        {
            text: "Step 2: Identify x₀ where M(x₀) ≠ 0",
            update: { visible: [true, false, false, true] },
            layout: {
                annotations: [
                    { x: x0, y: TraceM_y_at_x0(x0) + 0.15, text: 'M(x₀) ≠ 0', showarrow: false, font: { color: '#00d9ff', size: 26 } }
                ]
            }
        },
        {
            text: "Step 3: Construct localized test function η(x)",
            update: { visible: [true, true, false, true] },
            layout: {
                annotations: [
                    { x: x0, y: TraceM_y_at_x0(x0) + 0.15, text: 'M(x₀) ≠ 0', showarrow: false, font: { color: '#00d9ff', size: 26 } },
                    { x: x0 + 0.2, y: 1, text: 'η(x)', showarrow: false, font: { color: '#4ade80', size: 26 } }
                ]
            }
        },
        {
            text: "Step 4: Integrand is strictly positive",
            update: { visible: [true, true, true, true] },
            layout: {
                annotations: [
                    { x: x0, y: TraceM_y_at_x0(x0) + 0.15, text: 'M(x₀) ≠ 0', showarrow: false, font: { color: '#00d9ff', size: 26 } },
                    { x: x0 + 0.2, y: 1, text: 'η(x)', showarrow: false, font: { color: '#4ade80', size: 26 } },
                    { x: x0 + 0.3, y: 0.3, text: '∫ M η dx > 0', showarrow: false, font: { color: '#f59e66', size: 26 } }
                ]
            }
        }
    ];

    // Expose globally for fragment control
    window.gotoFLCVStep = function (idx) {
        if (idx < 0 || idx >= steps.length) return;
        const s = steps[idx];
        const statusSpan = document.getElementById('flcvStatus');
        if (statusSpan) statusSpan.textContent = s.text;
        Plotly.update('flcvPlot', s.update, s.layout);
    };

    // Init state 0
    window.gotoFLCVStep(0);
}

function setupShortestPathPlot() {
    const plot = document.getElementById('shortestPathPlot');
    if (!plot || plot.data) return;

    const x = [], y = [];
    for (let xi = 0; xi <= 1; xi += 0.01) {
        x.push(xi);
        y.push(xi);
    }

    Plotly.newPlot('shortestPathPlot', [{
        x: x, y: y,
        mode: 'lines',
        line: { color: '#00d9ff', width: 3 },
        name: 'y = x'
    }, {
        x: [0, 1], y: [0, 1],
        mode: 'markers',
        marker: { color: '#ff6b6b', size: 15 },
        name: 'Endpoints'
    }], {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { title: 'x', gridcolor: '#2a3a5a', range: [-0.1, 1.1] },
        yaxis: { gridcolor: '#2a3a5a', range: [-0.1, 1.1], scaleanchor: 'x' },
        margin: { t: 20, r: 20, b: 50, l: 50 },
        showlegend: false,
        annotations: [
            { x: -0.08, y: 0.5, xref: 'paper', yref: 'paper', text: 'y', showarrow: false, font: { color: '#eee', size: 14 } },
            { x: 0, y: 0, xref: 'x', yref: 'y', text: 'A', showarrow: false, font: { color: '#eee', size: 24 }, xshift: -28, yshift: 20 },
            // endpoints are (0,0) and (1,1) for this example
            { x: 1, y: 1, xref: 'x', yref: 'y', text: 'B', showarrow: false, font: { color: '#eee', size: 24 }, xshift: 28, yshift: 20 }
        ]
    }, { responsive: true });
}

// ds diagram for plane (Slide 16)
function setupDsPlotPlane() {
    const plot = document.getElementById('dsPlotPlane');
    if (!plot || plot.data) return;

    // Draw a curve with a zoomed-in section showing dx, dy, ds triangle
    const curveX = [], curveY = [];
    for (let xi = 0; xi <= 1; xi += 0.01) {
        curveX.push(xi);
        curveY.push(0.2 + 0.6 * xi); // Simple curve for clearer triangle
    }

    // Point on curve for the triangle - use smaller increment for clearer right angle
    const x0 = 0.3, x1 = 0.7;
    const y0 = 0.2 + 0.6 * x0;  // = 0.38
    const y1 = 0.2 + 0.6 * x1;  // = 0.62

    // Right angle marker size
    const markerSize = 0.04;

    Plotly.newPlot('dsPlotPlane', [{
        x: curveX, y: curveY,
        mode: 'lines',
        line: { color: '#00d9ff', width: 3 },
        name: 'y(x)'
    }, {
        // dx horizontal line (from start point, going right at constant y)
        x: [x0, x1], y: [y0, y0],
        mode: 'lines',
        line: { color: '#4ade80', width: 4 },
        name: 'dx'
    }, {
        // dy vertical line (from end of dx, going up to end point)
        x: [x1, x1], y: [y0, y1],
        mode: 'lines',
        line: { color: '#f59e0b', width: 4 },
        name: 'dy'
    }, {
        // ds hypotenuse (the actual curve segment from start to end)
        x: [x0, x1], y: [y0, y1],
        mode: 'lines',
        line: { color: '#ff6b6b', width: 5 },
        name: 'ds'
    }, {
        // Right angle marker
        x: [x1 - markerSize, x1 - markerSize, x1],
        y: [y0, y0 + markerSize, y0 + markerSize],
        mode: 'lines',
        line: { color: '#ffffff', width: 2 },
        name: 'right angle'
    }, {
        // Points at corners
        x: [x0, x1, x1], y: [y0, y0, y1],
        mode: 'markers',
        marker: { color: '#ff6b6b', size: 12 }
    }], {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { title: 'x', gridcolor: '#2a3a5a', range: [0, 1], dtick: 0.2 },
        yaxis: { gridcolor: '#2a3a5a', range: [0, 1], scaleanchor: 'x', dtick: 0.2 },
        margin: { t: 20, r: 20, b: 50, l: 50 },
        showlegend: false,
        annotations: [
            { x: (x0 + x1) / 2, y: y0 - 0.07, text: 'dx', showarrow: false, font: { color: '#4ade80', size: 18 } },
            { x: x1 + 0.07, y: (y0 + y1) / 2, text: 'dy', showarrow: false, font: { color: '#f59e0b', size: 18 } },
            { x: (x0 + x1) / 2 - 0.1, y: (y0 + y1) / 2 + 0.07, text: 'ds', showarrow: false, font: { color: '#ff6b6b', size: 20 } },
            { x: -0.08, y: 0.5, xref: 'paper', yref: 'paper', text: 'y', showarrow: false, font: { color: '#eee', size: 14 } }
        ]
    }, { responsive: true });
}

// Cylindrical Polars Plot (Slide 22)
function setupCylPolarsPlot() {
    const plot = document.getElementById('cylPolarsPlot');
    if (!plot || plot.data) return;

    const R = 1.2;
    const theta = Math.PI / 4;
    const H = 1.5;

    // Coordinate axes
    const axisLength = 2;
    const axes = [
        { x: [0, axisLength], y: [0, 0], z: [0, 0], color: '#aaa', name: 'x' },
        { x: [0, 0], y: [0, axisLength], z: [0, 0], color: '#aaa', name: 'y' },
        { x: [0, 0], y: [0, 0], z: [0, axisLength], color: '#aaa', name: 'z' }
    ].map(a => ({
        type: 'scatter3d',
        x: a.x, y: a.y, z: a.z,
        mode: 'lines',
        line: { color: a.color, width: 2 },
        name: a.name,
        hoverinfo: 'skip'
    }));

    // Radial line in xy-plane
    const radialLine = {
        type: 'scatter3d',
        x: [0, R * Math.cos(theta)],
        y: [0, R * Math.sin(theta)],
        z: [0, 0],
        mode: 'lines',
        line: { color: '#4ade80', width: 4 },
        name: 'r'
    };

    // Height line
    const heightLine = {
        type: 'scatter3d',
        x: [R * Math.cos(theta), R * Math.cos(theta)],
        y: [R * Math.sin(theta), R * Math.sin(theta)],
        z: [0, H],
        mode: 'lines',
        line: { color: '#f59e0b', width: 4 },
        name: 'z'
    };

    // Point (r, theta, z)
    const point = {
        type: 'scatter3d',
        x: [R * Math.cos(theta)],
        y: [R * Math.sin(theta)],
        z: [H],
        mode: 'markers',
        marker: { color: '#00d9ff', size: 8 },
        name: 'P(r, θ, z)'
    };

    // Theta arc
    const arcX = [], arcY = [], arcZ = [];
    const arcR = 0.5;
    for (let t = 0; t <= theta; t += 0.05) {
        arcX.push(arcR * Math.cos(t));
        arcY.push(arcR * Math.sin(t));
        arcZ.push(0);
    }
    const thetaArc = {
        type: 'scatter3d',
        x: arcX, y: arcY, z: arcZ,
        mode: 'lines',
        line: { color: '#a855f7', width: 3 },
        name: 'θ'
    };

    Plotly.newPlot('cylPolarsPlot', [...axes, radialLine, heightLine, thetaArc, point], {
        paper_bgcolor: '#1a1a2e',
        scene: {
            bgcolor: '#1a1a2e',
            xaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            zaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            camera: { eye: { x: 1.5, y: 1.2, z: 0.8 } },
            aspectmode: 'manual',
            aspectratio: { x: 1, y: 1, z: 1 },
            annotations: [
                { x: axisLength + 0.1, y: 0, z: 0, text: 'x', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: 0, y: axisLength + 0.1, z: 0, text: 'y', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: 0, y: 0, z: axisLength + 0.1, text: 'z', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: R * Math.cos(theta) / 2, y: R * Math.sin(theta) / 2, z: -0.15, text: 'r', showarrow: false, font: { color: '#4ade80', size: 28, weight: 'bold' } },
                { x: R * Math.cos(theta) - 0.2, y: R * Math.sin(theta) - 0.2, z: H * 0.7, text: 'z', showarrow: false, font: { color: '#f59e0b', size: 28, weight: 'bold' } },
                { x: arcR * Math.cos(theta / 2) - 0.1, y: arcR * Math.sin(theta / 2) - 0.1, z: -0.3, text: 'θ', showarrow: false, font: { color: '#a855f7', size: 28, weight: 'bold' } }
            ]
        },
        font: { color: '#eee' },
        margin: { t: 0, r: 0, b: 0, l: 0 },
        showlegend: false
    }, { responsive: true });
}

// Spherical Polars Plot (Slide 24)
function setupSpherePolarsPlot() {
    const plot = document.getElementById('spherePolarsPlot');
    if (!plot || plot.data) return;

    // Point P at (2, 2, 2)
    const xP = 2, yP = 2, zP = 2;
    const R = Math.sqrt(xP * xP + yP * yP + zP * zP); // sqrt(12) approx 3.46
    const phi = Math.atan2(yP, xP);          // 45 degrees
    const theta = Math.acos(zP / R);          // approx 54.7 degrees

    // Coordinate axes
    const axisLength = 3.5;
    const axes = [
        { x: [0, axisLength], y: [0, 0], z: [0, 0], color: '#aaa', name: 'x' },
        { x: [0, 0], y: [0, axisLength], z: [0, 0], color: '#aaa', name: 'y' },
        { x: [0, 0], y: [0, 0], z: [0, axisLength], color: '#aaa', name: 'z' }
    ].map(a => ({
        type: 'scatter3d',
        x: a.x, y: a.y, z: a.z,
        mode: 'lines',
        line: { color: a.color, width: 2 },
        name: a.name,
        hoverinfo: 'skip'
    }));

    // Radial line
    const radialLine = {
        type: 'scatter3d',
        x: [0, xP], y: [0, yP], z: [0, zP],
        mode: 'lines',
        line: { color: '#4ade80', width: 4 },
        name: 'r'
    };

    // Projection in xy plane
    const projectionLine = {
        type: 'scatter3d',
        x: [0, xP], y: [0, yP], z: [0, 0],
        mode: 'lines',
        line: { color: '#ccc', width: 2, dash: 'dash' },
        name: 'proj'
    };

    // Vertical line to projection
    const verticalLine = {
        type: 'scatter3d',
        x: [xP, xP], y: [yP, yP], z: [0, zP],
        mode: 'lines',
        line: { color: '#ccc', width: 2, dash: 'dash' },
        name: 'vert'
    };

    // Point P
    const pointMarker = {
        type: 'scatter3d',
        x: [xP], y: [yP], z: [zP],
        mode: 'markers',
        marker: { color: '#00d9ff', size: 8 },
        name: 'P'
    };

    // Theta arc (angle from z axis)
    const arcThetaX = [], arcThetaY = [], arcThetaZ = [];
    const rTheta = 1.2;
    for (let t = 0; t <= theta; t += 0.05) {
        arcThetaX.push(rTheta * Math.sin(t) * Math.cos(phi));
        arcThetaY.push(rTheta * Math.sin(t) * Math.sin(phi));
        arcThetaZ.push(rTheta * Math.cos(t));
    }
    const thetaArc = {
        type: 'scatter3d',
        x: arcThetaX, y: arcThetaY, z: arcThetaZ,
        mode: 'lines',
        line: { color: '#a855f7', width: 4 },
        name: 'θ'
    };

    // Phi arc (angle in xy plane)
    const arcPhiX = [], arcPhiY = [], arcPhiZ = [];
    const rPhi = 1.0;
    for (let p = 0; p <= phi; p += 0.05) {
        arcPhiX.push(rPhi * Math.cos(p));
        arcPhiY.push(rPhi * Math.sin(p));
        arcPhiZ.push(0);
    }
    const phiArc = {
        type: 'scatter3d',
        x: arcPhiX, y: arcPhiY, z: arcPhiZ,
        mode: 'lines',
        line: { color: '#00d9ff', width: 4 },
        name: 'ϕ'
    };

    Plotly.newPlot('spherePolarsPlot', [...axes, radialLine, projectionLine, verticalLine, thetaArc, phiArc, pointMarker], {
        paper_bgcolor: '#1a1a2e',
        scene: {
            bgcolor: '#1a1a2e',
            xaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            zaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            camera: { eye: { x: 1.6, y: 0.3, z: 0.4 } },
            aspectmode: 'manual',
            aspectratio: { x: 1, y: 1, z: 1 },
            annotations: [
                { x: axisLength + 0.1, y: 0, z: 0, text: 'x', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: 0, y: axisLength + 0.1, z: 0, text: 'y', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: 0, y: 0, z: axisLength + 0.1, text: 'z', showarrow: false, font: { color: '#eee', size: 24 } },
                { x: xP / 2, y: yP / 2, z: zP / 2 + 0.3, text: 'r', showarrow: false, font: { color: '#4ade80', size: 28, weight: 'bold' } },
                { x: rTheta * Math.sin(theta / 2) * Math.cos(phi) + 0.2, y: rTheta * Math.sin(theta / 2) * Math.sin(phi) + 0.2, z: rTheta * Math.cos(theta / 2) + 0.3, text: 'θ', showarrow: false, font: { color: '#a855f7', size: 32, weight: 'bold' } },
                { x: rPhi * Math.cos(phi / 2) + 0.2, y: rPhi * Math.sin(phi / 2) + 0.01, z: -0.2, text: 'ϕ', showarrow: false, font: { color: '#00d9ff', size: 32, weight: 'bold' } }
            ]
        },
        font: { color: '#eee' },
        margin: { t: 0, r: 0, b: 0, l: 0 },
        showlegend: false
    }, { responsive: true });
}

// ds diagram for cylinder (Slide 18)
function setupDsPlotCylinder() {
    const plot = document.getElementById('dsPlotCylinder');
    if (!plot) return;

    const R = 1;
    // Show a small patch of cylinder surface with ds triangle
    const nTheta = 20, nZ = 10;
    const xSurf = [], ySurf = [], zSurf = [];

    for (let j = 0; j <= nZ; j++) {
        const xRow = [], yRow = [], zRow = [];
        const zVal = j / nZ * 2;
        for (let i = 0; i <= nTheta; i++) {
            const theta = i * Math.PI / nTheta - Math.PI / 2;
            xRow.push(R * Math.cos(theta));
            yRow.push(R * Math.sin(theta));
            zRow.push(zVal);
        }
        xSurf.push(xRow);
        ySurf.push(yRow);
        zSurf.push(zRow);
    }

    // ds triangle on cylinder surface
    const theta0 = 0, z0 = 0.8;
    const dtheta = 0.5, dz = 0.6;
    const theta1 = theta0 + dtheta, z1 = z0 + dz;

    // Path along constant z (Rdθ arc)
    const arcX = [], arcY = [], arcZ = [];
    for (let t = theta0; t <= theta1; t += 0.05) {
        arcX.push(R * Math.cos(t));
        arcY.push(R * Math.sin(t));
        arcZ.push(z0);
    }
    // ensure arc reaches exact endpoint (avoid floating-step truncation)
    arcX.push(R * Math.cos(theta1));
    arcY.push(R * Math.sin(theta1));
    arcZ.push(z0);

    // Path along constant theta (dz line)
    const dzX = [R * Math.cos(theta1), R * Math.cos(theta1)];
    const dzY = [R * Math.sin(theta1), R * Math.sin(theta1)];
    const dzZ = [z0, z1];

    // ds diagonal on surface
    const dsX = [], dsY = [], dsZ = [];
    for (let t = 0; t <= 1; t += 0.05) {
        const theta = theta0 + t * dtheta;
        const z = z0 + t * dz;
        dsX.push(R * Math.cos(theta));
        dsY.push(R * Math.sin(theta));
        dsZ.push(z);
    }
    // ensure diagonal reaches exact endpoint
    dsX.push(R * Math.cos(theta1));
    dsY.push(R * Math.sin(theta1));
    dsZ.push(z1);

    Plotly.newPlot('dsPlotCylinder', [{
        type: 'surface',
        x: xSurf, y: ySurf, z: zSurf,
        // stronger, less transparent surface with simple uniform color and lighting
        colorscale: [[0, 'rgba(70, 90, 130, 0.4)'], [1, 'rgba(70, 90, 130, 0.4)']],
        showscale: false,
        opacity: 0.3,
        lighting: { ambient: 0.8, diffuse: 0.8, specular: 0.2, roughness: 0.9, fresnel: 0.1 },
        lightposition: { x: 100, y: 200, z: 0 },
        contours: { z: { show: false }, x: { show: false }, y: { show: false } }
    }, {
        type: 'scatter3d',
        x: arcX, y: arcY, z: arcZ,
        mode: 'lines',
        line: { color: '#a855f7', width: 6 },
        name: 'R dθ'
    }, {
        type: 'scatter3d',
        x: dzX, y: dzY, z: dzZ,
        mode: 'lines',
        line: { color: '#f59e0b', width: 6 },
        name: 'dz'
    }, {
        type: 'scatter3d',
        x: dsX, y: dsY, z: dsZ,
        mode: 'lines',
        line: { color: '#ff6b6b', width: 9 },
        name: 'ds'
    }, {
        type: 'scatter3d',
        x: [R * Math.cos(theta0), R * Math.cos(theta1)],
        y: [R * Math.sin(theta0), R * Math.sin(theta1)],
        z: [z0, z1],
        mode: 'markers',
        marker: { color: '#ff6b6b', size: 6 }
    }], {
        paper_bgcolor: '#1a1a2e',
        scene: {
            bgcolor: '#1a1a2e',
            xaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
            yaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
            zaxis: { showgrid: true, gridcolor: '#2a3a5a', title: 'z', color: '#eee' },
            camera: { eye: { x: 1.8, y: 1.2, z: 0.8 } },
            aspectmode: 'data',
            annotations: [
                { x: R * Math.cos(theta0 + dtheta / 2), y: R * Math.sin(theta0 + dtheta / 2), z: z0 - 0.15, text: 'dθ', showarrow: false, font: { color: '#a855f7', size: 22, weight: 'bold' } },
                { x: R * Math.cos(theta1) + 0.05, y: R * Math.sin(theta1) + 0.1, z: (z0 + z1) / 2, text: 'dz', showarrow: false, font: { color: '#f59e0b', size: 22, weight: 'bold' } },
                { x: R * Math.cos(theta0 + dtheta / 2) - 0.2, y: R * Math.sin(theta0 + dtheta / 2) - 0.2, z: (z0 + z1) / 2, text: 'ds', showarrow: false, font: { color: '#ff6b6b', size: 24, weight: 'bold' } }
            ]
        },
        font: { color: '#eee' },
        margin: { t: 10, r: 10, b: 10, l: 10 },
        showlegend: false
    }, { responsive: true });
}

// ds diagram for sphere (Slide 20)
function setupDsPlotSphere() {
    const plot = document.getElementById('dsPlotSphere');
    if (!plot) return;

    const R = 1;
    const nPhi = 25, nTheta = 25;

    // Create sphere surface
    const xSurf = [], ySurf = [], zSurf = [];
    for (let i = 0; i <= nTheta; i++) {
        const xRow = [], yRow = [], zRow = [];
        const theta = i * Math.PI / nTheta;
        for (let j = 0; j <= nPhi; j++) {
            const phi = j * 2 * Math.PI / nPhi;
            xRow.push(R * Math.sin(theta) * Math.cos(phi));
            yRow.push(R * Math.sin(theta) * Math.sin(phi));
            zRow.push(R * Math.cos(theta));
        }
        xSurf.push(xRow);
        ySurf.push(yRow);
        zSurf.push(zRow);
    }

    // ds triangle on sphere
    const theta0 = Math.PI / 4, phi0 = 0.2;
    const dtheta = 0.7, dphi = 0.9;
    const theta1 = theta0 + dtheta, phi1 = phi0 + dphi;

    // Path along constant phi (R dθ arc - meridian)
    const arcThetaX = [], arcThetaY = [], arcThetaZ = [];
    for (let t = theta0; t <= theta1; t += 0.02) {
        arcThetaX.push(R * Math.sin(t) * Math.cos(phi0));
        arcThetaY.push(R * Math.sin(t) * Math.sin(phi0));
        arcThetaZ.push(R * Math.cos(t));
    }
    // ensure meridian arc reaches exact endpoint
    arcThetaX.push(R * Math.sin(theta1) * Math.cos(phi0));
    arcThetaY.push(R * Math.sin(theta1) * Math.sin(phi0));
    arcThetaZ.push(R * Math.cos(theta1));

    // Path along constant theta (R sinθ dφ arc - parallel)
    const arcPhiX = [], arcPhiY = [], arcPhiZ = [];
    for (let p = phi0; p <= phi1; p += 0.02) {
        arcPhiX.push(R * Math.sin(theta1) * Math.cos(p));
        arcPhiY.push(R * Math.sin(theta1) * Math.sin(p));
        arcPhiZ.push(R * Math.cos(theta1));
    }
    // ensure parallel arc reaches exact endpoint
    arcPhiX.push(R * Math.sin(theta1) * Math.cos(phi1));
    arcPhiY.push(R * Math.sin(theta1) * Math.sin(phi1));
    arcPhiZ.push(R * Math.cos(theta1));

    // ds geodesic path
    const dsX = [], dsY = [], dsZ = [];
    for (let t = 0; t <= 1; t += 0.02) {
        const theta = theta0 + t * dtheta;
        const phi = phi0 + t * dphi;
        dsX.push(R * Math.sin(theta) * Math.cos(phi));
        dsY.push(R * Math.sin(theta) * Math.sin(phi));
        dsZ.push(R * Math.cos(theta));
    }
    // ensure geodesic reaches exact endpoint
    dsX.push(R * Math.sin(theta1) * Math.cos(phi1));
    dsY.push(R * Math.sin(theta1) * Math.sin(phi1));
    dsZ.push(R * Math.cos(theta1));

    Plotly.newPlot('dsPlotSphere', [{
        type: 'surface',
        x: xSurf, y: ySurf, z: zSurf,
        // stronger sphere colour with lighting to show curvature
        colorscale: [[0, 'rgba(70, 95, 140, 0.4)'], [1, 'rgba(70, 95, 140, 0.4)']],
        showscale: false,
        opacity: 0.3,
        lighting: { ambient: 0.8, diffuse: 0.85, specular: 0.2, roughness: 0.9, fresnel: 0.1 },
        lightposition: { x: 100, y: 150, z: 80 },
        contours: { x: { show: false }, y: { show: false }, z: { show: false } }
    }, {
        type: 'scatter3d',
        x: arcThetaX, y: arcThetaY, z: arcThetaZ,
        mode: 'lines',
        line: { color: '#a855f7', width: 9 },
        name: 'R dθ'
    }, {
        type: 'scatter3d',
        x: arcPhiX, y: arcPhiY, z: arcPhiZ,
        mode: 'lines',
        line: { color: '#00d9ff', width: 9 },
        name: 'R sinθ dϕ'
    }, {
        type: 'scatter3d',
        x: dsX, y: dsY, z: dsZ,
        mode: 'lines',
        line: { color: '#ff6b6b', width: 10 },
        name: 'ds'
    }, {
        type: 'scatter3d',
        x: [R * Math.sin(theta0) * Math.cos(phi0), R * Math.sin(theta1) * Math.cos(phi1)],
        y: [R * Math.sin(theta0) * Math.sin(phi0), R * Math.sin(theta1) * Math.sin(phi1)],
        z: [R * Math.cos(theta0), R * Math.cos(theta1)],
        mode: 'markers',
        marker: { color: '#ff6b6b', size: 9 }
    }], {
        paper_bgcolor: '#1a1a2e',
        scene: {
            bgcolor: '#1a1a2e',
            xaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
            yaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
            zaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
            camera: { eye: { x: 1.6, y: 1.4, z: 1.1 } },
            aspectmode: 'data',
            annotations: [
                { x: R * Math.sin((theta0 + theta1) / 2) * Math.cos(phi0) + 0.3, y: R * Math.sin((theta0 + theta1) / 2) * Math.sin(phi0) - 0.1, z: R * Math.cos((theta0 + theta1) / 2), text: 'dθ', showarrow: false, font: { color: '#a855f7', size: 22, weight: 'bold' } },
                { x: R * Math.sin(theta1) * Math.cos((phi0 + phi1) / 2) + 0.1, y: R * Math.sin(theta1) * Math.sin((phi0 + phi1) / 2) - 0.15, z: R * Math.cos(theta1) - 0.1, text: 'sinθ dϕ', showarrow: false, font: { color: '#00d9ff', size: 22, weight: 'bold' } },
                { x: R * Math.sin((theta0 + theta1) / 2) * Math.cos((phi0 + phi1) / 2) + 0.15, y: R * Math.sin((theta0 + theta1) / 2) * Math.sin((phi0 + phi1) / 2) + 0.15, z: R * Math.cos((theta0 + theta1) / 2) + 0.1, text: 'ds', showarrow: false, font: { color: '#ff6b6b', size: 24, weight: 'bold' } }
            ]
        },
        font: { color: '#eee' },
        margin: { t: 10, r: 10, b: 10, l: 10 },
        showlegend: false
    }, { responsive: true });
}

// Helix on Cylinder (Slide 16)
let helixAnimRunning = false;
let helixAnimId = null;

function setupHelixPlot() {
    const plot = document.getElementById('helixPlot');
    if (!plot) return;

    const slider = document.getElementById('helixPitchSlider');

    function drawHelix(pitch, rotation = 0) {
        const R = 1; // cylinder radius
        const turns = 2;
        const nPoints = 100;

        // Helix points
        const helixX = [], helixY = [], helixZ = [];
        for (let i = 0; i <= nPoints; i++) {
            const z = i / nPoints * turns * 2;
            const theta = pitch * z + rotation;
            helixX.push(R * Math.cos(theta));
            helixY.push(R * Math.sin(theta));
            helixZ.push(z);
        }

        // Cylinder mesh
        const cylTheta = [], cylZ = [], cylX = [], cylY = [];
        for (let t = 0; t <= 2 * Math.PI; t += 0.2) {
            for (let z = 0; z <= turns * 2; z += 0.2) {
                cylX.push(R * Math.cos(t));
                cylY.push(R * Math.sin(t));
                cylZ.push(z);
            }
        }

        // Create cylinder surface
        const thetaGrid = [];
        const zGrid = [];
        for (let i = 0; i <= 20; i++) {
            thetaGrid.push(i * 2 * Math.PI / 20);
        }
        for (let i = 0; i <= 10; i++) {
            zGrid.push(i * turns * 2 / 10);
        }

        const xSurf = [], ySurf = [], zSurf = [];
        for (let j = 0; j < zGrid.length; j++) {
            const xRow = [], yRow = [], zRow = [];
            for (let i = 0; i < thetaGrid.length; i++) {
                xRow.push(R * Math.cos(thetaGrid[i]));
                yRow.push(R * Math.sin(thetaGrid[i]));
                zRow.push(zGrid[j]);
            }
            xSurf.push(xRow);
            ySurf.push(yRow);
            zSurf.push(zRow);
        }

        Plotly.react('helixPlot', [{
            type: 'surface',
            x: xSurf,
            y: ySurf,
            z: zSurf,
            // make cylinder background more visible with lighting
            colorscale: [[0, 'rgba(60, 110, 150, 0.9)'], [1, 'rgba(60, 110, 150, 0.9)']],
            showscale: false,
            opacity: 0.5,
            lighting: { ambient: 0.75, diffuse: 0.8, specular: 0.25, roughness: 0.85 },
            lightposition: { x: 120, y: 150, z: 80 }
        }, {
            type: 'scatter3d',
            x: helixX,
            y: helixY,
            z: helixZ,
            mode: 'lines',
            line: { color: '#00d9ff', width: 12 },
            name: 'Geodesic (helix)'
        }, {
            type: 'scatter3d',
            x: [helixX[0], helixX[nPoints]],
            y: [helixY[0], helixY[nPoints]],
            z: [helixZ[0], helixZ[nPoints]],
            mode: 'markers',
            marker: { color: '#ff6b6b', size: 10 },
            name: 'Endpoints'
        }], {
            paper_bgcolor: '#1a1a2e',
            scene: {
                bgcolor: '#1a1a2e',
                xaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
                yaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false },
                zaxis: { showgrid: true, gridcolor: '#2a3a5a', title: 'z', color: '#eee' },
                camera: { eye: { x: 1.5, y: 1.5, z: 0.8 } },
                aspectmode: 'data'
            },
            font: { color: '#eee' },
            margin: { t: 10, r: 10, b: 10, l: 10 },
            showlegend: false
        }, { responsive: true });
    }

    drawHelix(1);

    if (slider) {
        slider.addEventListener('input', () => {
            drawHelix(parseFloat(slider.value));
        });
    }
}

function toggleHelixAnim() {
    if (helixAnimRunning) {
        cancelAnimationFrame(helixAnimId);
        helixAnimRunning = false;
        // Reset to cylinder view
        setupHelixPlot();
    } else {
        helixAnimRunning = true;
        const R = 1;
        const turns = 2;
        const nPoints = 100;
        const zMax = turns * 2;
        const slider = document.getElementById('helixPitchSlider');
        const pitch = slider ? parseFloat(slider.value) : 1;

        // Total angle the surface wraps (one full turn)
        const thetaMax = 2 * Math.PI;

        let t = 0; // Animation parameter: 0 = cylinder, 1 = flat
        const duration = 3500; // 3.5 seconds
        const startTime = Date.now();

        function animateUnroll() {
            if (!helixAnimRunning) return;

            const elapsed = Date.now() - startTime;
            // Ease in-out
            t = Math.min(1, elapsed / duration);
            const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

            // Helix points - interpolate between cylinder and flat with wrapping
            const helixX = [], helixY = [], helixZ = [];
            let lastThetaWrap = 0;

            for (let i = 0; i <= nPoints; i++) {
                const z = i / nPoints * zMax;
                const theta = pitch * z;
                const currentWrap = Math.floor(theta / (2 * Math.PI));

                // If we wrapped, handle boundary points to reach the exact edge
                if (i > 0 && currentWrap !== lastThetaWrap) {
                    // The wrap occurred between the previous point and this one.
                    // There might be multiple wraps if the pitch is extremely high,
                    // but the floor logic handles them one by one.
                    for (let w = lastThetaWrap + 1; w <= currentWrap; w++) {
                        const zWrap = (2 * Math.PI * w) / pitch;
                        const thetaWrap = 2 * Math.PI * w;

                        // 1. Right Edge Point (at 2*PI)
                        // In flat mode (easeT=1), x should be R * 2*PI
                        const posR = cylPos(thetaWrap, R, 2 * Math.PI, easeT);
                        helixX.push(posR.x);
                        helixY.push(posR.y);
                        helixZ.push(zWrap);

                        // 2. Break
                        helixX.push(null); helixY.push(null); helixZ.push(null);

                        // 3. Left Edge Point (at 0)
                        // In flat mode (easeT=1), x should be 0
                        const posL = cylPos(thetaWrap, R, 0, easeT);
                        helixX.push(posL.x);
                        helixY.push(posL.y);
                        helixZ.push(zWrap);
                    }
                }
                lastThetaWrap = currentWrap;

                const pos = cylPos(theta, R, theta % (2 * Math.PI), easeT);
                helixX.push(pos.x);
                helixY.push(pos.y);
                helixZ.push(z);
            }

            function cylPos(theta, R, flatTheta, easeT) {
                const cx = R * Math.cos(theta);
                const cy = R * Math.sin(theta);
                const fx = R * flatTheta;
                return {
                    x: cx * (1 - easeT) + fx * easeT,
                    y: cy * (1 - easeT)
                };
            }

            // Create surface - cylinder morphing to flat rectangle
            const nTheta = 30, nZ = 12;
            const xSurf = [], ySurf = [], zSurf = [];

            for (let j = 0; j <= nZ; j++) {
                const xRow = [], yRow = [], zRow = [];
                const zVal = j / nZ * zMax;

                for (let i = 0; i <= nTheta; i++) {
                    const theta = i * 2 * Math.PI / nTheta;

                    // Cylinder position
                    const cylX = R * Math.cos(theta);
                    const cylY = R * Math.sin(theta);

                    // Flat position (rectangle)
                    const flatX = R * theta;
                    const flatY = 0;

                    xRow.push(cylX * (1 - easeT) + flatX * easeT);
                    yRow.push(cylY * (1 - easeT) + flatY * easeT);
                    zRow.push(zVal);
                }
                xSurf.push(xRow);
                ySurf.push(yRow);
                zSurf.push(zRow);
            }

            // Calculate axis ranges
            const xMax = R * 2 * Math.PI;

            // Constant distance camera animation
            const dist = 2.5;
            const angle = (Math.PI / 2) * easeT;
            const camX = dist * Math.cos(angle);
            const camY = dist * Math.sin(angle);
            const camZ = 1.2 * (1 - easeT) + 0.8 * easeT;

            // moving marker index along helix
            const prog = Math.min(1, elapsed / duration);
            const markerIdx = Math.round(prog * nPoints);
            const markerX = helixX[Math.min(markerIdx, helixX.length - 1)];
            const markerY = helixY[Math.min(markerIdx, helixY.length - 1)];
            const markerZ = helixZ[Math.min(markerIdx, helixZ.length - 1)];

            Plotly.react('helixPlot', [{
                type: 'surface',
                x: xSurf,
                y: ySurf,
                z: zSurf,
                colorscale: [[0, 'rgba(60, 110, 150, 0.9)'], [1, 'rgba(60, 110, 150, 0.9)']],
                showscale: false,
                opacity: 0.78,
                lighting: { ambient: 0.75, diffuse: 0.8, specular: 0.25, roughness: 0.85 },
                lightposition: { x: 120, y: 150, z: 80 }
            }, {
                type: 'scatter3d',
                x: helixX,
                y: helixY,
                z: helixZ,
                mode: 'lines',
                line: { color: '#00d9ff', width: 12 },
                name: 'Geodesic (helix)'
            }, {
                type: 'scatter3d',
                x: [helixX[0], helixX[helixX.length - 1]],
                y: [helixY[0], helixY[helixY.length - 1]],
                z: [helixZ[0], helixZ[helixZ.length - 1]],
                mode: 'markers',
                marker: { color: '#ff6b6b', size: 10 },
                name: 'Endpoints'
            }, {
                type: 'scatter3d',
                x: [markerX],
                y: [markerY],
                z: [markerZ],
                mode: 'markers',
                marker: {
                    color: '#ffff66',
                    size: 12,
                    symbol: 'circle',
                    opacity: easeT > 0.98 ? 0 : 1 // Hide at the end
                },
                name: 'Moving point'
            }], {
                paper_bgcolor: '#1a1a2e',
                scene: {
                    bgcolor: '#1a1a2e',
                    xaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false, range: [-xMax * 0.1, xMax * 1.1] },
                    yaxis: { showgrid: true, gridcolor: '#2a3a5a', title: '', showticklabels: false, range: [-R * 1.5, R * 1.5] },
                    zaxis: { showgrid: true, gridcolor: '#2a3a5a', title: 'z', color: '#eee' },
                    camera: { eye: { x: camX, y: camY, z: camZ } },
                    aspectmode: 'data'
                },
                font: { color: '#eee' },
                margin: { t: 10, r: 10, b: 10, l: 10 },
                showlegend: false,
                annotations: easeT > 0.9 ? [{
                    x: 0.5, y: 0.95, xref: 'paper', yref: 'paper',
                    text: 'Helix → Straight line!',
                    showarrow: false,
                    font: { color: '#4ade80', size: 16 }
                }] : []
            }, { responsive: true });

            if (t < 1) {
                helixAnimId = requestAnimationFrame(animateUnroll);
            } else {
                // Hold at the end for a moment, then stay there
                helixAnimRunning = false;
            }
        }
        animateUnroll();
    }
}

// Sphere Geodesic (Slide 17)
let sphereAnimRunning = false;
let sphereAnimId = null;

function setupSpherePlot() {
    const plot = document.getElementById('spherePlot');
    if (!plot) return;

    drawSphereGeodesic(0);
}

function drawSphereGeodesic(rotation) {
    const R = 1;
    const nPhi = 30, nTheta = 30;

    // Create sphere surface
    const xSurf = [], ySurf = [], zSurf = [];
    for (let i = 0; i <= nTheta; i++) {
        const theta = i * Math.PI / nTheta;
        const xRow = [], yRow = [], zRow = [];
        for (let j = 0; j <= nPhi; j++) {
            const phi = j * 2 * Math.PI / nPhi;
            xRow.push(R * Math.sin(theta) * Math.cos(phi));
            yRow.push(R * Math.sin(theta) * Math.sin(phi));
            zRow.push(R * Math.cos(theta));
        }
        xSurf.push(xRow);
        ySurf.push(yRow);
        zSurf.push(zRow);
    }

    // Great circle (tilted equator)
    const gcX = [], gcY = [], gcZ = [];
    const tilt = Math.PI / 4; // 45 degree tilt
    for (let t = 0; t <= 2 * Math.PI; t += 0.05) {
        const x = R * Math.cos(t + rotation);
        const y = R * Math.sin(t + rotation) * Math.cos(tilt);
        const z = R * Math.sin(t + rotation) * Math.sin(tilt);
        gcX.push(x);
        gcY.push(y);
        gcZ.push(z);
    }

    // Second great circle (meridian)
    const gc2X = [], gc2Y = [], gc2Z = [];
    for (let t = 0; t <= 2 * Math.PI; t += 0.05) {
        const x = R * Math.cos(t) * Math.cos(rotation * 0.5);
        const y = R * Math.cos(t) * Math.sin(rotation * 0.5);
        const z = R * Math.sin(t);
        gc2X.push(x);
        gc2Y.push(y);
        gc2Z.push(z);
    }

    // add small moving marker and improved surface lighting
    // moving marker position will be chosen from gcX/gcY/gcZ based on rotation
    const tParam = (rotation % (2 * Math.PI)) / (2 * Math.PI);
    const idx = Math.round(tParam * (gcX.length - 1));
    const markerX = gcX[Math.max(0, Math.min(gcX.length - 1, idx))];
    const markerY = gcY[Math.max(0, Math.min(gcY.length - 1, idx))];
    const markerZ = gcZ[Math.max(0, Math.min(gcZ.length - 1, idx))];

    // camera slowly orbits for motion
    const camX = 1.6 * Math.cos(rotation * 0.12) + 0.01;
    const camY = 1.6 * Math.sin(rotation * 0.12) + 0.01;
    const camZ = 1.1;

    Plotly.react('spherePlot', [{
        type: 'surface',
        x: xSurf,
        y: ySurf,
        z: zSurf,
        colorscale: [[0, 'rgba(60, 105, 160, 0.92)'], [1, 'rgba(60, 105, 160, 0.92)']],
        showscale: false,
        opacity: 0.5,
        lighting: { ambient: 0.78, diffuse: 0.85, specular: 0.22, roughness: 0.9 },
        lightposition: { x: 100, y: 120, z: 60 }
    }, {
        type: 'scatter3d',
        x: gcX,
        y: gcY,
        z: gcZ,
        mode: 'lines',
        line: { color: '#00d9ff', width: 12 },
        name: 'Great circle 1'
    }, {
        type: 'scatter3d',
        x: gc2X,
        y: gc2Y,
        z: gc2Z,
        mode: 'lines',
        line: { color: '#ff6b6b', width: 10 },
        name: 'Great circle 2'
    }, {
        type: 'scatter3d',
        x: [markerX],
        y: [markerY],
        z: [markerZ],
        mode: 'markers',
        marker: {
            color: '#ffff66',
            size: 12,
            symbol: 'circle',
            opacity: sphereAnimRunning ? 1 : 0 // Hide when stopped
        },
        name: 'Moving point'
    }], {
        paper_bgcolor: '#1a1a2e',
        scene: {
            bgcolor: '#1a1a2e',
            xaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            yaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            zaxis: { showgrid: false, zeroline: false, showticklabels: false, title: '' },
            camera: { eye: { x: camX, y: camY, z: camZ } },
            aspectmode: 'data'
        },
        font: { color: '#eee' },
        margin: { t: 10, r: 10, b: 10, l: 10 },
        showlegend: false
    }, { responsive: true });
}

function toggleSphereAnim() {
    if (sphereAnimRunning) {
        cancelAnimationFrame(sphereAnimId);
        sphereAnimRunning = false;
    } else {
        sphereAnimRunning = true;
        let rotation = 0;

        function animate() {
            if (!sphereAnimRunning) return;
            rotation += 0.02;
            drawSphereGeodesic(rotation);
            sphereAnimId = requestAnimationFrame(animate);
        }
        animate();
    }
}

// Kepler's Second Law
let keplerAnimRunning = false;
let keplerAnimId = null;
let keplerAreaAnimRunning = false;
let keplerAreaAnimId = null;
let keplerTheta = Math.PI / 4;  // Current angle in animation
let keplerSectors = [];  // Array of swept sectors
let keplerSweeping = false;  // Currently sweeping an area?
let keplerSweepStart = null;  // Starting theta for current sweep
let keplerSweepStartTime = null;  // Start time for sweep
const keplerSweepDuration = 330;  // 0.33 second sweep
const keplerSectorColors = ['rgba(74, 222, 128, 0.5)', 'rgba(255, 107, 107, 0.5)', 'rgba(0, 217, 255, 0.5)', 'rgba(245, 158, 11, 0.5)', 'rgba(168, 85, 247, 0.5)'];

function setupKeplerPlot() {
    const plot = document.getElementById('keplerPlot');
    if (!plot) return;

    // Reset state
    keplerSectors = [];
    keplerSweeping = false;
    keplerTheta = Math.PI / 4;
    // Elliptical orbit parameters
    const a = 1.5;  // semi-major axis
    const e = 0.6;  // eccentricity (fixed for the Second Law slide)
    const b = a * Math.sqrt(1 - e * e);  // semi-minor axis
    const c = a * e;  // focus distance from center

    // Generate ellipse points
    const orbitX = [], orbitY = [];
    for (let theta = 0; theta <= 2 * Math.PI + 0.1; theta += 0.02) {
        const r = a * (1 - e * e) / (1 + e * Math.cos(theta));
        orbitX.push(r * Math.cos(theta));
        orbitY.push(r * Math.sin(theta));
    }

    // Initial planet position
    const r0 = a * (1 - e * e) / (1 + e * Math.cos(keplerTheta));

    Plotly.newPlot('keplerPlot', [{
        // Orbit path
        x: orbitX, y: orbitY,
        mode: 'lines',
        line: { color: '#00d9ff', width: 2 },
        name: 'Orbit'
    }, {
        // Sun at focus
        x: [0], y: [0],
        mode: 'markers',
        marker: { color: '#f59e0b', size: 20, symbol: 'circle' },
        name: 'Sun'
    }, {
        // Planet
        x: [r0 * Math.cos(keplerTheta)], y: [r0 * Math.sin(keplerTheta)],
        mode: 'markers',
        marker: { color: '#4ade80', size: 12 },
        name: 'Planet'
    }, {
        // Radius vector
        x: [0, r0 * Math.cos(keplerTheta)], y: [0, r0 * Math.sin(keplerTheta)],
        mode: 'lines',
        line: { color: '#ff6b6b', width: 2, dash: 'dot' },
        name: 'r'
    }], {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { showgrid: true, gridcolor: '#2a3a5a', zeroline: false, scaleanchor: 'y', range: [-2.5, 2] },
        yaxis: { showgrid: true, gridcolor: '#2a3a5a', zeroline: false, range: [-2, 2] },
        margin: { t: 20, r: 20, b: 20, l: 20 },
        showlegend: false
    }, { responsive: true });

    // No dynamic slider on this slide (Second Law demonstration uses a fixed e)
}

function keplerSweep() {
    if (keplerAnimRunning && !keplerSweeping) {
        keplerSweeping = true;
        keplerSweepStart = keplerTheta;
        keplerSweepStartTime = performance.now();
    }
}

function startKeplerSweep() {
    keplerSweeping = true;
    keplerSweepStart = keplerTheta;
    keplerSweepStartTime = performance.now();
}

function finishKeplerSweep(endTheta) {
    const a = 1.5, e = 0.6;
    const p = a * (1 - e * e);

    // Generate sector points - start at origin
    const sectorX = [0], sectorY = [0];
    let th = keplerSweepStart;
    const step = 0.02;

    // Handle wrap-around
    let endTh = endTheta;
    if (endTh < keplerSweepStart) {
        endTh += 2 * Math.PI;
    }

    while (th <= endTh) {
        const thMod = th % (2 * Math.PI);
        const r = p / (1 + e * Math.cos(thMod));
        sectorX.push(r * Math.cos(thMod));
        sectorY.push(r * Math.sin(thMod));
        th += step;
    }
    // Close the path back to origin
    sectorX.push(0);
    sectorY.push(0);

    // Add sector trace
    const colorIdx = keplerSectors.length % keplerSectorColors.length;
    const fillColor = keplerSectorColors[colorIdx];
    const lineColor = fillColor.replace('0.5)', '1)');

    Plotly.addTraces('keplerPlot', {
        type: 'scatter',
        x: sectorX,
        y: sectorY,
        mode: 'lines',
        fill: 'toself',
        fillcolor: fillColor,
        line: { color: lineColor, width: 1 },
        name: 'Area ' + (keplerSectors.length + 1),
        hoverinfo: 'skip'
    });

    keplerSectors.push({ start: keplerSweepStart, end: endTheta });
    keplerSweeping = false;
}

function toggleKeplerAnim() {
    if (keplerAnimRunning) {
        cancelAnimationFrame(keplerAnimId);
        keplerAnimRunning = false;
    } else {
        // Clear any existing sectors before starting
        if (keplerSectors.length > 0) {
            // Remove sector traces (indices 4 and above)
            const indicesToRemove = [];
            for (let i = 4; i < 4 + keplerSectors.length; i++) {
                indicesToRemove.push(i);
            }
            if (indicesToRemove.length > 0) {
                Plotly.deleteTraces('keplerPlot', indicesToRemove);
            }
            keplerSectors = [];
        }

        keplerAnimRunning = true;
        const a = 1.5, e = 0.6;

        function animate() {
            if (!keplerAnimRunning) return;

            const r = a * (1 - e * e) / (1 + e * Math.cos(keplerTheta));
            // Kepler's second law: r^2 * dtheta/dt = const
            // So dtheta ∝ 1/r^2 (faster when closer)
            const dtheta = 0.03 / (r * r);
            keplerTheta += dtheta;
            if (keplerTheta > 2 * Math.PI) keplerTheta -= 2 * Math.PI;

            const x = r * Math.cos(keplerTheta);
            const y = r * Math.sin(keplerTheta);

            Plotly.restyle('keplerPlot', {
                x: [[x], [0, x]],
                y: [[y], [0, y]]
            }, [2, 3]);

            // Check if we're sweeping and if time is up
            if (keplerSweeping) {
                const elapsed = performance.now() - keplerSweepStartTime;
                if (elapsed >= keplerSweepDuration) {
                    finishKeplerSweep(keplerTheta);
                }
            }

            keplerAnimId = requestAnimationFrame(animate);
        }
        animate();
    }
}

// Kepler First Law static plot (slide 25)
function setupKeplerFirstPlot() {
    const plotId = 'keplerFirstPlot';
    const plot = document.getElementById(plotId);
    if (!plot) return;

    const slider = document.getElementById('keplerFirstEccSlider');
    const display = document.getElementById('keplerFirstEccValue');
    const a = 1.5;
    let e = slider ? parseFloat(slider.value) : 0.6;

    function buildOrbit(ecc) {
        const xs = [], ys = [];
        for (let theta = 0; theta <= 2 * Math.PI + 0.01; theta += 0.02) {
            const r = a * (1 - ecc * ecc) / (1 + ecc * Math.cos(theta));
            xs.push(r * Math.cos(theta));
            ys.push(r * Math.sin(theta));
        }
        return { x: xs, y: ys };
    }

    const orbit = buildOrbit(e);
    Plotly.newPlot(plotId, [{ x: orbit.x, y: orbit.y, mode: 'lines', line: { color: '#00d9ff', width: 2 } }, {
        x: [0], y: [0], mode: 'markers', marker: { color: '#f59e0b', size: 18 }
    }], {
        paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', font: { color: '#eee' },
        xaxis: { scaleanchor: 'y', range: [-2.5, 2] }, yaxis: { range: [-2, 2] }, margin: { t: 10, r: 10, b: 30, l: 10 }, showlegend: false
    }, { responsive: true });

    if (slider) {
        display.textContent = e.toFixed(2);
        slider.addEventListener('input', () => {
            const newE = parseFloat(slider.value);
            display.textContent = newE.toFixed(2);
            const newOrbit = buildOrbit(newE);
            Plotly.restyle(plotId, { x: [newOrbit.x], y: [newOrbit.y] }, [0]);
        });
    }
}

// Brachistochrone Setup
function setupBrachistochroneSetup() {
    const plot = document.getElementById('brachistochroneSetupPlot');
    if (!plot || plot.data) return;

    Plotly.newPlot('brachistochroneSetupPlot', [{
        x: [0], y: [0],
        mode: 'markers+text',
        marker: { color: '#4ade80', size: 15 },
        text: ['A (start)'],
        textposition: 'top right',
        textfont: { color: '#eee' }
    }, {
        x: [3], y: [2],
        mode: 'markers+text',
        marker: { color: '#ff6b6b', size: 15 },
        text: ['B (end)'],
        textposition: 'bottom left',
        textfont: { color: '#eee' }
    }], {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { title: 'x', gridcolor: '#2a3a5a', range: [-0.5, 4] },
        yaxis: { title: 'y (down)', gridcolor: '#2a3a5a', range: [-0.5, 3], autorange: 'reversed' },
        margin: { t: 20, r: 20, b: 50, l: 50 },
        showlegend: false,
        annotations: [{
            x: 1.5, y: 1.5,
            text: '?',
            showarrow: false,
            font: { size: 40, color: '#00d9ff' }
        }]
    }, { responsive: true });
}

// Race Plot (Slide 20)
function setupRacePlot(endpointX, endpointY) {
    // Helper to build the layout annotations for the race plot so we can
    // reapply them reliably after Plotly operations that may reset layout.
    function getRaceAnnotations(Xval, Yval) {
        return [
            { x: -0.08, y: 0.5, xref: 'paper', yref: 'paper', text: 'y', showarrow: false, font: { color: '#eee', size: 14 } },
            { x: 0, y: 0, xref: 'x', yref: 'y', text: 'A', showarrow: false, font: { color: '#eee', size: 24 }, xshift: -18, yshift: 18 },
            { x: Xval, y: Yval, xref: 'x', yref: 'y', text: 'B', showarrow: false, font: { color: '#eee', size: 24 }, xshift: 18, yshift: 18 }
        ];
    }

    const plot = document.getElementById('racePlot');
    if (!plot) return;

    // Use provided endpoint or default to (4, 1.5)
    const X = (endpointX !== undefined) ? endpointX : (window.raceXY ? window.raceXY.X : 4);
    const Y = (endpointY !== undefined) ? endpointY : (window.raceXY ? window.raceXY.Y : 1.5);

    // store current race endpoints so other functions can reapply annotations
    window.raceXY = { X: X, Y: Y };

    // Whether to hide full curve names and use generic C_1, C_2... labels
    // Default true so the plot initially refers to curves as C_1, C_2, ...
    if (typeof window.raceHideNames === 'undefined') window.raceHideNames = true;

    // Helper: build a cycloid path that exactly hits (X,Y)
    function computeCycloidPath(X, Y, dtheta = 0.02) {
        if (X <= 0) return { x: [], y: [], thetaF: 0 };

        // Special case: if Y = 0, use a complete cycloid arch (one full rotation)
        // For a cycloid with Y=0, we have theta_f = 2π and the horizontal distance is 2πa
        // So a = X/(2π) to reach exactly X
        if (Math.abs(Y) < 1e-9) {
            const thetaF = 2 * Math.PI;
            const a = X / thetaF;  // Scale factor to reach X at theta = 2π
            const xs = [], ys = [];
            for (let th = 0; th <= thetaF + 1e-9; th += dtheta) {
                xs.push(a * (th - Math.sin(th)));
                ys.push(a * (1 - Math.cos(th)));
            }
            // ensure final point is exactly (X, 0)
            if (xs.length === 0 || Math.abs(xs[xs.length - 1] - X) > 1e-6 || Math.abs(ys[ys.length - 1]) > 1e-6) {
                xs.push(X);
                ys.push(0);
            }
            return { x: xs, y: ys, thetaF };
        }

        // General case: Y > 0
        // Solve for theta_f satisfying X/Y = (theta - sin theta)/(1 - cos theta)
        const target = X / Y;
        let lo = 1e-6, hi = Math.PI * 2 - 1e-6;
        // bisection
        for (let i = 0; i < 60; i++) {
            const mid = 0.5 * (lo + hi);
            const val = (mid - Math.sin(mid)) / (1 - Math.cos(mid));
            if (val > target) hi = mid; else lo = mid;
        }
        const thetaF = 0.5 * (lo + hi);
        const a = Y / (1 - Math.cos(thetaF));
        const xs = [], ys = [];
        for (let th = 0; th <= thetaF + 1e-9; th += dtheta) {
            xs.push(a * (th - Math.sin(th)));
            ys.push(a * (1 - Math.cos(th)));
        }
        // ensure final point is exactly (X,Y)
        if (xs.length === 0 || Math.abs(xs[xs.length - 1] - X) > 1e-6 || Math.abs(ys[ys.length - 1] - Y) > 1e-6) {
            xs.push(X); ys.push(Y);
        }
        return { x: xs, y: ys, thetaF };
    }

    // Line
    const lineX = [], lineY = [];
    for (let t = 0; t <= 1; t += 0.01) {
        lineX.push(t * X);
        lineY.push(t * Y);
    }
    // ensure line ends exactly at (X,Y)
    if (lineX.length === 0 || Math.abs(lineX[lineX.length - 1] - X) > 1e-9 || Math.abs(lineY[lineY.length - 1] - Y) > 1e-9) {
        lineX.push(X); lineY.push(Y);
    }

    // Parabola
    const parA = Y / (X * X);
    const parX = [], parY = [];
    for (let x = 0; x <= X; x += 0.04) {
        parX.push(x);
        parY.push(parA * x * x);
    }
    // ensure parabola ends exactly at (X,Y)
    if (parX.length === 0 || Math.abs(parX[parX.length - 1] - X) > 1e-9 || Math.abs(parY[parY.length - 1] - Y) > 1e-9) {
        parX.push(X); parY.push(Y);
    }

    // Exponential curve removed from this race; omitted per user request

    // Cycloid: generate to match endpoint (X,Y)
    const cycloid = computeCycloidPath(X, Y, 0.02);
    const cycX = cycloid.x, cycY = cycloid.y;

    // Deep dip curve: starts at (0,0), ends at (X,Y), but dips deeper than the cycloid
    // Construct as baseline linear ramp plus a sine bump so endpoints remain fixed
    // When Y=0, use a fixed amplitude to create an interesting dip-and-return path
    const deepA = (Math.abs(Y) < 1e-9) ? 1.5 : (1.0 * Y); // amplitude of the additional dip
    const deepX = [], deepY = [];
    for (let x = 0; x <= X; x += 0.02) {
        deepX.push(x);
        // baseline linear interpolation plus sine bump (zero at endpoints)
        const baseline = (x / X) * Y;
        const bump = deepA * Math.sin(Math.PI * x / X);
        deepY.push(baseline + bump);
    }
    // ensure exact endpoint
    if (deepX.length === 0 || Math.abs(deepX[deepX.length - 1] - X) > 1e-9 || Math.abs(deepY[deepY.length - 1] - Y) > 1e-9) {
        deepX.push(X); deepY.push(Y);
    }

    // Quintic curve: pass through (0,0), (1,2), (2,1), (X,Y) and enforce y''(0)=0, y''(X)=0
    // Solve for coefficients of y = a5*x^5 + a4*x^4 + a3*x^3 + a2*x^2 + a1*x + a0 (a0 can be 0)
    function solveLinear(A, b) {
        // Gaussian elimination (in-place copies)
        const n = A.length;
        const M = A.map(row => row.slice());
        const rhs = b.slice();
        for (let k = 0; k < n; k++) {
            // find pivot
            let iMax = k;
            for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[iMax][k])) iMax = i;
            if (Math.abs(M[iMax][k]) < 1e-12) continue;
            // swap
            [M[k], M[iMax]] = [M[iMax], M[k]];
            [rhs[k], rhs[iMax]] = [rhs[iMax], rhs[k]];
            // normalize and eliminate
            const pivot = M[k][k];
            for (let j = k; j < n; j++) M[k][j] /= pivot;
            rhs[k] /= pivot;
            for (let i = 0; i < n; i++) {
                if (i === k) continue;
                const factor = M[i][k];
                for (let j = k; j < n; j++) M[i][j] -= factor * M[k][j];
                rhs[i] -= factor * rhs[k];
            }
        }
        return rhs;
    }

    const qX = [], qY = [];
    try {
        // Build 6x6 system for [a5,a4,a3,a2,a1,a0]
        // We will include y(0)=0 which simplifies the first row
        const A = [];
        const bvec = [];
        // y(0)=0
        A.push([0, 0, 0, 0, 0, 1]); bvec.push(0);
        // y(1)=2
        A.push([1, 1, 1, 1, 1, 1]); bvec.push(2);
        // y(2)=1
        A.push([32, 16, 8, 4, 2, 1]); bvec.push(1);
        // y(X)=Y
        A.push([Math.pow(X, 5), Math.pow(X, 4), Math.pow(X, 3), Math.pow(X, 2), X, 1]); bvec.push(Y);
        // y''(0)=0 => 2*a2 = 0
        A.push([0, 0, 0, 2, 0, 0]); bvec.push(0);
        // y''(X)=0 => 20*a5*X^3 + 12*a4*X^2 + 6*a3*X + 2*a2 = 0
        A.push([20 * Math.pow(X, 3), 12 * Math.pow(X, 2), 6 * X, 2, 0, 0]); bvec.push(0);

        const coeffs = solveLinear(A, bvec); // [a5,a4,a3,a2,a1,a0]
        // Sample the polynomial and, if it goes below 0, adjust it smoothly
        // by adding a multiple of a basis function that vanishes at the
        // interpolation points (0,1,2,X). This preserves the exact values
        // at those points while allowing the curve to be lifted where needed.
        const samplesX = [];
        const samplesY = [];
        for (let xx = 0; xx <= X; xx += 0.02) {
            const yy = coeffs[0] * Math.pow(xx, 5) + coeffs[1] * Math.pow(xx, 4) + coeffs[2] * Math.pow(xx, 3) + coeffs[3] * Math.pow(xx, 2) + coeffs[4] * xx + coeffs[5];
            samplesX.push(xx); samplesY.push(yy);
        }

        // basis function B(x) = x*(x-1)*(x-2)*(x-X) vanishes at 0,1,2,X
        function B(x) { return x * (x - 1) * (x - 2) * (x - X); }

        // iterative correction: add c*B(x) where c is chosen to lift the
        // current global minimum to >= 0. Repeat if new minima appear.
        let corr = 0;
        const maxIter = 20;
        for (let iter = 0; iter < maxIter; iter++) {
            // compute current adjusted values
            const adjY = samplesY.map((y, idx) => y + corr * B(samplesX[idx]));
            // find min and index
            let minVal = Infinity, minIdx = -1;
            for (let i = 0; i < adjY.length; i++) {
                if (adjY[i] < minVal) { minVal = adjY[i]; minIdx = i; }
            }
            if (minVal >= 0) break;
            const bx = B(samplesX[minIdx]);
            // if basis is zero (shouldn't happen except at interpolation points),
            // fall back to a small uniform lift
            if (Math.abs(bx) < 1e-12) { corr += -minVal + 1e-6; continue; }
            // choose correction to make value at minIdx become zero
            const dc = -minVal / bx;
            corr += dc;
            // iterate - this will preserve values at interpolation points
        }

        // produce final sampled curve
        for (let i = 0; i < samplesX.length; i++) { qX.push(samplesX[i]); qY.push(samplesY[i] + corr * B(samplesX[i])); }
        if (qX.length === 0 || Math.abs(qX[qX.length - 1] - X) > 1e-9) { qX.push(X); qY.push(Y); }
    } catch (e) {
        for (let t = 0; t <= 1; t += 0.02) { qX.push(t * X); qY.push(t * Y); }
    }

    // Build the race traces into an array so we can compute tight axis ranges
    // When Y=0, exclude Line and Parabola as they're not interesting (both are just straight horizontal lines)
    const raceData = [];
    let curveLabels;

    if (Math.abs(Y) >= 1e-9) {
        // Y > 0: Include all curves with original labels
        const baseNames = ['Line', 'Parabola', 'Cycloid', 'Line-then-Sine', 'Quintic', 'Drop-then-Glide'];
        const shortNames = ['C₁', 'C₂', 'C₃', 'C₄', 'C₅', 'C₆'];
        curveLabels = (window.raceHideNames ? shortNames : baseNames);

        raceData.push({ x: lineX, y: lineY, mode: 'lines', line: { color: '#ff6b6b', width: 3 }, name: curveLabels[0] });
        raceData.push({ x: parX, y: parY, mode: 'lines', line: { color: '#fbbf24', width: 3 }, name: curveLabels[1] });
        raceData.push({ x: cycX, y: cycY, mode: 'lines', line: { color: '#00d9ff', width: 3 }, name: curveLabels[2] });
        raceData.push({ x: deepX, y: deepY, mode: 'lines', line: { color: '#7cf1a5', width: 3, dash: 'dot' }, name: curveLabels[3] });
        raceData.push({ x: qX, y: qY, mode: 'lines', line: { color: '#a78bfa', width: 3, dash: 'dashdot' }, name: curveLabels[4] });
    } else {
        // Y = 0: Exclude Line and Parabola, renumber remaining curves
        const baseNames = ['Cycloid', 'Line-then-Sine', 'Quintic', 'Drop-then-Glide'];
        const shortNames = ['C₁', 'C₂', 'C₃', 'C₄'];
        curveLabels = (window.raceHideNames ? shortNames : baseNames);

        raceData.push({ x: cycX, y: cycY, mode: 'lines', line: { color: '#a78bfa', width: 3 }, name: curveLabels[0] });
        raceData.push({ x: deepX, y: deepY, mode: 'lines', line: { color: '#7cf1a5', width: 3, dash: 'dot' }, name: curveLabels[1] });
        raceData.push({ x: qX, y: qY, mode: 'lines', line: { color: '#00d9ff', width: 3, dash: 'dashdot' }, name: curveLabels[2] });
    }


    // build Drop-then-Glide arrays separately to avoid nested IIFEs inside object literals
    (function buildDropPath() {
        const vx = [], vy = [];
        const y0 = Math.max(Y + 0.5, 1.0);
        const nDrop = 4;
        for (let i = 0; i <= nDrop; i++) { vx.push(0); vy.push(y0 * (i / nDrop)); }
        const P0x = 0, P0y = y0, P1x = X, P1y = Y;
        const d0 = Math.max(1.0, 6 * (y0 - Y));
        const d1 = Math.max(1.0, 6 * X);
        function hermite(t, P0, P1, D0, D1) {
            const h00 = 2 * t * t * t - 3 * t * t + 1;
            const h10 = t * t * t - 2 * t * t + t;
            const h01 = -2 * t * t * t + 3 * t * t;
            const h11 = t * t * t - t * t;
            return {
                x: h00 * P0[0] + h10 * D0[0] + h01 * P1[0] + h11 * D1[0],
                y: h00 * P0[1] + h10 * D0[1] + h01 * P1[1] + h11 * D1[1]
            };
        }
        const P0 = [P0x, P0y], P1 = [P1x, P1y], D0 = [0, d0], D1 = [d1, 0];
        const nHerm = 120;
        for (let k = 1; k <= nHerm; k++) {
            const t = k / nHerm;
            const p = hermite(t, P0, P1, D0, D1);
            vx.push(p.x); vy.push(p.y);
        }
        // Use correct label index: 5 when Y>0 (6 curves), 3 when Y=0 (4 curves)
        const labelIdx = (Math.abs(Y) >= 1e-9) ? 5 : 3;
        raceData.push({ x: vx, y: vy, mode: 'lines', line: { color: '#ff9f43', width: 3, dash: 'longdash' }, name: curveLabels[labelIdx] });
    })();


    // start/end markers
    raceData.push({ x: [0], y: [0], mode: 'markers', marker: { color: '#4ade80', size: 12 }, showlegend: false });
    raceData.push({ x: [X], y: [Y], mode: 'markers', marker: { color: '#ff6b6b', size: 12 }, showlegend: false });

    // gather numerical extents from the constructed traces
    const allXs = [];
    const allYs = [];
    for (let ti = 0; ti < raceData.length; ti++) {
        const tr = raceData[ti];
        if (Array.isArray(tr.x)) for (let i = 0; i < tr.x.length; i++) if (isFinite(tr.x[i])) allXs.push(tr.x[i]);
        if (Array.isArray(tr.y)) for (let i = 0; i < tr.y.length; i++) if (isFinite(tr.y[i])) allYs.push(tr.y[i]);
    }
    const minX = allXs.length ? Math.min.apply(null, allXs) : -0.5;
    const maxX = allXs.length ? Math.max.apply(null, allXs) : X;
    const minY = allYs.length ? Math.min.apply(null, allYs) : -0.3;
    const maxY = allYs.length ? Math.max.apply(null, allYs) : Math.max(Y + 0.5, 1.5);
    const xPad = Math.max(0.2, 0.06 * Math.abs(maxX - minX));
    const yPad = Math.max(0.4, 0.12 * Math.abs(maxY - minY));
    const xRangeInit = [minX - xPad, maxX + xPad];
    const yRangeInit = [minY - yPad, maxY + yPad];

    const layout = {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { title: 'x', gridcolor: '#2a3a5a', range: xRangeInit },
        yaxis: { gridcolor: '#2a3a5a', range: yRangeInit, autorange: 'reversed' },
        margin: { t: 20, r: 140, b: 50, l: 60 },
        showlegend: true,
        // move legend to the right and slightly outside the plotting area
        legend: { x: 1.02, y: 0.98, xanchor: 'left', yanchor: 'top', bgcolor: 'rgba(0,0,0,0.25)', font: { size: 18 } },
        annotations: getRaceAnnotations(X, Y)
    };

    Plotly.newPlot('racePlot', raceData, layout, { responsive: true });
}

// Race animation — physics-accurate time-parameterized implementation
function startRace() {
    // Prevent multiple runs started concurrently
    if (raceAnimation) return;

    // Read gravity from slider if available
    const gSlider = document.getElementById('gravitySlider');
    const g = gSlider ? Math.max(0.01, parseFloat(gSlider.value) || 0.5) : 0.5;
    const plotId = 'racePlot';
    const gd = document.getElementById(plotId);
    if (!gd || !gd.data || gd.data.length < 3) return;

    // Read existing traces for the plotted paths (any trace with lines)
    const readPts = (trace) => {
        const xs = trace.x || [];
        const ys = trace.y || [];
        const pts = [];
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) pts.push({ x: xs[i], y: ys[i] });
        return pts;
    };

    // Collect all line traces (paths) to animate
    const pathTraces = (gd.data || []).filter(tr => Array.isArray(tr.x) && Array.isArray(tr.y) && tr.mode && tr.mode.indexOf('lines') !== -1);
    if (pathTraces.length === 0) return;
    const pathPtsList = pathTraces.map(readPts);

    function computeTimes(pts) {
        const segLen = [], segDt = [], cum = [0];
        for (let i = 0; i < pts.length - 1; i++) {
            const dx = pts[i + 1].x - pts[i].x;
            const dy = pts[i + 1].y - pts[i].y;
            const ds = Math.hypot(dx, dy);
            segLen.push(ds);
            const yMid = Math.max(1e-4, 0.5 * (pts[i].y + pts[i + 1].y));
            const v = Math.sqrt(2 * g * yMid);
            const dt = v > 1e-9 ? ds / v : 1e9;
            segDt.push(dt);
            cum.push(cum[cum.length - 1] + dt);
        }
        return { pts, segLen, segDt, cum, total: cum[cum.length - 1] };
    }
    const timesListLocal = pathPtsList.map(pts => computeTimes(pts));
    // alias for inner use
    const timesList = timesListLocal;

    // Remove old marker traces if they exist (cleanup)
    const existingLen = gd.data.length;
    // We'll append marker traces for each path
    const markerTracesLocal = pathPtsList.map((pts, idx) => {
        const tr = pathTraces[idx] || {};
        // attempt to get color from line or marker
        const color = (tr.line && tr.line.color) || (tr.marker && tr.marker.color) || '#ffffff';
        return { x: [pts.length ? pts[0].x : 0], y: [pts.length ? pts[0].y : 0], mode: 'markers', marker: { color: color, size: 14 }, showlegend: false, hoverinfo: 'skip' };
    });

    // Add marker traces and start animation
    // Lock axes/ranges to prevent Plotly from autoscaling gridlines during animation
    let xRange = null, yRange = null;
    try {
        if (gd.layout && gd.layout.xaxis && Array.isArray(gd.layout.xaxis.range)) xRange = gd.layout.xaxis.range;
        if (gd.layout && gd.layout.yaxis && Array.isArray(gd.layout.yaxis.range)) yRange = gd.layout.yaxis.range;
    } catch (e) { /* ignore */ }
    if (!xRange) {
        const allXs = [].concat(...pathPtsList.map(arr => arr.map(p => p.x)));
        const minX = Math.min.apply(null, allXs.filter(v => isFinite(v)));
        const maxX = Math.max.apply(null, allXs.filter(v => isFinite(v)));
        xRange = [minX - 0.05 * Math.abs(maxX - minX), maxX + 0.05 * Math.abs(maxX - minX)];
    }
    if (!yRange) {
        const allYs = [].concat(...pathPtsList.map(arr => arr.map(p => p.y)));
        const minY = Math.min.apply(null, allYs.filter(v => isFinite(v)));
        const maxY = Math.max.apply(null, allYs.filter(v => isFinite(v)));
        yRange = [minY - 0.05 * Math.abs(maxY - minY), maxY + 0.05 * Math.abs(maxY - minY)];
    }
    Plotly.relayout(plotId, {
        'xaxis.autorange': false,
        'yaxis.autorange': false,
        'xaxis.range': xRange,
        'yaxis.range': yRange,
        'xaxis.fixedrange': true,
        'yaxis.fixedrange': true
    }).then(() => {
        Plotly.addTraces(plotId, markerTracesLocal).then(() => {
            const markerIdxLocal = markerTracesLocal.map((_, i) => existingLen + i);
            // save prepared race data to globals so pause/resume can work
            raceMarkerIdx = markerIdxLocal;
            raceMarkerTraces = markerTracesLocal;
            raceTimesList = timesListLocal;
            racePathTraces = pathTraces;
            racePrepared = true;
            // initialize finish tracking and clear any previous results
            raceFinishedFlags = new Array(timesListLocal.length).fill(false);
            raceFinishOrder = [];
            try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
            // start time accounting (take into account any paused elapsed)
            raceStartT = performance.now() - (racePausedElapsed * 1000);

            // expose the step function so toggleRaceStart can pause/resume it

            function findSegment(cum, t) {
                let lo = 0, hi = cum.length - 1;
                if (t >= cum[hi]) return hi - 1;
                while (lo < hi) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (cum[mid] <= t) lo = mid + 1; else hi = mid;
                }
                return Math.max(0, lo - 1);
            }

            function posAt(timesObj, t) {
                if (!timesObj.pts || timesObj.pts.length === 0) return { x: 0, y: 0, finished: true };
                if (t >= timesObj.total) {
                    const p = timesObj.pts[timesObj.pts.length - 1];
                    return { x: p.x, y: p.y, finished: true };
                }
                const idx = findSegment(timesObj.cum, t);
                const t0 = timesObj.cum[idx];
                const dt = timesObj.segDt[idx];
                const frac = dt > 0 ? Math.min(1, Math.max(0, (t - t0) / dt)) : 0;
                const p0 = timesObj.pts[idx];
                const p1 = timesObj.pts[idx + 1];
                const x = p0.x + frac * (p1.x - p0.x);
                const y = p0.y + frac * (p1.y - p0.y);
                return { x, y, finished: false };
            }

            function step() {
                const elapsed = (performance.now() - raceStartT) / 1000;
                const positions = timesList.map(tobj => posAt(tobj, elapsed));

                // update each marker
                for (let i = 0; i < positions.length; i++) {
                    const p = positions[i];
                    Plotly.restyle(plotId, { x: [[p.x]], y: [[p.y]] }, [raceMarkerIdx[i]]);
                }

                // detect newly finished particles and append rows progressively
                try {
                    const tbody = document.getElementById('raceResultsBody');
                    for (let i = 0; i < positions.length; i++) {
                        const p = positions[i];
                        if (p.finished && raceFinishedFlags && !raceFinishedFlags[i]) {
                            raceFinishedFlags[i] = true;
                            raceFinishOrder.push(i);
                            const finishTime = (timesList && timesList[i] && typeof timesList[i].total === 'number') ? timesList[i].total : elapsed;
                            if (tbody) {
                                const tr = document.createElement('tr');
                                tr.style.borderTop = '1px solid rgba(255,255,255,0.04)';
                                tr.dataset.pathIdx = String(i);
                                const rank = raceFinishOrder.length;
                                const medal = (rank === 1) ? '🥇' : (rank === 2) ? '🥈' : (rank === 3) ? '🥉' : '';
                                const name = window.raceHideNames ? ('C' + subscript(i + 1)) : ((racePathTraces && racePathTraces[i] && racePathTraces[i].name) ? racePathTraces[i].name : ('Path ' + (i + 1)));
                                const timeStr = isFinite(finishTime) ? finishTime.toFixed(2) + 's' : '--';
                                tr.innerHTML = '<td style="padding:6px;color:#fff;font-weight:600">' + rank + '</td>' +
                                    '<td style="padding:6px;font-size:1.2em">' + medal + '</td>' +
                                    '<td style="padding:6px;color:#eee">' + name + '</td>' +
                                    '<td style="padding:6px;color:#fff;text-align:right">' + timeStr + '</td>';
                                tbody.appendChild(tr);
                            }
                        }
                    }
                } catch (e) { /* ignore DOM errors */ }

                const finished = positions.every(p => p.finished);
                if (!finished && !racePaused) {
                    raceAnimation = requestAnimationFrame(step);
                } else if (!finished && racePaused) {
                    // paused: store pausedElapsed and leave raceAnimation null
                    racePausedElapsed = (performance.now() - raceStartT) / 1000;
                    raceAnimation = null;
                } else {
                    raceAnimation = null;
                    // Display results
                    const res = document.getElementById('raceResults');
                    if (res) {
                        res.style.display = 'block';
                        // build results content dynamically and keep previous "Winner!" text
                        // find the fastest path
                        let winnerIdx = 0;
                        let winnerTime = timesList[0] ? timesList[0].total : Infinity;
                        for (let i = 1; i < timesList.length; i++) {
                            if (timesList[i].total < winnerTime) {
                                winnerTime = timesList[i].total;
                                winnerIdx = i;
                            }
                        }
                        // store latest results so the toggle can update the displayed labels later
                        window.latestRaceResults = {
                            times: timesList.map(t => (t && typeof t.total === 'number') ? t.total : Infinity),
                            winnerIdx: winnerIdx,
                            // store canonical full names matching the currently plotted paths
                            // (derive from the path traces so indices line up for Y=0 cases)
                            fullNames: (pathTraces || []).map((t, i) => (t && t.name) ? t.name : ('Path ' + (i + 1)))
                        };

                        // build results HTML and order by increasing time (fastest first)
                        // Build a medal-style table (Rank, Medal, Path, Time)
                        let html = '<h4>Results</h4>';
                        const nPaths = timesList.length;
                        const idxs = [];
                        for (let i = 0; i < nPaths; i++) idxs.push(i);
                        idxs.sort((a, b) => {
                            const ta = (timesList[a] && typeof timesList[a].total === 'number') ? timesList[a].total : Infinity;
                            const tb = (timesList[b] && typeof timesList[b].total === 'number') ? timesList[b].total : Infinity;
                            return ta - tb;
                        });
                        // small helper for medal emoji
                        function medalForRank(r) { if (r === 0) return '🥇'; if (r === 1) return '🥈'; if (r === 2) return '🥉'; return ''; }
                        // Build just the tbody rows so we can update the existing
                        // visible table body without replacing the whole container.
                        let rowsHtml = '';
                        for (let r = 0; r < idxs.length; r++) {
                            const i = idxs[r];
                            const medal = medalForRank(r);
                            const name = window.raceHideNames ? ('C' + subscript(i + 1)) : ((pathTraces[i] && pathTraces[i].name) || ('Path ' + (i + 1)));
                            const tval = (timesList[i] && typeof timesList[i].total === 'number') ? timesList[i].total : Infinity;
                            const timeStr = isFinite(tval) ? tval.toFixed(2) + 's' : '--';
                            rowsHtml += '<tr style="border-top:1px solid rgba(255,255,255,0.04)" data-path-idx="' + i + '">';
                            rowsHtml += '<td style="padding:6px;color:#fff;font-weight:600">' + (r + 1) + '</td>';
                            rowsHtml += '<td style="padding:6px;font-size:1.2em">' + medal + '</td>';
                            rowsHtml += '<td style="padding:6px;color:#eee">' + name + '</td>';
                            rowsHtml += '<td style="padding:6px;color:#fff;text-align:right">' + timeStr + '</td>';
                            rowsHtml += '</tr>';
                        }
                        try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = rowsHtml; else res.innerHTML = '<table>' + rowsHtml + '</table>'; } catch (e) { res.innerHTML = html; }
                        // animate medal assignment for visual emphasis
                        try { animateMedalTable(res); } catch (e) { /* ignore animate errors */ }
                        // ensure the Start/Pause button reads as Start when the race has finished
                        try { const btn = document.getElementById('raceStartBtn'); if (btn) btn.textContent = '▶ Start Race'; } catch (e) { }
                    }
                }
            }

            // make step callable from outside so we can resume after pause
            window._raceStep = step;
            step();
        });
    });
}

function toggleRaceStart() {
    const btn = document.getElementById('raceStartBtn');
    // If race not yet prepared, start a fresh run
    if (!racePrepared) {
        racePaused = false;
        racePausedElapsed = 0;
        // clear any previous results immediately
        try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
        try { delete window.latestRaceResults; } catch (e) { window.latestRaceResults = undefined; }
        raceFinishOrder = [];
        raceFinishedFlags = null;
        // this will prepare markers and start animation
        startRace();
        if (btn) btn.textContent = '⏸ Pause';
        return;
    }

    // If currently running, pause
    if (!racePaused && raceAnimation) {
        racePaused = true;
        try { cancelAnimationFrame(raceAnimation); } catch (e) { }
        raceAnimation = null;
        racePausedElapsed = (performance.now() - raceStartT) / 1000;
        if (btn) btn.textContent = '▶ Resume';
        return;
    }

    // If paused, resume
    if (racePaused) {
        racePaused = false;
        // adjust start time to account for paused duration
        raceStartT = performance.now() - (racePausedElapsed * 1000);
        if (window._raceStep) {
            raceAnimation = requestAnimationFrame(window._raceStep);
        } else {
            // fallback: restart the race (will re-prepare traces)
            startRace();
        }
        if (btn) btn.textContent = '⏸ Pause';
        return;
    }

    // If not running and not paused (likely finished), restart
    // Clear previous results and reset finish tracking so new run repopulates table
    try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
    try { delete window.latestRaceResults; } catch (e) { window.latestRaceResults = undefined; }
    raceFinishOrder = [];
    raceFinishedFlags = (raceTimesList && raceTimesList.length) ? new Array(raceTimesList.length).fill(false) : null;
    racePausedElapsed = 0;
    raceStartT = performance.now();
    if (window._raceStep) raceAnimation = requestAnimationFrame(window._raceStep);
    if (btn) btn.textContent = '⏸ Pause';
}

function resetRace() {
    // Cancel any running animation (support both rAF and setInterval IDs)
    if (raceAnimation) {
        try { cancelAnimationFrame(raceAnimation); } catch (e) { }
        try { clearInterval(raceAnimation); } catch (e) { }
        raceAnimation = null;
    }
    try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
    try { delete window.latestRaceResults; } catch (e) { window.latestRaceResults = undefined; }
    raceFinishOrder = [];
    raceFinishedFlags = null;
    // Reset pause/prepared state and UI so Reset returns everything to the initial state
    racePaused = false;
    racePausedElapsed = 0;
    raceStartT = 0;
    racePrepared = false;
    raceMarkerIdx = null;
    raceMarkerTraces = null;
    raceTimesList = null;
    racePathTraces = null;
    // remove any exposed step callback
    try { delete window._raceStep; } catch (e) { window._raceStep = undefined; }
    // ensure Start/Pause button shows the initial Start label
    try { const btn = document.getElementById('raceStartBtn'); if (btn) btn.textContent = '▶ Start Race'; } catch (e) { }
    // Purge existing Plotly graph to ensure all traces/handlers removed, then recreate
    try {
        const gd = document.getElementById('racePlot');
        if (gd) Plotly.purge(gd);
    } catch (e) { /* ignore if purge unavailable */ }
    setupRacePlot();
}

// Helper to format integer n with Unicode subscript digits (1 -> '₁', etc.)
function subscript(n) {
    const subs = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    return String(n).split('').map(d => subs[parseInt(d, 10)] || d).join('');
}

// --- Tautochrone demo: separate, self-contained functions for the new slide ---
let tautAnimation = null;
let tautPrepared = false;
let tautPaused = false;
let tautStartT = 0;
let tautPausedElapsed = 0;
let tautMarkerIdx = null;
let tautParams = null;

function setupTautochroneControls() {
    const slider = document.getElementById('gravityTautSlider');
    const display = document.getElementById('gravityTautValue');
    if (!slider || !display) return;
    display.textContent = parseFloat(slider.value).toFixed(2);
    slider.addEventListener('input', () => { display.textContent = parseFloat(slider.value).toFixed(2); });
}

function setupTautochronePlot(endpointX, endpointY) {
    const plot = document.getElementById('tautPlot');
    if (!plot) return;
    const X = (endpointX !== undefined) ? endpointX : 4;
    const Y = (endpointY !== undefined) ? endpointY : 0;

    // Compute cycloid matching (X,Y). Adapted from race computeCycloidPath.
    function computeCycloidPathLocal(X, Y, dtheta = 0.012) {
        if (X <= 0) return { x: [], y: [], thetaF: 0, a: 0 };
        if (Math.abs(Y) < 1e-9) {
            const thetaF = 2 * Math.PI;
            const a = X / thetaF;
            const xs = [], ys = [], thetas = [];
            for (let th = 0; th <= thetaF + 1e-9; th += dtheta) {
                xs.push(a * (th - Math.sin(th)));
                ys.push(a * (1 - Math.cos(th)));
                thetas.push(th);
            }
            xs.push(X); ys.push(Y); thetas.push(thetaF);
            return { x: xs, y: ys, thetaF, a, theta: thetas };
        }
        const target = X / Y;
        let lo = 1e-6, hi = Math.PI * 2 - 1e-6;
        for (let i = 0; i < 60; i++) {
            const mid = 0.5 * (lo + hi);
            const val = (mid - Math.sin(mid)) / (1 - Math.cos(mid));
            if (val > target) hi = mid; else lo = mid;
        }
        const thetaF = 0.5 * (lo + hi);
        const a = Y / (1 - Math.cos(thetaF));
        const xs = [], ys = [], thetas = [];
        for (let th = 0; th <= thetaF + 1e-9; th += dtheta) {
            xs.push(a * (th - Math.sin(th)));
            ys.push(a * (1 - Math.cos(th)));
            thetas.push(th);
        }
        xs.push(X); ys.push(Y); thetas.push(thetaF);
        return { x: xs, y: ys, thetaF, a, theta: thetas };
    }

    const cycl = computeCycloidPathLocal(X, Y, 0.01);
    const cycX = cycl.x, cycY = cycl.y, thetaArr = cycl.theta || [];
    tautParams = { X, Y, a: cycl.a, thetaF: cycl.thetaF, cycX, cycY, thetaArr };

    // compute the turning point (max y) along the cycloid to use as finish line
    let bottomIdx = 0;
    for (let i = 1; i < cycY.length; i++) if (cycY[i] > cycY[bottomIdx]) bottomIdx = i;
    const bottomX = cycX[bottomIdx] || 0;
    const bottomY = cycY[bottomIdx] || 0;
    const bottomTheta = (thetaArr && thetaArr[bottomIdx] !== undefined) ? thetaArr[bottomIdx] : (cycl.thetaF || 0);
    tautParams.bottom = { x: bottomX, y: bottomY, theta: bottomTheta };

    const trace = { x: cycX, y: cycY, mode: 'lines', line: { color: '#00d9ff', width: 4 }, name: 'Cycloid' };
    // compute extents and set a slightly zoomed-out initial range
    const allXs = Array.isArray(cycX) ? cycX.filter(v => isFinite(v)) : [];
    const allYs = Array.isArray(cycY) ? cycY.filter(v => isFinite(v)) : [];
    const minX = allXs.length ? Math.min.apply(null, allXs) : -0.5;
    const maxX = allXs.length ? Math.max.apply(null, allXs) : X;
    const minY = allYs.length ? Math.min.apply(null, allYs) : -0.3;
    const maxY = allYs.length ? Math.max.apply(null, allYs) : Math.max(Y + 0.5, 1.5);
    const xPad = Math.max(0.4, 0.20 * Math.abs(maxX - minX));
    const yPad = Math.max(0.8, 0.20 * Math.abs(maxY - minY));
    // add extra space below the bottom of the curve (y increases downward)
    const extraBottom = Math.max(1.0, 0.8 * Math.abs(maxY - minY));
    const xRangeInit = [minX - xPad, maxX + xPad];
    const yRangeInit = [minY - yPad, maxY + yPad + extraBottom];

    const layout = {
        paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', font: { color: '#eee', size: 24 },
        xaxis: { title: { text: 'x', font: { size: 24, color: '#eee' } }, gridcolor: '#2a3a5a', range: xRangeInit, tickfont: { size: 20 } },
        yaxis: { title: { text: 'y', font: { size: 24, color: '#eee' } }, gridcolor: '#2a3a5a', range: yRangeInit, autorange: 'reversed', scaleanchor: 'x', scaleratio: 1, tickfont: { size: 20 } },
        margin: { t: 20, r: 140, b: 50, l: 60 }, showlegend: true,
        legend: { x: 1.02, y: 0.85, bgcolor: 'rgba(0,0,0,0)', bordercolor: 'rgba(255,255,255,0.05)', font: { color: '#eee', size: 20 } }
    };

    Plotly.newPlot('tautPlot', [trace], layout, { responsive: true }).then(() => {
        // set a fixed finish x (user-specified) and draw a vertical dashed finish line there
        try {
            tautParams.finishX = 2;
            const shape = { type: 'line', x0: tautParams.finishX, x1: tautParams.finishX, xref: 'x', yref: 'paper', y0: 0, y1: 1, line: { color: '#ffd166', width: 2, dash: 'dash' } };
            const ann = { x: tautParams.finishX, y: 1, xref: 'x', yref: 'paper', text: 'Finish', showarrow: false, xanchor: 'left', yanchor: 'bottom', xshift: 8, yshift: -12, font: { color: '#ffd166', size: 20 } };
            Plotly.relayout('tautPlot', { shapes: [shape], annotations: [ann] });
        } catch (e) { /* ignore */ }
        // add initial static particle markers so they are visible at rest before starting
        try {
            const gd = document.getElementById('tautPlot');
            const bottomThetaLocal = (tautParams && tautParams.bottom && typeof tautParams.bottom.theta === 'number') ? tautParams.bottom.theta : 0;
            const thetaF_local = tautParams.thetaF || Math.PI * 2;
            const phiMags_init = [0.4, 0.20, 0.15, 0.05].map(frac => Math.max(0.02, Math.min(frac * thetaF_local, thetaF_local)));
            const starts_init = [
                Math.max(0.02, bottomThetaLocal - phiMags_init[0]),
                Math.max(0.02, bottomThetaLocal - phiMags_init[1]),
                Math.min(thetaF_local - 1e-3, bottomThetaLocal + phiMags_init[2]),
                Math.min(thetaF_local - 1e-3, bottomThetaLocal + phiMags_init[3])
            ];
            const colors = ['#ff6b6b', '#fbbf24', '#7cf1a5', '#a78bfa'];
            const initialTraces = starts_init.map((th, idx) => {
                const x0 = tautParams.a * (th - Math.sin(th));
                const y0 = tautParams.a * (1 - Math.cos(th));
                return { x: [x0], y: [y0], mode: 'markers', name: 'P' + subscript(idx + 1), marker: { color: colors[idx % colors.length], size: 18 }, showlegend: true };
            });
            const existingLen = (gd && Array.isArray(gd.data)) ? gd.data.length : 0;
            Plotly.addTraces('tautPlot', initialTraces).then(() => {
                tautParams._initialMarkerIdx = initialTraces.map((_, i) => existingLen + i);
                // ensure prevX/prevY align with these starts
                tautParams._prevY = starts_init.map(th => tautParams.a * (1 - Math.cos(th)));
                tautParams._prevX = starts_init.map(th => tautParams.a * (th - Math.sin(th)));
            });
        } catch (e) { /* ignore */ }
    });
    tautPrepared = false;
    // ensure results area visible and clear results
    try {
        const resultsDiv = document.getElementById('tautResults'); if (resultsDiv) resultsDiv.style.display = 'block';
        const tb = document.getElementById('tautResultsBody'); if (tb) tb.innerHTML = '';
    } catch (e) { }
}

function startTautochrone() {
    if (tautAnimation) return;
    const gSlider = document.getElementById('gravityTautSlider');
    const g = gSlider ? Math.max(0.01, parseFloat(gSlider.value) || 9.8) : 9.8;
    const params = tautParams;
    if (!params) return;
    const a = params.a || 1;
    const thetaF = params.thetaF || Math.PI * 2;

    // choose four distinct starting thetas placed above the turning point
    const thetaFinal = thetaF;
    const bottomThetaLocal = (tautParams && tautParams.bottom && typeof tautParams.bottom.theta === 'number') ? tautParams.bottom.theta : 0;
    const eps = 1e-3;
    // choose four starts: two left of the turning point, two right
    const phiMags = [0.4, 0.20, 0.15, 0.05].map(frac => Math.max(0.02, Math.min(frac * thetaF, thetaF)));
    const starts = [
        Math.max(0.02, bottomThetaLocal - phiMags[0]),
        Math.max(0.02, bottomThetaLocal - phiMags[1]),
        Math.min(thetaF - 1e-3, bottomThetaLocal + phiMags[2]),
        Math.min(thetaF - 1e-3, bottomThetaLocal + phiMags[3])
    ];

    // tautochrone constant time for cycloid: T = π * sqrt(a / g)
    const T = Math.PI * Math.sqrt(a / g);

    // prepare marker traces (one per particle)
    const gd = document.getElementById('tautPlot');
    if (!gd) return;
    // If initial static markers were added during setup, remove them now
    // so they do not remain visible when the animated markers are added.
    try {
        if (tautParams && Array.isArray(tautParams._initialMarkerIdx) && tautParams._initialMarkerIdx.length) {
            Plotly.deleteTraces('tautPlot', tautParams._initialMarkerIdx);
            tautParams._initialMarkerIdx = null;
        }
    } catch (e) { /* ignore */ }
    const existingLen = (gd && Array.isArray(gd.data)) ? gd.data.length : 0;
    const markerTraces = starts.map((th, idx) => {
        // compute initial position
        const x = a * (th - Math.sin(th));
        const y = a * (1 - Math.cos(th));
        const colors = ['#ff6b6b', '#fbbf24', '#7cf1a5', '#a78bfa'];
        return { x: [x], y: [y], mode: 'markers', name: 'P' + subscript(idx + 1), marker: { color: colors[idx % colors.length], size: 18 }, showlegend: true };
    });

    Plotly.addTraces('tautPlot', markerTraces).then(() => {
        // If initial static markers were added during setup, reuse those indices instead
        if (tautParams && Array.isArray(tautParams._initialMarkerIdx) && tautParams._initialMarkerIdx.length === markerTraces.length) {
            tautMarkerIdx = tautParams._initialMarkerIdx.slice();
            // update their positions to match the computed starts (in case bottomTheta changed)
            for (let i = 0; i < starts.length; i++) {
                const th = starts[i];
                const x0 = a * (th - Math.sin(th));
                const y0 = a * (1 - Math.cos(th));
                try { Plotly.restyle('tautPlot', { x: [[x0]], y: [[y0]] }, [tautMarkerIdx[i]]); } catch (e) { }
            }
        } else {
            tautMarkerIdx = markerTraces.map((_, i) => existingLen + i);
        }
        tautPrepared = true;
        tautPaused = false;
        tautPausedElapsed = 0;
        tautStartT = performance.now() - (tautPausedElapsed * 1000);

        // prepare finish-tracking (persist in tautParams so pause/resume doesn't lose first-passage records)
        const bottomTheta = (tautParams && tautParams.bottom && tautParams.bottom.theta) ? tautParams.bottom.theta : (thetaF * 0.5);
        if (!tautParams._finishedFlags || !Array.isArray(tautParams._finishedFlags) || tautParams._finishedFlags.length !== starts.length) {
            tautParams._finishedFlags = new Array(starts.length).fill(false);
        }
        if (!tautParams._finishTimes || !Array.isArray(tautParams._finishTimes) || tautParams._finishTimes.length !== starts.length) {
            tautParams._finishTimes = new Array(starts.length).fill(null);
        }
        // previous y and x values per particle so we can detect first crossing
        if (!tautParams._prevY || !Array.isArray(tautParams._prevY) || tautParams._prevY.length !== starts.length) {
            // initialize previous y-values correctly (y = a*(1 - cos(theta)))
            tautParams._prevY = starts.map(th => a * (1 - Math.cos(th)));
        }
        if (!tautParams._prevX || !Array.isArray(tautParams._prevX) || tautParams._prevX.length !== starts.length) {
            // initialize previous x-values (x = a*(theta - sin(theta)))
            tautParams._prevX = starts.map(th => a * (th - Math.sin(th)));
        }
        // debug: show bottomY and initial prevY
        try { console.debug('taut:init prevY, bottomY', tautParams._prevY.slice(), tautParams.bottom && tautParams.bottom.y); } catch (e) { }
        const finishedFlags = tautParams._finishedFlags;
        const finishTimes = tautParams._finishTimes;
        const prevY = tautParams._prevY;
        const prevX = tautParams._prevX;
        const finishX = (tautParams && typeof tautParams.finishX === 'number') ? tautParams.finishX : 2;

        // ensure results area visible when animation starts
        try { const resultsDiv = document.getElementById('tautResults'); if (resultsDiv) resultsDiv.style.display = 'block'; } catch (e) { }

        function step() {
            const elapsed = (performance.now() - tautStartT) / 1000; // seconds
            // angular frequency for tautochrone SHM: omega = sqrt(g/(4a))
            const omega = Math.sqrt(g / (4 * a));
            const bottomThetaLocal2 = bottomTheta; // capture
            for (let i = 0; i < starts.length; i++) {
                const th0 = starts[i];
                // phi0 is offset from turning point
                const phi0 = th0 - bottomThetaLocal2;
                const s = Math.sin(phi0 / 2) * Math.cos(omega * elapsed);
                const sc = Math.max(-1, Math.min(1, s));
                const phi = 2 * Math.asin(sc);
                const th = bottomThetaLocal2 + phi;
                const x = a * (th - Math.sin(th));
                const y = a * (1 - Math.cos(th));
                Plotly.restyle('tautPlot', { x: [[x]], y: [[y]] }, [tautMarkerIdx[i]]);

                // detect first downward crossing of turning-point y (bottomYval)
                try {
                    const currY = y;
                    const prev = (typeof prevY[i] === 'number') ? prevY[i] : (a * (th0 - Math.sin(th0)));
                    // record first time particle crosses the vertical finish line at x ~ finishX
                    const currX = x;
                    const prevXval = (typeof prevX[i] === 'number') ? prevX[i] : (a * (th0 - Math.sin(th0)));
                    const tolX = Math.max(0.02, 0.02 * Math.abs(finishX));
                    // robust crossing test: either prev was left of (finishX - tol) and curr is at/after it,
                    // or curr is within tol and particle is moving right
                    const movedRight = currX >= prevXval;
                    const crossedX = ((prevXval < finishX - tolX) && (currX >= finishX - tolX)) || (Math.abs(currX - finishX) <= tolX && movedRight);
                    if (!tautParams._globalFinishRecorded && crossedX) {
                        // record a single global finish time and apply it to all particles
                        tautParams._globalFinishRecorded = true;
                        tautParams._globalFinishTime = elapsed;
                        try {
                            const tbody = document.getElementById('tautResultsBody');
                            if (tbody) {
                                for (let j = 0; j < starts.length; j++) {
                                    if (!finishedFlags[j]) {
                                        finishedFlags[j] = true;
                                        finishTimes[j] = elapsed;
                                        const existing = tbody.querySelector('tr[data-p-idx="' + j + '"]');
                                        if (!existing) {
                                            const rank = tbody.children.length + 1;
                                            const medal = (rank === 1) ? '🥇' : (rank === 2) ? '🥈' : (rank === 3) ? '🥉' : '';
                                            const name = window.tautHideNames ? ('P' + subscript(j + 1)) : ('Particle ' + subscript(j + 1));
                                            const tr = document.createElement('tr');
                                            tr.style.borderTop = '1px solid rgba(255,255,255,0.04)';
                                            tr.dataset.pIdx = String(j);
                                            tr.innerHTML = '<td style="padding:6px;color:#fff;font-weight:600">' + rank + '</td>' +
                                                '<td style="padding:6px;font-size:1.2em">' + medal + '</td>' +
                                                '<td style="padding:6px;color:#eee">' + name + '</td>' +
                                                '<td style="padding:6px;color:#fff;text-align:right">' + (isFinite(elapsed) ? elapsed.toFixed(2) + 's' : '--') + '</td>';
                                            tbody.appendChild(tr);
                                        }
                                    }
                                }
                            }
                        } catch (e) { /* ignore DOM errors */ }
                        try { console.log('Tautochrone: global finish recorded at', elapsed.toFixed(3)); } catch (e) { }
                    }
                    // update prev arrays
                    prevY[i] = currY;
                    prevX[i] = currX;
                } catch (e) { /* ignore DOM errors */ }
            }

            // continue running until paused by the user; don't auto-stop
            if (!tautPaused) {
                tautAnimation = requestAnimationFrame(step);
            } else {
                // when paused, cancel the scheduled animation frame
                try { cancelAnimationFrame(tautAnimation); } catch (e) { }
                tautAnimation = null;
            }
        }

        // expose step for pause/resume
        window._tautStep = step;
        step();
    });
}

function toggleTautochroneStart() {
    const btn = document.getElementById('tautStartBtn');
    if (!tautPrepared) {
        // initial start
        startTautochrone();
        if (btn) btn.textContent = '⏸ Pause';
        return;
    }
    // pause
    if (!tautPaused && tautAnimation) {
        tautPaused = true;
        try { cancelAnimationFrame(tautAnimation); } catch (e) { }
        tautAnimation = null;
        tautPausedElapsed = (performance.now() - tautStartT) / 1000;
        if (btn) btn.textContent = '▶ Resume';
        return;
    }
    // resume
    if (tautPaused) {
        tautPaused = false;
        tautStartT = performance.now() - (tautPausedElapsed * 1000);
        if (window._tautStep) {
            tautAnimation = requestAnimationFrame(window._tautStep);
        } else {
            startTautochrone();
        }
        if (btn) btn.textContent = '⏸ Pause';
        return;
    }
}

function resetTautochrone() {
    if (tautAnimation) {
        try { cancelAnimationFrame(tautAnimation); } catch (e) { }
        try { clearInterval(tautAnimation); } catch (e) { }
        tautAnimation = null;
    }
    try { const body = document.getElementById('tautResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
    tautPrepared = false; tautPaused = false; tautStartT = 0; tautPausedElapsed = 0; tautMarkerIdx = null; tautParams = null;
    try {
        const gd = document.getElementById('tautPlot'); if (gd) Plotly.purge(gd);
    } catch (e) { }
    setupTautochronePlot();
    try { const btn = document.getElementById('tautStartBtn'); if (btn) btn.textContent = '▶ Start Race'; } catch (e) { }
}

function toggleTautochroneNames() {
    window.tautHideNames = !window.tautHideNames;
    const btn = document.getElementById('tautToggleNamesBtn');
    if (btn) btn.textContent = window.tautHideNames ? 'Show names' : 'Hide names';
    try {
        const tbody = document.getElementById('tautResultsBody');
        if (tbody && tbody.children && tbody.children.length > 0) {
            const rows = Array.from(tbody.children);
            rows.forEach((row, idx) => {
                const name = window.tautHideNames ? ('P_' + (idx + 1)) : ('Particle ' + (idx + 1));
                if (row.children && row.children[2]) row.children[2].textContent = name;
            });
        }
    } catch (e) { }
}

// Toggle whether full curve names are shown (defaults to hiding names)
function toggleRaceNames() {
    window.raceHideNames = !window.raceHideNames;
    const btn = document.getElementById('raceToggleNamesBtn');
    if (btn) btn.textContent = window.raceHideNames ? 'Show names' : 'Hide names';

    // Update the displayed trace names in-place (don't recreate the whole plot)
    const plotId = 'racePlot';
    const gd = document.getElementById(plotId);
    if (gd && Array.isArray(gd.data)) {
        // Choose canonical names depending on whether the endpoint is a drop (Y=0)
        const currentY = (window.raceXY && typeof window.raceXY.Y === 'number') ? window.raceXY.Y : 1.5;
        let baseNames, shortNames;
        if (Math.abs(currentY) < 1e-9) {
            baseNames = ['Cycloid', 'Line-then-Sine', 'Quintic', 'Drop-then-Glide'];
            shortNames = ['C' + subscript(1), 'C' + subscript(2), 'C' + subscript(3), 'C' + subscript(4)];
        } else {
            baseNames = ['Line', 'Parabola', 'Cycloid', 'Line-then-Sine', 'Quintic', 'Drop-then-Glide'];
            shortNames = ['C' + subscript(1), 'C' + subscript(2), 'C' + subscript(3), 'C' + subscript(4), 'C' + subscript(5), 'C' + subscript(6)];
        }
        const labels = window.raceHideNames ? shortNames : baseNames;
        // rename all line-mode traces in order using labels
        let labIdx = 0;
        for (let i = 0; i < gd.data.length && labIdx < labels.length; i++) {
            const tr = gd.data[i];
            if (tr && typeof tr.mode === 'string' && tr.mode.indexOf('lines') !== -1) {
                try { Plotly.restyle(plotId, { name: labels[labIdx] }, [i]); } catch (e) { /* ignore */ }
                labIdx++;
            }
        }
        // Force a layout refresh so the legend updates reliably in all browsers
        // and reapply the A/B annotations which some Plotly operations may clear.
        try {
            const xy = window.raceXY || { X: 4, Y: 1.5 };
            const annotations = [
                { x: -0.08, y: 0.5, xref: 'paper', yref: 'paper', text: 'y', showarrow: false, font: { color: '#eee', size: 14 } },
                { x: 0, y: 0, xref: 'x', yref: 'y', text: 'A', showarrow: false, font: { color: '#eee', size: 24 }, xshift: -18, yshift: 18 },
                { x: xy.X, y: xy.Y, xref: 'x', yref: 'y', text: 'B', showarrow: false, font: { color: '#eee', size: 24 }, xshift: 18, yshift: 18 }
            ];
            Plotly.relayout(plotId, { annotations: annotations });
        } catch (e) { /* ignore */ }
        // Also update any already-filled result rows to reflect the new
        // visibility state (compact vs full names).
        try {
            const tbody = document.getElementById('raceResultsBody');
            if (tbody) {
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(row => {
                    const pIdx = parseInt(row.dataset.pathIdx, 10);
                    if (isNaN(pIdx)) return;
                    const name = window.raceHideNames ? ('C' + subscript(pIdx + 1)) : ((racePathTraces && racePathTraces[pIdx] && racePathTraces[pIdx].name) ? racePathTraces[pIdx].name : ('Path ' + (pIdx + 1)));
                    if (row.children && row.children[2]) row.children[2].textContent = name;
                });
            }
        } catch (e) { /* ignore */ }
    }

    // Only update existing result rows (do not recreate or unhide the
    // medal table). If there is a populated tbody, update the Path
    // names in-place according to the current `raceHideNames` state.
    try {
        const tbody = document.getElementById('raceResultsBody');
        if (tbody && tbody.children && tbody.children.length > 0) {
            const rows = Array.from(tbody.children);
            rows.forEach(row => {
                const pIdx = parseInt(row.dataset.pathIdx, 10);
                if (isNaN(pIdx)) return;
                const name = window.raceHideNames ? ('C' + subscript(pIdx + 1)) : ((racePathTraces && racePathTraces[pIdx] && racePathTraces[pIdx].name) ? racePathTraces[pIdx].name : ('Path ' + (pIdx + 1)));
                if (row.children && row.children[2]) row.children[2].textContent = name;
            });
        }
    } catch (e) { /* ignore DOM errors */ }
}

// Toggle race endpoint between (4, 1.5) and (4, 0)
function toggleRaceEndpoint() {
    // Get current endpoint or default to (4, 1.5)
    const currentY = window.raceXY ? window.raceXY.Y : 1.5;
    // Toggle between 1.5 and 0
    const newY = (currentY === 1.5) ? 0 : 1.5;
    const newX = 4;

    // Update button text: show current state - "Level" when Y=1.5, "Drop" when Y=0
    const btn = document.getElementById('raceEndpointBtn');
    if (btn) btn.textContent = (newY === 0) ? 'Drop' : 'Level';

    // Reset the race to clear any running animation
    if (raceAnimation) {
        try { cancelAnimationFrame(raceAnimation); } catch (e) { }
        try { clearInterval(raceAnimation); } catch (e) { }
        raceAnimation = null;
    }
    try { const body = document.getElementById('raceResultsBody'); if (body) body.innerHTML = ''; } catch (e) { }
    raceFinishOrder = [];
    raceFinishedFlags = null;
    racePaused = false;
    racePausedElapsed = 0;
    raceStartT = 0;
    racePrepared = false;
    raceMarkerIdx = null;
    raceMarkerTraces = null;
    raceTimesList = null;
    racePathTraces = null;
    try { delete window._raceStep; } catch (e) { window._raceStep = undefined; }
    try { const startBtn = document.getElementById('raceStartBtn'); if (startBtn) startBtn.textContent = '▶ Start Race'; } catch (e) { }

    // Purge and recreate the plot with new endpoint
    try {
        const gd = document.getElementById('racePlot');
        if (gd) Plotly.purge(gd);
    } catch (e) { /* ignore if purge unavailable */ }
    setupRacePlot(newX, newY);
}


// Animate the medal table rows / medal cells when results appear
function animateMedalTable(containerEl) {
    if (!containerEl) return;
    // find the first table inside container
    const table = containerEl.querySelector('table');
    if (!table) return;
    // fade-in the table
    try { table.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' }); } catch (e) { /* ignore */ }
    const rows = table.querySelectorAll('tbody tr');
    // animate top three medals with a pop + subtle row highlight
    rows.forEach((row, idx) => {
        const medalCell = row.children[1];
        if (!medalCell) return;
        if (idx < 3) {
            // pop the medal emoji using WAAPI
            try {
                medalCell.animate([
                    { transform: 'scale(0.2)', opacity: 0 },
                    { transform: 'scale(1.25)', opacity: 1, offset: 0.7 },
                    { transform: 'scale(1)', opacity: 1 }
                ], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)', delay: idx * 120, fill: 'forwards' });
            } catch (e) { /* ignore */ }
            // row background flash
            try {
                row.animate([{ backgroundColor: 'rgba(255,255,255,0.02)' }, { backgroundColor: 'rgba(255,255,255,0.06)' }, { backgroundColor: 'transparent' }], { duration: 900, delay: idx * 120 });
            } catch (e) { /* ignore */ }
        } else {
            // gentle fade for others
            try { row.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 400, delay: idx * 40 }); } catch (e) { }
        }
    });
}

// Cycloid Animation (Slide 21)
function setupCycloidPlot() {
    const plot = document.getElementById('cycloidAnimPlot');
    if (!plot || plot.data) return;
    const a = parseFloat(document.getElementById('cycloidRadius')?.value) || 1;
    const x = [], y = [];
    for (let theta = 0; theta <= 2 * Math.PI; theta += 0.05) {
        x.push(a * (theta - Math.sin(theta)));
        y.push(a * (1 - Math.cos(theta)));
    }

    Plotly.newPlot('cycloidAnimPlot', [{
        x: x, y: y,
        mode: 'lines',
        line: { color: '#00d9ff', width: 3 }
    }], {
        paper_bgcolor: '#1a1a2e',
        plot_bgcolor: '#1a1a2e',
        font: { color: '#eee' },
        xaxis: { gridcolor: '#2a3a5a', range: [-0.5, 7] },
        yaxis: { gridcolor: '#2a3a5a', range: [-0.5, 2.5] },
        margin: { t: 20, r: 20, b: 40, l: 40 },
        showlegend: false
    }, { responsive: true });
}

function toggleCycloidAnim() {
    const btn = document.getElementById('cycloidAnimBtn');
    if (cycloidAnim) {
        // Currently animating, so pause
        clearInterval(cycloidAnim);
        cycloidAnim = null;
        if (btn) btn.textContent = '▶ Animate';
    } else {
        // Currently paused, so start animation
        if (btn) btn.textContent = '⏸ Pause';

        let theta = 0;
        const intervalMs = 50;

        cycloidAnim = setInterval(() => {
            // read dynamic controls each tick so user can adjust mid-animation
            const a = parseFloat(document.getElementById('cycloidRadius')?.value) || 1;
            const speed = parseFloat(document.getElementById('cycloidSpeed')?.value) || 0.1; // Δθ per tick

            theta += speed;
            // compute circle center x to decide when to wrap — use plot x-axis max if available
            const gd = document.getElementById('cycloidAnimPlot');
            let xMax = 7; // fallback
            try {
                if (gd && gd.layout && gd.layout.xaxis && Array.isArray(gd.layout.xaxis.range)) xMax = gd.layout.xaxis.range[1];
            } catch (e) { }
            const cxCheck = a * theta;
            // wrap when the circle center moves beyond the visible plotting range plus a small margin
            if (cxCheck > xMax + 0.5) theta = 0;

            const px = a * (theta - Math.sin(theta));
            const py = a * (1 - Math.cos(theta));
            const cx = a * theta;
            const cy = a;

            const circleX = [], circleY = [];
            for (let t = 0; t <= 2 * Math.PI; t += 0.08) {
                circleX.push(cx + a * Math.cos(t));
                circleY.push(cy + a * Math.sin(t));
            }
            // ensure the circle is closed by repeating the first point at the end
            if (circleX.length > 0) {
                circleX.push(circleX[0]);
                circleY.push(circleY[0]);
            }

            const trailX = [], trailY = [];
            for (let t = 0; t <= theta; t += 0.05) {
                trailX.push(a * (t - Math.sin(t)));
                trailY.push(a * (1 - Math.cos(t)));
            }

            Plotly.react('cycloidAnimPlot', [
                { x: trailX, y: trailY, mode: 'lines', line: { color: '#00d9ff', width: 3 } },
                { x: circleX, y: circleY, mode: 'lines', line: { color: '#4ade80', width: 2 } },
                { x: [cx, px], y: [cy, py], mode: 'lines', line: { color: '#fbbf24', width: 2 } },
                { x: [px], y: [py], mode: 'markers', marker: { color: '#ff6b6b', size: 12 } }
            ], {
                paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e', font: { color: '#eee' },
                xaxis: { gridcolor: '#2a3a5a', range: [-0.5, 7] },
                yaxis: { gridcolor: '#2a3a5a', range: [-0.5, 2.5] },
                margin: { t: 20, r: 20, b: 40, l: 40 }, showlegend: false
            });
        }, intervalMs);
    }
}

// Update displayed cycloid control values and optionally redraw when not animating
function updateCycloidControls() {
    try {
        const sp = document.getElementById('cycloidSpeed');
        const sv = document.getElementById('cycloidSpeedValue');
        if (sp && sv) sv.textContent = parseFloat(sp.value).toFixed(2);
        const ra = document.getElementById('cycloidRadius');
        const rv = document.getElementById('cycloidRadiusValue');
        if (ra && rv) rv.textContent = parseFloat(ra.value).toFixed(2);
        // if not animating, update static plot to reflect new radius
        if (!cycloidAnim) {
            // small debounce not necessary here
            setupCycloidPlot();
        }
    } catch (e) { /* ignore */ }
}

// Navigation bar toggle: hide/show and persist preference
function updateNavUI(hidden) {
    const nav = document.querySelector('.nav-bar');
    const handle = document.getElementById('navToggleHandle');
    const hideBtn = document.getElementById('hideNavBtn');
    if (!nav || !handle) return;
    nav.classList.toggle('hidden', !!hidden);
    // Update handle glyph (aria-pressed handling commented out)
    handle.textContent = hidden ? '▲' : '▼';
    // handle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    if (hideBtn) {
        hideBtn.textContent = hidden ? '▲' : '▼';
        hideBtn.title = hidden ? 'Show navigation' : 'Hide navigation';
        // hideBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    }
}

function toggleNavBar() {
    const nav = document.querySelector('.nav-bar');
    if (!nav) return;
    const nowHidden = !nav.classList.contains('hidden');
    updateNavUI(nowHidden);
    try { localStorage.setItem('navHidden', nowHidden ? '1' : '0'); } catch (e) { }
}

function initNavFromStorage() {
    const nav = document.querySelector('.nav-bar');
    if (!nav) return;
    let saved = null;
    try { saved = localStorage.getItem('navHidden'); } catch (e) { saved = null; }
    const hidden = (saved === '1');
    updateNavUI(hidden);
    // Wire up the floating handle click to toggle nav visibility
    const handle = document.getElementById('navToggleHandle');
    if (handle) {
        handle.addEventListener('click', (e) => { e.stopPropagation(); toggleNavBar(); });
    }
}

// Quiz functionality
document.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const answer = btn.nextElementSibling;
        answer.classList.toggle('visible');
        btn.textContent = answer.classList.contains('visible') ? 'Hide' : 'Reveal';
    });
});

// Dido's Calculation Logic

let didoSlider = document.getElementById('didoSlider');
// Whether the circular arc trace should be shown (toggled when the relevant fragment is revealed)
let didoArcVisible = false;

function solveDidoBeta(L) {
    // Solve L/2 = beta / sin(beta) for beta in (0, pi)
    // Function f(beta) = beta/sin(beta) - L/2 = 0
    // Behavior: f(0+) -> 1 - L/2. f(pi-) -> infinity.
    // If L/2 < 1 (L < 2), no solution (straight line is lim L->2).
    // We assume L >= 2.

    const target = L / 2.0;
    if (target <= 1.0 + 1e-9) return 1e-5; // Almost 0

    // Initial guess
    let beta = 1.5;
    if (target > 1.57) { // L/2 > pi/2 => L > pi
        // Near pi, beta / sin(beta) ~ pi / (pi - beta)
        // target ~ pi / (pi - beta) => pi - beta ~ pi / target
        beta = Math.PI - (Math.PI / target);
    } else {
        // Taylor: beta / (beta - beta^3/6) ~ 1 / (1 - beta^2/6) ~ 1 + beta^2/6
        // target = 1 + beta^2/6 => beta = sqrt(6*(target-1))
        beta = Math.sqrt(6 * (target - 1));
        if (beta > 1.5) beta = 1.5;
    }

    for (let i = 0; i < 20; i++) {
        let sinB = Math.sin(beta);
        let cosB = Math.cos(beta);
        if (Math.abs(sinB) < 1e-9) break; // Safety

        let val = beta / sinB;
        let f = val - target;

        // d/dbeta (beta/sinB) = (sinB - beta*cosB) / sinB^2
        let df = (sinB - beta * cosB) / (sinB * sinB);

        if (Math.abs(df) < 1e-6) break;
        let d = f / df;

        // Dampen step near singularities
        if (Math.abs(d) > 0.5) d = 0.5 * Math.sign(d);

        beta -= d;

        // Clamp beta to (0, pi)
        if (beta <= 0) beta = 1e-5;
        if (beta >= Math.PI) beta = Math.PI - 1e-5;

        if (Math.abs(d) < 1e-7) break;
    }
    return beta;
}

function updateDido() {
    const slider = document.getElementById('didoSlider');
    if (!slider) return;
    let L = parseFloat(slider.value);
    // Protect against invalid L (must be >= 2)
    if (L < 2.00) L = 2.00;

    const valSpan = document.getElementById('didoValue');
    if (valSpan) valSpan.innerText = L.toFixed(2);

    let beta = solveDidoBeta(L);
    // If L=2, beta approx 0. R -> infinity.
    // Avoid infinity in R calculation.
    let R;
    let yc;

    if (beta < 1e-4) {
        // Straight line case (L=2)
        // R is very large. We can simulate straight line by just plotting it directly
        // or using a large R. 
        // Let's use Large R for continuity.
        R = 1.0 / beta; // approx 1/sin(beta)
        yc = -1.0 / beta; // approx -1/tan(beta)
    } else {
        R = 1 / Math.sin(beta);
        yc = -1 / Math.tan(beta);
    }

    const rSpan = document.getElementById('didoRadius');
    if (rSpan) {
        if (R > 10000) {
            rSpan.innerHTML = "&infin;";
        } else {
            rSpan.innerText = R.toFixed(2);
        }
    }

    // Generate points
    // Range of angle t around center.
    // Endpoints are at angles:
    // x = R sin(t), y = yc + R cos(t)? No, standard is x = R cos(phi), y = yc + R sin(phi).
    // Let's use x as parameter since it is a function y(x) for L < 2pi?
    // Actually, if beta approaches pi, R becomes large? No.
    // If beta -> pi, R -> infinity.

    // Wait. L = R * 2 * beta. R = L / (2 beta).
    // If L -> 2pi, beta -> pi. R -> 1.
    // So R can be 1.
    // If L > pi, we have a major arc.
    // The arc is defined for x in [-1, 1] ONLY if it functions.
    // But a major arc of a circle through -1,1 DOES define a function y(x) on [-1,1].
    // It just bulges up.
    // The max x of the circle is R. If R > 1, then the circle exceeds [-1,1] in width.
    // But we only plot the segment between -1 and 1.
    // Is it possible for the arc to NOT be a function on [-1,1]?
    // Only if tangents are vertical inside (-1,1).
    // Vertical tangent at x = +/- R.
    // We need R >= 1 for the chord of length 2 to exist.
    // So x \in [-1, 1] is always inside [-R, R].
    // Thus y(x) is always valid.

    const xs = [], ys = [];
    const n = 150;
    for (let i = 0; i <= n; i++) {
        let psi = -beta + (2 * beta * i) / n;
        let x = R * Math.sin(psi);
        let y = yc + R * Math.cos(psi);
        xs.push(x);
        ys.push(y);
    }

    const trace = {
        x: xs, y: ys,
        mode: 'lines',
        line: { color: '#4ade80', width: 4 },
        fill: 'tozeroy', // fill to x-axis
        fillcolor: 'rgba(74, 222, 128, 0.1)', // semi-transparent green
        name: 'Optimal Curve'
    };

    // Add fixed points A and B (markers)
    const pointsTrace = {
        x: [-1, 1], y: [0, 0],
        mode: 'markers',
        marker: {
            color: '#ffcc66', size: 14,
            line: { color: '#222', width: 1 }
        },
        hoverinfo: 'none',
        showlegend: false,
        cliponaxis: false
    };

    // Separate label trace so we can position labels and make them larger
    // Place labels at y = -0.2 as requested
    const labelTrace = {
        x: [-1, 1], y: [-0.2, -0.2],
        mode: 'text',
        text: ['A', 'B'],
        textfont: { color: '#ffcc66', size: 20 },
        hoverinfo: 'none',
        showlegend: false,
        cliponaxis: false
    };

    // Highlight only the segment y=0 for x in [-1,1]
    const zeroLineTrace = {
        x: [-1, 1], y: [0, 0],
        mode: 'lines',
        line: { color: '#ffb86b', width: 4 },
        hoverinfo: 'none',
        showlegend: false,
        cliponaxis: false
    };

    const layout = {
        paper_bgcolor: '#1a1a2e', plot_bgcolor: '#1a1a2e',
        font: { color: '#eee', size: 14 },
        // Only highlight the horizontal line y = 0 and keep y-range non-negative
        xaxis: { range: [-2, 2], title: 'x', zeroline: false, gridcolor: '#333' },
        yaxis: {
            range: [-0.3, 1.5], title: 'y', zeroline: false, gridcolor: '#333'
        },
        margin: { t: 20, r: 20, b: 40, l: 40 },
        showlegend: false
    };

    // Ensure aspect ratio is 1:1 so circle looks like a circle
    layout.yaxis.scaleanchor = "x";
    layout.yaxis.scaleratio = 1;

    const traces = didoArcVisible ? [trace, zeroLineTrace, pointsTrace, labelTrace] : [zeroLineTrace, pointsTrace, labelTrace];
    Plotly.react('didoPlot', traces, layout, { responsive: true });
}

// Attach listener
if (didoSlider) {
    didoSlider.addEventListener('input', updateDido);
    // Initial draw
    // Use timeout to ensure Plotly is loaded if it's async, but usually it's fine.
    setTimeout(updateDido, 100);
}

// Initialize
initNavFromStorage();
function jumpToSlide(idOrIndex) {
    // showSlide handles validation for both IDs and indices
    showSlide(idOrIndex);
    if (!fragmentModeEnabled) {
        // currentSlide is updated by showSlide to be the numeric index
        showAllFragments(currentSlide);
    }
}

// ... existing next/prev/keyboard handlers ...

// Initialize
initNavFromStorage();
// Restore last viewed slide if available
let startSlide = 1;
try {
    const saved = localStorage.getItem('currentSlide');
    if (saved) startSlide = saved;
} catch (e) { }

showSlide(startSlide);
if (!fragmentModeEnabled) {
    showAllFragments(currentSlide); // Use currentSlide since startSlide might be an ID
}
