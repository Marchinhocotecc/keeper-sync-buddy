import React from 'react';
import { useTranslation } from 'react-i18next';
import { UtensilsCrossed, Car, Film, ShoppingBag, Pill, FileText, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticImpact } from '@/utils/haptics';

export const ALL_CATEGORIES = ['food', 'transport', 'entertainment', 'shopping', 'health', 'bills', 'other'] as const;
export type ExpenseCategory = typeof ALL_CATEGORIES[number];

export const CATEGORY_ICON: Record<string, React.ComponentType<any>> = {
  food: UtensilsCrossed,
  transport: Car,
  entertainment: Film,
  shopping: ShoppingBag,
  health: Pill,
  bills: FileText,
  other: Tag,
};

export const CATEGORY_TINT: Record<string, string> = {
  food: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  transport: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  entertainment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  shopping: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  health: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  bills: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  other: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};

interface CategoryChipsProps {
  value: string;
  onChange: (category: string) => void;
  /** Categories to promote at the start of the list (e.g. user's most-used) */
  topCategories?: string[];
  className?: string;
  /** Compact (icon-only) chips instead of icon+label */
  compact?: boolean;
}

/**
 * Horizontal scrollable chip selector for expense categories.
 * The `topCategories` prop reorders categories so user's most-used appear first.
 */
export function CategoryChips({ value, onChange, topCategories = [], className, compact }: CategoryChipsProps) {
  const { t } = useTranslation();

  // Reorder: top categories first (deduplicated), then the rest
  const ordered = React.useMemo(() => {
    const tops = topCategories.filter((c) => ALL_CATEGORIES.includes(c as ExpenseCategory));
    const rest = ALL_CATEGORIES.filter((c) => !tops.includes(c));
    return [...tops, ...rest];
  }, [topCategories]);

  return (
    <div className={cn('scroll-snap-x py-1', className)}>
      {ordered.map((cat) => {
        const Icon = CATEGORY_ICON[cat] || Tag;
        const active = cat === value;
        const label = t(`expenses.${cat}`, { defaultValue: cat.charAt(0).toUpperCase() + cat.slice(1) });
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) hapticImpact('light');
              onChange(cat);
            }}
            className={cn(
              'pressable inline-flex items-center gap-1.5 rounded-full border transition-all',
              'h-10 px-4 text-[14px] font-medium whitespace-nowrap',
              compact && 'h-9 px-3',
              active
                ? 'bg-primary text-primary-foreground border-primary shadow-[0_4px_12px_rgba(15,61,62,0.25)]'
                : 'bg-card text-foreground border-border hover:bg-muted/60'
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default CategoryChips;
