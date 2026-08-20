import type { ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout-header">
        <h1 className="layout-logo">PDF Viewer</h1>
      </header>
      <main className="layout-main">{children}</main>
    </div>
  );
}
