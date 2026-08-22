import { Component } from 'react';
import { Link } from 'react-router-dom';

// React error boundaries must be class components — there's no hook equivalent for catching
// a render error. Wraps a route tree so one screen throwing (e.g. reading a field an API
// response doesn't have) shows a contained, readable fallback instead of taking down
// everything else mounted alongside it (see App.jsx: this wraps the whole admin route tree,
// so a crash in one admin screen no longer kills the sidebar navigation to the others, or
// the rest of the app).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    const { children, homeTo = '/' } = this.props;

    if (!error) return children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-4 text-center">
        <h1 className="text-xl font-semibold text-text">Something went wrong on this screen</h1>
        <p className="max-w-sm text-sm text-text-muted">{error.message || 'An unexpected error occurred.'}</p>
        <Link to={homeTo} className="mt-2 text-sm font-medium text-primary hover:text-primary-hover">
          Go home
        </Link>
      </div>
    );
  }
}
