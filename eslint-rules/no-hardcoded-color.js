// eslint-rules/no-hardcoded-color.js
//
// Flags raw hex colors and hardcoded Tailwind palette-scale utility classes
// in app/** and components/**, instead of the semantic tokens defined in
// app/globals.css (bg-primary, text-destructive, ...) or a live per-app
// color from lib/theme/useAppThemeColors.ts / lib/search/useAppSearchColor.ts.
// See docs/superpowers/specs/2026-09-08-design-token-consistency-design.md.

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

const PALETTE_COLOR_NAMES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink',
  'rose', 'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone',
].join('|');

const TAILWIND_PALETTE_CLASS = new RegExp(
  `\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|caret|accent|decoration|divide|placeholder|shadow)-(?:${PALETTE_COLOR_NAMES})-\\d{2,3}\\b`
);

function checkText(context, node, text) {
  if (HEX_COLOR.test(text)) {
    context.report({ node, messageId: 'hexColor' });
    return;
  }
  if (TAILWIND_PALETTE_CLASS.test(text)) {
    context.report({ node, messageId: 'paletteClass' });
  }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw hex colors and hardcoded Tailwind palette classes; use semantic design tokens instead.',
    },
    schema: [],
    messages: {
      hexColor: 'Raw hex color. Use a semantic token (bg-primary, text-destructive, ...) or a live per-app color from useAppThemeColors/useAppSearchColor instead.',
      paletteClass: 'Hardcoded Tailwind palette class. Use a semantic token (bg-primary, text-muted-foreground, ...) so AdminLog theme changes apply here too.',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          checkText(context, node, node.value);
        }
      },
      TemplateElement(node) {
        checkText(context, node, node.value.raw);
      },
    };
  },
};
