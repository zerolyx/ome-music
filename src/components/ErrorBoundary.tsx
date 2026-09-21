import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Ome Music crashed", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#d0c6ba] px-8 text-center text-[#4a2108]">
        <div className="max-w-md">
          <p className="mb-4 text-sm font-medium text-[#4a2108]/40">OME</p>
          <h1 className="text-3xl font-black leading-tight text-[#4a2108]/80">
            The room went quiet for a moment.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#4a2108]/45">
            Something interrupted the broadcast. A quick reload usually brings the music back.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="app-transition mt-8 inline-flex h-11 items-center justify-center rounded-full bg-[#4a2108]/[0.86] px-6 text-sm font-semibold text-[#efe4d8] hover:bg-[#4a2108]"
          >
            Reload the room
          </button>
        </div>
      </div>
    );
  }
}
