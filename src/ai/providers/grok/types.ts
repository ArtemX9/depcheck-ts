export type ChatMessage = {
    role: 'system' | 'user';
    content: string;
}

export type GrokResponseBody = {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
}
