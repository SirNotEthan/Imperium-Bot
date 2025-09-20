interface UserLevelData {
  discordId: string;
  messageCount: number;
  level: number;
  lastMessageTime: number;
}

interface LevelConfig {
  level: number;
  messagesRequired: number;
  roleId?: string;
}

class LevelsStorage {
  private userLevels: Map<string, UserLevelData> = new Map();
  private levelConfigs: LevelConfig[] = [];
  private readonly MESSAGE_COOLDOWN = 60000; // 1 minute cooldown between counting messages
  private readonly MAX_LEVEL = 100;

  constructor() {
    this.initializeLevelConfigs();
  }

  private initializeLevelConfigs(): void {
    // Progressive message requirements - more messages needed as level increases
    for (let level = 1; level <= this.MAX_LEVEL; level++) {
      const messagesRequired = this.calculateMessagesForLevel(level);
      this.levelConfigs.push({
        level,
        messagesRequired
      });
    }
  }

  private calculateMessagesForLevel(level: number): number {
    // Exponential scaling: 10 * level^1.5, rounded to nearest 10
    const base = Math.floor(10 * Math.pow(level, 1.5) / 10) * 10;
    return Math.max(base, 10); // Minimum 10 messages per level
  }

  addMessage(discordId: string): { leveledUp: boolean; newLevel?: number; oldLevel?: number } {
    const userData = this.getUserData(discordId);
    const now = Date.now();

    // Check cooldown
    if (now - userData.lastMessageTime < this.MESSAGE_COOLDOWN) {
      return { leveledUp: false };
    }

    const oldLevel = userData.level;
    userData.messageCount++;
    userData.lastMessageTime = now;

    const newLevel = this.calculateLevel(userData.messageCount);
    const leveledUp = newLevel > oldLevel;
    
    if (leveledUp) {
      userData.level = newLevel;
    }

    this.userLevels.set(discordId, userData);

    return {
      leveledUp,
      newLevel: leveledUp ? newLevel : undefined,
      oldLevel: leveledUp ? oldLevel : undefined
    };
  }

  private calculateLevel(messageCount: number): number {
    let level = 0;
    let totalMessages = 0;

    for (const config of this.levelConfigs) {
      totalMessages += config.messagesRequired;
      if (messageCount >= totalMessages) {
        level = config.level;
      } else {
        break;
      }
    }

    return Math.min(level, this.MAX_LEVEL);
  }

  getUserData(discordId: string): UserLevelData {
    const existing = this.userLevels.get(discordId);
    if (existing) {
      return existing;
    }

    const newUser: UserLevelData = {
      discordId,
      messageCount: 0,
      level: 0,
      lastMessageTime: 0
    };

    this.userLevels.set(discordId, newUser);
    return newUser;
  }

  getLevelProgress(discordId: string): {
    currentLevel: number;
    messageCount: number;
    messagesForCurrentLevel: number;
    messagesForNextLevel: number;
    progressToNext: number;
    totalMessagesForNext: number;
  } {
    const userData = this.getUserData(discordId);
    const currentLevel = userData.level;
    const nextLevel = Math.min(currentLevel + 1, this.MAX_LEVEL);
    
    // Calculate total messages required up to current level
    let totalMessagesForCurrent = 0;
    for (let i = 1; i <= currentLevel; i++) {
      const config = this.levelConfigs.find(c => c.level === i);
      if (config) {
        totalMessagesForCurrent += config.messagesRequired;
      }
    }

    // Calculate total messages required for next level
    let totalMessagesForNext = totalMessagesForCurrent;
    const nextLevelConfig = this.levelConfigs.find(c => c.level === nextLevel);
    if (nextLevelConfig) {
      totalMessagesForNext += nextLevelConfig.messagesRequired;
    }

    const messagesForCurrentLevel = currentLevel === 0 ? 0 : totalMessagesForCurrent;
    const messagesForNextLevel = nextLevelConfig ? nextLevelConfig.messagesRequired : 0;
    const progressToNext = Math.max(0, userData.messageCount - totalMessagesForCurrent);

    return {
      currentLevel,
      messageCount: userData.messageCount,
      messagesForCurrentLevel,
      messagesForNextLevel,
      progressToNext,
      totalMessagesForNext
    };
  }

  getLeaderboard(limit: number = 10): UserLevelData[] {
    return Array.from(this.userLevels.values())
      .sort((a, b) => {
        if (a.level !== b.level) {
          return b.level - a.level; // Higher level first
        }
        return b.messageCount - a.messageCount; // More messages first if same level
      })
      .slice(0, limit);
  }

  setLevelRole(level: number, roleId: string): boolean {
    const config = this.levelConfigs.find(c => c.level === level);
    if (config) {
      config.roleId = roleId;
      return true;
    }
    return false;
  }

  getLevelRole(level: number): string | undefined {
    const config = this.levelConfigs.find(c => c.level === level);
    return config?.roleId;
  }

  getStats() {
    return {
      totalUsers: this.userLevels.size,
      maxLevel: this.MAX_LEVEL,
      averageLevel: this.calculateAverageLevel(),
      totalMessages: this.calculateTotalMessages()
    };
  }

  private calculateAverageLevel(): number {
    if (this.userLevels.size === 0) return 0;
    const totalLevels = Array.from(this.userLevels.values()).reduce((sum, user) => sum + user.level, 0);
    return Math.round(totalLevels / this.userLevels.size * 100) / 100;
  }

  private calculateTotalMessages(): number {
    return Array.from(this.userLevels.values()).reduce((sum, user) => sum + user.messageCount, 0);
  }
}

export const levelsStorage = new LevelsStorage();
export type { UserLevelData, LevelConfig };