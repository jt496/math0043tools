# TODO — Proposed Tools and Visualisations

Gaps identified by mapping the MATH0043 lecture notes (`Lecture Notes/Chapter-2/chapter2.tex`,
`Chapter-3/chapter3.tex`) and Problem Sheet 8 against the pages currently in this repository.

**Current coverage.** Group theory (notes Ch. 2) is well served — axioms, Cₙ/Dₙ, Sₙ, presentations,
subgroups, Lagrange/cosets and homomorphisms all have a tool. Two areas are thin:

- **Calculus of Variations** (Ch. 1) — 4 interactive pages plus the slide deck.
- **Representation and character theory** (Ch. 3–4) — a quarter of the notes and the end of the
  course, served by the single preset-only page `groups/structure/representations/`.

---

## Priority

Ranked by value per hour of work:

1. [x] Rotation matrices and characters on the polyhedra pages (§Representations, item 1)
      — shared module `groups/polyhedra/rep-panel.js`, wired into all six pages
2. [x] Euler–Lagrange stationarity explorer — plot *I*(ε) (§Calculus of Variations, item 1)
      — `CoV/euler_lagrange.html`
3. [ ] Standalone conjugacy class explorer (§Group theory, item 1)
4. [ ] User-entered characters in the Representation Explorer (§Representations, item 4)

---

## Calculus of Variations

- [x] **Euler–Lagrange stationarity explorer** — the biggest single gap. *Done: `CoV/euler_lagrange.html`.
      Four functionals (the three §1.3 exercises plus ∫(y′)³ for the necessary-not-sufficient case),
      right/wrong candidates, four variations, an ε slider, and a second panel plotting I(ε) with the
      tangent at ε=0. The first variation is computed exactly from ∫(F_y η + F_y′ η′)dx, and a tally
      reports how many of the variations give δI = 0 — so "stationary for one η" never reads as
      "solves Euler–Lagrange".*
      The slides plot `y + εη` (`CoV/slides.js:2155`) but never plot *I*(ε), even though the whole
      proof in notes §1.3 hinges on `dI/dε|₀ = 0`. Menu of *F* (arclength; ∫₀¹(y′−y)²; ∫₁²x²(y′)²+y —
      the three worked exercises in §1.3), a candidate *f*, a choice of η, an ε slider, and a second
      panel showing *I*(ε) with its stationary point at 0. Crucially, let students pick a **wrong**
      *f* and watch *I*(ε) tilt. The same page can make the "necessary but not sufficient" caveat
      concrete with a y = x³-style example.

- [ ] **Discrete direct-method minimiser.**
      Represent the curve as an N-node polyline and gradient-descend the discretised functional.
      One engine covers shortest path, brachistochrone, catenary and geodesics, and it answers
      "where does the E–L equation come from?" better than any static picture. The existing
      `CoV/brachistochrone.html` and `CoV/soap_bubbles.html` become special cases with a
      "relax to solution" button.

- [ ] **Geodesics on the cylinder and sphere.**
      Slides 24–27 derive both; there is no interactive version, despite three.js already being in
      the stack. Drag two points, get the helix / great circle, compare against a dragged competitor
      path's length.

- [ ] **Catenary / hanging chain.**
      The notes point at it explicitly (§1.7, "the classic hanging chain problem, sheet 6 Q10") and
      nothing in the repo mentions it. Cleanest isoperimetric example after Dido: slider on chain
      length vs span, watch λ respond, debunk the parabola.

- [ ] **Beltrami / first-integral conservation.**
      Plot `F − y′·∂F/∂y′` along a numerically integrated solution and watch it stay flat; likewise
      `∂F/∂y′ = C` for the x-independent case. Ties directly to the Noether remark in §1.5.1 and to
      the Kepler derivation in the slides.

- [ ] **Sheep-pen problem** (§1.7 final exercise).
      Small, but it is the isoperimetric problem students are actually assessed on, and it is not
      Dido.

---

## Representation and character theory

