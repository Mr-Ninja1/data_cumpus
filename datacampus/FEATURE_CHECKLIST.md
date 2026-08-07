# DataCampus — Feature Checklist

Living product checklist for **DataCampus (DC)**: a YouTube-style campus resource hub that also becomes a smart academic workspace (papers, proposals, assignments, AI tools) students enjoy using — and that can grow into a monetizable platform.

**How to use**

- `[x]` Done / shipped
- `[~]` Partial / built but not fully wired
- `[ ]` Planned / not started
- Update status as work lands. Prefer finishing a vertical slice over starting many half-features.

**Product pillars**

1. **Resource hub** — discover, upload, view campus learning materials
2. **YouTube-for-resources** — uploaders as channels, feed, engagement, related content
3. **Smart academic tools** — AI that understands school standards (proposals, answers, assignments)
4. **Personalization** — themes, preferences, per-user AI model choice
5. **Trust & growth** — moderation, popularity, monetization

---

## 1. Core resource hub

### Browse & discovery

- [x] Home feed of papers / resources
- [x] Filter by school
- [x] Filter by program
- [x] Filter by type (Exam / Test / Material)
- [~] Featured / highlighted resources strip
- [~] Homepage stats (replace fetch-limited / static numbers with real counts)
- [~] Full-text **search** by title, course, keywords
- [x] Dedicated `/search` page (currently linked, missing)
- [ ] Search suggestions / recent searches
- [ ] Filter by year / semester / unit / course code
- [ ] Sort: newest, most viewed, most saved, trending
- [ ] Infinite scroll / pagination beyond current fetch limit
- [ ] “For you” personalized feed from school + program preferences
- [ ] Trending this week (exam-season surfacing)
- [ ] Course / unit pages (group resources by course code)

### Resource viewing

- [x] Paper detail page
- [x] In-app PDF viewer
- [x] Zoom / fullscreen / download on detail page
- [~] Related / recommended resources (currently “latest other”, not personalized)
- [~] Related rail: same course, same type, same uploader
- [ ] View count tracking
- [ ] “Was this helpful?” feedback
- [ ] Preview thumbnail / first-page cover on cards (YouTube-like)
- [x] Card download action fully wired

### Upload

- [x] Auth-gated upload
- [x] Drag-and-drop / multi-file upload
- [x] Metadata: school, program, type, title
- [x] File hash dedupe via `stored_files`
- [~] Upload UX polish (progress, previews)
- [~] Upload goes to **moderation queue** (`pending_papers`) instead of live
- [ ] Course code / unit / year / semester fields
- [ ] Optional description / tags
- [~] Credit uploader on every resource (`uploaded_by` → profile)
- [ ] Bulk upload admin tools (keep script; add in-app where useful)

### Auth & accounts

- [x] Google OAuth (Supabase)
- [~] Auth UI polish
- [ ] Email / password auth (marked coming soon)
- [~] Profiles table fully wired to UI
- [x] Dedicated `/profile` page (currently linked, missing)
- [ ] Edit display name, avatar, bio
- [ ] Account settings page

### Preferences & onboarding

- [x] Preference modal / launcher (built, not fully mounted)
- [x] Onboarding modal: school → courses/programs (built, not fully mounted)
- [~] Preferences in localStorage + user metadata (can desync)
- [~] First-run onboarding always shown for new users
- [x] Soft personalization: full catalog by default; prefs/interests re-rank (not lock) the feed
- [~] Preferences available anytime from profile / sidebar (optional)

---

## 2. YouTube-for-resources (social & interactive)

### Uploader = channel

- [~] Show **who posted** on every card and detail page
- [~] Public channel / profile page: avatar, name, bio, upload count
- [~] Channel resource grid (all uploads by user)
- [ ] Follow / subscribe to an uploader
- [ ] Follow a program or course feed
- [ ] “New from people you follow” section

### Engagement

- [x] Like button UI (no persistence)
- [x] Save / bookmark button UI (no persistence)
- [~] Persist likes
- [~] Persist saves / library (“Watch later” equivalent)
- [~] My Library page (saved + liked + my uploads)
- [ ] Comments on resources (tips, “this was the June paper”, etc.)
- [ ] Helpful / upvote comments
- [x] Share link (copy + native share on mobile)
- [ ] Report resource (wrong file, duplicate, spam)

