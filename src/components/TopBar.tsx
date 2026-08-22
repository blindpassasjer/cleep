import type { PublicUser } from '../types';

interface Props {
  user: PublicUser;
  search: string;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
}

export function TopBar({ user, search, onSearchChange, onLogout }: Props) {
  return (
    <header className="topbar">
      <div className="brand">Cleep</div>
      <input
        className="search"
        placeholder="Search notes"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className="user-menu">
        <span>{user.username}</span>
        <button type="button" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
