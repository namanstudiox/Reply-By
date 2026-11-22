import { Navigate, Route, Routes } from 'react-router-dom';
import ReaderPage from './reader/ReaderPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<ReaderPage />} />
      <Route
        path="*"
        element={
          <main className="page">
            <h1>Page not found</h1>
            <p>
              The reader lives at <a href="/app">/app</a>.
            </p>
          </main>
        }
      />
    </Routes>
  );
}
