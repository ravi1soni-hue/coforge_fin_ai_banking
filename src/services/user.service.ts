import jwt from "jsonwebtoken";
import { UserRepository } from "../repo/chat.repo.js";
import { User } from "../repo/user.repo.js";
import { InitUserReq } from "../routes/user.route.js";


interface InitUserResponse {
    token: string;
    user: {
        id: string;
        external_user_id: string;
    };
}



export class UserService {
    private readonly userRepo: UserRepository;

    constructor({ userRepo }: { userRepo: UserRepository }) {
        this.userRepo = userRepo;
    }

    // Removed 'function' keyword and implemented logic
    async initUser(userData: InitUserReq): Promise<InitUserResponse | undefined> {
        // 1. Check if user already exists, otherwise create them
        let user = await this.userRepo.findByExternalId(userData.external_user_id);

        if (!user) {
            user = await this.userRepo.create({
                external_user_id: userData.external_user_id,
                full_name: userData.full_name,
                country_code: userData.country_code,
                base_currency: userData.base_currency,
                timezone: userData.timezone,
                metadata: userData.metadata,
            });
        }

        

        if (!user) return undefined;

        // 2. Generate the JWT
        const token = jwt.sign(
            { userId: user.id, externalId: user.external_user_id },
            process.env.JWT_SECRET as string,
            { expiresIn: "7d" }
        );

        return {
            token,
            user: {
                id: user.id,
                external_user_id: user.external_user_id,
            },
        };
    }
}
