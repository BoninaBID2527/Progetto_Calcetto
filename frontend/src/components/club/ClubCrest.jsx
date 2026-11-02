/** Stemma del club: l'immagine caricata dall'admin oppure, in mancanza, simbolo e colore del gruppo. */
export default function ClubCrest({ group, size = 60 }) {
  if (group.crestUrl) {
    return <img className="club-crest" src={group.crestUrl} alt="" width={size} height={size} style={{ '--group-color': group.color, width: size, height: size }} />;
  }
  return (
    <span className="group-emoji" style={{ '--group-color': group.color, width: size, height: size, fontSize: `${size / 32}rem` }} aria-hidden="true">
      {group.emoji}
    </span>
  );
}
