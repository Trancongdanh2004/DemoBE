import { PrismaClient } from '@prisma/client';

// Support BigInt serialization in JSON (e.g. for sizeBytes)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  global.prismaGlobal ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}
