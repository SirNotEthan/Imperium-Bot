import User from '../database/models/User';
import VerificationHistory from '../database/models/VerificationHistory';

interface VerifiedUser {
  discordId: string;
  robloxId: number;
  robloxUsername: string;
  verifiedAt: Date;
  previousAccounts?: Array<{
    robloxId: number;
    robloxUsername: string;
    linkedAt: Date;
    unlinkedAt: Date;
  }>;
}

class VerificationStorage {
  private verifiedUsers = new Map<string, VerifiedUser>();
  private robloxToDiscord = new Map<number, string>();

  async verifyUser(discordId: string, robloxId: number, robloxUsername: string): Promise<boolean> {
    try {
      
      const existingRobloxUser = await User.findOne({ 
        where: { 
          robloxId,
        }
      });
      if (existingRobloxUser && existingRobloxUser.verifiedAt && existingRobloxUser.discordId !== discordId) {
        return false;
      }

      
      let [user] = await User.findOrCreate({
        where: { discordId },
        defaults: {
          discordId,
          messageCount: 0,
          level: 0,
        }
      });

      
      if (user.robloxId && user.verifiedAt) {
        await VerificationHistory.create({
          userId: user.id,
          robloxId: user.robloxId,
          robloxUsername: user.robloxUsername || '',
          linkedAt: user.verifiedAt,
          unlinkedAt: new Date()
        });

        
        this.robloxToDiscord.delete(user.robloxId);
      }

      
      await user.update({
        robloxId,
        robloxUsername,
        verifiedAt: new Date()
      });

      
      const userData: VerifiedUser = {
        discordId,
        robloxId,
        robloxUsername,
        verifiedAt: new Date(),
      };

      this.verifiedUsers.set(discordId, userData);
      this.robloxToDiscord.set(robloxId, discordId);

      console.log(`User ${discordId} verified with Roblox account ${robloxUsername} (${robloxId})`);
      return true;
    } catch (error) {
      console.error('Error verifying user:', error);
      return false;
    }
  }

  async unverifyUser(discordId: string): Promise<boolean> {
    try {
      const user = await User.findOne({ where: { discordId } });
      if (!user || !user.robloxId || !user.verifiedAt) return false;

      
      const oldRobloxId = user.robloxId;

      
      await VerificationHistory.create({
        userId: user.id,
        robloxId: user.robloxId,
        robloxUsername: user.robloxUsername || '',
        linkedAt: user.verifiedAt,
        unlinkedAt: new Date()
      });

      
      await user.update({
        robloxId: null,
        robloxUsername: null,
        verifiedAt: null
      });

      
      this.robloxToDiscord.delete(oldRobloxId);
      this.verifiedUsers.delete(discordId);
      
      console.log(`User ${discordId} unverified from Roblox account ${user.robloxUsername} (${user.robloxId})`);
      return true;
    } catch (error) {
      console.error('Error unverifying user:', error);
      return false;
    }
  }

  async getVerifiedUser(discordId: string): Promise<VerifiedUser | null> {
    try {
      const user = await User.findOne({ where: { discordId } });
      if (!user || !user.robloxId || !user.verifiedAt) return null;
      
      return {
        discordId: user.discordId,
        robloxId: user.robloxId!,
        robloxUsername: user.robloxUsername || '',
        verifiedAt: user.verifiedAt!
      };
    } catch (error) {
      console.error('Error getting verified user:', error);
      return null;
    }
  }

  async getUserByRobloxId(robloxId: number): Promise<VerifiedUser | null> {
    try {
      const user = await User.findOne({ where: { robloxId } });
      if (!user || !user.verifiedAt) return null;
      
      return {
        discordId: user.discordId,
        robloxId: user.robloxId!,
        robloxUsername: user.robloxUsername || '',
        verifiedAt: user.verifiedAt!
      };
    } catch (error) {
      console.error('Error getting user by Roblox ID:', error);
      return null;
    }
  }

  async getUserHistory(discordId: string): Promise<VerifiedUser | null> {
    try {
      const user = await User.findOne({ 
        where: { discordId },
        include: [{
          model: VerificationHistory,
          as: 'verificationHistory',
          required: false
        }]
      });
      
      if (!user) return null;
      
      const previousAccounts = user.verificationHistory?.map(history => ({
        robloxId: history.robloxId,
        robloxUsername: history.robloxUsername,
        linkedAt: history.linkedAt,
        unlinkedAt: history.unlinkedAt || new Date()
      })) || [];
      
      return {
        discordId: user.discordId,
        robloxId: user.robloxId || 0,
        robloxUsername: user.robloxUsername || '',
        verifiedAt: user.verifiedAt || new Date(0),
        previousAccounts
      };
    } catch (error) {
      console.error('Error getting user history:', error);
      return null;
    }
  }

  async isRobloxLinked(robloxId: number): Promise<boolean> {
    try {
      const user = await User.findOne({ where: { robloxId } });
      return !!(user && user.verifiedAt);
    } catch (error) {
      console.error('Error checking if Roblox is linked:', error);
      return false;
    }
  }

  async isDiscordVerified(discordId: string): Promise<boolean> {
    try {
      const user = await User.findOne({ where: { discordId } });
      return !!(user && user.verifiedAt);
    } catch (error) {
      console.error('Error checking if Discord is verified:', error);
      return false;
    }
  }

  async getAllVerifiedUsers(): Promise<VerifiedUser[]> {
    try {
      const users = await User.findAll();
      return users
        .filter(user => user.robloxId && user.robloxUsername && user.verifiedAt)
        .map(user => ({
          discordId: user.discordId,
          robloxId: user.robloxId!,
          robloxUsername: user.robloxUsername!,
          verifiedAt: user.verifiedAt!
        }));
    } catch (error) {
      console.error('Error getting all verified users:', error);
      return [];
    }
  }

  
  async loadFromDatabase(): Promise<void> {
    try {
      const users = await User.findAll();
      
      this.verifiedUsers.clear();
      this.robloxToDiscord.clear();
      
      for (const user of users) {
        if (user.robloxId && user.verifiedAt) {
          const userData: VerifiedUser = {
            discordId: user.discordId,
            robloxId: user.robloxId,
            robloxUsername: user.robloxUsername || '',
            verifiedAt: user.verifiedAt
          };
          
          this.verifiedUsers.set(user.discordId, userData);
          this.robloxToDiscord.set(user.robloxId, user.discordId);
        }
      }
      
      console.log(`Loaded ${this.verifiedUsers.size} verified users from database`);
    } catch (error) {
      console.error('Error loading verification data from database:', error);
    }
  }
}

export const verificationStorage = new VerificationStorage();
export type { VerifiedUser };