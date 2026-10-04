import type { SearchItem } from '../search/search-client';
import type { ResultInteractionProps } from './result-interaction';
import { VehicleCard } from './vehicle-card';
import { PartCard } from './part-card';
export function MarketplaceResult({
  listing,
  ...props
}: ResultInteractionProps & { listing: SearchItem }) {
  switch (listing.type) {
    case 'VEHICLE':
      return <VehicleCard listing={listing} {...props} />;
    case 'PART':
      return <PartCard listing={listing} {...props} />;
    default: {
      const unknownType: never = listing;
      void unknownType;
      return null;
    }
  }
}
