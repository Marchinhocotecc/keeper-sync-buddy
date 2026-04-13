import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
             <h1 className="text-xl font-semibold text-foreground mb-2">
               Something went wrong
             </h1>
             <p className="text-sm text-muted-foreground mb-6">
               An unexpected error occurred. Please reload the page.
             </p>
             <Button onClick={this.handleReload} className="gap-2">
               <RefreshCw className="h-4 w-4" />
               Reload
             </Button>
             {import.meta.env.DEV && this.state.error && (
               <p className="text-xs text-muted-foreground mt-4 font-mono break-all">
                 {this.state.error.message}
               </p>
             )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
