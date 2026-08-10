import { createCanvas } from '@napi-rs/canvas';

export interface GroupDataForImage {
  name: string;
  teams: {
    name: string;
    tag?: string;
    wins?: number;
    losses?: number;
    points?: number;
    captainUsername?: string;
  }[];
}

export interface GroupMatchesScheduleData {
  groupName: string;
  matches: {
    team1Name: string;
    team1Tag?: string;
    team2Name: string;
    team2Tag?: string;
    format: string;
  }[];
}

export async function generateGroupsImageBuffer(groups: GroupDataForImage[]): Promise<Buffer> {
  const width = 1920;
  const numGroups = groups.length;
  const cols = Math.min(4, Math.ceil(numGroups / Math.ceil(numGroups / 4)));
  const rows = Math.ceil(numGroups / cols);

  const maxTeamsInGroup = Math.max(...groups.map(g => g.teams.length), 4);
  const rowHeight = 90 + maxTeamsInGroup * 40;
  const height = Math.max(1080, 230 + rows * (rowHeight + 30));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Deep Monochrome Black Background (#050505)
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);

  // Subtle White Radial Vignette / Glow
  const bgGlow = ctx.createRadialGradient(width / 2, height * 0.3, 50, width / 2, height * 0.3, 900);
  bgGlow.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, width, height);

  // Fine Monochromatic Grid Overlay
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 2. EFL Header Section
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(width * 0.08, 0, width * 0.84, 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 48px sans-serif';
  ctx.fillText('ELECTRONIC FUTURE LEAGUE', width / 2, 75);

  const badgeW = 440;
  const badgeH = 34;
  const badgeX = (width - badgeW) / 2;
  const badgeY = 96;

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4, true, false);

  ctx.fillStyle = '#000000';
  ctx.font = '900 14px sans-serif';
  ctx.fillText('CS2 SEASON 1 • 8 GROUPS • TOP 1 QUALIFIES', width / 2, badgeY + 22);

  // 3. Render 8 Groups in 4x2 Grid (No Tags)
  const sideMargin = 50;
  const gap = 20;
  const colW = (width - sideMargin * 2 - gap * (cols - 1)) / cols;

  groups.forEach((grp, idx) => {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);

    const x = sideMargin + colIdx * (colW + gap);
    const y = 165 + rowIdx * (rowHeight + gap);

    // Card Outer Container
    ctx.fillStyle = '#0D0D0D';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, colW, rowHeight, 8, true, true);

    // Group Header Bar
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, x, y, colW, 44, { tl: 8, tr: 8, bl: 0, br: 0 }, true, false);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000000';
    ctx.font = '900 20px sans-serif';
    ctx.fillText(grp.name.toUpperCase(), x + 18, y + 29);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#333333';
    ctx.font = '900 12px sans-serif';
    ctx.fillText('W - L  (PTS)', x + colW - 18, y + 28);

    const qualifyCutoff = 1;

    // Render Team Rows inside Group Card
    grp.teams.forEach((t, tIdx) => {
      const itemY = y + 60 + tIdx * 39;
      const w = t.wins ?? 0;
      const l = t.losses ?? 0;
      const pts = t.points ?? 0;

      // Color highlight rules:
      // Top 1 team (1st place with wins/points) -> Green (#10B981)
      // Bottom team (4th place with losses) -> Red (#EF4444)
      // Middle teams (2nd & 3rd place) -> Clean White (#FFFFFF)
      const isQualifying = tIdx === 0 && (w > 0 || pts > 0);
      const isBottomEliminated = tIdx === grp.teams.length - 1 && l > 0;

      let mainTextColor = '#FFFFFF';
      let numColor = '#64748B';

      if (isQualifying) {
        mainTextColor = '#10B981';
        numColor = '#10B981';
      } else if (isBottomEliminated) {
        mainTextColor = '#EF4444';
        numColor = '#EF4444';
      }

      // Zebra background row
      if (tIdx % 2 === 0) {
        ctx.fillStyle = isQualifying
          ? 'rgba(16, 185, 129, 0.04)'
          : isBottomEliminated
          ? 'rgba(239, 68, 68, 0.04)'
          : 'rgba(255, 255, 255, 0.03)';
        roundRect(ctx, x + 6, itemY, colW - 12, 34, 4, true, false);
      }

      // Position Number (01, 02...)
      ctx.textAlign = 'center';
      ctx.fillStyle = numColor;
      ctx.font = '900 14px sans-serif';
      const numStr = (tIdx + 1).toString().padStart(2, '0');
      ctx.fillText(numStr, x + 24, itemY + 22);

      // Team Name (Clean, No Tag Badge)
      ctx.textAlign = 'left';
      ctx.fillStyle = mainTextColor;
      ctx.font = 'bold 15px sans-serif';
      const maxNameLen = 22;
      const truncatedName = t.name.length > maxNameLen ? t.name.slice(0, maxNameLen - 2) + '..' : t.name;
      ctx.fillText(truncatedName, x + 48, itemY + 22);

      // Wins / Losses / Points Record (Right Aligned)
      ctx.textAlign = 'right';
      ctx.fillStyle = mainTextColor;
      ctx.font = '900 14px sans-serif';
      ctx.fillText(`${w} - ${l}  (${pts}P)`, x + colW - 16, itemY + 22);
    });
  });

  // 4. Footer Watermark
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('ELECTRONIC FUTURE LEAGUE • CS2 • GREEN = TOP 1 QUALIFIED FOR PLAYOFFS | RED = ELIMINATED', width / 2, height - 25);

  return canvas.toBuffer('image/png');
}

