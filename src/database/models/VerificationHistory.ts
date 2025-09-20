import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';
import User from './User';

interface VerificationHistoryAttributes {
    id: number;
    userId: number;
    robloxId: number;
    robloxUsername: string;
    linkedAt: Date;
    unlinkedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

interface VerificationHistoryCreationAttributes extends Optional<VerificationHistoryAttributes, 'id' | 'unlinkedAt' | 'createdAt' | 'updatedAt'> {}

class VerificationHistory extends Model<VerificationHistoryAttributes, VerificationHistoryCreationAttributes> implements VerificationHistoryAttributes {
    public id!: number;
    public userId!: number;
    public robloxId!: number;
    public robloxUsername!: string;
    public linkedAt!: Date;
    public unlinkedAt?: Date;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

VerificationHistory.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: User,
                key: 'id',
            },
            onDelete: 'CASCADE',
        },
        robloxId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        robloxUsername: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        linkedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        unlinkedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'verification_history',
        timestamps: true,
        underscored: true,
        indexes: [
            {
                fields: ['user_id'],
            },
            {
                fields: ['roblox_id'],
            },
            {
                fields: ['linked_at'],
            },
        ],
    }
);

User.hasMany(VerificationHistory, {
    foreignKey: 'userId',
    as: 'verificationHistory',
});

VerificationHistory.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
});

export default VerificationHistory;