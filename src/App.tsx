import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AnimatePresence } from "framer-motion";
import { Navigation } from "@/components/Navigation";
import { NotificationInitializer } from "@/components/NotificationInitializer";
import { useNativeApp } from "@/hooks/useNativeApp";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { suppressAnalyticsErrors } from "@/utils/analytics";
import { Skeleton } from "@/components/ui/skeleton";
import ProtectedRoute from "./components/ProtectedRoute";

// Lazy-loaded routes — keep initial bundle minimal for fast cold start
const HomePage = lazy(() => import("./pages/HomePage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsAndConditionsPage = lazy(() => import("./pages/TermsAndConditionsPage"));
const AcceptTermsPage = lazy(() => import("./pages/AcceptTermsPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,        // 1 minute default
      gcTime: 10 * 60 * 1000,      // 10 minutes
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

suppressAnalyticsErrors();

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <Skeleton className="h-10 w-48 mb-4" />
      <Skeleton className="h-32 w-full rounded-xl mb-3" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  useNativeApp();
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<ProtectedRoute><Navigation /><HomePage /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><Navigation /><CalendarPage /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><Navigation /><ExpensesPage /></ProtectedRoute>} />
          <Route path="/assistant" element={<ProtectedRoute><Navigation /><AssistantPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Navigation /><SettingsPage /></ProtectedRoute>} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
          <Route path="/accept-terms" element={<AcceptTermsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <TooltipProvider>
            <OfflineBanner />
            <NotificationInitializer />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AnimatedRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
