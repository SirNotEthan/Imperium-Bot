import axios from 'axios';

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  description: string;
  created: string;
  isBanned: boolean;
  externalAppDisplayName?: string;
  hasVerifiedBadge: boolean;
}

export interface RobloxUserThumbnail {
  targetId: number;
  state: string;
  imageUrl: string;
}

export interface RobloxGroup {
  id: number;
  name: string;
  description: string;
  owner: {
    id: number;
    name: string;
    displayName: string;
  };
  memberCount: number;
  isBuildersClubOnly: boolean;
  publicEntryAllowed: boolean;
  isLocked: boolean;
}

export interface RobloxUserGroup {
  group: RobloxGroup;
  role: {
    id: number;
    name: string;
    rank: number;
  };
}

export interface RobloxGamepass {
  id: number;
  name: string;
  displayName: string;
  productId: number;
  price?: number;
}

export class RobloxAPI {
  private static readonly BASE_URL = 'https://users.roblox.com';
  private static readonly GROUPS_URL = 'https://groups.roblox.com';
  private static readonly THUMBNAILS_URL = 'https://thumbnails.roblox.com';
  private static readonly INVENTORY_URL = 'https://inventory.roblox.com';

  static async getUserByUsername(username: string): Promise<RobloxUser | null> {
    try {
      const response = await axios.post(`${this.BASE_URL}/v1/usernames/users`, {
        usernames: [username]
      });

      if (response.data.data && response.data.data.length > 0) {
        const userData = response.data.data[0];
        
        const detailsResponse = await axios.get(`${this.BASE_URL}/v1/users/${userData.id}`);
        return detailsResponse.data;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      return null;
    }
  }

  static async getUserById(userId: number): Promise<RobloxUser | null> {
    try {
      const response = await axios.get(`${this.BASE_URL}/v1/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      return null;
    }
  }

  static async getUserThumbnail(userId: number, size: string = '420x420'): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.THUMBNAILS_URL}/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png&isCircular=false`
      );

      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0].imageUrl;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user thumbnail:', error);
      return null;
    }
  }

  static async getUserGroups(userId: number): Promise<RobloxUserGroup[]> {
    try {
      const response = await axios.get(`${this.GROUPS_URL}/v2/users/${userId}/groups/roles`);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching user groups:', error);
      return [];
    }
  }

  static async getUserGamepasses(userId: number): Promise<RobloxGamepass[]> {
    try {
      return [];
    } catch (error) {
      console.error('Error fetching user gamepasses:', error);
      return [];
    }
  }

  static async checkCommunityStatus(userId: number): Promise<{
    warnings: number;
    communityBans: number;
    gameBans: number;
  }> {
    try {
      return {
        warnings: 0,
        communityBans: 0,
        gameBans: 0
      };
    } catch (error) {
      console.error('Error checking community status:', error);
      return {
        warnings: 0,
        communityBans: 0,
        gameBans: 0
      };
    }
  }

  static async getCommunityGroups(userId: number, communityGroupIds: number[] = []): Promise<RobloxUserGroup[]> {
    try {
      const userGroups = await this.getUserGroups(userId);
      
      if (communityGroupIds.length === 0) {
        return userGroups;
      }
      
      return userGroups.filter(userGroup => 
        communityGroupIds.includes(userGroup.group.id)
      );
    } catch (error) {
      console.error('Error fetching community groups:', error);
      return [];
    }
  }

  static async getCommunityGamepasses(userId: number, communityGamepassIds: number[] = []): Promise<RobloxGamepass[]> {
    try {
      return [];
    } catch (error) {
      console.error('Error fetching community gamepasses:', error);
      return [];
    }
  }

  static calculateAccountAge(createdDate: string): { days: number; years: number; months: number } {
    const created = new Date(createdDate);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    
    return { days, years, months };
  }

  static formatAccountAge(age: { days: number; years: number; months: number }): string {
    if (age.years > 0) {
      return `${age.years} year${age.years !== 1 ? 's' : ''}, ${age.months} month${age.months !== 1 ? 's' : ''}`;
    } else if (age.months > 0) {
      return `${age.months} month${age.months !== 1 ? 's' : ''}`;
    } else {
      return `${age.days} day${age.days !== 1 ? 's' : ''}`;
    }
  }

  static generateProfileUrl(userId: number): string {
    return `https://www.roblox.com/users/${userId}/profile`;
  }
}