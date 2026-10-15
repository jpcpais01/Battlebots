import type { ArenaId } from '../../game/events';
import type { VenueLike } from '../venue';
import { HarborVenue } from './harbor';
import { IslandVenue } from './island';

/**
 * The world map events' own venues, round the same ring. This module is its own chunk: it's only
 * downloaded the first time someone fights an event.
 */
export function buildVenue(id: ArenaId, quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number } }): VenueLike | null {
  switch (id) {
    case 'island':
      return new IslandVenue(quality, arena);
    case 'harbor':
      return new HarborVenue(quality, arena);
    default:
      // (the Grand Championship is fought in the indoor arena)
      return null;
  }
}
