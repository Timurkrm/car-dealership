import type {
  VehicleSearchItem,
  PartSearchItem,
} from '../src/features/search/search-client';
export const resultId = '60000000-0000-4000-8000-000000000001';
const named = (name: string) => ({ id: resultId, name });
const base = {
  id: resultId,
  title: 'BMW 330i — длинное название автомобиля для проверки переноса',
  price: { amountMinor: '9007199254740993', currency: 'EUR' },
  publishedAt: '2026-01-01T00:00:00Z',
  cover: {
    url: 'https://media.example.test/ready.webp',
    width: 640,
    height: 480,
  },
  location: {
    city: 'Амстердам',
    region: 'Северная Голландия',
    countryCode: 'NL',
    publicPoint: null,
    distanceMeters: 12000,
  },
};
export const vehicleResult: VehicleSearchItem = {
  ...base,
  type: 'VEHICLE',
  vehicle: {
    make: named('BMW'),
    model: named('3 Series'),
    generation: null,
    year: 2022,
    mileageKm: 48000,
    bodyType: 'SEDAN',
    fuelType: 'PETROL',
    transmission: 'AUTOMATIC',
    driveType: 'RWD',
    condition: 'USED',
    color: null,
  },
};
export const partResult: PartSearchItem = {
  ...base,
  id: '60000000-0000-4000-8000-000000000002',
  title: 'Комплект тормозных дисков Brembo',
  price: { amountMinor: '17999', currency: 'EUR' },
  type: 'PART',
  part: {
    name: 'Тормозные диски',
    category: { ...named('Тормозная система'), parentId: null },
    brand: named('Brembo'),
    condition: 'NEW',
    oemNumber: 'OEM-09.A047.11',
    manufacturerPartNumber: 'MANUFACTURER-123456789012345678901234567890',
    quantityAvailable: 3,
    fitment: {
      mode: 'VEHICLE_SPECIFIC',
      count: 3,
      samples: [
        {
          make: named('BMW'),
          model: named('3 Series'),
          generation: null,
          yearFrom: 2019,
          yearTo: 2024,
        },
      ],
    },
  },
};
