import { Component, ErrorInfo, ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface-900 p-6 font-mono">
          <div className="w-full max-w-md rounded-none bg-surface-800 p-8 border-2 border-red-500 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-none border-2 border-red-500 bg-red-950 text-red-500">
                <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="mt-6 text-xl font-bold text-white tracking-tight">CRITICAL_ERROR</h2>
              <p className="mt-3 text-sm text-surface-400 leading-relaxed">
                A fatal error was caught in the SecureChat runtime environment. The E2E state has been halted safely to protect keys.
              </p>
              <div className="mt-8 flex w-full flex-col gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex w-full justify-center rounded-none border-2 border-white bg-white text-black px-4 py-2.5 text-sm font-bold shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] transition-all cursor-pointer"
                >
                  REBOOT APPLICATION
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
