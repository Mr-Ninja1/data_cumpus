# DataCampus UI/UX Redesign - Parallel Development Plan

## Overview
Transform DataCampus into a professional, mobile-first resource hub with YouTube-like mobile navigation and personalized onboarding flow.

## Agent Roles & Responsibilities

### 🎯 Cursor (You - Integrator + Support)
- **Primary Focus**: Integration, coordination, and merge readiness
- **Secondary Focus**: Performance pass + fixing integration issues + overflow component work
- **Decision Making**: Final arbiter on design decisions and conflicts
- **File Ownership**:
  - Integration fixes across the app when conflicts arise
  - App-wide metadata and final integration polish (after Phase 1 stabilizes)
  - Phase 6 (integration & testing) lead

### 🌊 Windsurf (SE 1.6 - Foundation + Component + UX)
- **Primary Focus**: Phase 1 foundation + component redesign/implementation
- **Secondary Focus**: Mobile navigation + onboarding UX + page polish + dark mode coverage
- **File Ownership**:
  - `src/app/globals.css`, `src/app/layout.tsx` (Phase 1 foundation)
  - All component files in `src/components/`
  - `src/app/page.tsx` and UX-heavy page changes

---

## Phase 1: Foundation (Sequential - MUST COMPLETE FIRST)

### Task 1.1: Fix Dependencies (WINDSURF)
- **File**: `package.json` (root level)
- **Action**: Run `npm install` from `datacampus` folder
- **Status**: ✅ Verified Complete
- **Dependencies**: None

### Task 1.2: Typography System (WINDSURF)
- **File**: `src/app/layout.tsx`, `src/app/globals.css`
- **Action**:
  - Switch from Geist to Inter font family
  - Add font weights: 400, 500, 600, 700
  - Set proper line heights and letter spacing
- **Status**: ✅ Verified Complete
- **Dependencies**: Task 1.1

