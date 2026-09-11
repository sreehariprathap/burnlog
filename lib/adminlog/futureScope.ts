// lib/adminlog/futureScope.ts
//
// Findings from the 2026-09-10 whole-codebase review (frontend + backend).
// Single source of truth for AdminLog > General > Future Scope — the page
// renders this array, so the tracker and the write-up never drift.
//
// The prose write-up, with the failure scenarios, verification queries, and
// refactored code, lives at:
//   docs/superpowers/reviews/2026-09-10-codebase-review.md
//
// `status` is the only field expected to change over time. Flip it to
// 'done' (or 'wontfix', with a reason in `note`) as items land, rather than
// deleting entries — the list doubles as the audit trail for what was
// found when.

export const FUTURE_SCOPE_REVIEW_DATE = '2026-09-10';
export const FUTURE_SCOPE_DOC_PATH =
  'docs/superpowers/reviews/2026-09-10-codebase-review.md';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'ux';
export type FindingStatus = 'open' | 'in-progress' | 'done' | 'wontfix';

export interface Finding {
  /** Stable id used in the doc and in commit messages (C1, H3, U7, …). */
  id: string;
  severity: FindingSeverity;
  title: string;
  /** Area tag for grouping/scanning, e.g. 'security', 'money', 'a11y'. */
  area: string;
  /** Files or globs the finding points at. */
  files: string[];
  /** What is wrong, in one or two sentences. */
  problem: string;
  /** What goes wrong in practice if it stays as-is. */
  impact: string;
  /** The recommended change. */
  fix: string;
  status: FindingStatus;
  /** Optional caveat — e.g. something that needs checking against prod. */
  note?: string;
}

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Improvements',
  ux: 'UI / UX',
};

export const SEVERITY_BLURBS: Record<FindingSeverity, string> = {
  critical: 'Data exposure, money correctness, and a red test suite. Fix before new feature work.',
  high: 'Exploitable or user-facing, but contained. Schedule deliberately.',
  medium: 'Performance, architecture, and maintainability. Highest win per hour spent.',
  ux: 'Accessibility and interaction gaps, mostly in GlobalSearch and the shared overlay surfaces.',
};

