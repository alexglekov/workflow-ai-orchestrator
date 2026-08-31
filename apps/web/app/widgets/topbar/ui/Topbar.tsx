import { NavLink } from 'react-router';

export const Topbar = () => (
  <header className="topbar">
    <NavLink to="/workflows" className="brand" end>
      <span className="brand-mark">G</span>
      <strong>Workflow Creator</strong>
    </NavLink>
    <nav className="top-nav">
      <NavLink to="/workflows">Workflows</NavLink>
      <NavLink to="/connectors">Коннекторы</NavLink>
    </nav>
  </header>
);
