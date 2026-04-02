import { User } from '../../domain/entities/user.js';

export interface UserProfileDTO {
  user_id: string;
  name: string;
  currency: string;
  country: string;
  employment: {
    type: string;
    monthlyIncome: number;
    salaryCreditDay: number;
  };
  created_at?: string;
  updated_at?: string;
}

export class UserProfileMapper {
  static toDTO(user: User): UserProfileDTO {
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

  static toDomain(dto: UserProfileDTO): User {
    return new User(
      dto.user_id,
      dto.name,
      dto.currency,
      dto.country,
      dto.employment,
      dto.created_at ? new Date(dto.created_at) : undefined,
      dto.updated_at ? new Date(dto.updated_at) : undefined
    );
  }
}