- [x] **Rotation matrices on the polyhedra pages — cheapest high-value change.**
      *Done, all six pages. `groups/polyhedra/rep-panel.js` shows ρ(g), χ(g) = tr ρ(g) and the
      conjugacy class, behind a toggle that is off by default (`?rep=1` opens it enabled).
      Handles reflections and the inversion on the three full-symmetry pages, and prints entries
      symbolically — the dodecahedron shows ½ × [entries in 0, ±1, ±φ, ±(φ−1)] rather than
      decimals.*
      `groups/polyhedra/rotate_tetrahedron/index.html` already tracks axis, angle and cycle notation
      but shows no matrix. A side panel with the 3×3 matrix, its trace, cycle type and conjugacy
      class turns that page into a live demo of the "Challenging" d4-dice exercise that closes the
      notes, and shows χ(g) = 1 + 2cos θ being constant on classes. Reuses everything already built.

- [ ] **Invariant-subspace geometry for reducibility.**
      Notes §3.3 states the key Fact — common eigenvector ⟹ reducible — with no picture anywhere.
      Show the 2D rep of D₃ and a reducible rep acting on vectors: in one case a line is preserved,
      in the other nothing is. The current explorer decomposes numerically but is entirely tables.

- [ ] **Change-of-basis slider.**
      The notes' ρ_θ = P_θ⁻¹ρ̂P_θ example is made for a slider: matrices churn, the trace never
      moves. That is the motivation for characters existing, delivered in one interaction.

- [ ] **Let students enter their own character.**
      `groups/structure/representations/script.js:397` builds a fixed `REPS` catalog, so a student
      who has computed a character table for homework cannot check it. Add: type a class function,
      get ⟨χ,χ⟩, the multiplicities n_r, and validation against Σdᵢ² = |G| and column orthogonality.
      Converts a demo into a homework tool.

---

## Group theory

- [ ] **Standalone conjugacy class explorer.**
      Conjugacy currently exists only as a colour toggle inside the Cayley graph
      (`groups/structure/cayley/script.js:1742`), yet it is asked for three times on Sheet 8 and is
      the hinge between Ch. 2 and Ch. 4. The notes' own hint — "which symmetries look the same if we
      shift our viewpoint?" — suggests the tool: animate b⁻¹xb on the actual square as
      *change viewpoint → act → change back*.

- [ ] **Cayley-table Sudoku and an isomorphism game.**
      Notes §2.7–2.8 are entirely table-based and have no tool. Fill in a partial table with
      Latin-square feedback (the notes literally say "cf. Sudoku!"), then a second mode: two tables,
      find the relabelling — C₄ vs V₄, and the {a,b} example from §2.8.

- [ ] **Direct products and an element-order profile comparator.**
      Sheet 8's hard question needs C₄×C₄ and Q₈×C₂; the presentation library at
      `groups/structure/presentations/script.js:715` has no product constructor, so neither group can
      be built. Add products plus a side-by-side order-spectrum view — makes "same order profile,
      not isomorphic" tangible.

- [ ] **Infinite matrix groups.**
      Notes §3.1 opens with GL, SL, O, U and the site has nothing continuous at all. A 2D sandbox —
      drag matrix entries, watch the unit square deform, live readouts of det and AᵀA, with toggles
      constraining you to SL(2), O(2), SO(2) — would also give "rotation matrices form a group" a
      home.

---

## Smaller fixes

- [ ] **Kernel / fibres in the Homomorphism Explorer.**
      It reports Extension Condition, Isomorphism Check and Image, but never *what collapses*. The
      notes' φ(g) = g² on C₄ example is precisely about that, and displaying the fibres φ⁻¹(h) shows
      them as cosets — a free link back to Lagrange.
- [ ] **Unify the group libraries.** The Homomorphism Explorer's presets for *G* are a hand-written
      subset of the presentations library.
- [ ] **Third card on the landing page.** `index.html` has an unused slot. Chapters 3–4 are a quarter
      of the notes but live three clicks down under `groups/structure/tools.html`;
      "Representations & Characters" arguably deserves to be top-level.
- [ ] **Settle the canonical URL.** Sheet 8 links to
      `homepages.ucl.ac.uk/~ucahjmt/groups/rotate_tetrahedron` while the README gives
      `jt496.github.io/math0043tools`. Worth deciding before more sheets link out.
