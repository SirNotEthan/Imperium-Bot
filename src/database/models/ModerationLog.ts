import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface ModerationLogAttributes {
    id: number;
    discordUserId: string;
    guildId: string;
    moderatorId: string;
    action: 'ban' | 'unban' | 'mute' | 'unmute' | 'kick' | 'timeout' | 'untimeout' | 'gameban' | 'warning' | 'communityban';
    reason: string;
    duration?: number;
    expiresAt?: Date;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

interface ModerationLogCreationAttributes extends Optional<ModerationLogAttributes, 'id' | 'duration' | 'expiresAt' | 'createdAt' | 'updatedAt'> {}

class ModerationLog extends Model<ModerationLogAttributes, ModerationLogCreationAttributes> implements ModerationLogAttributes {
    public id!: number;
    public discordUserId!: string;
    public guildId!: string;
    public moderatorId!: string;
    public action!: 'ban' | 'unban' | 'mute' | 'unmute' | 'kick' | 'timeout' | 'untimeout' | 'gameban' | 'warning' | 'communityban';
    public reason!: string;
    public duration?: number;
    public expiresAt?: Date;
    public isActive!: boolean;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

ModerationLog.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        discordUserId: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            },
        },
        guildId: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            },
        },
        moderatorId: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true,
            },
        },
        action: {
            type: DataTypes.ENUM('ban', 'unban', 'mute', 'unmute', 'kick', 'timeout', 'untimeout', 'gameban', 'warning', 'communityban'),
            allowNull: false,
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true,
            },
        },
        duration: {
            type: DataTypes.BIGINT,
            allowNull: true,
            comment: 'Duration in milliseconds',
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    },
    {
        sequelize,
        tableName: 'moderation_logs',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['discord_user_id'],
            },
            {
                fields: ['guild_id'],
            },
            {
                fields: ['moderator_id'],
            },
            {
                fields: ['action'],
            },
            {
                fields: ['is_active'],
            },
            {
                fields: ['expires_at'],
            },
            {
                fields: ['created_at'],
            },
            {
                fields: ['guild_id', 'discord_user_id'],
            },
        ],
    }
);

export default ModerationLog;