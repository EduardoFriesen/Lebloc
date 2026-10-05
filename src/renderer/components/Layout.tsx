import { NavLink, Outlet } from 'react-router-dom';
import { buttonClass } from './ui/Button';

const NAV_ITEMS = [
  { to: '/', label: 'Mostrador', end: true },
  { to: '/clientes', label: 'Clientes', end: false },
  { to: '/deudores', label: 'Deudores', end: false },
  { to: '/planes', label: 'Planes', end: false },
  { to: '/profesores', label: 'Profesores', end: false },
  { to: '/ajustes', label: 'Ajustes', end: false },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      <button
        type="button"
        onClick={() => document.getElementById('contenido')?.focus()}
        className={`${buttonClass('primary')} sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50`}
      >
        Saltar al contenido
      </button>
      <nav aria-label="Principal" className="flex w-56 shrink-0 flex-col bg-granite text-chalk">
        <p className="px-6 pb-8 pt-7 font-display text-3xl font-bold uppercase tracking-tight">
          Le<span className="text-volt">bloc</span>
        </p>
        <ul className="flex flex-col">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block border-l-4 px-5 py-3 font-display text-lg uppercase tracking-wide transition ${
                    isActive ? 'border-volt bg-granite-soft text-chalk' : 'border-transparent text-chalk/75 hover:bg-granite-soft hover:text-chalk'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="contenido" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
