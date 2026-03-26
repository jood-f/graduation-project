import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function MainLayout({ children, title }: MainLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-screen bg-background">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} />
      <div className="min-w-0 md:pl-64">
        <Header title={title} onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
