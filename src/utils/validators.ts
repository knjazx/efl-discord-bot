import { z } from 'zod';

export function isValidUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedDomain(urlStr: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase();
    return allowedDomains.some(domain => {
      const cleanDomain = domain.toLowerCase();
      return hostname === cleanDomain || hostname.endsWith(`.${cleanDomain}`);
    });
  } catch {
    return false;
  }
}

export interface LinkValidationResult {
  isValid: boolean;
  error?: string;
  cleanLinks?: string[];
}

export function validateMatchLinks(
  format: string,
  rawLinks: string[],
  allowedDomains: string[]
): LinkValidationResult {
  const cleanLinks = rawLinks.map(l => l.trim()).filter(Boolean);

  if (cleanLinks.length === 0) {
    return { isValid: false, error: 'Вы должны предоставить хотя бы одну ссылку на матч.', cleanLinks: [] };
  }

  for (let i = 0; i < cleanLinks.length; i++) {
    const link = cleanLinks[i];
    if (!isValidUrl(link)) {
      return {
        isValid: false,
        error: `Ссылка №${i + 1} (${link}) имеет неверный формат URL.`,
        cleanLinks: [],
      };
    }

    if (!isAllowedDomain(link, allowedDomains)) {
      return {
        isValid: false,
        error: `Домен в ссылке №${i + 1} (${link}) не разрешён. Допустимые домены: ${allowedDomains.join(', ')}`,
        cleanLinks: [],
      };
    }
  }

  if (format === 'BO1' && cleanLinks.length !== 1) {
    return {
      isValid: false,
      error: 'Для формата BO1 требуется ровно 1 ссылка на матч.',
      cleanLinks: [],
    };
  }

  if (format === 'BO3') {
    if (cleanLinks.length < 2 || cleanLinks.length > 3) {
      return {
        isValid: false,
        error: 'Для формата BO3 требуется 2 ссылки (при счёте 2:0 / 0:2) или 3 ссылки (при счёте 2:1 / 1:2).',
        cleanLinks: [],
      };
    }
  }

  return { isValid: true, cleanLinks };
}

export interface ScoreValidationResult {
  isValid: boolean;
  scoreTeam1: number;
  scoreTeam2: number;
  error?: string;
}

export function determineScoreAndValidate(
  format: string,
  linkCount: number,
  winnerTeamId: string,
  team1Id: string,
  team2Id: string
): ScoreValidationResult {
  if (winnerTeamId !== team1Id && winnerTeamId !== team2Id) {
    return {
      isValid: false,
      scoreTeam1: 0,
      scoreTeam2: 0,
      error: 'Указанная команда-победитель не участвует в данном матче.',
    };
  }

  const isTeam1Winner = winnerTeamId === team1Id;

  if (format === 'BO1') {
    if (linkCount !== 1) {
      return {
        isValid: false,
        scoreTeam1: 0,
        scoreTeam2: 0,
        error: 'Для BO1 требуется ровно 1 ссылка.',
      };
    }
    return {
      isValid: true,
      scoreTeam1: isTeam1Winner ? 1 : 0,
      scoreTeam2: isTeam1Winner ? 0 : 1,
    };
  }

  if (format === 'BO3') {
    if (linkCount === 2) {
      // 2:0 or 0:2
      return {
        isValid: true,
        scoreTeam1: isTeam1Winner ? 2 : 0,
        scoreTeam2: isTeam1Winner ? 0 : 2,
      };
    } else if (linkCount === 3) {
      // 2:1 or 1:2
      return {
        isValid: true,
        scoreTeam1: isTeam1Winner ? 2 : 1,
        scoreTeam2: isTeam1Winner ? 1 : 2,
      };
    } else {
      return {
        isValid: false,
        scoreTeam1: 0,
        scoreTeam2: 0,
        error: 'Для BO3 необходимо предоставить 2 ссылки (2:0 / 0:2) или 3 ссылки (2:1 / 1:2).',
      };
    }
  }

  return {
    isValid: false,
    scoreTeam1: 0,
    scoreTeam2: 0,
    error: `Неподдерживаемый формат матча: ${format}`,
  };
}
