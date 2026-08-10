import fs from 'fs';
import path from 'path';
import { generateDailyScheduleImageBuffer } from '../src/utils/imageGenerator';

async function testScheduleGen() {
  const mockSchedule = [
    {
      groupName: 'Group A',
      matches: [
        { team1Name: 'Rakuzan', team1Tag: 'RAKU', team2Name: 'KaboVerde', team2Tag: 'KABO', format: 'BO1' },
        { team1Name: 'Team Spica', team1Tag: 'TS', team2Name: 'HHAI', team2Tag: 'HHAI', format: 'BO1' },
      ],
    },
    {
      groupName: 'Group B',
      matches: [
        { team1Name: 'ZERION team', team1Tag: 'ZT', team2Name: 'CHEKUSHKA_TEAM', team2Tag: 'CHEK', format: 'BO1' },
        { team1Name: 'VASILKI ESPORTS', team1Tag: 'VE', team2Name: 'Vanguard', team2Tag: 'VANG', format: 'BO1' },
      ],
    },
    {
      groupName: 'Group C',
      matches: [
        { team1Name: 'Bichi game', team1Tag: 'BG', team2Name: 'PyZ0', team2Tag: 'PYZ0', format: 'BO1' },
        { team1Name: 'Kachevniki', team1Tag: 'KACH', team2Name: 'P1tushki', team2Tag: 'P1TU', format: 'BO1' },
      ],
    },
    {
      groupName: 'Group D',
      matches: [
        { team1Name: 'WultimDotCom', team1Tag: 'WULT', team2Name: 'Good Game Spot', team2Tag: 'GGS', format: 'BO1' },
        { team1Name: 'WINQ', team1Tag: 'WINQ', team2Name: 'retw.gg', team2Tag: 'RETW', format: 'BO1' },
      ],
    },
  ];

  console.log('Generating Day 1 schedule graphic banner...');
  const buf = await generateDailyScheduleImageBuffer(1, mockSchedule);

  const outputPath = path.join(__dirname, 'schedule_day1_preview.png');
  fs.writeFileSync(outputPath, buf);
  console.log(`Saved schedule preview image to: ${outputPath} (${buf.length} bytes)`);
}

testScheduleGen().catch(console.error);
