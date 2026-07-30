import React from 'react';
import { Ic } from './icons';

interface Props {
  /** Changing this resets the boundary, so navigating away from a broken view recovers. */
  resetKey?: unknown;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one view's failure inside that view.
 *
 * React unmounts the entire tree when a render throws and nothing catches it, so
 * before this existed a single bad view took the title bar and the sidebar with
 * it and left a blank window — no message, and no way to navigate out. The
 * Sessions view did exactly that whenever no sessions had been recorded.
 *
 * The boundary resets when `resetKey` changes, which is the current view, so
 * switching views is enough to recover without restarting the application.
 */
export class ViewErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Kept on the console so a development build still shows the stack.
    console.error('view failed to render', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="view"><div className="view-inner">
        <div className="empty">
          <Ic.Bell size={36} />
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)' }}>This view failed to load</div>
          <div style={{ color: 'var(--fg-4)', marginTop: 6, fontSize: 12, maxWidth: 460 }}>
            The rest of Localhost Hub is unaffected — pick another view in the sidebar. Your
            running services were not touched.
          </div>
          <div
            style={{
              marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--fg-4)', maxWidth: 560, overflowWrap: 'anywhere'
            }}
          >
            {error.message}
          </div>
        </div>
      </div></div>
    );
  }
}
