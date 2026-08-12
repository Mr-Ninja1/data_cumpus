This is the same feature we already scoped (Sections 12–13 from earlier), so let me just pull it together into one clean end-to-end flow you can hand to your coding agent — this is genuinely the right thing to nail, and title-only-input is a good bar to hold it to.

## The autopilot flow, start to finish

**Trigger:** student provides just a project title (+ maybe a one-line description).

**Step 1 — Decompose the topic into research angles.**
Don't search the raw title. Break it into 3-5 constituent angles (the way we did for UniVote: e-voting adoption, multi-tenant SaaS patterns, auth/fraud prevention, etc.). This is what separates a shallow single-search result from something that actually looks researched.

**Step 2 — Search each angle for real sources.**
Web search plus, ideally, a scholarly API (Semantic Scholar, CrossRef) that returns actual paper metadata rather than general web results. Merge and de-duplicate into one candidate pool.

**Step 3 — Quality-check before committing.**
Run a relevance/credibility pass on what came back — is it actually on-topic, from a credible venue, reasonably current. This is the gate that decides what happens next.

**Step 4a — If strong:** store the sources in `references.json`, tagged `source: "ai_sourced"`. Proceed straight to synthesis (Step 5) — this is the "student did nothing and it just worked" path.

**Step 4b — If thin:** don't pad it with weak sources to hit a count. Tell the student specifically — *"only found 2 directly relevant sources, might not be enough — try searching [related angle] or your library's database for [source type]"* — and let them either proceed with what's there or go find more. This is the moment that actually builds trust: the system is honest about its own research quality instead of quietly covering the gap.

**Step 5 — Synthesize the Literature Review from that store.**
Cluster by theme, one subsection per cluster titled the way your school's real convention shows it (`2.3.3 [Theme] — Author (Year)`), close with an explicit gap statement that feeds into Chapter 1's Significance section. Generation is constrained to cite *only* what's in `references.json` — nothing else, ever.

**Step 6 — The References page is not AI-written at all.**
This is worth being precise about, because it's actually a nice architectural unification: the References page should be **deterministically rendered from `references.json`**, the exact same way the cover page is deterministically rendered from `school_profile` — sort/format according to the citation style, done in code, not generated text. Two pages in the document (cover page, references page) are pure data-rendering, zero AI, which also means they can never be wrong in a way that traces back to model behavior. Everything cited *inside* the chapters just has to match an entry in that same store — which your Section 12 validation check already verifies.

That's the whole loop: title in → real sources found or the student's told exactly where to look → chapters and references page both draw from one verified store → nothing in the output traces back to something invented. That consistency is what actually makes it feel like autopilot rather than a slot machine — the student can trust that if a name's in their references page, it's real, because the system was never allowed to put it there otherwise.
