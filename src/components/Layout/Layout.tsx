import type { ReactNode } from 'react';
import './Layout.css';

interface LayoutProps {
    title: string;
    children: ReactNode;
    isMobile: boolean;
    isDetailsOpen: boolean;
    onToggleDetails: () => void;
    isThumbnailsOpen: boolean;
    onToggleThumbnails: () => void;
}

export default function Layout({
    title,
    children,
    isMobile,
    isDetailsOpen,
    onToggleDetails,
    isThumbnailsOpen,
    onToggleThumbnails,
}: LayoutProps) {
    return (
        <div className='layout'>
            <header className='layout-header'>
                <h1 className='layout-logo'>{title}</h1>
                {isMobile && (
                    <div className='layout-header-actions'>
                        {/* \u25A3 = ▣ thumbnail grid icon */}
                        <button
                            className='layout-details-toggle'
                            onClick={onToggleThumbnails}
                            aria-label={isThumbnailsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
                            aria-expanded={isThumbnailsOpen}
                        >
                            {'\u25A3'}
                        </button>
                        {/* \u2630 = ☰ hamburger icon */}
                        <button
                            className='layout-details-toggle'
                            onClick={onToggleDetails}
                            aria-label={isDetailsOpen ? 'Hide details' : 'Show details'}
                            aria-expanded={isDetailsOpen}
                        >
                            {'\u2630'}
                        </button>
                    </div>
                )}
            </header>
            <main className='layout-main'>{children}</main>
        </div>
    );
}
