interface StaffRoleConfig {
    roleIds: string[];
    guildId?: string;
}

class RolePermissions {
    private static staffRoles: StaffRoleConfig = {
        roleIds: [],
        guildId: undefined
    };

    static setStaffRoles(roleIds: string[], guildId?: string) {
        this.staffRoles = { roleIds, guildId };
    }

    static getStaffRoles(): StaffRoleConfig {
        return { ...this.staffRoles };
    }

    static hasStaffRole(memberRoles: string[], guildId?: string): boolean {
        if (this.staffRoles.guildId && guildId && this.staffRoles.guildId !== guildId) {
            return false;
        }

        if (this.staffRoles.roleIds.length === 0) {
            return true;
        }

        return this.staffRoles.roleIds.some(roleId => memberRoles.includes(roleId));
    }

    static checkStaffPermission(memberRoles: string[], guildId?: string): { hasPermission: boolean; message?: string } {
        if (!this.hasStaffRole(memberRoles, guildId)) {
            return {
                hasPermission: false,
                message: 'You do not have permission to use this command. Staff role required.'
            };
        }

        return { hasPermission: true };
    }
}

export default RolePermissions;