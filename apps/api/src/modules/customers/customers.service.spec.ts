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
  let stored: Record<string, unknown> & { save: jest.Mock };
  // Registers the place and hands back the list's spelling.
  const locations = { ensure: jest.fn(async (_t: string, _b: string, city: string, territory?: string) => ({ city: city.toUpperCase(), territory: territory?.toUpperCase() })) };

  const build = (found: unknown) =>
    new CustomersService({ findOne: jest.fn().mockResolvedValue(found) } as never, {} as never, locations as never);

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
