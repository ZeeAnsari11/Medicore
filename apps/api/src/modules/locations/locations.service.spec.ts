import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { LocationsService } from './locations.service';

// The Mongoose schema decorators can't be evaluated under this jest config; the service is tested with mocked models.
jest.mock('./schemas/city.schema', () => ({ City: { name: 'City' } }));
jest.mock('./schemas/territory.schema', () => ({ Territory: { name: 'Territory' } }));
jest.mock('../customers/schemas/customer.schema', () => ({ Customer: { name: 'Customer' } }));

const tenantId = new Types.ObjectId().toString();
const branchId = new Types.ObjectId().toString();
const duplicate = Object.assign(new Error('E11000'), { code: 11000 });

const doc = (fields: Record<string, unknown>) => {
  const d: Record<string, unknown> = { ...fields };
  d.save = jest.fn(async () => d);
  return d;
};

function build(opts: { city?: unknown; territory?: unknown; cityModel?: object } = {}) {
  const cityModel = { findOne: jest.fn().mockResolvedValue(opts.city ?? null), create: jest.fn(async (d: object) => d), ...opts.cityModel };
  const territoryModel = { findOne: jest.fn().mockResolvedValue(opts.territory ?? null), create: jest.fn(async (d: object) => d) };
  const customerModel = { updateMany: jest.fn().mockResolvedValue({}) };
  const service = new LocationsService(cityModel as never, territoryModel as never, customerModel as never);
  return { service, cityModel, territoryModel, customerModel };
}

describe('LocationsService', () => {
  it('creates a city with a case-insensitive key', async () => {
    const { service, cityModel } = build();
    await service.createCity(tenantId, branchId, { name: 'Kasur' });
    expect(cityModel.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kasur', nameKey: 'kasur', isActive: true, branchId: new Types.ObjectId(branchId) }));
  });

  it('a city that already exists (any case) is a 409', async () => {
    const { service } = build({ cityModel: { create: jest.fn().mockRejectedValue(duplicate) } });
    await expect(service.createCity(tenantId, branchId, { name: 'kasur' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('a territory takes the branch of its city', async () => {
    const city = { _id: new Types.ObjectId(), branchId: new Types.ObjectId(branchId), name: 'Kasur' };
    const { service, territoryModel } = build({ city });
    await service.createTerritory(tenantId, { cityId: city._id.toString(), name: 'North' });
    expect(territoryModel.create).toHaveBeenCalledWith(expect.objectContaining({ branchId: city.branchId, cityId: city._id, nameKey: 'north' }));
  });

  it('the city is looked up in the named branch when one is given', async () => {
    const { service, cityModel } = build();
    await expect(service.createTerritory(tenantId, { cityId: new Types.ObjectId().toString(), branchId, name: 'North' })).rejects.toBeInstanceOf(NotFoundException);
    expect(cityModel.findOne).toHaveBeenCalledWith(expect.objectContaining({ branchId: new Types.ObjectId(branchId) }));
  });

  it('lists are narrowed to the branch when one is resolved, unfiltered otherwise', async () => {
    const sort = jest.fn();
    const { service, cityModel } = build();
    Object.assign(cityModel, { find: jest.fn(() => ({ sort })) });
    service.listCities(tenantId, branchId);
    service.listCities(tenantId, null);
    const [withBranch, withoutBranch] = (cityModel as unknown as { find: jest.Mock }).find.mock.calls.map((c) => c[0]);
    expect(withBranch.branchId).toEqual(new Types.ObjectId(branchId));
    expect(withoutBranch.branchId).toBeUndefined();
  });

  it('a territory needs a city of the same tenant, otherwise 404', async () => {
    const { service, territoryModel } = build();
    await expect(service.createTerritory(tenantId, { cityId: new Types.ObjectId().toString(), name: 'North' })).rejects.toBeInstanceOf(NotFoundException);
    expect(territoryModel.create).not.toHaveBeenCalled();
  });

  it('renaming a city renames it on its customers', async () => {
    const city = doc({ _id: new Types.ObjectId(), branchId: new Types.ObjectId(branchId), name: 'Kasur', nameKey: 'kasur', isActive: true });
    const { service, customerModel } = build({ city });
    await service.updateCity(tenantId, 'c1', { name: 'Kasoor' });
    expect(city).toMatchObject({ name: 'Kasoor', nameKey: 'kasoor' });
    expect(customerModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({ city: 'Kasur', branchId: city.branchId }), { $set: { city: 'Kasoor' } });
  });

  it('deactivating a city leaves its customers alone', async () => {
    const city = doc({ _id: new Types.ObjectId(), name: 'Kasur', nameKey: 'kasur', isActive: true });
    const { service, customerModel } = build({ city });
    await service.updateCity(tenantId, 'c1', { isActive: false });
    expect(city.isActive).toBe(false);
    expect(customerModel.updateMany).not.toHaveBeenCalled();
  });

  it('renaming a territory renames it only on customers of its city', async () => {
    const territory = doc({ _id: new Types.ObjectId(), branchId: new Types.ObjectId(branchId), cityId: new Types.ObjectId(), name: 'North', nameKey: 'north', isActive: true });
    const city = { name: 'Kasur' };
    const { service, cityModel, customerModel } = build({ territory });
    cityModel.findOne.mockResolvedValue(city);
    await service.updateTerritory(tenantId, 't1', { name: 'North East' });
    expect(customerModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({ city: 'Kasur', territory: 'North', branchId: territory.branchId }), { $set: { territory: 'North East' } });
  });

  it('ensure returns the stored spelling and registers new places', async () => {
    const { service, cityModel: cm, territoryModel: tm } = build();
    const cityModel = cm as Record<string, jest.Mock>;
    const territoryModel = tm as Record<string, jest.Mock>;
    const city = { _id: new Types.ObjectId(), name: 'Kasur' };
    cityModel.findOneAndUpdate = jest.fn().mockResolvedValue(city);
    territoryModel.findOneAndUpdate = jest.fn().mockResolvedValue({ name: 'North' });
    await expect(service.ensure(tenantId, branchId, ' kasur ', 'NORTH')).resolves.toEqual({ city: 'Kasur', territory: 'North' });
    expect(cityModel.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ nameKey: 'kasur', branchId: new Types.ObjectId(branchId) }), { $setOnInsert: { name: 'kasur', isActive: true } }, { upsert: true, new: true });
  });

  it('ensure survives two requests creating the same city at once', async () => {
    const { service, cityModel: cm } = build();
    const cityModel = cm as Record<string, jest.Mock>;
    const winner = { _id: new Types.ObjectId(), name: 'Kasur' };
    cityModel.findOneAndUpdate = jest.fn().mockRejectedValue(duplicate);
    cityModel.findOne.mockResolvedValue(winner);
    await expect(service.ensure(tenantId, branchId, 'Kasur')).resolves.toEqual({ city: 'Kasur' });
  });
});