### Feed feel (UI style)

- [~] Mobile bottom tab bar (Home / Search / Upload / Profile)
- [~] Card redesign with badges and hover actions
- [ ] Dense YouTube-like grid (strong thumbnails, channel row under title)
- [~] Hover / focus: quick save, like, more menu
- [~] Detail page layout: player (PDF) + related sidebar (desktop)
- [~] Mobile: related section under viewer
- [~] Skeleton loaders everywhere lists load
- [~] Empty states with clear CTAs
- [x] Toast notifications used for real actions (save, follow, upload, errors)

---

## 3. Trust, moderation & admin

- [~] `pending_papers` moderation workflow live
- [~] Admin review queue UI (approve / reject / request changes)
- [~] Roles from `profiles.role` (`user`, `moderator`, `admin`, …)
- [~] Admin audit log (`admin_audit`) for approvals and bans
- [ ] Duplicate detection beyond hash (similar titles)
- [ ] Content quality guidelines page
- [ ] Ban / mute abusive accounts
- [ ] Messaging / inbox (`messages` schema → real notifications for approvals, follows, replies)

---

## 4. Smart academic tools (AI workspace)

> Goal: DC feels like it understands the college — standards, formats, and student deadlines — not just a ChatGPT wrapper.

### Shared AI platform

- [ ] Per-user **AI model preference** (pick default model for their account)
- [ ] Supported providers/models configurable (e.g. Claude, GPT, Gemini, open models)
- [ ] Secure server-side AI calls (no user API keys in client unless BYOK)
- [ ] Optional **Bring Your Own Key (BYOK)** for power users
- [ ] Usage limits per plan (free tier + paid)
- [ ] Prompt / context injection: school, program, course, resource metadata
- [ ] AI history per user (past generations, regenerate, export)
- [ ] Safety: refuse cheating framing where required; favor study / practice modes

### Exam answer sheet generator

- [ ] Open an exam/test PDF and request an **answer sheet**
- [ ] Structured answers (numbered to match questions)
- [ ] Mark scheme / working steps mode (study aid)
- [ ] Confidence / “verify with lecturer” disclaimers
- [ ] Save answer sheet to Library
- [ ] Export PDF / Markdown / DOCX
- [ ] Link answer sheet back to source paper

### Assignment solver / helper

- [ ] Upload or paste assignment brief
- [ ] Detect assignment type (essay, code, calc, case study, etc.)
- [ ] Step-by-step solution / outline mode (learning-first)
- [ ] Full draft mode (where academically appropriate)
- [ ] Cite campus materials when relevant
- [ ] Plagiarism-awareness tips / originality checklist
- [ ] Export + save to Library

### Final-year project & proposal intelligence

- [ ] School / course **proposal standards** library (start with one SE course)
- [ ] Rubric / structure checklist (sections required by the college)
- [ ] Proposal draft assistant (guided sections)
- [ ] Score / critique draft against local standards
- [ ] Gap filler (“missing methodology”, “weak objectives”, etc.)
- [ ] Export submission-ready proposal (DOCX / PDF)
- [ ] Store past accepted anonymized examples (with permission)
- [ ] Expand standards to more schools / courses over time
- [ ] Later: FYP build companion (milestones, docs, viva prep)

### Request & gaps

- [ ] “Request a paper / resource” form
- [ ] Vote on requests (demand signal)
- [ ] Notify when a requested resource is uploaded
- [ ] “No results — ask AI or request upload” empty state

---

## 5. Personalization & “understands me”

- [ ] Remember school, programs, year, interests
- [ ] Homepage greets with relevant program context
- [ ] Deadline / exam-season mode (boost exams & past papers)
- [ ] Study streak / weekly activity (light gamification)
- [ ] Smart suggestions: “Students in BIT also viewed…”
- [ ] Notification preferences (email / in-app)
- [ ] Accessibility: font size, reduced motion
- [ ] Language preference (if multi-language later)

### Theme & appearance

- [~] Dark mode via system preference only
- [ ] In-app light / dark / system toggle
- [ ] **Custom theme accent color** per user
- [ ] Preset campus themes (e.g. Engineering blue, Business teal, ICT green)
- [ ] Persist theme on profile / local settings
- [ ] Consistent theming across cards, tabs, PDF chrome, modals

