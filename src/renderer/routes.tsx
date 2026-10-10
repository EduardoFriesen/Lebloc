import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientFormPage } from './pages/ClientFormPage';
import { ClientsPage } from './pages/ClientsPage';
import { HomePage } from './pages/HomePage';
import { PlansPage } from './pages/PlansPage';
import { PlanDetailPage } from './pages/PlanDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherAccountPage } from './pages/TeacherAccountPage';
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
        <Route index element={<HomePage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/nuevo" element={<ClientFormPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="clientes/:id/editar" element={<ClientFormPage />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="planes/:id" element={<PlanDetailPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/nuevo" element={<TeacherFormPage />} />
        <Route path="profesores/:id" element={<TeacherAccountPage />} />
        <Route path="profesores/:id/editar" element={<TeacherFormPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
