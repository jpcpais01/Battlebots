import type { GearDesign, MakerGear } from './types';
import { IRONHORSE } from './ironhorse';
import { LUMEN } from './lumen';
import { LONGWEI } from './longwei';
import { MARTELLI } from './martelli';
import { KENSEI } from './kensei';
import { STRIX } from './strix';

/** Makers in look order (0 Ironhorse … 5 Strix). */
const MAKERS: MakerGear[] = [IRONHORSE, LUMEN, LONGWEI, MARTELLI, KENSEI, STRIX];

/**
 * Every Rare and Epic design by look (maker + 6 × tier). Looks 0..5 (the Common designs) are
 * built in parts.ts and have no entry here.
 */
export const DESIGNS: (GearDesign | undefined)[] = [
  ...MAKERS.map(() => undefined),
  ...MAKERS.map((m) => m.rare),
  ...MAKERS.map((m) => m.epic),
];
