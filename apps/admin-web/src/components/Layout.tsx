import { useQuery } from '@tanstack/react-query';
import {
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  Settings,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { api, PUBLIC_SITE_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DashboardSummary } from '../lib/types';
import { cx } from './ui';

export function Layout() {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 60_000,
  });
  const pending = data?.ordersByStatus.PENDING ?? 0;

  const nav = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/orders', label: 'Orders', icon: ShoppingBag, badge: pending },
    { to: '/products', label: 'Products', icon: Package },
    { to: '/imports', label: 'WhatsApp import', icon: MessageSquareText },
    { to: '/categories', label: 'Categories', icon: FolderTree },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          <img src="/logo-icon.png" alt="" aria-hidden className="size-7 object-contain" />
          <span className="font-semibold">SmileBox</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Admin</span>
        </div>
        <nav className="space-y-0.5 p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-100 p-3 text-sm">
          <a href={PUBLIC_SITE_URL} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 text-slate-500 hover:text-slate-800">
            <ExternalLink className="size-4" /> View store
          </a>
          <div className="truncate text-xs text-slate-500" title={admin?.email}>
            {admin?.email}
          </div>
          <button type="button" onClick={logout} className="mt-1 flex items-center gap-2 text-slate-600 hover:text-red-600">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1.5 hover:bg-slate-100">
            <Menu className="size-5" />
          </button>
          <img src="/logo-icon.png" alt="" aria-hidden className="size-6 object-contain" />
          <span className="font-semibold">SmileBox Admin</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
