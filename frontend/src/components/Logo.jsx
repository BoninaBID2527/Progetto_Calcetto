// Compatibilità: il logo vive in brand/BrandLogo.jsx.
import BrandLogo, { BrandMark, BrandWordmark } from './brand/BrandLogo';

export const LogoMark = BrandMark;
export const Wordmark = BrandWordmark;

export default function Logo({ to = '/', className = '' }) {
  return <BrandLogo to={to} className={className} />;
}
