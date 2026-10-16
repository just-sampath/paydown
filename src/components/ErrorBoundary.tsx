import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  resetKeys?: ReadonlyArray<unknown>;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Catches render-time errors so a single throwing page cannot blank the app.
 *
 * @remarks
 * Acts as defense in depth: input sanitization should keep invalid values out of
 * the engine, but if anything slips through the boundary shows a recoverable
 * fallback instead of unmounting the whole tree. Supply {@link resetKeys} to
 * automatically clear the error when underlying state changes (e.g. navigation or
 * data reset).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (!this.state.hasError) {
      return;
    }

    const prevKeys = prevProps.resetKeys ?? [];
    const nextKeys = this.props.resetKeys ?? [];

    if (
      prevKeys.length !== nextKeys.length ||
      prevKeys.some((key, index) => key !== nextKeys[index])
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info);
  }

  private handleReset = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
      this.setState({ hasError: false, error: null });
    } else {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <ErrorFallback
        error={this.state.error}
        canReset={Boolean(this.props.onReset)}
        onReset={this.handleReset}
      />
    );
  }
}

type ErrorFallbackProps = {
  error: Error | null;
  canReset: boolean;
  onReset: () => void;
};

function ErrorFallback({ error, canReset, onReset }: ErrorFallbackProps): ReactNode {
  return (
    <div className="content">
      <section className="card">
        <div className="label mb-1">Something went wrong</div>
        <h2 className="m-0 text-lg font-extrabold">This view could not be rendered</h2>
        <p className="subtle m-0 mt-1 text-sm">
          {error?.message ?? 'An unexpected error occurred while building this page.'}
        </p>
        <div className="mt-4">
          <button className="btn btn-primary" onClick={onReset} type="button">
            {canReset ? 'Reset loan data' : 'Reload page'}
          </button>
        </div>
      </section>
    </div>
  );
}
