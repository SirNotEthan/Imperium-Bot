import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../database';

interface UserAttributes {
    id: number;
    discordId: string;
    robloxId?: number;
    robloxUsername?: string;
    verifiedAt?: Date;
    messageCount: number;
    level: number;
    lastMessageTime?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'robloxId' | 'robloxUsername' | 'verifiedAt' | 'lastMessageTime' | 'createdAt' | 'updatedAt'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    public id!: number;
    public discordId!: string;
    public robloxId?: number;
    public robloxUsername?: string;
    public verifiedAt?: Date;
    public messageCount!: number;
    public level!: number;
    public lastMessageTime?: Date;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
    
    // Association properties
    public verificationHistory?: any[];
}

User.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        discordId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true,
            },
        },
        robloxId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            unique: true,
        },
        robloxUsername: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        verifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        messageCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
            },
        },
        level: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: {
                min: 0,
                max: 100,
            },
        },
        lastMessageTime: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'users',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ['discord_id'],
            },
            {
                unique: true,
                fields: ['roblox_id'],
                where: {
                    roblox_id: { [Op.ne]: null },
                },
            },
            {
                fields: ['level'],
            },
            {
                fields: ['message_count'],
            },
        ],
    }
);

export default User;