import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { hapticImpact, hapticSuccess } from "@/utils/haptics";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  dueDate?: string;
}

interface TaskCardProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TaskCard = React.memo(function TaskCard({ task, onToggle, onDelete }: TaskCardProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const touchStartX = useRef(0);
  const isSwiping = useRef(false);

  const priorityStyles = {
    low: "bg-muted border-border",
    medium: "bg-warning/10 border-warning/30",
    high: "bg-destructive/10 border-destructive/30",
  };

  const handleToggle = () => {
    if (!task.completed) {
      hapticSuccess();
      setIsExiting(true);
      setTimeout(() => onToggle(task.id), 300);
    } else {
      hapticImpact('light');
      onToggle(task.id);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff < -10) {
      isSwiping.current = true;
      setSwipeX(Math.max(diff, -80));
    } else if (diff > 0 && swipeX < 0) {
      setSwipeX(Math.min(0, swipeX + diff));
    }
  };

  const handleTouchEnd = () => {
    if (swipeX < -50) {
      hapticImpact('medium');
      setSwipeX(-80);
    } else {
      setSwipeX(0);
    }
  };

  return (
    <>
      <motion.div
        animate={isExiting ? { opacity: 0, x: -60 } : { opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative overflow-hidden rounded-xl"
      >
        {/* Delete background revealed on swipe */}
        <div className="absolute inset-y-0 right-0 flex items-center justify-center w-20 bg-destructive rounded-r-xl">
          <button onClick={() => setShowDeleteConfirm(true)} className="text-destructive-foreground p-2">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        <div
          style={{ transform: `translateX(${swipeX}px)`, transition: isSwiping.current ? 'none' : 'transform 0.2s ease-out' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Card
            className={cn(
              "p-3 sm:p-4 transition-all hover:shadow-ayvro border",
              task.completed && "opacity-60",
              priorityStyles[task.priority]
            )}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.completed}
                onCheckedChange={handleToggle}
                className="mt-0.5 sm:mt-1 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-[15px] font-medium text-foreground",
                    task.completed && "line-through text-muted-foreground"
                  )}
                >
                  {task.title}
                </p>
                {task.dueDate && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(task.dueDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 hidden sm:flex"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      </motion.div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('common.deleteConfirm', { item: task.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(task.id); setSwipeX(0); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
