import { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export async function cleanupDatabase() {
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename 
    FROM pg_tables
    WHERE schemaname='public'
  `;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== "_prisma_migrations");

  try {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "public"."${table}" CASCADE;`
      );
    }
  } catch (error) {
    console.log({ error });
  }
}

export async function createTestCalendar(data: {
  year: number;
  selectedMonths: string[];
  events?: { date: string; title: string }[];
  backgroundUrl?: string;
}) {
  return prisma.calendar.create({
    data: {
      year: data.year,
      selectedMonths: data.selectedMonths,
      backgroundUrl: data.backgroundUrl,
      events: data.events
        ? {
            create: data.events,
          }
        : undefined,
    },
    include: {
      events: true,
    },
  });
}