export const FINDINGS: Finding[] = [
  // ── Critical ────────────────────────────────────────────────────────────
  {
    id: 'C1',
    severity: 'critical',
    title: '26 of 109 tables have no RLS statement',
    area: 'security',
    files: ['supabase/rls.sql', 'prisma/schema.prisma'],
    problem:
      'rls.sql enables RLS on 51 tables and defines 96 policies, but the schema declares 109 tables. 26 are absent entirely, including intel_chat_messages, intel_chat_threads, habits, savings_buckets, bucket_entries, watch_items and travellog_passport_entries.',
    impact:
      'The anon key ships in the browser bundle by design. Any table with RLS off is world-readable and world-writable with it — including every user\'s private AI chat history and finances.',
    fix:
      'Add enable-RLS + policies for all 26, then gate deploys on a pg_class/pg_policy query that fails when any public table has RLS off or zero policies.',
    status: 'open',
    note: 'Some may have been enabled by hand in the Supabase dashboard after the table landed — run the verification query in the doc before triaging severity.',
  },
  {
    id: 'C2',
    severity: 'critical',
    title: 'RLS lives outside migrations, so drift is structural',
    area: 'security',
    files: ['supabase/rls.sql'],
    problem:
      'Policies are a hand-run "paste into the SQL editor" file. Nothing guarantees it is executed, and nothing fails when a new table lands without a policy.',
    impact:
      'C1 is the proof: 26 tables have already drifted since the file was written. The same thing will happen to the next 26.',
    fix:
      'Move the file into a numbered Prisma migration so it is applied by the same command that creates the table, and assert coverage post-deploy.',
    status: 'open',
  },
  {
    id: 'C3',
    severity: 'critical',
    title: '/api/invites/mark-signed-up is an unauthenticated service-role write',
    area: 'security',
    files: ['app/api/invites/mark-signed-up/route.ts'],
    problem:
      'The route takes an email from the request body and updates adminlog_invites with the service-role client. No auth check, no caller identity, no rate limit, and middleware does not cover /api.',
    impact:
      'Anyone on the internet can mark any pending invite as signed-up, corrupting the invite dashboard. The 200-vs-noop difference also makes it an invite-existence oracle for email enumeration.',
    fix:
      'Require a session and mark only the caller\'s own invite (user.email), ignoring the request body entirely.',
    status: 'open',
  },
  {
    id: 'C4',
    severity: 'critical',
    title: 'Wallet double-spend — balance check and debit are not atomic',
    area: 'money',
    files: ['app/api/moneylog/pay/route.ts'],
    problem:
      'getBalance() then a separate insert, with no transaction, row lock, or constraint. The repo contains zero .rpc() calls, so no money operation anywhere is atomic.',
    impact:
      'Ten concurrent POSTs from a ₹100 balance all read ₹100, all pass the check, and all insert — ₹1,000 spent. Because the same balance gates ShoppingLog checkout, it converts into real goods.',
    fix:
      'A wallet_pay Postgres function taking an advisory lock on the payer, checking the balance and writing payment + both ledger rows in one transaction.',
    status: 'open',
    note: 'The in-code comment calls this "a narrow theoretical race window" — it is reproducible with xargs -P10 curl.',
  },
  {
    id: 'C5',
    severity: 'critical',
    title: 'pay ignores the ledger insert error, leaving a payment with no debit',
    area: 'money',
    files: ['app/api/moneylog/pay/route.ts'],
    problem:
      'Every other write in the route checks `error`; the finance_transactions insert does not. The route returns 200 with a paymentId regardless of whether the ledger rows were written.',
    impact:
      'A failed ledger insert leaves a payments row with no debit. Checkout validates against the payments row, finds it consistent, and creates the order — free goods, and the seller\'s income row is missing too.',
    fix: 'Same wallet_pay RPC as C4 — one transaction, or delete the orphaned payment on error.',
    status: 'open',
  },
  {
    id: 'C6',
    severity: 'critical',
    title: 'getBalance fetches every row and is silently truncated',
    area: 'money',
    files: ['lib/moneylog/balance.ts'],
    problem:
      'Selects every finance_transactions row for a profile and sums them in Node. PostgREST\'s default db-max-rows is 1000, with no error and no pagination.',
    impact:
      'Past 1000 transactions the reported balance is simply wrong, which is either free money or a user locked out of their own funds. It also transfers a user\'s full financial history on every payment and checkout.',
    fix: 'A wallet_balance(uuid) SQL function that aggregates in Postgres.',
    status: 'open',
    note: 'Confirm the project\'s Settings → API → Max rows value to pin down exactly when truncation begins.',
  },
  {
    id: 'C7',
    severity: 'critical',
    title: 'Money is stored as floating point',
    area: 'money',
    files: ['prisma/schema.prisma', 'app/api/shoppinglog/checkout/route.ts'],
    problem:
      'Payment.amount, FinanceTransaction.amount, ShopListing.price, ShopOrder.totalAmount, HouseholdExpense.totalAmount and others are Prisma Float (double precision).',
    impact:
      'A ₹100 expense split three ways stores 33.333333333333336, so "settled up" never reaches zero. And checkout\'s Math.abs(total - paid) > 0.01 tolerance — a workaround for the same drift — is a free-discount window a buyer can shave every order.',
    fix: 'Decimal @db.Decimal(12,2) or integer minor units, with exact comparison at the boundary.',
    status: 'open',
    note: 'Migration plus backfill — plan it. Worth doing in the same change as C4–C6 since those columns get touched anyway.',
  },
  {
    id: 'C8',
    severity: 'critical',
    title: 'Checkout oversells stock',
    area: 'money',
    files: ['app/api/shoppinglog/checkout/route.ts'],
    problem:
      'Stock is filtered in JS, then written back as a computed absolute value with an unconditional update — last writer wins. The shop_order_items insert error is unchecked too.',
    impact:
      'One unit, two simultaneous buyers: both read 1, both write 0, two orders exist for one unit. Larger quantities push the column negative, and status is computed from the stale read so a sold-out listing can stay active.',
    fix:
      'Conditional update (.gte("stockQuantity", qty) + .select()) and treat an empty result as 409. Better: move the whole checkout into one RPC.',
    status: 'open',
  },
  {
    id: 'C9',
    severity: 'critical',
    title: 'npm test is red on master',
    area: 'testing',
    files: [
      'app/api/loading-animations/route.test.ts',
      'app/api/loading-animations/[id]/route.test.ts',
    ],
    problem:
      'Both suites assert 401 when unauthenticated, but the routes were deliberately made public reads (the route comments say so). The tests were never updated: 6 failed / 1009 passed.',
    impact:
      'The suite has been red since that change, so every regression since has landed into an already-failing run and nobody can tell new breakage from known breakage.',
    fix: 'Update both tests to the current public contract, and gate CI on npm test.',
    status: 'open',
  },

  // ── High ────────────────────────────────────────────────────────────────
  {
    id: 'H1',
    severity: 'high',
    title: 'No rate limiting anywhere, including on endpoints that spend money',
    area: 'security',
    files: ['app/api/**/route.ts', 'lib/ai/jobs.ts'],
    problem:
      'A repo-wide search for ratelimit/throttle returns zero hits across 167 routes. AI routes call OpenRouter with real credits; ai_jobs logs spend but enforces no quota.',
    impact:
      'Any authenticated user can loop the chat endpoint and burn the project-wide OpenRouter budget. ai_jobs records the damage after the fact.',
    fix: 'A per-profile token bucket in a shared route wrapper, plus a daily ai_jobs-backed spend cap inside runAiJob.',
    status: 'open',
  },
  {
    id: 'H2',
    severity: 'high',
    title: '89 request bodies are type-asserted, never validated',
    area: 'validation',
    files: ['app/api/**/route.ts'],
    problem:
      'Every request.json() is followed by `as SomeBody`. Type assertions are erased at compile time and guarantee nothing at runtime; zod is not a dependency.',
    impact:
      'PATCH {"name": 42} to moneylog/assets/[id] throws "name.trim is not a function" and returns 500 for what is a 400. pay accepts any category string; intellog/chat forwards a client-supplied model straight to OpenRouter and persists it.',
    fix: 'One zod schema per route behind a shared parseBody(request, schema) that returns 400 with field errors. Do it incrementally, money and AI routes first.',
    status: 'open',
  },
  {
    id: 'H3',
    severity: 'high',
    title: 'The service-role client is the default data path (130 of 167 routes)',
    area: 'security',
    files: ['lib/supabase/serviceRole.ts', 'app/api/**/route.ts'],
    problem:
      'createServiceRoleClient() bypasses RLS entirely, so authorization is hand-written prose in each handler. The routes sampled do this correctly — but correctness is unverifiable at this scale and enforced by nothing.',
    impact: 'One omission is a full data exposure. C3 is what that costs.',
    fix:
      'Invert the default: RLS-respecting server client for user-scoped work, service-role only for cron, admin, and genuinely public reads. Then a forgotten .eq("profileId") fails closed.',
    status: 'open',
  },
  {
    id: 'H4',
    severity: 'high',
    title: 'A live TMDB bearer token is committed to the repo',
    area: 'security',
    files: ['lib/watchlog/tmdb.ts'],
    problem: 'A full eyJ… JWT sits in the file as a hardcoded fallback, and is in git history.',
    impact: 'The token is usable by anyone with repo access, and rotating the env var alone does not revoke it.',
    fix:
      'Rotate in TMDB, set the deployment env var, delete the literal, and throw on a missing env var the way serviceRole.ts already does.',
    status: 'open',
  },
  {
    id: 'H5',
    severity: 'high',
    title: 'Pinch-zoom is disabled app-wide (WCAG 1.4.4)',
    area: 'a11y',
    files: ['app/layout.tsx'],
    problem:
      'The viewport export sets maximumScale: 1 and userScalable: false to work around an iOS keyboard/scroll bug.',
    impact:
      'Zoom is gone for every user on every page — a hard accessibility failure for low-vision users and an App Store accessibility-review risk.',
    fix:
      'Drop both flags and stop iOS auto-zoom the targeted way: computed font-size ≥ 16px on inputs. KeyboardFocusScroll already handles the scroll half.',
    status: 'open',
  },
  {
    id: 'H6',
    severity: 'high',
    title: 'Raw database error messages are returned to clients',
    area: 'security',
    files: [
      'app/api/shoppinglog/checkout/route.ts',
      'app/api/homelog/expenses/[id]/route.ts',
      'app/api/homelog/shopping-list/[id]/check/route.ts',
    ],
    problem:
      'Several routes return error.message straight to the client, which names tables, columns and constraints.',
    impact:
      'Free schema reconnaissance, and inconsistent with the rest of the codebase, which logs server-side and returns a generic message.',
    fix: 'A respondError(error, publicMessage) helper so the safe thing is the easy thing.',
    status: 'open',
  },
  {
    id: 'H7',
    severity: 'high',
    title: 'Check-then-act on state transitions (TOCTOU)',
    area: 'concurrency',
    files: ['app/api/homelog/shopping-list/[id]/check/route.ts'],
    problem:
      'Reads checkedAt, returns 400 if set, then updates unconditionally. Also sets quantity to lowStockThreshold + 1, where a null threshold evaluates to 1 in JS rather than failing.',
    impact:
      'Two members tapping the same item both pass the guard, both update, and both fire household notifications — everyone gets duplicate pushes for one checkoff.',
    fix: 'Make the update the guard — .is("checkedAt", null) + .select() — and notify only on the winning write.',
    status: 'open',
  },
  {
    id: 'H8',
    severity: 'high',
    title: 'The test runner executes stale worktree copies',
    area: 'testing',
    files: ['vitest.config.ts'],
    problem:
      'No exclude, so vitest picks up .claude/worktrees/**. Four of the six current failures are old code in old copies asserting old contracts.',
    impact: 'Inflated failure counts and slower runs make a genuine regression easy to wave off as "just the worktree ones".',
    fix: "exclude: ['**/node_modules/**', '**/.claude/**', '**/dist/**']",
    status: 'open',
  },

  // ── Improvements ────────────────────────────────────────────────────────
  {
    id: 'M1',
    severity: 'medium',
    title: '16 Google font families load on every page for an admin-only preference',
    area: 'performance',
    files: ['app/RootLayoutClient.tsx'],
    problem:
      'All 16 families are imported unconditionally so that switching the AdminLog typography setting needs no reload.',
    impact:
      'Every user on every visit downloads 14 fonts they will never see. Likely the single largest LCP contributor in the app.',
    fix: 'Load the two active families statically; inject the admin\'s alternate via a runtime <link> when a non-default is resolved.',
    status: 'open',
  },
  {
    id: 'M2',
    severity: 'medium',
    title: 'The entire app is a client component tree',
    area: 'architecture',
    files: ['app/layout.tsx', 'app/RootLayoutClient.tsx'],
    problem:
      'The root layout renders a "use client" component above {children}, and 396 files carry the directive.',
    impact: 'Every RSC benefit — zero-JS pages, server data fetching, smaller bundles — is forfeited at the root.',
    fix: 'Make RootLayoutClient a provider wrapper rather than the root, so pages can be server components. Convert the heaviest read-only pages first.',
    status: 'open',
  },
  {
    id: 'M3',
    severity: 'medium',
    title: 'backdrop-filter: blur(0px) on every card, button, input and nav',
    area: 'performance',
    files: ['app/globals.css'],
    problem:
      'The v1 tokens set blur to 0px, but .surface-* applies backdrop-filter unconditionally. Any non-none backdrop-filter promotes a compositing layer and creates a containing block.',
    impact:
      'The default non-glass path pays layer-promotion cost for zero visual effect, and any position: fixed child inside a card is positioned against the card instead of the viewport.',
    fix: 'Apply backdrop-filter only under the :root[data-ui-version="v2"] selector.',
    status: 'open',
  },
  {
    id: 'M4',
    severity: 'medium',
    title: '50 components fetch in useEffect; one file uses AbortController',
    area: 'correctness',
    files: ['app/**/_components/**', 'components/**'],
    problem:
      'Two data-fetching conventions coexist — swr in 94 files, manual effects in 50 — and the manual path has no cancellation or dedupe, with 22 exhaustive-deps suppressions alongside.',
    impact:
      'Switch filters faster than the network and a stale response lands last, overwriting fresh data. The eslint-disable comments hide the dependency that would have surfaced it.',
    fix: 'Move these to useSWR. Where a manual effect must stay, thread an AbortSignal and abort in cleanup.',
    status: 'open',
  },
  {
    id: 'M5',
    severity: 'medium',
    title: 'Cron jobs iterate every profile serially',
    area: 'performance',
    files: ['app/api/cron/**/route.ts'],
    problem:
      'intel-snapshot awaits profiles × extractors one at a time with an upsert per pair. No batching, no concurrency limit, no resume point.',
    impact: 'Runtime grows linearly with the user base until it hits the function timeout, silently losing the tail of the user list.',
    fix: 'Chunk profiles through a bounded Promise.all, batch the upserts, and persist a cursor so a timed-out run resumes.',
    status: 'open',
  },
  {
    id: 'M6',
    severity: 'medium',
    title: 'Production dependencies that are not runtime dependencies',
    area: 'maintainability',
    files: ['package.json'],
    problem:
      '@prisma/client has zero runtime imports (Prisma is migrations-only here) and shadcn-ui is a scaffolding CLI. Both sit under dependencies. Relatedly, nothing generates Supabase Database types, so every query is untyped.',
    impact: 'Install and bundle weight for nothing, plus 32 any-escapes and hand-written casts the generated types would remove.',
    fix: 'Move both to devDependencies and add supabase gen types typescript to the build.',
    status: 'open',
  },
  {
    id: 'M7',
    severity: 'medium',
    title: 'getMyProfileId is copy-pasted instead of imported',
    area: 'maintainability',
    files: ['lib/homelog/serverAuth.ts', 'app/api/**/route.ts'],
    problem:
      'serverAuth exports it and intellog/chat imports it, but moneylog/assets/[id], shoppinglog/checkout and moneylog/pay each redeclare a local copy, while sociallog/posts/[id]/vote inlines the query.',
    impact: 'Four spellings of the same authorization primitive is how one of them eventually drifts.',
    fix: 'One lib/auth/requireProfile(request) returning { user, profileId } or a Response — and the natural home for H1 and H2.',
    status: 'open',
  },
  {
    id: 'M8',
    severity: 'medium',
    title: 'No CSP on application pages',
    area: 'security',
    files: ['next.config.ts'],
    problem:
      'nosniff, X-Frame-Options and Referrer-Policy are set globally, and a strict CSP is set on /sw.js only. Pages have no CSP, no HSTS, and no Permissions-Policy.',
    impact: 'No defence-in-depth against injected script, and no transport pinning.',
    fix: 'Nonce-based CSP in report-only first, then enforce. Add HSTS with includeSubDomains, and deny unused sensors via Permissions-Policy.',
    status: 'open',
  },

  // ── UI / UX ─────────────────────────────────────────────────────────────
  {
    id: 'U1',
    severity: 'ux',
    title: 'Search results have no combobox semantics',
    area: 'a11y',
    files: ['components/GlobalSearch.tsx'],
    problem:
      'No role="combobox", aria-expanded, aria-controls or aria-activedescendant on the input; no role="listbox" on the container; no role="option"/aria-selected on the items.',
    impact:
      'Arrow keys move a purely visual highlight. A screen-reader user gets a text field that silently does nothing and is never told results appeared.',
    fix: 'Full combobox/listbox wiring plus an aria-live result count. See the refactored component in the doc.',
    status: 'open',
  },
  {
    id: 'U2',
    severity: 'ux',
    title: 'The highlighted result is never scrolled into view',
    area: 'a11y',
    files: ['components/GlobalSearch.tsx'],
    problem: 'The list is max-h-64 with overflow-y-auto, and the arrow-key handler never calls scrollIntoView.',
    impact: 'Past the fourth result the selection is off-screen — Enter navigates somewhere the user was never shown.',
    fix: 'scrollIntoView({ block: "nearest" }) on the active option whenever the highlight moves.',
    status: 'open',
  },
  {
    id: 'U3',
    severity: 'ux',
    title: 'The app-color swatch breaks for any non-hex theme color',
    area: 'correctness',
    files: ['components/GlobalSearch.tsx', 'lib/theme/appTheme.ts'],
    problem:
      'backgroundColor: `${color}1a` appends a hex alpha byte, but isValidCssColor accepts rgb(), rgba() and oklch() as well as 3–8 digit hex.',
    impact:
      'An admin setting a primary to oklch(0.7 0.2 40) produces invalid CSS that is silently dropped — every result icon loses its tint, with no error anywhere.',
    fix: 'color-mix(in oklab, ${color} 10%, transparent), which is format-agnostic.',
    status: 'open',
  },
  {
    id: 'U4',
    severity: 'ux',
    title: 'The results overlay cannot be dismissed by tapping outside',
    area: 'ux',
    files: ['components/GlobalSearch.tsx'],
    problem: 'Visibility is derived from the query alone — no outside-click or blur dismissal.',
    impact: 'On mobile the results float over page content with no way out except finding the small × button.',
    fix: 'An open state plus a pointerdown listener that closes on an outside target.',
    status: 'open',
  },
  {
    id: 'U5',
    severity: 'ux',
    title: '150ms debounce on an in-memory array',
    area: 'performance',
    files: ['components/GlobalSearch.tsx'],
    problem: 'SEARCH_REGISTRY is a local constant and filtering is a synchronous Array.filter.',
    impact:
      'Adds 150ms of latency per keystroke for no benefit, and decouples what is rendered from what is typed so Enter can fire against the previous keystroke.',
    fix: 'Filter query directly; reintroduce debouncing only if the source becomes server-backed.',
    status: 'open',
  },
  {
    id: 'U6',
    severity: 'ux',
    title: 'No result ranking and no result cap',
    area: 'ux',
    files: ['components/GlobalSearch.tsx'],
    problem: 'includes() across label, description and app name, returned in registry order, unsliced.',
    impact: 'An exact label match can rank below an incidental description match, and the list becomes a scroll-jail as the registry grows.',
    fix: 'Score exact > prefix > substring > app > description, sort, and cap at ~8.',
    status: 'open',
  },
  {
    id: 'U7',
    severity: 'ux',
    title: 'The clear button misses the touch-target and focus-ring floor',
    area: 'a11y',
    files: ['components/GlobalSearch.tsx'],
    problem:
      'A bare button around a 16px icon — roughly 16×16px of hit area against the 44×44px iOS / 24×24px WCAG 2.2 minimum — with no focus-visible ring.',
    impact: 'Hard to hit on mobile, invisible to keyboard users, and tapping it blurs the field and dismisses the keyboard mid-search.',
    fix: '-m-2 p-2 for the hit area, a focus-visible ring, and onMouseDown preventDefault to keep focus in the input.',
    status: 'open',
  },
  {
    id: 'U8',
    severity: 'ux',
    title: 'Escape both closes the list and clears the query',
    area: 'ux',
    files: ['components/GlobalSearch.tsx'],
    problem: 'One keypress does two things; the convention is close-then-clear across two presses.',
    impact: 'A stray Escape loses what the user typed.',
    fix: 'First Escape closes and keeps the query, second clears and blurs.',
    status: 'open',
  },
  {
    id: 'U9',
    severity: 'ux',
    title: 'Z-index is ad-hoc across the app',
    area: 'maintainability',
    files: ['app/**', 'components/**'],
    problem:
      '14 distinct values in use, including z-[9], z-[60], z-[70], z-[100], z-[110] and z-[120]. The search overlay sits at z-50 alongside 23 other z-50 users.',
    impact: 'Which overlay wins depends on DOM order, so stacking bugs appear and disappear as layout changes.',
    fix: 'A named scale in globals.css (--z-nav, --z-overlay, --z-drawer, --z-toast) and a lint rule against raw z-[...].',
    status: 'open',
  },
  {
    id: 'U10',
    severity: 'ux',
    title: 'prefers-reduced-motion is honored in 2 files out of 35 that animate',
    area: 'a11y',
    files: ['components/**', 'app/globals.css'],
    problem:
      '35 files import from motion, plus the animated icon set, siri-orb, flow-field and glow backgrounds. Only 2 reference prefers-reduced-motion, and Micro Interactions is a global admin switch rather than a user preference.',
    impact: 'Users with vestibular disorders have no way to calm the app down.',
    fix: 'A useReducedMotion() gate in the shared animation wrappers plus a global reduce block that neutralizes decorative backgrounds.',
    status: 'open',
  },
];

