import fs from 'fs';
import path from 'path';
import { generateGroupsImageBuffer } from '../src/utils/imageGenerator';

async function testGen() {
  const mockGroups = [
    {
      name: 'Group A',
      teams: [
        { name: 'Rakuzan', tag: 'RAKU', wins: 3, losses: 0, points: 9 },
        { name: 'KaboVerde', tag: 'KABO', wins: 2, losses: 1, points: 6 },
        { name: 'Team Spica', tag: 'TS', wins: 1, losses: 2, points: 3 },
        { name: 'HHAI', tag: 'HHAI', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group B',
      teams: [
        { name: 'ZERION team', tag: 'ZT', wins: 3, losses: 0, points: 9 },
        { name: 'CHEKUSHKA_TEAM', tag: 'CHEK', wins: 2, losses: 1, points: 6 },
        { name: 'VASILKI ESPORTS', tag: 'VE', wins: 1, losses: 2, points: 3 },
        { name: 'Vanguard', tag: 'VANG', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group C',
      teams: [
        { name: 'Bichi game', tag: 'BG', wins: 3, losses: 0, points: 9 },
        { name: 'PyZ0', tag: 'PYZ0', wins: 2, losses: 1, points: 6 },
        { name: 'Kachevniki', tag: 'KACH', wins: 1, losses: 2, points: 3 },
        { name: 'P1tushki', tag: 'P1TU', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group D',
      teams: [
        { name: 'WultimDotCom', tag: 'WULT', wins: 3, losses: 0, points: 9 },
        { name: 'Good Game Spot', tag: 'GGS', wins: 2, losses: 1, points: 6 },
        { name: 'WINQ', tag: 'WINQ', wins: 1, losses: 2, points: 3 },
        { name: 'retw.gg', tag: 'RETW', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group E',
      teams: [
        { name: '$win Esports', tag: 'WINE', wins: 3, losses: 0, points: 9 },
        { name: 'Rayzex Team', tag: 'RT', wins: 2, losses: 1, points: 6 },
        { name: '181 Team', tag: '1T', wins: 1, losses: 2, points: 3 },
        { name: 'ROFL TEAM', tag: 'RT1', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group F',
      teams: [
        { name: 'moggers', tag: 'MOGG', wins: 3, losses: 0, points: 9 },
        { name: 'Synapse', tag: 'SYNA', wins: 2, losses: 1, points: 6 },
        { name: 'DONER DAD', tag: 'DD', wins: 1, losses: 2, points: 3 },
        { name: 'Freak Room', tag: 'FR', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group G',
      teams: [
        { name: 'TeamMOD', tag: 'TEAM', wins: 3, losses: 0, points: 9 },
        { name: 'X team', tag: 'XT', wins: 2, losses: 1, points: 6 },
        { name: 'LL team', tag: 'LT', wins: 1, losses: 2, points: 3 },
        { name: 'Repulse team', tag: 'RT2', wins: 0, losses: 3, points: 0 },
      ],
    },
    {
      name: 'Group H',
      teams: [
        { name: 'swinTeam', tag: 'SWIN', wins: 3, losses: 0, points: 9 },
        { name: 'ZLD', tag: 'ZLD', wins: 2, losses: 1, points: 6 },
        { name: 'IED', tag: 'IED', wins: 1, losses: 2, points: 3 },
        { name: 'Nova Impera', tag: 'NI', wins: 0, losses: 3, points: 0 },
      ],
    },
  ];

  console.log('Generating test 8 groups esports graphic banner (Top 1 Qualifies)...');
  const buf = await generateGroupsImageBuffer(mockGroups);

  const outputPath = path.join(__dirname, 'groups_esports_preview.png');
  fs.writeFileSync(outputPath, buf);
  console.log(`Saved preview image to: ${outputPath} (${buf.length} bytes)`);
}

testGen().catch(console.error);
