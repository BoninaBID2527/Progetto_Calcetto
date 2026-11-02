import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useAuth } from './AuthContext';

/**
 * Le animazioni seguono prefers-reduced-motion del sistema; in più l'utente
 * può ridurle dal profilo (settings.motion = "ridotto").
 */
export default function MotionPreference({ children }) {
  const { user } = useAuth();
  const reduced = user?.settings?.motion === 'ridotto';
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'ridotto' : 'auto';
  }, [reduced]);
  return <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>;
}
