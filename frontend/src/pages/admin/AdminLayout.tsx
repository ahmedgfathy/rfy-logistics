import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Mail,
  Layers,
  Menu,
  PackageSearch,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminUser } from '../../types';
import { BrandMark } from '../../components/layout/Logo';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/quotes', label: 'Quote requests', icon: Mail },
  { to: '/admin/contacts', label: 'Messages', icon: Building2 },
  { to: '/admin/shipments', label: 'Shipments', icon: PackageSearch },
  { to: '/admin/content', label: 'Services', icon: Layers },
  { to: '/admin/users', label: 'Users', icon: UsersIcon, adminOnly: true },
];

export function AdminLayout({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    queryClient.clear();
    window.location.href = '/admin/login';
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.86rem] font-semibold transition-colors',
      isActive ? 'bg-brand-50 text-brand-700' : 'text-steel-600 hover:bg-steel-50 hover:text-navy-800',
    );

  return (
    <div className="min-h-screen bg-steel-50">
      <div className="flex">
        <aside
          className={cn(
            'fixed inset-y-0 start-0 z-50 flex w-64 flex-col border-e border-steel-200 bg-white transition-transform duration-300 lg:translate-x-0',
            open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-steel-200 px-5 py-4">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark className="h-8 w-8" />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-extrabold text-navy-800">RFY</span>
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-steel-500">Operations</span>
              </span>
            </Link>
            <button type="button" onClick={() => setOpen(false)} className="text-steel-500 lg:hidden" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems
              .filter((item) => !item.adminOnly || user.role === 'ADMIN')
              .map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={() => setOpen(false)}>
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
          </nav>

          <div className="border-t border-steel-200 p-3">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2.5 text-[0.82rem] font-semibold text-steel-600 hover:bg-steel-50 hover:text-brand-700"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View website
            </a>
          </div>
        </aside>

        {open ? <div className="fixed inset-0 z-40 bg-navy-950/25 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" /> : null}

        <div className="w-full lg:ps-64">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-steel-200 bg-white/95 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-steel-200 p-2 text-navy-800 lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-[0.82rem] font-bold text-navy-800">{user.name}</p>
                <p className="text-[0.7rem] text-steel-500">{user.role === 'ADMIN' ? 'Administrator' : 'Editor'} · {user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-steel-200 px-3 py-2 text-[0.78rem] font-semibold text-steel-600 transition-colors hover:border-red-200 hover:text-red-600"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </header>

          <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children ?? <Outlet />}</main>
        </div>
      </div>
    </div>
  );
}
