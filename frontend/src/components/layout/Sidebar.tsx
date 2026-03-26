import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Zap, 
  AlertTriangle, 
  Camera, 
  User,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import logo from '@/assets/SolarSense_Logo.png';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'operator'] },
  { path: '/panels', label: 'Panels', icon: Zap, roles: ['admin', 'operator'] },
  { path: '/anomalies', label: 'Anomalies', icon: AlertTriangle, roles: ['admin', 'operator'] },
  { path: '/missions', label: 'Inspections', icon: Camera, roles: ['admin', 'operator'] },
  { path: '/admin', label: 'Admin Panel', icon: Shield, roles: ['admin'] },
  { path: '/profile', label: 'Profile', icon: User, roles: ['admin', 'operator'] },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function Sidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const location = useLocation();
  const { hasRole, user } = useAuth();

  const filteredNavItems = navItems.filter(item => 
    hasRole(item.roles as any[])
  );

  const content = (isMobile: boolean) => (
    <div className="flex h-full flex-col overflow-y-auto bg-sidebar text-sidebar-foreground touch-scroll">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <img src={logo} alt="SolarSense Logo" className="h-10 w-10 object-contain" />
        <span className="text-xl font-bold">SolarSense</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => {
                if (isMobile) onMobileOpenChange?.(false);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60 capitalize">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 md:block md:h-[100svh]">
        {content(false)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[85vw] max-w-xs border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:border [&>button]:border-sidebar-border [&>button]:bg-sidebar-accent/40 [&>button]:text-sidebar-foreground [&>button]:opacity-100 [&>button]:hover:bg-sidebar-accent [&>button]:hover:opacity-100"
        >
          {content(true)}
        </SheetContent>
      </Sheet>
    </>
  );
}
