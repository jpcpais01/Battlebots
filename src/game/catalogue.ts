import { COMPANY_BY_ID, ITEMS, MAX_RARITY, itemsForSlot, type CompanyId, type Equipped, type ItemDef, type Rarity, type Slot } from './items';

/**
 * The gear catalogue as career mode sees it: every part is one tier of one maker's design for one
 * slot, with its own id. Common parts belong to everybody; the better tiers are won or bought.
 */

/** An item's own tier. */
export const rarityOf = (item: ItemDef): Rarity => item.tier;

/** How a part sits in a loadout. */
export const equipped = (item: ItemDef): Equipped => ({ id: item.id, rarity: rarityOf(item) });

/** The part a maker builds for a slot in a tier (or the best tier below it that exists). */
export function itemAt(slot: Slot, maker: CompanyId, rarity: number): ItemDef {
  const mine = itemsForSlot(slot).filter((i) => i.maker === maker);
  let best: ItemDef | undefined;
  for (const it of mine) if (rarityOf(it) <= Math.min(rarity, MAX_RARITY) && (!best || rarityOf(it) > rarityOf(best))) best = it;
  return best ?? mine[0] ?? itemsForSlot(slot)[0];
}

/** Every part in play that has to be earned (above Common, up to the tiers switched on). */
export const EARNABLE: ItemDef[] = ITEMS.filter((i) => rarityOf(i) > 0 && rarityOf(i) <= MAX_RARITY && COMPANY_BY_ID.has(i.maker));

/** The Common version of a part (what an unowned part falls back to). */
export const commonOf = (item: ItemDef): ItemDef => itemAt(item.slot, item.maker, 0);
