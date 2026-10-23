import type { ArenaId } from '../../game/events';
import type { VenueLike } from '../venue';
import { FallsVenue } from './falls';
import { GroveVenue } from './grove';
import { HarborVenue } from './harbor';
import { IslandVenue } from './island';
import { RooftopVenue } from './rooftop';
import { TitanVenue } from './titan';

export { TitanFx } from '../titanFx';
export { TitanVenue };

/**
 * The world map events' own venues, round the same ring, and the titan battles' Titan Colosseum.
 * This module is its own chunk: it's only downloaded the first time someone fights in one.
 */
export function buildVenue(
  id: ArenaId | 'titan',
  quality: 'low' | 'med' | 'high',
  arena: { uTime: { value: number }; uHype: { value: number }; ropeU?: { value: Float32Array } },
): VenueLike | null {
  switch (id) {
    case 'titan':
      return new TitanVenue(quality, arena);
    case 'island':
      return new IslandVenue(quality, arena);
    case 'harbor':
      return new HarborVenue(quality, arena);
    case 'grove':
      return new GroveVenue(quality, arena);
    case 'falls':
      return new FallsVenue(quality, arena);
    case 'rooftop':
      return new RooftopVenue(quality, arena);
    default:
      // (the Grand Championship is fought in the indoor arena)
      return null;
  }
}
