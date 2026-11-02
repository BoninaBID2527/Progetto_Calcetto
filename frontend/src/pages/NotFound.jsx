import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';
import Logo from '../components/Logo';

export default function NotFound() {
  return (
    <div className="page" style={{ minHeight: '100dvh', alignContent: 'center' }}>
      <Logo />
      <EmptyState
        title="Palla fuori dal campo"
        action={
          <Link to="/" className="btn btn-primary">
            Torna a centrocampo
          </Link>
        }
      >
        La pagina che cerchi non esiste o è stata spostata.
      </EmptyState>
    </div>
  );
}
