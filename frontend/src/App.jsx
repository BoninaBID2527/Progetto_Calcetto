import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAppData } from './context/AppDataContext';
import AppShell from './layouts/AppShell';
import Landing from './pages/Landing';
import { Login, Register } from './pages/Auth';
import Groups from './pages/Groups';
import JoinByLink from './pages/JoinByLink';
import GroupLayout from './pages/GroupLayout';
import GroupMatches from './pages/GroupMatches';
import Dashboard from './pages/Dashboard';
import GroupPolls from './pages/GroupPolls';
import NewPoll from './pages/NewPoll';
import PollDetail from './pages/PollDetail';
import PlayerProfile from './pages/PlayerProfile';
import Matchday from './pages/Matchday';
import Rivalries from './pages/Rivalries';
import Versus from './pages/Versus';
import NewMatch from './pages/NewMatch';
import MatchDetail from './pages/MatchDetail';
import GroupRankings from './pages/GroupRankings';
import HallOfFame from './pages/HallOfFame';
import Club from './pages/Club';
import Calendar from './pages/Calendar';
import GroupChat from './pages/GroupChat';
import GroupMembers from './pages/GroupMembers';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

function Splash() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true">
      <span className="muted">Riscaldamento in corso…</span>
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, ready, loggedOut } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (!user && loggedOut) return <Navigate to="/" replace />;
  if (!user) return <Navigate to={`/accedi?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Splash />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />;
  }
  return children;
}

/** Visitatore: landing. Utente: il proprio gruppo attivo oppure l'elenco dei gruppi. */
function Home() {
  const { user, ready } = useAuth();
  const { groups, activeGroup } = useAppData();
  if (!ready) return <Splash />;
  if (!user) return <Landing />;
  if (!groups) return <Splash />;
  return <Navigate to={activeGroup ? `/gruppi/${activeGroup.id}` : '/gruppi'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/accedi" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/registrati" element={<GuestOnly><Register /></GuestOnly>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/gruppi" element={<Groups />} />
        <Route path="/calendario" element={<Calendar />} />
        <Route path="/entra/:code" element={<JoinByLink />} />
        <Route path="/gruppi/:groupId" element={<GroupLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="partite" element={<GroupMatches />} />
          <Route path="nuova-partita" element={<NewMatch />} />
          <Route path="boncall" element={<GroupPolls />} />
          <Route path="boncall/nuova" element={<NewPoll />} />
          <Route path="giocatori/:userId" element={<PlayerProfile />} />
          <Route path="rivalita" element={<Rivalries />} />
          <Route path="rivalita/:userId" element={<Versus />} />
          <Route path="classifiche" element={<GroupRankings />} />
          <Route path="club" element={<Club />} />
          <Route path="hall-of-fame" element={<HallOfFame />} />
          <Route path="chat" element={<GroupChat />} />
          <Route path="membri" element={<GroupMembers />} />
        </Route>
        <Route path="/partite/:matchId" element={<MatchDetail />} />
        <Route path="/partite/:matchId/matchday" element={<Matchday />} />
        <Route path="/boncall/:pollId" element={<PollDetail />} />
        <Route path="/notifiche" element={<Notifications />} />
        <Route path="/profilo" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