export async function generateDailyScheduleImageBuffer(
  round: number,
  groupsSchedule: GroupMatchesScheduleData[],
  dateStr?: string
): Promise<Buffer> {
  const width = 1920;
  const numGroups = groupsSchedule.length;
  const cols = Math.min(4, Math.ceil(numGroups / Math.ceil(numGroups / 4)));
  const rows = Math.ceil(numGroups / cols);

  const maxMatchesInGrp = Math.max(...groupsSchedule.map(g => g.matches.length), 2);
  const rowHeight = 55 + maxMatchesInGrp * 68;
  const height = Math.max(900, 210 + rows * (rowHeight + 25));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background #050505
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);

  // Background Radial Glow
  const bgGlow = ctx.createRadialGradient(width / 2, height * 0.3, 50, width / 2, height * 0.3, 900);
  bgGlow.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, width, height);

  // Top White Accent Line
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(width * 0.08, 0, width * 0.84, 4);

  // Main Header Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 48px sans-serif';
  ctx.fillText('ELECTRONIC FUTURE LEAGUE', width / 2, 75);

  // Subtitle Badge (Dynamic text with optional date)
  const badgeText = dateStr && dateStr.trim()
    ? `CS2 SEASON 1 • DAY / ROUND ${round} • ${dateStr.toUpperCase().trim()}`
    : `CS2 SEASON 1 • MATCH SCHEDULE • DAY / ROUND ${round}`;

  const badgeW = Math.max(460, badgeText.length * 10);
  const badgeH = 34;
  const badgeX = (width - badgeW) / 2;
  const badgeY = 96;

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4, true, false);

  ctx.fillStyle = '#000000';
  ctx.font = '900 14px sans-serif';
  ctx.fillText(badgeText, width / 2, badgeY + 22);

  // Render Group Cards for Daily Schedule (Clean, No Tags)
  const sideMargin = 50;
  const gap = 20;
  const colW = (width - sideMargin * 2 - gap * (cols - 1)) / cols;

  groupsSchedule.forEach((grp, idx) => {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);

    const x = sideMargin + colIdx * (colW + gap);
    const y = 165 + rowIdx * (rowHeight + gap);

    // Card Outer Container Box
    ctx.fillStyle = '#0D0D0D';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, colW, rowHeight, 8, true, true);

    // Group Header Bar
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, x, y, colW, 40, { tl: 8, tr: 8, bl: 0, br: 0 }, true, false);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000000';
    ctx.font = '900 18px sans-serif';
    ctx.fillText(grp.groupName.toUpperCase(), x + 16, y + 25);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#333333';
    ctx.font = '900 12px sans-serif';
    ctx.fillText(`ROUND ${round}`, x + colW - 16, y + 25);

    // Render Match Rows (Clean Team Names)
    grp.matches.forEach((m, mIdx) => {
      const itemY = y + 48 + mIdx * 64;

      // Row container box
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 8, itemY, colW - 16, 56, 6, true, true);

      // Match format badge (BO1 / BO3) on top-left
      ctx.fillStyle = '#1E1E1E';
      roundRect(ctx, x + 14, itemY + 6, 36, 16, 3, true, false);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.format, x + 32, itemY + 18);

      // VS Badge Box (Centered)
      const centerX = x + colW / 2;
      ctx.fillStyle = '#1E1E1E';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      roundRect(ctx, centerX - 18, itemY + 16, 36, 24, 4, true, true);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VS', centerX, itemY + 32);

      // TEAM 1 (LEFT SIDE)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      const t1Trunc = m.team1Name.length > 15 ? m.team1Name.slice(0, 13) + '..' : m.team1Name;
      ctx.fillText(t1Trunc, x + 16, itemY + 33);

      // TEAM 2 (RIGHT SIDE)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px sans-serif';
      const t2Trunc = m.team2Name.length > 15 ? m.team2Name.slice(0, 13) + '..' : m.team2Name;
      ctx.fillText(t2Trunc, x + colW - 16, itemY + 33);
    });
  });

  // Footer Watermark
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`ELECTRONIC FUTURE LEAGUE • CS2 • OFFICIAL DAY ${round} MATCH SCHEDULE`, width / 2, height - 25);

  return canvas.toBuffer('image/png');
}

function roundRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | { tl: number; tr: number; bl: number; br: number },
  fill: boolean,
  stroke: boolean
) {
  let radii = { tl: 0, tr: 0, bl: 0, br: 0 };
  if (typeof r === 'number') {
    radii = { tl: r, tr: r, bl: r, br: r };
  } else {
    radii = r;
  }

  ctx.beginPath();
  ctx.moveTo(x + radii.tl, y);
  ctx.lineTo(x + w - radii.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
  ctx.lineTo(x + w, y + h - radii.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
  ctx.lineTo(x + radii.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
  ctx.lineTo(x, y + radii.tl);
  ctx.quadraticCurveTo(x, y, x + radii.tl, y);
  ctx.closePath();

  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
