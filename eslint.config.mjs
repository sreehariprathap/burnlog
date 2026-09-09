import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import noHardcodedColor from "./eslint-rules/no-hardcoded-color.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Extend Next.js defaults
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Disable unused-vars checks
  {
    rules: {
      // disable core rule
      "no-unused-vars": "off",
      // disable TS-specific rule
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Design token consistency — see
  // docs/superpowers/specs/2026-09-08-design-token-consistency-design.md.
  // Scoped to app/** and components/**, where every consumer of a
  // per-app/admin-themeable color lives; lib/theme/appColorDefaults.ts and
  // lib/search/registry.ts (the fallback layer itself) are outside this
  // scope on purpose.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    plugins: {
      local: { rules: { "no-hardcoded-color": noHardcodedColor } },
    },
    rules: {
      "local/no-hardcoded-color": "error",
    },
  },

  // Baseline: files with hardcoded colors that predate the rule above.
  // Not migrated in this pass (see the design doc's "Rollout for existing
  // violations" / "Follow-up" sections) — exempted here so CI stays green
  // today; the rule still blocks any *new* file. Remove an entry once its
  // file is migrated to semantic tokens or a live per-app color.
  {
    files: [
      "app/(adminlog)/adminlog/app-theme/page.tsx",
      "app/(adminlog)/adminlog/color-combos/page.tsx",
      "app/(adminlog)/adminlog/design-system/page.tsx",
      "app/(burnlog)/burnlog/ai-setup/_components/PlanPreview.tsx",
      "app/(burnlog)/burnlog/dashboard/_components/DailyRingsWidget.tsx",
      "app/(burnlog)/burnlog/dashboard/config/page.tsx",
      "app/(burnlog)/burnlog/session/_components/session-loggers/BodyweightLogger.tsx",
      "app/(burnlog)/burnlog/session/_components/session-loggers/PushPullLegLogger.tsx",
      "app/(logbook)/logbook/_components/QuickAddFab.tsx",
      "app/(logbook)/logbook/_components/WeeklySummary.tsx",
      "app/(moneylog)/moneylog/assets/_components/NetWorthSummaryCard.tsx",
      "app/RootLayoutClient.tsx",
      "app/manifest.ts",
      "app/offline/page.tsx",
      "app/pwa-test/page.tsx",
      "app/signup/profile/page.tsx",
      "components/AchievementOverlay.tsx",
      "components/SplashScreen.tsx",
      "components/adminlog/TestModeBanner.tsx",
      "components/auth/oauth-buttons.tsx",
      "components/kibo-ui/ticker/index.tsx",
      "components/kokonutui/apple-activity-card.tsx",
      "components/kokonutui/dual-ring-card.tsx",
      "components/kokonutui/flow-field.tsx",
      "components/kokonutui/lines-gradient-shader.tsx",
      "components/kokonutui/segmented-ring-card.tsx",
      "components/kokonutui/wavy-background.tsx",
      "components/kokonutui/weekday-tabs.tsx",
      "components/logbook/AiJobsList.tsx",
      "components/moneylog/AssetWalletCard.tsx",
      "components/smoothui/power-off-slide/index.tsx",
      "components/smoothui/smooth-button/index.tsx",
      "components/travellog/WeeklyTripStack.tsx",
      "components/ui/aurora-logbook-mark.tsx",
      "components/ui/background-paths.tsx",
      "components/ui/card-stack.tsx",
      "components/ui/chart.tsx",
      "components/ui/metal-button.tsx",
      "components/ui/neon-gradient-card.tsx",
      "components/ui/ripple-button.tsx",
      "components/ui/world-map.tsx",
    ],
    rules: {
      "local/no-hardcoded-color": "off",
    },
  },
];

export default eslintConfig;
