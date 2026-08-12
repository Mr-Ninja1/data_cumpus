
### UX flow
1. user uploads ZICTC ID image
2. image stored in Supabase Storage
3. OCR route sends image to Gemini Vision
4. response normalized into strict JSON
5. if confidence is high, confirm extracted values
6. write `profiles` fields and mark verified
7. if confidence is weak, mark `needs_review`

### Important guardrails
- extracted name should be locked or strongly restricted
- never trust client-submitted identity fields directly
- low-confidence OCR should not auto-verify
- creator access should depend on verification state, not just upload success

## Module 2: Wallet and Credits

### Product outcome
`/wallet` becomes the central balance and transaction hub for all premium AI actions.

### DB changes
Add:
- `wallets`
  - `user_id`
  - `balance_credits`
  - `lifetime_purchased`
  - `lifetime_spent`
  - `updated_at`

- `wallet_transactions`
  - `id`
  - `user_id`
  - `kind` (`deposit`, `spend`, `refund`, `bonus`, `adjustment`)
  - `credits_delta`
  - `cash_amount`
  - `currency`
  - `status` (`pending`, `completed`, `failed`, `reversed`)
  - `provider`
  - `reference`
  - `metadata jsonb`
  - `created_at`

- `credit_packages`
  - `id`
  - `name`
  - `credits`
  - `price`
  - `currency`
  - `is_active`
  - `is_popular`
  - `sort_order`

- `deposit_requests`
  - `id`
  - `user_id`
  - `package_id`
  - `provider`
  - `phone_number`
  - `reference`
  - `proof_path`
  - `status`
  - `created_at`

### Routes
Add:
- `datacampus/src/app/wallet/page.tsx`
- `datacampus/src/app/api/wallet/balance/route.ts`
- `datacampus/src/app/api/wallet/transactions/route.ts`
- `datacampus/src/app/api/wallet/deposit/route.ts`
- `datacampus/src/app/api/wallet/consume/route.ts`

Admin side later:
- `datacampus/src/app/api/admin/wallet/transactions/route.ts`
- `datacampus/src/app/api/admin/wallet/adjust/route.ts`

### Component map
Add:
- `datacampus/src/components/wallet/BalanceBanner.tsx`
- `datacampus/src/components/wallet/CreditPackageCard.tsx`
- `datacampus/src/components/wallet/DepositModal.tsx`
- `datacampus/src/components/wallet/TransactionList.tsx`
- `datacampus/src/components/wallet/TransactionRow.tsx`

### Service/util layer
Add:
- `datacampus/src/utils/wallet.ts`
- `datacampus/src/utils/credits.ts`

### Critical server rules
All spending must be enforced server-side:
- check balance on server
- write transaction on server
- deduct credits atomically
- never let client decrement credits directly

### Good future use of credits
Once wallet exists, reuse it for:
- proposal generation
- proposal rewriting
- OCR tools
- export features
- summarization
- formatting assistant
- citation assistant

## Module 3: Proposal Workspace

### Product outcome
This should become the flagship retention feature, not just a page with AI text generation.

### DB changes
Add:
- `proposal_projects`
  - `id`
  - `user_id`
  - `title`
  - `department`
  - `supervisor`
  - `academic_year`
  - `status`
  - `current_step`
  - `created_at`
  - `updated_at`

- `proposal_sections`
  - `id`
  - `project_id`
  - `section_key`
  - `title`
  - `content_md`
  - `content_html`
  - `version`
  - `updated_at`

- `proposal_generations`
  - `id`
  - `project_id`
  - `section_id`
  - `prompt_type`
  - `prompt_text`
  - `response_text`
  - `credits_spent`
  - `model`
  - `created_at`

- `proposal_exports`
  - `id`
  - `project_id`
  - `format`
  - `file_path`
  - `status`
  - `created_at`

Optional later:
- `proposal_comments`
- `proposal_versions`
- `proposal_templates`

