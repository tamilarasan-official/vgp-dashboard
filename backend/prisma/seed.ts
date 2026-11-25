import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const properties = [
    { code: 'WW', name: 'VGP Wonder World' },
    { code: 'IR', name: 'VGP Wonder Ice Rink' },
    { code: 'VEL', name: 'Velocity' },
    { code: 'FLY', name: 'VGP Fly Dining' },
  ];
  for (const p of properties) {
    await prisma.property.upsert({ where: { code: p.code }, update: { name: p.name }, create: p });
  }

  const sources = [
    { code: 'funsquare', name: 'FunSquare / Elesoft (Velocity)', accessType: 'cloud_api', status: 'access_confirmed' },
    { code: 'tally', name: 'TallyPrime (accounting)', accessType: 'agent_xml', status: 'access_confirmed' },
    { code: 'semnox', name: 'Semnox Parafait (ticketing, cards)', accessType: 'agent_sql', status: 'access_confirmed' },
    { code: 'zoho', name: 'Zoho CRM', accessType: 'oauth_api', status: 'blocked', notes: 'API Access permission off in CRM profile' },
    { code: 'greythr', name: 'greytHR (workforce)', accessType: 'cloud_api', status: 'blocked', notes: 'API add-on commercials pending' },
    { code: 'petpooja', name: 'Petpooja (F&B POS)', accessType: 'cloud_api', status: 'pending', notes: 'Waiting for vendor reply' },
    { code: 'gbp', name: 'Google Business Profile', accessType: 'oauth_api', status: 'pending' },
    { code: 'thoughtmetrics', name: 'Thought Metrics (surveys)', accessType: 'cloud_api', status: 'pending' },
  ];
  for (const s of sources) {
    await prisma.sourceSystem.upsert({ where: { code: s.code }, update: {}, create: s });
  }
  console.log(`Seeded ${properties.length} properties and ${sources.length} source systems.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
