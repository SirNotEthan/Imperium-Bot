import sequelize from '../database';
import User from './User';
import VerificationHistory from './VerificationHistory';
import ModerationLog from './ModerationLog';

export { User, VerificationHistory, ModerationLog };

export async function initializeDatabase(): Promise<void> {
    try {
        await sequelize.authenticate();
        console.log('Database connection established successfully.');
        
        await sequelize.sync({ force: false });
        console.log('Database synchronized successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
}

export default sequelize;