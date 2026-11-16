import React from 'react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Catches rendering errors in child subtrees so a single malformed blip or
 * gadget cannot crash the entire application.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unexpected render error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, message: '' });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          padding: '16px',
          margin: '12px',
          borderRadius: '8px',
          border: '1px solid #f5c2c7',
          background: '#fff5f5',
          color: '#842029',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>
          {this.props.fallbackTitle || 'Something went wrong while rendering this view.'}
        </div>
        {this.state.message && (
          <div style={{ fontSize: '0.85rem', marginBottom: '10px', opacity: 0.9 }}>
            {this.state.message}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={this.handleReset}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
