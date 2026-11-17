import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

// The Mongoose schema decorators can't be evaluated under this jest config; the service is tested with mocked collaborators.
jest.mock('./schemas/customer.schema', () => ({ Customer: { name: 'Customer' } }));
jest.mock('../accounting/party-balance.service', () => ({ PartyBalanceService: class {} }));

/** What ValidationPipe hands the controller: a DTO instance carrying only the fields in the request body. */
const dto = (body: Partial<UpdateCustomerDto>) => Object.assign(new UpdateCustomerDto(), body);

describe('CustomersService.updateCustomer', () => {
  const tenantId = new Types.ObjectId().toString();
  let stored: Record<string, unknown> & { save: jest.Mock };

  const build = (found: unknown) =>
    new CustomersService({ findOne: jest.fn().mockResolvedValue(found) } as never, {} as never);

  beforeEach(() => {
    stored = {
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

  it('a missing or deleted customer is a 404', async () => {
    await expect(
      build(null).updateCustomer(tenantId, 'c1', dto({ name: 'X' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
