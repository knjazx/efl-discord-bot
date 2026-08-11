import { generateRoundRobinPairs } from "../src/services/matchService";

const groupA = ["P1tushki", "X team", "Freak Room", "Nova Impera"];
const groupB = ["Repulse team", "swinTeam", "LL team", "Team Spica"];
const groupE = ["VASILKI ESPORTS", "CHEKUSHKA_TEAM", "KaboVerde", "Bichi game"];
const groupH = ["181 Team", "Vanguard", "WultimDotCom", "IED"];

function checkGroup(name: string, teams: string[]) {
  console.log(`\n=== ${name} ===`);
  const sorted = [...teams].sort((a, b) => a.localeCompare(b, "ru"));
  const pairs = generateRoundRobinPairs(sorted);

  for (let r = 1; r <= 3; r++) {
    const roundPairs = pairs.filter((p) => p.round === r);
    console.log(`Round ${r}:`);
    for (const p of roundPairs) {
      console.log(`  ${p.t1} vs ${p.t2}`);
    }
  }
}

checkGroup("Group A", groupA);
checkGroup("Group B", groupB);
checkGroup("Group E", groupE);
checkGroup("Group H", groupH);
