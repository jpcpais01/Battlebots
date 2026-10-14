/** Shared render tuning. Emissive colors are pushed above the bloom threshold only when bloom is on. */
export const RenderSettings = {
  bloom: true,
  /** The render quality the stage was built at (set by Stage before anything else is built). */
  quality: 'high' as 'low' | 'med' | 'high',
  /** Multiplier for "glowing" colours: >1 feeds bloom, ~1.2 keeps hues readable without it. */
  glow(k: number) {
    return this.bloom ? k : 1 + (k - 1) * 0.12;
  },
};
