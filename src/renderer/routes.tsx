import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { PlansPage } from './pages/PlansPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherFormPage } from './pages/TeacherFormPage';
import { TeachersPage } from './pages/TeachersPage';

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
        <Route index element={<Navigate to="/planes" replace />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