---

## 6. UI / UX polish (ongoing)

- [~] Mobile-first shell (header, drawer, tab bar)
- [~] Loading skeletons
- [~] Empty states
- [ ] Favicon + Open Graph / social metadata
- [ ] Integration testing pass (nav, auth, upload, viewer, theme)
- [ ] Performance: lazy routes, image/PDF worker optimization, bundle trim
- [ ] Accessibility pass (keyboard, ARIA, contrast)
- [ ] Remove dead deps / unused Firebase if still unused
- [ ] Real toasts on success/error paths
- [ ] Fix broken nav targets (`/search`, `/profile`)
- [x] Wire AuthGate / Onboarding / PreferenceLauncher into layout

---

## 7. Growth, popularity & monetization

### Make it the campus default

- [ ] Shareable resource links that look good in WhatsApp / Telegram
- [ ] Class / cohort invite links
- [ ] Contributor leaderboard (most helpful uploads)
- [ ] Verified contributor badge
- [ ] Partner with class reps / societies for seeding content
- [ ] Simple landing pitch for non-logged visitors (brand-first)

### Monetization (AI & premium — keep library free)

- [ ] Free tier: browse, upload, limited AI uses
- [ ] Paid tier: higher AI limits, model choice, exports
- [ ] Per-proposal / per-answer-sheet unlock (impulse purchase)
- [ ] BYOK free of quota (or discounted)
- [ ] Later: department / club license
- [ ] Payment provider integration
- [ ] Billing portal / invoices
- [ ] Usage dashboard for the user

---

## 8. Data model & platform (engineering checklist)

### Existing schema (use or extend)

- [x] `papers`
- [x] `stored_files` (hash dedupe)
- [~] `profiles` (exists; UI incomplete)
- [~] `pending_papers` (exists; unused by upload flow)
- [ ] `messages` (exists; no UI)
- [~] `admin_audit` (exists; unused)

### Likely new / extended tables (plan when building)

- [~] `papers.uploaded_by` (+ optional course/year/tags columns)
- [~] `likes` / `saves` / `views`
- [ ] `follows` (user→user, user→program)
- [ ] `comments`
- [ ] `resource_requests`
- [ ] `ai_generations` (type, model, source paper, output refs)
- [ ] `user_settings` (theme accent, AI model, notification prefs)
- [ ] `proposal_standards` / `rubrics`
- [ ] `subscriptions` / `usage_quotas`

### Infra

- [ ] Env-based Supabase config (no hardcoded secrets in repo)
- [ ] Rate limiting on AI and upload APIs
- [ ] Storage lifecycle / orphan cleanup
- [ ] Analytics (privacy-friendly) for popular resources

---

## Suggested build waves

Use this order so the site feels complete before the heavy AI bet.

| Wave | Focus | Checklist sections |
|------|--------|--------------------|
| **A** | Finish incomplete UX + YouTube social base | 1 (search/profile), 2, 6 |
| **B** | Trust (moderation, roles) | 3 |
| **C** | Personalization + themes + per-user AI settings | 5, AI platform foundation in 4 |
| **D** | Answer sheets + assignment helper | 4 |
| **E** | Proposal / FYP standards engine (start: one SE course) | 4 |
| **F** | Monetization + growth loops | 7 |

---

## Decision log (optional)

Record product decisions here so agents and contributors stay aligned.

| Date | Decision |
|------|----------|
| 2026-07-27 | Vision locked: YouTube-for-resources + smart academic AI (answers, assignments, proposals) + per-user model/theme personalization; library stays free, AI is the monetization surface. |
| 2026-07-27 | Start standards engine with **one school / one SE proposal format**, then expand. |

---

## Notes

- Prefer wiring orphaned UI (`OnboardingModal`, `AuthGate`, likes/saves, toasts) before adding net-new chrome.
- AI features must feel **campus-aware** (school standards, linked resources), not generic chat.
- Academic integrity: default copy and UX should frame tools as study / drafting aids with clear disclaimers where needed.
- Keep this file updated when shipping; treat it as the source of truth over chat history.
