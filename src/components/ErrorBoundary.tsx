import { AlertTriangle } from 'lucide-react';
import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-danger" />
        <div className="font-semibold">Something went wrong on this screen</div>
        <div className="max-w-md break-words text-sm text-muted">{this.state.error.message}</div>
        <button type="button" onClick={() => this.setState({ error: null })} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
          Try again
        </button>
      </div>
    );
  }
}
