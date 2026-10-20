import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Brand } from './components/Brand';
import { Button } from './components/ui/Button';
import { LandingPage } from './pages/LandingPage';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { JoinPage } from './pages/JoinPage';
import { RoomPage } from './pages/RoomPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/2 top-1/3 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-3xl" />
      </div>
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Brand />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </Link>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 pb-16 text-center">
        <div className="font-mono text-6xl font-semibold tracking-tight text-emerald-300/20">404</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">This table does not exist</h1>
        <p className="mt-2 text-sm text-slate-400">
          The room code may be wrong, or the page moved. Join a private room or create a new one.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/join">
            <Button variant="primary">
              <Home className="h-4 w-4" /> Join a room
            </Button>
          </Link>
          <Link to="/create">
            <Button variant="secondary">Create a room</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateRoomPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ChipRoom UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="surface w-full max-w-md p-7 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10 text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-white">Something broke at the table</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The interface hit an unexpected error. Your chips and the room are safe on the server.
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-left text-[10px] text-red-200/70">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> Reload
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
