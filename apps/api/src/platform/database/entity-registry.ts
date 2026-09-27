// Composition root only: registration is not permission for cross-module table access.
import { User } from '../../modules/users/infrastructure/persistence/user.entity';
import { UserRole } from '../../modules/users/infrastructure/persistence/user-role.entity';
import { UserCredential } from '../../modules/auth/infrastructure/persistence/user-credential.entity';
import { UserSession } from '../../modules/auth/infrastructure/persistence/user-session.entity';
import { SessionToken } from '../../modules/auth/infrastructure/persistence/session-token.entity';
import { ActionToken } from '../../modules/auth/infrastructure/persistence/action-token.entity';
import { VehicleMake } from '../../modules/vehicles/infrastructure/persistence/vehicle-make.entity';
import { VehicleModel } from '../../modules/vehicles/infrastructure/persistence/vehicle-model.entity';
import { VehicleGeneration } from '../../modules/vehicles/infrastructure/persistence/vehicle-generation.entity';
import { Vehicle } from '../../modules/vehicles/infrastructure/persistence/vehicle.entity';
import { Listing } from '../../modules/listings/infrastructure/persistence/listing.entity';
import { VehicleListing } from '../../modules/listings/infrastructure/persistence/vehicle-listing.entity';
import { PartListing } from '../../modules/listings/infrastructure/persistence/part-listing.entity';
import { Part } from '../../modules/parts/infrastructure/persistence/part.entity';
import { PartCategory } from '../../modules/parts/infrastructure/persistence/part-category.entity';
import { PartBrand } from '../../modules/parts/infrastructure/persistence/part-brand.entity';
import { PartFitment } from '../../modules/parts/infrastructure/persistence/part-fitment.entity';
import { ListingLocation } from '../../modules/geo/infrastructure/persistence/listing-location.entity';
import { ListingMedia } from '../../modules/media/infrastructure/persistence/listing-media.entity';
import { MediaVariant } from '../../modules/media/infrastructure/persistence/media-variant.entity';
import { Favorite } from '../../modules/favorites/infrastructure/persistence/favorite.entity';
import { SavedSearch } from '../../modules/search/infrastructure/persistence/saved-search.entity';
import { Conversation } from '../../modules/messaging/infrastructure/persistence/conversation.entity';
import { ConversationParticipant } from '../../modules/messaging/infrastructure/persistence/conversation-participant.entity';
import { Message } from '../../modules/messaging/infrastructure/persistence/message.entity';
import { Notification } from '../../modules/notifications/infrastructure/persistence/notification.entity';
import { Report } from '../../modules/moderation/infrastructure/persistence/report.entity';
import { ModerationAction } from '../../modules/moderation/infrastructure/persistence/moderation-action.entity';
import { AuditLog } from '../../modules/audit/infrastructure/persistence/audit-log.entity';
import { OutboxEvent } from '../../modules/outbox/infrastructure/persistence/outbox-event.entity';
import { NotificationPreference } from '../../modules/email-delivery/infrastructure/persistence/notification-preference.entity';
import { NotificationDelivery } from '../../modules/email-delivery/infrastructure/persistence/notification-delivery.entity';

export const marketplaceEntities = [
  User,
  UserRole,
  UserCredential,
  UserSession,
  SessionToken,
  ActionToken,
  VehicleMake,
  VehicleModel,
  VehicleGeneration,
  Vehicle,
  Listing,
  VehicleListing,
  PartListing,
  Part,
  PartCategory,
  PartBrand,
  PartFitment,
  ListingLocation,
  ListingMedia,
  MediaVariant,
  Favorite,
  SavedSearch,
  Conversation,
  ConversationParticipant,
  Message,
  Notification,
  Report,
  ModerationAction,
  AuditLog,
  OutboxEvent,
  NotificationPreference,
  NotificationDelivery,
];