export const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'ux'];

export function findingsBySeverity(severity: FindingSeverity): Finding[] {
  return FINDINGS.filter((f) => f.severity === severity);
}

export function openCount(severity: FindingSeverity): number {
  return findingsBySeverity(severity).filter((f) => f.status !== 'done' && f.status !== 'wontfix').length;
}

/** Recommended order of attack, from the review's sequencing table. */
export const SEQUENCING: { step: string; ids: string[]; why: string }[] = [
  { step: 'Verify and patch the exposure', ids: ['C1', 'C3'], why: 'Minutes of work, and C1 may be live.' },
  { step: 'Get the suite green and honest', ids: ['C9', 'H8'], why: 'Nothing below is safe to land against a red suite.' },
  { step: 'Make money atomic', ids: ['C4', 'C5', 'C6'], why: 'Real money, actively exploitable.' },
  { step: 'Close the remaining races', ids: ['C8', 'C2'], why: 'Same class, contained blast radius.' },
  { step: 'Harden the route boundary', ids: ['H1', 'H2', 'M7'], why: 'All three want the same shared helper.' },
  { step: 'Migrate money to Decimal', ids: ['C7'], why: 'Migration plus backfill — plan it, do not rush it.' },
  { step: 'Accessibility pass', ids: ['H5', 'U1', 'U2', 'U7', 'U10'], why: 'Independent of everything above; can run in parallel.' },
  { step: 'Performance pass', ids: ['M1', 'M2', 'M3'], why: 'Largest user-visible win per hour spent.' },
];

/** Things the review found working well — stated because a findings list
 *  reads more negative than this codebase deserves. */
export const STRENGTHS: string[] = [
  'Comments explain decisions, not mechanics — the getUser()-vs-getSession() note in middleware, the viewport split in layout, the lottie matcher exclusion, the cross-instance cancel caveat in lib/ai/jobs.ts.',
  'Ownership checks in the sampled routes are correct and consistently shaped: authenticate → resolve profile → load row → compare owner → act, with 404 rather than 403 where existence itself is sensitive.',
  '1,009 passing tests including route-level tests — an unusually good position to refactor from.',
  'lib/adminlog/nav.ts and lib/ai/modelConfig.ts are real single sources of truth, consumed rather than duplicated.',
  'lib/supabase/serviceRole.ts fails loudly on missing configuration instead of limping along with undefined.',
];
