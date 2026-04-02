import { User } from '../../domain/entities/user.js';
export class UserProfileMapper {
    static toDTO(user) {
        return {
            user_id: user.userId,
            name: user.name,
            currency: user.currency,
            country: user.country,
            employment: user.employment,
            created_at: user.createdAt?.toISOString(),
            updated_at: user.updatedAt?.toISOString()
        };
    }
    static toDomain(dto) {
        return new User(dto.user_id, dto.name, dto.currency, dto.country, dto.employment, dto.created_at ? new Date(dto.created_at) : undefined, dto.updated_at ? new Date(dto.updated_at) : undefined);
    }
}
