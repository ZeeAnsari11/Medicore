import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';

const valid = { name: 'Ali Medical Store', address: '1 Mall Road', territory: 'Kangan Pur', city: 'Kasur' };
const errorsOf = async <T extends object>(cls: new () => T, body: object) =>
  (await validate(plainToInstance(cls, body))).map((e) => e.property);

describe('create customer', () => {
  it('accepts a customer with address, territory and city', async () => {
    expect(await errorsOf(CreateCustomerDto, valid)).toEqual([]);
  });

  it.each(['address', 'territory', 'city'])('requires %s', async (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(await errorsOf(CreateCustomerDto, body)).toContain(field);
    expect(await errorsOf(CreateCustomerDto, { ...valid, [field]: '   ' })).toContain(field);
  });
});

describe('update customer', () => {
  it('may leave address, territory and city out', async () => {
    expect(await errorsOf(UpdateCustomerDto, { name: 'Ali Store' })).toEqual([]);
  });

  it.each(['address', 'territory', 'city'])('cannot blank %s', async (field) => {
    expect(await errorsOf(UpdateCustomerDto, { [field]: '  ' })).toContain(field);
  });

  it('lets an empty code through so it can be cleared', async () => {
    expect(await errorsOf(UpdateCustomerDto, { code: '' })).toEqual([]);
  });
});

describe('create customer clientOpId', () => {
  it('is optional and must be a UUID when given', async () => {
    expect(await errorsOf(CreateCustomerDto, valid)).toEqual([]);
    expect(await errorsOf(CreateCustomerDto, { ...valid, clientOpId: '0190a0a0-0000-7000-8000-000000000001' })).toEqual([]);
    expect(await errorsOf(CreateCustomerDto, { ...valid, clientOpId: 'not-a-uuid' })).toContain('clientOpId');
  });
});
