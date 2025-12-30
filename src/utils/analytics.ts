/**
 * Analytics utilities
 * Prevents analytics calls in dev/preview environments
 */

/**
 * Check if analytics should be enabled
 * Returns false for lovable.dev preview and localhost
 */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  
  const host = window.location.hostname;
  
  // Disable in preview/dev environments
  if (host.includes('lovable.dev') || host.includes('localhost') || host === '127.0.0.1') {
    return false;
  }
  
  return true;
}

/**
 * Suppress Plausible analytics errors in dev/preview
 * Call this once at app bootstrap
 */
export function suppressAnalyticsErrors(): void {
  if (isAnalyticsEnabled()) return; // Only suppress in dev/preview
  
  const isPlausibleError = (message: string): boolean => {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('plausible.io') ||
      (lowerMessage.includes('api/event') && (
        lowerMessage.includes('cors') || 
        lowerMessage.includes('402') ||
        lowerMessage.includes('payment')
      ))
    );
  };

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || '');
    if (isPlausibleError(message)) {
      event.preventDefault();
      console.debug('[Analytics] Suppressed Plausible error in dev:', message);
    }
  });

  // Handle regular errors
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (isPlausibleError(message)) {
      event.preventDefault();
      console.debug('[Analytics] Suppressed Plausible error in dev:', message);
    }
  });
}
