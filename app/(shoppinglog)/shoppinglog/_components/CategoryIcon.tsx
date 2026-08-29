// app/(shoppinglog)/shoppinglog/_components/CategoryIcon.tsx
import {
  Smartphone,
  Sofa,
  Shirt,
  Home,
  Dumbbell,
  BookOpen,
  Gamepad2,
  Car,
  Gift,
  Package,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Smartphone,
  Sofa,
  Shirt,
  Home,
  Dumbbell,
  BookOpen,
  Gamepad2,
  Car,
  Gift,
  Package,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Package;
  return <Icon className={className} />;
}
