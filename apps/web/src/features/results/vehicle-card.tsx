import type { VehicleSearchItem } from '../search/search-client';
import type { ResultInteractionProps } from './result-interaction';
import {
  ResultCardShell,
  ResultPrice,
  ResultLocation,
} from './result-card-shell';
import { ResultMedia } from './result-media';
import { resultMileage } from './result-format';
import { VEHICLE_OPTION_LABELS } from '../listings/vehicle-labels';
import { FavoriteButton } from '../engagement/favorite-button';
export function VehicleCard({
  listing,
  ...props
}: ResultInteractionProps & { listing: VehicleSearchItem }) {
  const vehicle = listing.vehicle;
  const specs = [vehicle.transmission, vehicle.fuelType]
    .map((value) => VEHICLE_OPTION_LABELS[value])
    .filter(Boolean);
  return (
    <ResultCardShell
      {...props}
      id={listing.id}
      title={listing.title}
      href={`/listings/${listing.id}`}
      media={
        <ResultMedia
          type="VEHICLE"
          cover={listing.cover}
          label={`${vehicle.make.name} ${vehicle.model.name}`}
        />
      }
      favorite={<FavoriteButton listingId={listing.id} variant="icon" />}
      price={<ResultPrice price={listing.price} />}
      location={<ResultLocation location={listing.location} />}
    >
      <p className="result-primary-specs">
        {vehicle.year} · {resultMileage(vehicle.mileageKm)}
      </p>
      {specs.length > 0 && <p>{specs.join(' · ')}</p>}
    </ResultCardShell>
  );
}
