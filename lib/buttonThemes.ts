export const BUTTON_STYLES = ['default', 'liquid', 'flow', 'metal'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export function isButtonStyle(value: unknown): value is ButtonStyle {
  return typeof value === 'string' && (BUTTON_STYLES as readonly string[]).includes(value);
}

export interface ButtonSlotDef {
  key: string;
  label: string;
  description: string;
}

/** The set of themeable button "elements" admins can assign a style to.
 * Add a new entry here, then wrap the real call site with
 * `<ThemedButton slot="...">` to make it respond to the setting. */
export const BUTTON_SLOTS: ButtonSlotDef[] = [
  {
    key: 'primary-cta',
    label: 'Primary action',
    description: 'Main call-to-action buttons — Save, Continue, Submit.',
  },
  {
    key: 'secondary-cta',
    label: 'Secondary action',
    description: 'Secondary buttons shown alongside a primary action — Cancel, Back.',
  },
  {
    key: 'destructive',
    label: 'Destructive action',
    description: 'Delete, remove, or leave-style buttons.',
  },
  {
    key: 'fab',
    label: 'Floating action button',
    description: 'Round quick-add / quick-log buttons.',
  },
];

export const DEFAULT_BUTTON_STYLE: ButtonStyle = 'default';
