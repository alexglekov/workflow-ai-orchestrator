import { NavLink } from 'react-router';

export const Sidebar = () => (
  <aside className="sidebar">
    <div className="brand">
      <span className="brand-mark">AW</span>
      <div>
        <strong>Workflow Creator</strong>
        <p>Workflow MVP</p>
      </div>
    </div>
    <nav className="side-nav">
      <NavLink to="/connectors" end>
        Коннекторы
      </NavLink>
      <NavLink to="/workflows" end>
        Workflows
      </NavLink>
    </nav>
  </aside>
);
