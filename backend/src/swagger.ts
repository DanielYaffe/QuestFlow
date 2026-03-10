import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/config';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'QuestFlow API',
            version: '2.0.0',
            description: 'API for QuestFlow — quest builder, sprite generation, AI generation, and authentication',
            contact: {
                name: 'Daniel Yaffe',
            },
        },
        servers: [
            {
                url: `http://localhost:${config.PORT || 3000}`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        _id:           { type: 'string',  example: '60d0fe4f5311236168a109cb' },
                        email:         { type: 'string',  example: 'user@example.com' },
                        password:      { type: 'string',  example: 'secret123' },
                        refreshTokens: { type: 'array', items: { type: 'string' } },
                    },
                },
                Questline: {
                    type: 'object',
                    properties: {
                        _id:         { type: 'string',  example: '60d0fe4f5311236168a109cb' },
                        title:       { type: 'string',  example: 'The Dragon\'s Lair' },
                        description: { type: 'string',  example: 'A heroic journey into the mountains' },
                        ownerId:     { type: 'string',  example: '60d0fe4f5311236168a109ca' },
                        createdAt:   { type: 'string',  format: 'date-time' },
                    },
                },
                QuestNode: {
                    type: 'object',
                    properties: {
                        id:       { type: 'string',  example: 'node-1' },
                        title:    { type: 'string',  example: 'Find the artifact' },
                        variant:  { type: 'string',  example: 'main' },
                        position: {
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                            },
                        },
                    },
                },
                QuestEdge: {
                    type: 'object',
                    properties: {
                        id:     { type: 'string', example: 'edge-1' },
                        source: { type: 'string', example: 'node-1' },
                        target: { type: 'string', example: 'node-2' },
                    },
                },
                Character: {
                    type: 'object',
                    properties: {
                        _id:        { type: 'string', example: '60d0fe4f5311236168a109cc' },
                        name:       { type: 'string', example: 'Aldric the Brave' },
                        appearance: { type: 'string', example: 'Tall warrior with silver hair' },
                        background: { type: 'string', example: 'Former knight of the realm' },
                        imageUrl:   { type: 'string', example: 'https://cdn.example.com/sprite.png' },
                        questIds:   { type: 'array', items: { type: 'string' } },
                    },
                },
                Reward: {
                    type: 'object',
                    properties: {
                        _id:         { type: 'string', example: '60d0fe4f5311236168a109cd' },
                        title:       { type: 'string', example: 'Sword of Valor' },
                        description: { type: 'string', example: 'A legendary blade forged by dwarves' },
                        rarity:      { type: 'string', enum: ['common', 'rare', 'epic'], example: 'epic' },
                        imageUrl:    { type: 'string', example: 'https://cdn.example.com/reward.png' },
                    },
                },
                Chapter: {
                    type: 'object',
                    properties: {
                        _id:    { type: 'string', example: '60d0fe4f5311236168a109ce' },
                        title:  { type: 'string', example: 'Chapter 1: The Call' },
                        scenes: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id:    { type: 'string' },
                                    title: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                SpriteFilters: {
                    type: 'object',
                    properties: {
                        artStyle:     { type: 'string', enum: ['pixel-art-8bit', 'pixel-art-16bit', 'hand-drawn', 'vector', 'watercolor', 'anime', 'realistic', '3d-render'] },
                        perspective:  { type: 'string', enum: ['side-view', 'top-down', 'isometric', 'front-facing', 'any'] },
                        aspectRatio:  { type: 'string', enum: ['square', 'portrait', 'landscape', 'auto'] },
                        background:   { type: 'string', enum: ['transparent', 'white', 'black', 'gradient', 'scene'] },
                        colorPalette: { type: 'string', enum: ['vibrant', 'muted', 'monochrome', 'warm', 'cool', 'neon', 'any'] },
                        detailLevel:  { type: 'string', enum: ['minimal', 'medium', 'detailed', 'ultra-detailed'] },
                        category:     { type: 'string', enum: ['character', 'enemy', 'npc', 'item', 'weapon', 'environment', 'ui', 'effect', 'any'] },
                    },
                },
                SpriteRecord: {
                    type: 'object',
                    properties: {
                        _id:        { type: 'string', example: '60d0fe4f5311236168a109cf' },
                        imageUrl:   { type: 'string', description: 'Short-lived presigned S3 URL', example: 'https://s3.example.com/sprites/abc.png?X-Amz-...' },
                        imageKey:   { type: 'string', description: 'Permanent S3 storage key', example: 'sprites/abc.png' },
                        userPrompt: { type: 'string', example: 'A fierce dragon knight' },
                        fullPrompt: { type: 'string', example: 'A 16-bit pixel art sprite for use as a character — A fierce dragon knight...' },
                        filters:    { $ref: '#/components/schemas/SpriteFilters' },
                        createdAt:  { type: 'string', format: 'date-time' },
                    },
                },
                QuestStyle: {
                    type: 'object',
                    properties: {
                        _id:         { type: 'string' },
                        name:        { type: 'string', example: 'Fantasy' },
                        description: { type: 'string', example: 'High fantasy setting with magic and dragons' },
                    },
                },
                ExportTemplate: {
                    type: 'object',
                    properties: {
                        _id:     { type: 'string' },
                        name:    { type: 'string', example: 'Default Template' },
                        content: { type: 'string', example: '# {{title}}\n\n{{description}}' },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi, swaggerSpec };
