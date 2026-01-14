/**
 * PLAN ROUTER - Single source of truth for FREE vs PREMIUM routing
 * 
 * RULES:
 * - FREE: Uses AI FREE (DeepSeek R1 Free) as ONLY brain
 * - PREMIUM: Uses external AI coach (not implemented yet)
 * 
 * In FREE plan, NO legacy pipeline (statefulHandler, decisionRouter) is ever called.
 */

import { supabase } from '@/integrations/supabase/client';

export type UserPlan = 'FREE' | 'PREMIUM';

/**
 * Get user's current plan
 * For now returns FREE always (premium not implemented)
 * TODO: Read from profiles.is_premium when column exists
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  // TODO: Check profiles.is_premium when available
  // For now, always return FREE
  console.log('[PlanRouter] getUserPlan for:', userId);
  console.log('[PlanRouter] Returning: FREE (premium not implemented)');
  return 'FREE';
}

/**
 * Check if user has premium access
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan === 'PREMIUM';
}

/**
 * Check if user is on free plan
 */
export async function isFreeUser(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan === 'FREE';
}
