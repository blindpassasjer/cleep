import { IconMenu, IconSearch, IconSettings } from './Icons';
import type { PublicUser } from '../types';

interface Props {
  user: PublicUser;
  search: string;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}

export function TopBar({ user, search, onSearchChange, onLogout, onToggleSidebar, onOpenSettings }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="sidebar-toggle" title="Menu" onClick={onToggleSidebar}>
          <IconMenu />
        </button>
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-icon" />
          <span className="brand-text">Cleep</span>
        </div>
      </div>
      <div className="search-wrap">
        <IconSearch className="search-icon" />
        <input
          className="search"
          placeholder="Search notes"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="user-menu">
        <span>{user.username}</span>
        <button type="button" title="Settings" className="icon-only" onClick={onOpenSettings}>
          <IconSettings width={18} height={18} />
        </button>
        <button type="button" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
