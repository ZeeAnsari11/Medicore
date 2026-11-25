import { ConflictException } from '@nestjs/common';

const FIRST = 5300;
const LAST = 5890;
const STEP = 10;

/**
 * Account code for a new main expense category: the next free code in 5300-5890 (the defaults use 5000, 5100,
 * 5200 and 5900), so categories created from the Expenses page never collide with the chart's own codes.
 */
export function nextExpenseAccountCode(existingCodes: Iterable<string>): string {
  const taken = new Set(existingCodes);
  for (let code = FIRST; code <= LAST; code += STEP) {
    if (!taken.has(String(code))) return String(code);
  }
  throw new ConflictException(
    'No free expense account codes left',
  );
}