### Routes
Add:
- `datacampus/src/app/workspace/proposals/page.tsx`
- `datacampus/src/app/workspace/proposals/[id]/page.tsx`
- `datacampus/src/app/api/proposals/route.ts`
- `datacampus/src/app/api/proposals/[id]/route.ts`
- `datacampus/src/app/api/proposals/[id]/generate/route.ts`
- `datacampus/src/app/api/proposals/[id]/export/route.ts`

### Component map
Add:
- `datacampus/src/components/proposals/ProposalStepSidebar.tsx`
- `datacampus/src/components/proposals/ProposalEditor.tsx`
- `datacampus/src/components/proposals/ProposalPreview.tsx`
- `datacampus/src/components/proposals/ProposalAiPanel.tsx`
- `datacampus/src/components/proposals/ProposalProgressHeader.tsx`
- `datacampus/src/components/proposals/ExportButton.tsx`

### Service/util layer
Add:
- `datacampus/src/utils/proposals.ts`
- `datacampus/src/utils/proposalPrompts.ts`
- `datacampus/src/utils/exportProposal.ts`
- `datacampus/src/utils/gemini.ts`

### MVP step structure
Use these fixed section keys first:
- `cover`
- `background`
- `problem_statement`
- `objectives_scope`
- `architecture_stack`
- `budget_timeline`

That gives you a stable editor model and export pipeline.

### AI generation pattern
For each generation request:
1. authenticate user
2. verify wallet balance
3. verify proposal ownership
4. charge credits on server
5. call Gemini
6. save generation log
7. update section content or return draft suggestion

## Cross-cutting system design

### Shared environment/config you’ll need
Add env support for:
- `GEMINI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional payment provider keys later

### Shared UI/navigation additions
Eventually add nav entries for:
- `Verify`
- `Wallet`
- `Workspace`

Best places:
- desktop sidebar
- mobile tab extensions or profile/menu entry
- profile page quick actions

### Shared profile model upgrades
The current `profiles` table is too thin for where this is going. It should eventually carry:
- `display_name`
- `full_name`
- `student_id`
- `program`
- `department`
- `is_verified`
- `verification_status`
- `role`
- `metadata`

### Shared admin surface
Because you already have admin work started, these modules should plug into it:
- verification queue
- wallet transaction review
- manual credit adjustments
- proposal usage analytics
- AI failure logs

## Best implementation sequence in this repo

### Step 1
Create a new migration bundle:
- `supabase/verification.sql`
- `supabase/wallet.sql`
- `supabase/proposals.sql`

Do this carefully and idempotently, following the style of `messages_foundation.sql`.

### Step 2
Build verification first:
- page
- OCR route
- storage flow
- profile update
- status badge

### Step 3
Build wallet core:
- schema
- `/wallet`
- transaction list
- server credit consumption helpers

### Step 4
Build proposal workspace MVP:
- proposal list
- single project workspace
- section save/load
- AI generate route
- export stub

### Step 5
Integrate credits into proposal generation and export

## My creative additions beyond `cd.md`

If you want DataCampus to feel bigger than a toolset, I’d add these after MVP:

- verified uploader badges on paper cards and profiles
- proposal templates by discipline
- AI “improve academic tone” anywhere in the platform
- shared project showcase pages
- reviewer/advisor comment mode
- “study channels” by program
- saved prompt presets per student
- generation history and restore points

## What I’d do next

The cleanest next move is:

1. create the DB design for all three modules first
2. implement only Phase 1 end-to-end before touching wallet/workspace UI
3. then use the wallet model as a reusable billing layer for every future AI tool

If you want, I can next turn this roadmap into a concrete build spec with:
- exact SQL tables
- exact route list
- exact component tree
- exact order of implementation for the first coding pass

Or I can start immediately with Phase 1 and create the verification migration + `/verify` page.

---

**User**

proceed and listen the chat has become really long so every prompt i send resends the entire chat history meaning we will hit credit limit faster , so when you start implementing just keep going if possible finish everything and when done you will let me know if you need any migrations run 

---

**Cursor**

I'll implement the full stack in one pass: migrations first, then verification, wallet, and the proposal workspace, and I'll only stop at the end to tell you which SQL to run.


