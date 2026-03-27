export type ChatMessage = {
    role: 'system' | 'user';
    content: string;
}

export type ProviderResponseBody = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}
