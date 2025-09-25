import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";
const prisma = new PrismaClient();
const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 6);

async function main() {
  await prisma.link.create({
    data: { slug: nano(), url: "https://example.com" },
  });
  console.log("Seeded one link");
}
main().finally(() => prisma.$disconnect());
