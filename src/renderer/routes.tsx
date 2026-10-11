import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/States';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { FinancePage } from './pages/FinancePage';
import { SalesTab } from './pages/finance/SalesTab';
import { SummaryTab } from './pages/finance/SummaryTab';
import { HomePage } from './pages/HomePage';
import { KioskPage } from './pages/KioskPage';
import { PlansPage } from './pages/PlansPage';
import { PlanDetailPage } from './pages/PlanDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { TeacherAccountPage } from './pages/TeacherAccountPage';
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
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="planes" element={<PlansPage />} />
        <Route path="planes/:id" element={<PlanDetailPage />} />
        <Route path="kiosco" element={<KioskPage />} />
        <Route path="profesores" element={<TeachersPage />} />
        <Route path="profesores/:id" element={<TeacherAccountPage />} />
        <Route path="empleados" element={<EmployeesPage />} />
        <Route path="gastos" element={<ExpensesPage />} />
        <Route path="finanzas" element={<FinancePage />}>
          <Route index element={<SummaryTab />} />
          <Route path="ventas" element={<SalesTab />} />
          <Route path="afluencia" element={<EmptyState title="Próximamente" />} />
          <Route path="profesores" element={<EmptyState title="Próximamente" />} />
          <Route path="clientes" element={<EmptyState title="Próximamente" />} />
        </Route>
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
