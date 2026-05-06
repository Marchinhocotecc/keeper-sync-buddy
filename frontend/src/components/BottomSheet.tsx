import React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle as DialogTitleComp,
  DialogDescription as DialogDescriptionComp,
} from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** When true, sheet stretches to most of the viewport. Default: auto-height. */
  fullHeight?: boolean;
  /** Extra classes for the inner content body */
  className?: string;
  /** Disable the modal-style fallback on desktop (always render as drawer) */
  alwaysDrawer?: boolean;
}

/**
 * Responsive bottom sheet:
 *  - Mobile: vaul drawer (drag-to-dismiss, native feel, drag handle)
 *  - Desktop: centered Dialog
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  fullHeight,
  className,
  alwaysDrawer,
}: BottomSheetProps) {
  const isMobile = useIsMobile();

  if (isMobile || alwaysDrawer) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            'border-0 rounded-t-3xl bg-card focus:outline-none',
            fullHeight && 'h-[92vh]'
          )}
        >
          {(title || description) && (
            <div className="px-5 pt-3 pb-2 text-left">
              {title && <DrawerTitle className="text-[18px] font-semibold tracking-tight">{title}</DrawerTitle>}
              {description && (
                <DrawerDescription className="text-[13px] text-muted-foreground mt-1">
                  {description}
                </DrawerDescription>
              )}
            </div>
          )}
          <div className={cn('sheet-body overflow-y-auto', className)}>{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitleComp>{title}</DialogTitleComp>}
            {description && <DialogDescriptionComp>{description}</DialogDescriptionComp>}
          </DialogHeader>
        )}
        <div className={className}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export default BottomSheet;
