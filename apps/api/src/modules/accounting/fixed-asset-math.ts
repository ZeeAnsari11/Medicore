const round2 = (n: number) => Math.round(n * 100) / 100;

/** Proceeds less cost: positive is a gain, negative a loss. */
export const disposalGainLoss = (cost: number, proceeds: number): number => round2(proceeds - cost);
