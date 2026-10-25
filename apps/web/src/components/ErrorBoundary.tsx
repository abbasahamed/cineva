import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './ui/Button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex items-center justify-center p-6 selection:bg-white/20">
          <div className="max-w-md w-full p-8 rounded-3xl bg-white/[0.04] border border-white/[0.09] shadow-2xl backdrop-blur-xl text-center">
            <div className="w-12 h-12 rounded-full bg-[#ff6b6b]/15 text-[#ff6b6b] border border-[#ff6b6b]/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 stroke-[1.6]" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight mb-2">Something went wrong</h1>
            <p className="text-sm text-[#f5f5f7]/60 mb-6 leading-relaxed">
              An unexpected error occurred in Cineva. You can reload this view or return to the home screen.
            </p>
            {this.state.error?.message && (
              <div className="text-xs font-mono bg-black/40 text-white/50 p-3 rounded-xl mb-6 text-left break-all overflow-x-auto border border-white/5">
                {this.state.error.message}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="primary"
                onClick={this.handleReload}
                icon={<RefreshCw className="w-4 h-4 stroke-[1.6]" />}
              >
                Reload
              </Button>
              <Button
                variant="secondary"
                onClick={this.handleGoHome}
                icon={<Home className="w-4 h-4 stroke-[1.6]" />}
              >
                Back home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
