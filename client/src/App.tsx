import { Toaster } from "./components/Toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {

  return (
    <ErrorBoundary>
      <Toaster />
    </ErrorBoundary>
  );
}
