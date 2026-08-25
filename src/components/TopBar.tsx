import { forwardRef } from 'react';
import { CoffeeMenu } from './CoffeeMenu';
import { IconMenu, IconMoon, IconSearch, IconSettings, IconSun } from './Icons';
import type { PublicUser } from '../types';

interface Props {
  user: PublicUser;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const TopBar = forwardRef<HTMLInputElement, Props>(function TopBar(
  { user, search, onSearchChange, onToggleSidebar, onOpenSettings, theme, onToggleTheme },
  searchRef,
) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="sidebar-toggle" title="Menu" onClick={onToggleSidebar}>
          <IconMenu width={22} height={22} />
        </button>
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="brand-icon" />
          <span className="brand-text">Cleep</span>
        </div>
      </div>
      <div className="search-wrap">
        <IconSearch className="search-icon" width={20} height={20} />
        <input
          ref={searchRef}
          className="search"
          placeholder="Search notes"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && search) {
              e.stopPropagation();
              onSearchChange('');
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="user-menu">
        <span className="user-account-name">{user.username}</span>
        <CoffeeMenu />
        <button
          type="button"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="icon-only theme-toggle"
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <IconMoon width={20} height={20} /> : <IconSun width={20} height={20} />}
        </button>
        <button type="button" title="Settings" className="icon-only" onClick={onOpenSettings}>
          <IconSettings width={20} height={20} />
        </button>
      </div>
    </header>
  );
});
