import { prisma } from "../src/database/prisma";

async function main() {
  const name = "Rayzex Team";
  const tag = "RZX";
  const logoUrl = "https://ibb.co/27hXQnVM";

  let team = await prisma.team.findUnique({
    where: { tag },
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        name,
        tag,
        logoUrl,
      },
    });
    console.log(`Created team ${team.name} in Bot DB (${team.id})`);
  } else {
    console.log(`Team ${team.name} already exists in Bot DB (${team.id})`);
  }

  // Add captain user
  const captainDiscordId = "w22tk"; // Or tag
  const capUsername = "w1z";

  let user = await prisma.user.findFirst({
    where: { username: capUsername },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        discordId: captainDiscordId,
        username: capUsername,
        teamId: team.id,
        role: "CAPTAIN",
      },
    });
    console.log(`Created captain user ${user.username}`);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { teamId: team.id, role: "CAPTAIN" },
    });
    console.log(`Updated captain user ${user.username}`);
  }

  console.log("Bot DB sync complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
