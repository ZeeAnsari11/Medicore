import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

// The Mongoose schema decorators can't be evaluated under this jest config; the service is tested with mocked collaborators.
jest.mock('./schemas/customer.schema', () => ({ Customer: { name: 'Customer' } }));
jest.mock('../accounting/party-balance.service', () => ({ PartyBalanceService: class {} }));
jest.mock('../locations/locations.service', () => ({ LocationsService: class {} }));

/** What ValidationPipe hands the controller: a DTO instance carrying only the fields in the request body. */
const dto = (body: Partial<UpdateCustomerDto>) => Object.assign(new UpdateCustomerDto(), body);

describe('CustomersService.updateCustomer', () => {
  const tenantId = new Types.ObjectId().toString();
  const sequence = { next: jest.fn().mockResolvedValue(1) };
  let stored: Record<string, unknown> & { save: jest.Mock };
  // Registers the place and hands back the list's spelling.
  const locations = { ensure: jest.fn(async (_t: string, _b: string, city: string, territory?: string) => ({ city: city.toUpperCase(), territory: territory?.toUpperCase() })) };

  const build = (found: unknown) =>
    new CustomersService({ findOne: jest.fn().mockResolvedValue(found) } as never, {} as never, locations as never, sequence as never);

  beforeEach(() => {
    locations.ensure.mockClear();
    stored = {
      branchId: 'b1',
      name: 'Walk In',
      phone: '0300',
      address: 'Mall Road',
      isDealer: true,
      save: jest.fn(),
    };
    stored.save.mockImplementation(() => Promise.resolve(stored));
  });

  it('a partial body only changes the fields that were sent (isDealer, phone and address are kept)', async () => {
    await build(stored).updateCustomer(tenantId, 'c1', dto({ name: 'Renamed' }));
    expect(stored).toMatchObject({
      name: 'Renamed',
      phone: '0300',
      address: 'Mall Road',
      isDealer: true,
    });
    expect(stored.save).toHaveBeenCalledTimes(1);
  });

  it('explicit values are applied, including false and an empty string', async () => {
    await build(stored).updateCustomer(tenantId, 'c1', dto({ isDealer: false, phone: '' }));
    expect(stored).toMatchObject({
      name: 'Walk In',
      phone: '',
      address: 'Mall Road',
      isDealer: false,
    });
  });

  it('a new city or territory is registered and saved in the list spelling', async () => {
    await build(stored).updateCustomer(tenantId, 'c1', dto({ city: 'kasur', territory: 'north' }));
    expect(locations.ensure).toHaveBeenCalledWith(tenantId, 'b1', 'kasur', 'north');
    expect(stored).toMatchObject({ city: 'KASUR', territory: 'NORTH' });
  });

  it('a changed city alone keeps the existing territory and registers only the city', async () => {
    stored.city = 'Lahore';
    stored.territory = 'Old Area';
    await build(stored).updateCustomer(tenantId, 'c1', dto({ city: 'kasur' }));
    expect(locations.ensure).toHaveBeenCalledWith(tenantId, 'b1', 'kasur', undefined);
    expect(stored).toMatchObject({ city: 'KASUR', territory: 'Old Area' });
  });

  it('touches the lists only when the city or territory is edited', async () => {
    await build(stored).updateCustomer(tenantId, 'c1', dto({ name: 'Renamed' }));
    expect(locations.ensure).not.toHaveBeenCalled();
  });

  it('a missing or deleted customer is a 404', async () => {
    await expect(
      build(null).updateCustomer(tenantId, 'c1', dto({ name: 'X' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CustomersService.createCustomer replay (clientOpId)', () => {
  const tenantId = new Types.ObjectId().toString();
  const sequence = { next: jest.fn().mockResolvedValue(1) };
  const branchId = new Types.ObjectId().toString();
  const body = { name: 'Ali Store', address: '1 Mall Road', territory: 'North', city: 'Kasur', branchId };
  const locations = { ensure: jest.fn(async (_t: string, _b: string, city: string, territory?: string) => ({ city, territory })) };

  // A model that can be constructed (as the service does) and queried.
  const makeModel = (existing: unknown, saveError?: unknown) => {
    const model: any = jest.fn().mockImplementation((doc: Record<string, unknown>) => ({
      ...doc,
      validate: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(function (this: unknown) {
        return saveError ? Promise.reject(saveError) : Promise.resolve(this);
      }),
    }));
    model.findOne = jest.fn().mockResolvedValue(existing);
    return model;
  };
  beforeEach(() => locations.ensure.mockClear())
  const service = (model: unknown) => new CustomersService(model as never, {} as never, locations as never, sequence as never);
  const create = (extra: Record<string, unknown> = {}) => Object.assign(new (require('./dto/create-customer.dto').CreateCustomerDto)(), body, extra);

  it('without clientOpId it creates as before and never looks for a replay', async () => {
    const model = makeModel(null);
    const out = await service(model).createCustomer(tenantId, create());
    expect(model.findOne).not.toHaveBeenCalled();
    expect(out).toMatchObject({ name: 'Ali Store' });
  });

  it('a replay returns the customer already created and creates nothing', async () => {
    const existing = { _id: 'c1', name: 'Ali Store' };
    const model = makeModel(existing);
    const out = await service(model).createCustomer(tenantId, create({ clientOpId: '0190a0a0-0000-7000-8000-000000000001' }));
    expect(out).toBe(existing);
    expect(model).not.toHaveBeenCalled();
    expect(locations.ensure).not.toHaveBeenCalledWith(tenantId, branchId, 'Kasur', 'North');
  });

  it('a concurrent duplicate that loses the unique index returns the winner, not an error', async () => {
    const winner = { _id: 'c1' };
    const model = makeModel(null, { code: 11000, keyPattern: { tenantId: 1, clientOpId: 1 } });
    model.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    const out = await service(model).createCustomer(tenantId, create({ clientOpId: '0190a0a0-0000-7000-8000-000000000002' }));
    expect(out).toBe(winner);
  });

  it('a duplicate customer CODE is still the existing 409', async () => {
    const model = makeModel(null, { code: 11000, keyPattern: { tenantId: 1, code: 1 } });
    await expect(service(model).createCustomer(tenantId, create({ code: 'C-1', clientOpId: '0190a0a0-0000-7000-8000-000000000003' }))).rejects.toThrow('Another customer already uses this code');
  });
});
