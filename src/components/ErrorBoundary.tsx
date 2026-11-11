import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keeps one broken page from blanking the whole workspace. Shows a plain message and a reload button. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_e: Error, _i: ErrorInfo) { /* nothing is sent anywhere */ }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="pg">
        <div className="empty" role="alert">
          <p>This page hit a problem and could not be shown.</p>
          <small>Your data is safe. Reload the page, or go to another section from the menu.</small>
          <button type="button" className="btn btn--dark" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
      </div>
    )
  }
}