### Task 1.3: Color Palette (WINDSURF)
- **File**: `src/app/globals.css`
- **Action**: Define CSS variables for:
  - Primary: Indigo-600 (#4F46E5) with gradient
  - Secondary: Slate-500 (#64748B)
  - Success: Emerald-500 (#10B981)
  - Error: Rose-500 (#F43F5E)
  - Warning: Amber-500 (#F59E0B)
  - Full dark mode variants for all colors
- **Status**: ✅ Verified Complete
- **Dependencies**: Task 1.2

### Task 1.4: Global CSS Utilities (WINDSURF)
- **File**: `src/app/globals.css`
- **Action**:
  - Add spacing scale (4px base unit)
  - Add border radius utilities
  - Add shadow utilities
  - Add transition utilities
- **Status**: ✅ Verified Complete
- **Dependencies**: Task 1.3

---

## Phase 2: Mobile Navigation & Onboarding (PARALLEL - AFTER PHASE 1)

### Task 2.1: Bottom Tab Bar (WINDSURF)
- **File**: `src/components/MobileTabBar.tsx` (NEW)
- **Action**:
  - Create YouTube-like bottom navigation
  - Tabs: Home, Search, Upload, Profile
  - Active state indicators
  - Smooth icon animations
  - Hide on desktop, show on mobile (< 768px)
- **Status**: ✅ Complete
- **Dependencies**: Phase 1 complete

### Task 2.2: Onboarding Modal (WINDSURF)
- **File**: `src/components/OnboardingModal.tsx` (NEW)
- **Action**:
  - Create first-time user onboarding flow
  - Step 1: Select school (with icons)
  - Step 2: Select courses/programs
  - Step 3: Confirm and save preferences
  - Skip option for returning users
  - Store in localStorage and Supabase user metadata
- **Status**: ✅ Complete
- **Dependencies**: Phase 1 complete

### Task 2.3: Mobile Header (WINDSURF)
- **File**: `src/components/Header.tsx`
- **Action**:
  - Add mobile hamburger menu
  - Simplified search bar for mobile
  - Hide desktop elements on mobile
  - Smooth menu toggle animation
- **Status**: ✅ Complete
- **Dependencies**: Phase 1 complete

### Task 2.4: Mobile Drawer Sidebar (WINDSURF)
- **File**: `src/components/Sidebar.tsx`
- **Action**:
  - Convert to slide-in drawer on mobile
  - Add backdrop overlay
  - Touch-friendly close gestures
  - Smooth open/close animations
- **Status**: ✅ Complete
- **Dependencies**: Phase 1 complete

---

## Phase 3: Core Components (PARALLEL - AFTER PHASE 2)

### Task 3.1: PaperCard Redesign (WINDSURF)
- **File**: `src/components/PaperCard.tsx`
- **Action**:
  - Add gradient overlay on thumbnail
  - Colored type badges (Exam=blue, Test=amber, Material=green)
  - Hover lift effect with enhanced shadow
  - Download button on hover
  - Mobile-optimized tap targets
  - Aspect ratio optimization
- **Status**: ✅ Complete
- **Dependencies**: Phase 2 complete

### Task 3.2: Header Polish (WINDSURF)
- **File**: `src/components/Header.tsx`
- **Action**:
  - Gradient text for "DataCampus" logo
  - Enhanced search bar with focus ring
  - Better icon button styling
  - Improved dropdown menu
  - Smooth hover transitions
- **Status**: ✅ Complete
- **Dependencies**: Phase 2 complete

### Task 3.3: PaperFilters Enhancement (WINDSURF)
- **File**: `src/components/PaperFilters.tsx`
- **Action**:
  - Better chip colors with active states
  - Animated selection transitions
  - Improved dropdown styling
  - Horizontal scroll for mobile chips
  - Touch-friendly tap targets
- **Status**: ✅ Complete
- **Dependencies**: Phase 2 complete

### Task 3.4: Loading Skeleton (WINDSURF)
- **File**: `src/components/LoadingSkeleton.tsx` (NEW)
- **Action**:
  - Create skeleton loader for paper cards
  - Shimmer animation effect
  - Responsive grid layout
  - Dark mode support
- **Status**: ✅ Complete
- **Dependencies**: Phase 2 complete

### Task 3.5: Empty State (WINDSURF)
- **File**: `src/components/EmptyState.tsx` (NEW)
- **Action**:
  - Create empty state for no papers
  - Create empty state for no search results
  - Friendly illustrations/icons
  - Call-to-action buttons
  - Dark mode support
- **Status**: ✅ Complete
- **Dependencies**: Phase 2 complete

---

## Phase 4: Forms & UX (PARALLEL - AFTER PHASE 3)

### Task 4.1: UploadForm Redesign (WINDSURF)
- **File**: `src/components/UploadPaperForm.tsx`
- **Action**:
  - Progress indicators for uploads
  - Better drag-drop zone with visual feedback
  - File preview cards with thumbnails
  - Improved form layout
  - Mobile-friendly file selection
  - Error handling with clear messages
- **Status**: ✅ Complete
- **Dependencies**: Phase 3 complete

### Task 4.2: Homepage Enhancement (WINDSURF)
- **File**: `src/app/page.tsx`
- **Action**:
  - Add hero section with stats
  - Featured papers section
  - Better grid layout
  - Mobile-optimized feed
  - Infinite scroll (optional)
- **Status**: ✅ Complete
- **Dependencies**: Phase 3 complete

### Task 4.3: PDF Viewer Enhancement (WINDSURF)
- **File**: `src/app/paper/[id]/page.tsx`
- **Action**:
  - Better toolbar design
  - Page navigation controls
  - Zoom controls
  - Download button
  - Mobile-optimized controls
- **Status**: ✅ Complete
- **Dependencies**: Phase 3 complete

### Task 4.4: Auth Improvement (WINDSURF)
- **File**: `src/components/Auth.tsx`
- **Action**:
  - Better button styling
  - Social login icons
  - Loading states
  - Error messages
- **Status**: ✅ Complete
- **Dependencies**: Phase 3 complete

---

## Phase 5: Polish & Integration (PARALLEL - AFTER PHASE 4)

### Task 5.1: Toast Notifications (WINDSURF)
- **File**: `src/components/Toast.tsx` (NEW)
- **Action**:
  - Create toast notification system
  - Success, error, info variants
  - Auto-dismiss with timer
  - Stack multiple toasts
  - Dark mode support
- **Status**: ✅ Complete
- **Dependencies**: Phase 4 complete

### Task 5.2: Page Transitions (WINDSURF)
- **File**: `src/app/globals.css`
- **Action**:
  - Add route transition animations
  - Loading states between pages
  - Smooth fade effects
- **Status**: ✅ Complete
- **Dependencies**: Phase 4 complete

### Task 5.3: Dark Mode Perfection (WINDSURF)
- **Multiple Files**: All component files
- **Action**:
  - Audit all components for dark mode
  - Fix any dark mode issues
  - Ensure smooth theme transitions
  - Test color contrast
- **Status**: ✅ Complete
- **Dependencies**: Phase 4 complete

### Task 5.4: AuthGate Enhancement (WINDSURF)
- **File**: `src/components/AuthGate.tsx`
- **Action**:
  - Add fade-in animation
  - Better loading spinner
  - Improved error states
- **Status**: ✅ Complete
- **Dependencies**: Phase 4 complete

### Task 5.5: PreferenceModal Improvement (WINDSURF)
- **File**: `src/components/PreferenceModal.tsx`
- **Action**:
  - Better form styling
  - Clear visual hierarchy
  - Save animations
  - Mobile-friendly layout
- **Status**: ✅ Complete
- **Dependencies**: Phase 4 complete

### Task 5.6: Favicon & Metadata (CURSOR)
- **File**: `src/app/layout.tsx`, `public/favicon.ico`
- **Action**:
  - Create professional favicon
  - Improve metadata
  - Add Open Graph tags
  - Add Twitter card tags
- **Status**: ⏳ Pending
- **Dependencies**: Phase 4 complete

---

## Phase 6: Integration & Testing (CURSOR LEADS)

### Task 6.1: Integration Testing (CURSOR + WINDSURF)
- **Action**:
  - Test all components together
  - Verify responsive behavior
  - Test mobile navigation
  - Test onboarding flow
  - Test dark mode
  - Fix integration issues
- **Status**: ⏳ Pending
- **Dependencies**: Phase 5 complete

### Task 6.2: Performance Optimization (CURSOR)
- **Action**:
  - Optimize images
  - Lazy load components
  - Code splitting
  - Bundle size analysis
- **Status**: ⏳ Pending
- **Dependencies**: Task 6.1 complete

### Task 6.3: Final Polish (CURSOR + WINDSURF)
- **Action**:
  - Fix any remaining bugs
  - Polish animations
  - Improve accessibility
  - Final review
- **Status**: ⏳ Pending
- **Dependencies**: Task 6.2 complete

---

## Coordination Rules

### Communication Protocol
1. **Before starting any task**: Check if dependencies are complete
2. **After completing any task**: Update status in this file
3. **Conflicts**: Escalate to Cursor for resolution
4. **File conflicts**: Use git branches or coordinate file access times

### Git Workflow
1. Each agent works on their assigned files
2. Commit frequently with descriptive messages
3. Use feature branches if needed
4. Cursor coordinates merges to main

### Testing Protocol
1. Test locally before marking complete
2. Verify mobile responsiveness (use Chrome DevTools)
3. Test dark mode toggle
4. Check for console errors

### Priority Order
1. **Phase 1** (Foundation) - MUST BE SEQUENTIAL
2. **Phase 2** (Mobile Nav) - PARALLEL AFTER PHASE 1
3. **Phase 3** (Core Components) - PARALLEL AFTER PHASE 2
4. **Phase 4** (Forms & UX) - PARALLEL AFTER PHASE 3
5. **Phase 5** (Polish) - PARALLEL AFTER PHASE 4
6. **Phase 6** (Integration) - BOTH AGENTS TOGETHER

---

## Status Dashboard

- **Phase 1**: ✅ Complete (Verified by Windsurf)
- **Phase 2**: ✅ Complete (WINDSURF)
- **Phase 3**: ✅ Complete (WINDSURF)
- **Phase 4**: ✅ Complete (WINDSURF)
- **Phase 5**: ✅ Complete (WINDSURF)
- **Phase 6**: ⏳ Not Started

**Overall Progress**: 87% (20/23 tasks complete)

---

## Notes

- All agents should work in the `datacampus` directory
- Use TypeScript strict mode
- Follow existing code style
- Test on mobile viewport (375px width minimum)
- Ensure accessibility (ARIA labels, keyboard navigation)
- Dark mode should work seamlessly
- Performance target: < 3s initial load, < 100ms interactions
