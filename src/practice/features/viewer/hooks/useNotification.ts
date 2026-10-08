import { createContext, useContext } from 'react';

export type NotificationStyle = 'error' | 'success';

export interface NotificationState {
  message: string;
  style: NotificationStyle;
}

export interface NotificationContextValue {
  notification: NotificationState | null;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  dismissNotification: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export default function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotification must be used inside NotificationProvider');
  }

  return context;
}
