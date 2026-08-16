import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Catches render/lifecycle errors anywhere below it so a single broken page
// degrades to a recoverable message instead of unmounting the whole app to
// a blank white screen.
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-muted-foreground">Something went wrong loading this page.</p>
          <button
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
          >
            Back to map
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
