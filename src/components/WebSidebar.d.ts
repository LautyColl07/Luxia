import type { ComponentType } from 'react';

declare const WebSidebar: ComponentType<{
  activeRoute?: string;
  currentUser?: unknown;
  onNavigate: (route: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
}>;

export default WebSidebar;
