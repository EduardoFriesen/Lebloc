import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.jpg';
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
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className="flex h-screen">
      <button
        type="button"
        onClick={() => document.getElementById('contenido')?.focus()}
        className={`${buttonClass('primary')} sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50`}
      >
        Saltar al contenido
      </button>
      <nav aria-label="Principal" className="flex w-56 shrink-0 flex-col overflow-hidden bg-dusk text-cream">
        <div className="flex justify-center pb-6 pt-7">
          {/* El sol: el fondo blanco del logo se funde con el crema por multiply. */}
          <div className="flex h-32 w-32 items-center justify-center rounded-full bg-cream ring-4 ring-ochre">
            <img src={logo} alt="Le Bloc" className="w-24 mix-blend-multiply" />
          </div>
        </div>
        <ul className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-full px-4 py-2.5 font-display text-lg transition ${
                    isActive ? 'bg-dusk-soft text-cream' : 'text-cream/80 hover:bg-dusk-soft/60 hover:text-cream'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${isActive ? 'bg-ochre' : 'bg-transparent'}`} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <svg aria-hidden="true" viewBox="0 0 224 120" preserveAspectRatio="none" className="mt-auto h-28 w-full">
          <path d="M0 120 L0 70 L40 30 L70 60 L110 15 L150 55 L180 35 L224 75 L224 120 Z" className="fill-ochre" />
          <path d="M0 120 L0 90 L30 65 L65 95 L100 55 L145 100 L190 60 L224 90 L224 120 Z" className="fill-accent" />
          <path d="M0 120 L0 108 L50 90 L110 112 L170 92 L224 106 L224 120 Z" className="fill-sunken" />
        </svg>
      </nav>
      <main id="contenido" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
        {location.key !== 'default' && (
          <div className="px-8 pt-6">
            <button type="button" className={buttonClass('ghost')} onClick={() => void navigate(-1)}>
              ← Volver
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
