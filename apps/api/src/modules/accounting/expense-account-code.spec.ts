import { ConflictException } from '@nestjs/common';
import { nextExpenseAccountCode } from './expense-account-code';

describe('nextExpenseAccountCode', () => {
  it('starts at 5300, clear of the default expense accounts', () => {
    expect(nextExpenseAccountCode(['5000', '5100', '5200', '5900'])).toBe('5300');
  });

  it('skips codes that are taken, in any order', () => {
    expect(nextExpenseAccountCode(['5310', '5300', '5320'])).toBe('5330');
  });

  it('fills a gap before moving on', () => {
    expect(nextExpenseAccountCode(['5300', '5320'])).toBe('5310');
  });

  it('throws once the range is exhausted', () => {
    const all = Array.from({ length: 60 }, (_, i) => String(5300 + i * 10));
    expect(() => nextExpenseAccountCode(all)).toThrow(ConflictException);
  });
});
