import { render } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

export const group = {
  id: 'g1',
  name: 'Calcetto del giovedì',
  emoji: '⚽',
  color: '#2EE59D',
  myRole: 'admin',
  crestUrl: null,
  motto: '',
  settings: { organizers: 'tutti', minMatchesForRanking: 3, loserPaysFirstRound: false, cashbox: false, season: { mode: 'annuale', startMonth: 9 } },
  kits: { light: { primary: null, secondary: null }, dark: { primary: null, secondary: null } },
};

/** Monta una pagina di gruppo con router e contesto `{ group }` come nell'app. */
export function renderInGroup(ui, { path = '/gruppi/g1/pagina', route = '/gruppi/:groupId/pagina', ctx = { group } } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/gruppi/:groupId" element={<Outlet context={ctx} />}>
          <Route path="pagina" element={ui} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

export const user = (id, name, extra = {}) => ({ id, name, nickname: null, avatarUrl: null, avatarColor: '#4CC9F0', preferredRole: null, ...extra });
