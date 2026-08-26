import type { ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
    title: string;
    children: ReactNode;
    isMobile: boolean;
    isDetailsOpen: boolean;
    onToggleDetails: () => void;
}

export default function Layout({ title, children, isMobile, isDetailsOpen, onToggleDetails }: LayoutProps) {
    return (
        <div className='layout'>
            <header className='layout-header'>
                <h1 className='layout-logo'>{title}</h1>
                {isMobile && (
                    <button className='layout-details-toggle' onClick={onToggleDetails} aria-label={isDetailsOpen ? 'Hide details' : 'Show details'} aria-expanded={isDetailsOpen}>
                        {/* \u2715 = ✕ close icon, \u2630 = ☰ hamburger icon. It's a quick way to get icons without adding an icon library. They're just text characters.*/}
                        {isDetailsOpen ? '\u2715' : '\u2630'}
                    </button>
                )}
            </header>
            <main className='layout-main'>{children}</main>
        </div>
    );
}
