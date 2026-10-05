import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { SettingsPage } from './pages/SettingsPage';

function NotFoundPage() {
  return (
    <section className="p-8">
      <EmptyState title="Página no encontrada">
        <Link className="underline" to="/">
          Volver al mostrador
        </Link>
      </EmptyState>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/ajustes" replace />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
