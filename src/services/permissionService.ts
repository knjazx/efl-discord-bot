import { GuildMember } from 'discord.js';
import { config } from '../config';

export class PermissionService {
  public static isMatchAdmin(member: GuildMember | null): boolean {
    if (!member) return false;
    return member.roles.cache.has(config.MATCH_ADMIN_ROLE_ID) ||
      member.roles.cache.has(config.SUPER_ADMIN_ROLE_ID) ||
      member.permissions.has('Administrator');
  }

  public static isSuperAdmin(member: GuildMember | null): boolean {
    if (!member) return false;
    return member.roles.cache.has(config.SUPER_ADMIN_ROLE_ID) ||
      member.permissions.has('Administrator');
  }

  public static canSubmitForMatch(
    userDiscordId: string,
    team1MemberDiscordIds: string[],
    team2MemberDiscordIds: string[],
    member: GuildMember | null
  ): boolean {
    // Admins can always submit for testing or management
    if (this.isMatchAdmin(member)) return true;

    // Check if player's discord ID is in team 1 or team 2 members list
    const isInTeam1 = team1MemberDiscordIds.includes(userDiscordId);
    const isInTeam2 = team2MemberDiscordIds.includes(userDiscordId);

    return isInTeam1 || isInTeam2;
  }
}
