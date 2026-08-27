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
            <a href='#main-content' className='skip-to-main'>Skip to main content</a>
            <header className='layout-header'>
                <h1 className='layout-logo'>{title}</h1>
                {isMobile && (
                    <button className='layout-details-toggle' onClick={onToggleDetails} aria-label={isDetailsOpen ? 'Hide details' : 'Show details'} aria-expanded={isDetailsOpen}>
                        {/* \u2630 = ☰ hamburger icon. The details panel has its own
                            close button, so we only need the hamburger here to open it. */}
                        {'\u2630'}
                    </button>
                )}
            </header>
            <main id='main-content' className='layout-main'>{children}</main>
        </div>
    );
}
