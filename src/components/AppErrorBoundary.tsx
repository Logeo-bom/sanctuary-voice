import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected sanctuary runtime error',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Sanctuary App Error Boundary caught:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h1 className="text-xl font-bold text-amber-400 mb-2">
              Audio Stream Recovery Needed
            </h1>
            <p className="text-sm text-slate-300 mb-4">
              The live translation view encountered a temporary interruption:
            </p>
            <pre className="text-xs bg-slate-950 text-rose-300 p-3 rounded-lg overflow-x-auto mb-5 text-left border border-slate-800">
              {this.state.errorMessage}
            </pre>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold transition"
            >
              Restart Sanctuary Session
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
