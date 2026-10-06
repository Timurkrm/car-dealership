import type { Vehicle, PublicListing } from '../listings/listing-types';
import { VEHICLE_OPTION_LABELS } from '../listings/vehicle-labels';
import { resultMileage } from '../results/result-format';
import { Section } from '../../components/ui/layout';
import { DetailShell } from './detail-shell';
import { DetailFacts } from './detail-facts';

const label = (value: string | null) => value && Object.hasOwn(VEHICLE_OPTION_LABELS, value) ? VEHICLE_OPTION_LABELS[value] : null;
export function VehicleFacts({ vehicle: v }: { vehicle: Vehicle }) {
  return <DetailFacts compact rows={[
    ['Год', v.year], ['Пробег', resultMileage(v.mileageKm)], ['Коробка передач', label(v.transmission)], ['Топливо', label(v.fuelType)], ['Кузов', label(v.bodyType)],
  ]} />;
}
export function VehicleSpecifications({ vehicle: v }: { vehicle: Vehicle }) {
  return <Section className="detail-section" aria-labelledby="vehicle-specifications"><h2 id="vehicle-specifications">Характеристики автомобиля</h2><div className="detail-spec-groups">
    <div><h3>Общие сведения</h3><DetailFacts rows={[
      ['Марка', v.make.name], ['Модель', v.model.name], ['Поколение', v.generation?.name], ['Год', v.year], ['Пробег', resultMileage(v.mileageKm)], ['Состояние', label(v.condition)],
    ]} /></div>
    <div><h3>Двигатель и трансмиссия</h3><DetailFacts rows={[
      ['Топливо', label(v.fuelType)], ['Мощность', v.enginePowerHp === null ? null : `${v.enginePowerHp.toLocaleString('ru-RU')} л. с.`], ['Объём двигателя', v.engineDisplacementCc === null ? null : `${v.engineDisplacementCc.toLocaleString('ru-RU')} см³`], ['Коробка передач', label(v.transmission)], ['Привод', label(v.driveType)],
    ]} /></div>
    <div><h3>Кузов и цвет</h3><DetailFacts rows={[
      ['Кузов', label(v.bodyType)], ['Цвет', label(v.color)],
    ]} /></div>
  </div></Section>;
}
export function VehicleDetail({ listing, sellerIdentity }: { listing: PublicListing; sellerIdentity: string }) {
  return <DetailShell listing={listing} sellerIdentity={sellerIdentity} facts={<VehicleFacts vehicle={listing.vehicle} />}><VehicleSpecifications vehicle={listing.vehicle} /></DetailShell>;
}
