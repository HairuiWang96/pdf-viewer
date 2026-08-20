import type { ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
  title: string;
  children: ReactNode;
}

export default function Layout({ title, children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout-header">
        <h1 className="layout-logo">{title}</h1>
      </header>
      <main className="layout-main">{children}</main>
    </div>
  );
}
