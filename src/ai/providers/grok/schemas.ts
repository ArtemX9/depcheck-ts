export const OUTDATED_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        priorityPackage: { type: 'string' },
        upgradeAdvice: { type: 'string' },
    },
    required: ['summary', 'priorityPackage', 'upgradeAdvice'],
    additionalProperties: false,
};

export const BUNDLE_SIZE_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        topOffender: { type: 'string' },
        recommendation: { type: 'string' },
    },
    required: ['summary', 'topOffender', 'recommendation'],
    additionalProperties: false,
};

export const LICENSE_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        advice: { type: 'string' },
    },
    required: ['summary', 'riskLevel', 'advice'],
    additionalProperties: false,
};

export const UNUSED_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        cleanupAdvice: { type: 'string' },
    },
    required: ['summary', 'cleanupAdvice'],
    additionalProperties: false,
};
