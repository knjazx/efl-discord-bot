import { prisma } from "../src/database/prisma";
import { generateRoundRobinPairs } from "../src/services/matchService";

async function main() {
  const groups = await prisma.group.findMany({
    include: {
      teams: {
        include: {
          team: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const grp of groups) {
    console.log(`\n================ ${grp.name} ================`);
    const sortedGroupTeams = grp.teams.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const teams = sortedGroupTeams.map((gt) => gt.team);

    const pairs = generateRoundRobinPairs(teams);

    for (let r = 1; r <= 3; r++) {
      const rPairs = pairs.filter((p) => p.round === r);
      console.log(`-- Round ${r} --`);
      for (const p of rPairs) {
        console.log(`  ${p.t1.name} vs ${p.t2.name}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
