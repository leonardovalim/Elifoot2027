export const money = (v: number) =>
  (v < 0 ? '-' : '') + '$ ' + Math.abs(v).toLocaleString('pt-BR');

export const POS_LABEL = { GK: 'GOL', DF: 'DEF', MF: 'MEI', FW: 'ATA' } as const;
export const STYLE_LABEL = { defensive: 'Defensivo', balanced: 'Equilibrado', attacking: 'Ofensivo' } as const;
