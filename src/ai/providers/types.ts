import {type Role} from '../types';

export type ChatMessage = {
    role: Role;
    content: string;
}

export type ProviderResponseBody = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}
