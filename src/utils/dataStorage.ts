import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ModerationAction {
  id: string;
  userId: string;
  moderatorId: string;
  action: 'ban' | 'unban' | 'mute' | 'unmute';
  reason: string;
  duration?: number; // in milliseconds
  timestamp: number;
  expiresAt?: number; // for timed actions
}

export interface UserStats {
  userId: string;
  messageCount: number;
  lastMessageAt: number;
}

export interface UserData {
  userId: string;
  robloxId?: number;
  robloxUsername?: string;
  verificationHistory: string[]; // Previous roblox usernames
  isBanned: boolean;
  isMuted: boolean;
  banExpiresAt?: number;
  muteExpiresAt?: number;
}

class DataStorage {
  private dataPath: string;
  private moderationPath: string;
  private statsPath: string;
  private userData: Map<string, UserData> = new Map();
  private moderationLogs: ModerationAction[] = [];
  private userStats: Map<string, UserStats> = new Map();

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'users.json');
    this.moderationPath = join(process.cwd(), 'data', 'moderation.json');
    this.statsPath = join(process.cwd(), 'data', 'stats.json');
    this.loadData();
  }

  private loadData(): void {
    try {
      // Create data directory if it doesn't exist
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        require('fs').mkdirSync(dataDir, { recursive: true });
      }

      // Load user data
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        this.userData = new Map(data.map((user: UserData) => [user.userId, user]));
      }

      // Load moderation logs
      if (existsSync(this.moderationPath)) {
        this.moderationLogs = JSON.parse(readFileSync(this.moderationPath, 'utf-8'));
      }

      // Load user stats
      if (existsSync(this.statsPath)) {
        const data = JSON.parse(readFileSync(this.statsPath, 'utf-8'));
        this.userStats = new Map(data.map((stat: UserStats) => [stat.userId, stat]));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  private saveData(): void {
    try {
      // Save user data
      const userData = Array.from(this.userData.values());
      writeFileSync(this.dataPath, JSON.stringify(userData, null, 2));

      // Save moderation logs
      writeFileSync(this.moderationPath, JSON.stringify(this.moderationLogs, null, 2));

      // Save user stats
      const userStats = Array.from(this.userStats.values());
      writeFileSync(this.statsPath, JSON.stringify(userStats, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  // User Data Methods
  getUser(userId: string): UserData | undefined {
    return this.userData.get(userId);
  }

  createUser(userId: string, robloxId?: number, robloxUsername?: string): UserData {
    const user: UserData = {
      userId,
      robloxId,
      robloxUsername,
      verificationHistory: robloxUsername ? [robloxUsername] : [],
      isBanned: false,
      isMuted: false
    };
    
    this.userData.set(userId, user);
    this.saveData();
    return user;
  }

  updateUser(userId: string, updates: Partial<UserData>): void {
    const user = this.userData.get(userId);
    if (user) {
      // If updating roblox username, add to history
      if (updates.robloxUsername && updates.robloxUsername !== user.robloxUsername) {
        user.verificationHistory.push(updates.robloxUsername);
      }
      
      Object.assign(user, updates);
      this.userData.set(userId, user);
      this.saveData();
    }
  }

  getUserByRobloxId(robloxId: number): UserData | undefined {
    for (const user of this.userData.values()) {
      if (user.robloxId === robloxId) {
        return user;
      }
    }
    return undefined;
  }

  getUserByRobloxUsername(username: string): UserData | undefined {
    for (const user of this.userData.values()) {
      if (user.robloxUsername?.toLowerCase() === username.toLowerCase()) {
        return user;
      }
    }
    return undefined;
  }

  // Moderation Methods
  addModerationAction(action: Omit<ModerationAction, 'id' | 'timestamp'>): ModerationAction {
    const moderationAction: ModerationAction = {
      ...action,
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      timestamp: Date.now()
    };

    this.moderationLogs.push(moderationAction);
    this.saveData();
    return moderationAction;
  }

  getModerationHistory(userId: string): ModerationAction[] {
    return this.moderationLogs.filter(action => action.userId === userId);
  }

  getActiveBan(userId: string): ModerationAction | undefined {
    const user = this.getUser(userId);
    if (!user?.isBanned) return undefined;

    // Check if ban is expired
    if (user.banExpiresAt && Date.now() > user.banExpiresAt) {
      this.updateUser(userId, { isBanned: false, banExpiresAt: undefined });
      return undefined;
    }

    return this.moderationLogs
      .filter(action => action.userId === userId && action.action === 'ban')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  getActiveMute(userId: string): ModerationAction | undefined {
    const user = this.getUser(userId);
    if (!user?.isMuted) return undefined;

    // Check if mute is expired
    if (user.muteExpiresAt && Date.now() > user.muteExpiresAt) {
      this.updateUser(userId, { isMuted: false, muteExpiresAt: undefined });
      return undefined;
    }

    return this.moderationLogs
      .filter(action => action.userId === userId && action.action === 'mute')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  // Message Stats Methods
  incrementMessageCount(userId: string): void {
    const stats = this.userStats.get(userId) || {
      userId,
      messageCount: 0,
      lastMessageAt: 0
    };

    stats.messageCount++;
    stats.lastMessageAt = Date.now();
    this.userStats.set(userId, stats);
    this.saveData();
  }

  getUserStats(userId: string): UserStats | undefined {
    return this.userStats.get(userId);
  }

  getTopMessagers(limit: number = 10): UserStats[] {
    return Array.from(this.userStats.values())
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit);
  }

  // Utility Methods
  cleanupExpiredActions(): void {
    const now = Date.now();
    
    // Clean up expired bans and mutes
    for (const [userId, user] of this.userData.entries()) {
      let updated = false;
      
      if (user.isBanned && user.banExpiresAt && now > user.banExpiresAt) {
        user.isBanned = false;
        user.banExpiresAt = undefined;
        updated = true;
      }
      
      if (user.isMuted && user.muteExpiresAt && now > user.muteExpiresAt) {
        user.isMuted = false;
        user.muteExpiresAt = undefined;
        updated = true;
      }
      
      if (updated) {
        this.userData.set(userId, user);
      }
    }
    
    if (Array.from(this.userData.values()).some(user => 
      (user.isBanned && user.banExpiresAt && now > user.banExpiresAt) ||
      (user.isMuted && user.muteExpiresAt && now > user.muteExpiresAt)
    )) {
      this.saveData();
    }
  }
}

export const dataStorage = new DataStorage();

// Clean up expired actions every 5 minutes
setInterval(() => {
  dataStorage.cleanupExpiredActions();
}, 5 * 60 * 1000);