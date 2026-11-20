import { COUNTRY_NAME, FLAGS, nationalityOf, type Country } from '../sports/football/nations';
import type { Player } from '../sports/football/types';

const W = 16, H = 11;

/** Bandeirinha do país (pixel art). */
export function Flag({ country, title }: { country: Country; title?: string }) {
  const f = FLAGS[country];
  const total = f.bands.reduce((a, [, n]) => a + n, 0);
  let at = 0;
  const label = title ?? COUNTRY_NAME[country];
  return (
    <svg className="flag" width={W} height={H} viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <title>{label}</title>
      {f.bands.map(([color, n], i) => {
        const size = ((f.dir === 'h' ? H : W) * n) / total;
        const r = f.dir === 'h'
          ? <rect key={i} x={0} y={at} width={W} height={size} fill={color} />
          : <rect key={i} x={at} y={0} width={size} height={H} fill={color} />;
        at += size;
        return r;
      })}
      {f.extra === 'bra' && (<><polygon points="8,1.5 14.5,5.5 8,9.5 1.5,5.5" fill="#fedf00" /><circle cx="8" cy="5.5" r="2.4" fill="#002776" /></>)}
      {f.extra === 'chi' && (<><rect x={0} y={0} width={5.5} height={5.5} fill="#0039a6" /><rect x={2.2} y={2.2} width={1.2} height={1.2} fill="#ffffff" /></>)}
      {f.extra === 'uru' && (<><rect x={0} y={0} width={6} height={6.6} fill="#ffffff" /><circle cx="3" cy="3.3" r="1.8" fill="#f5b400" /></>)}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={1} />
    </svg>
  );
}

/** Bandeira só para quem não é brasileiro (na liga, o normal é ser do Brasil). */
export function ForeignFlag({ p }: { p: Pick<Player, 'nationality'> }) {
  const c = nationalityOf(p);
  return c === 'BRA' ? null : <Flag country={c} />;
}
