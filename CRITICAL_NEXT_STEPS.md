# DataCampus — CRITICAL NEXT STEPS (from cd.md)

**This document clarifies the single most important feature to build next.**

**Source**: `cd.md` (strategy document already in your repo)

---

## The Core Issue

You've built excellent **infrastructure** (spec-driven generation, templates, exports, credits). But students experience the system as **rigid** because:

1. ❌ **Can't edit cover page fields** (title, student name, etc.) — system doesn't route edit requests to the cover page
2. ❌ **System ignores edge-case instructions** — user asks "change this one paragraph" but system regenerates entire chapter
3. ❌ **Feels like overwrite, not refinement** — users worry their good writing will disappear

**Root cause**: No **intent classification** + **scoped edit tools**. When user says "change X", the system doesn't know *what kind of change* to make, so it regenerates everything.

---

## The Solution (cd.md's Roadmap)

### **Immediate (THIS FIX UNLOCKS EVERYTHING)**

#### 1. **Intent Classifier** (1 week)
Add a routing layer that class