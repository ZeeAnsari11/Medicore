import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import PermissionsPage from '@/pages/administration/permissions';
import RolesPage from '@/pages/administration/roles';
import UsersPage from '@/pages/administration/users';
import SettingsPage from '@/pages/settings';
import { ComingSoonPage } from '@/components/layout/coming-soon-page';
import { Factory, Truck, Pill, ShoppingCart, Boxes, Receipt, Users, BarChart3 } from 'lucide-react';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/dashboard',
    element: <AppShell><DashboardPage /></AppShell>,
  },
  {
    path: '/',
    element: <AppShell><DashboardPage /></AppShell>,
  },
  {
    path: '/administration/permissions',
    element: <AppShell><PermissionsPage /></AppShell>,
  },
  {
    path: '/administration/roles',
    element: <AppShell><RolesPage /></AppShell>,
  },
  {
    path: '/administration/users',
    element: <AppShell><UsersPage /></AppShell>,
  },
  {
    path: '/settings',
    element: <AppShell><SettingsPage /></AppShell>,
  },
  {
    path: '/manufacturers',
    element: <AppShell><ComingSoonPage title="Manufacturers" description="Manage manufacturers" icon={Factory} /></AppShell>,
  },
  {
    path: '/vendors',
    element: <AppShell><ComingSoonPage title="Vendors" description="Manage vendors" icon={Truck} /></AppShell>,
  },
  {
    path: '/products',
    element: <AppShell><ComingSoonPage title="Products" description="Manage products" icon={Pill} /></AppShell>,
  },
  {
    path: '/purchases',
    element: <AppShell><ComingSoonPage title="Purchases" description="Manage purchases" icon={ShoppingCart} /></AppShell>,
  },
  {
    path: '/inventory',
    element: <AppShell><ComingSoonPage title="Inventory" description="Manage inventory" icon={Boxes} /></AppShell>,
  },
  {
    path: '/sales',
    element: <AppShell><ComingSoonPage title="Sales" description="Manage sales" icon={Receipt} /></AppShell>,
  },
  {
    path: '/customers',
    element: <AppShell><ComingSoonPage title="Customers" description="Manage customers" icon={Users} /></AppShell>,
  },
  {
    path: '/reports',
    element: <AppShell><ComingSoonPage title="Reports" description="View reports" icon={BarChart3} /></AppShell>,
  },
]);
