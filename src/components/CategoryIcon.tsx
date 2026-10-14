import { BrickWall, HardHat, Percent, Receipt, Zap, type LucideIcon } from 'lucide-react';

// One glyph per category *type* (see categoryTypeSchema) so rows are recognisable at a glance.
const ICONS: Record<string, LucideIcon> = {
  material: BrickWall,
  labour: HardHat,
  utility: Zap,
  tax: Percent,
  misc: Receipt,
};

export function CategoryIcon({ type, size = 18 }: { type?: string; size?: number }) {
  const Icon = (type && ICONS[type]) || Receipt;
  return <Icon size={size} aria-hidden />;
}
