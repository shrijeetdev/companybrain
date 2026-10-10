// Spawned by stdio.test.ts: runs the stdio MCP server against the fake services.
import { runMcpStdio } from '../src/index.ts';
import { createFakeServices } from './fake-services.ts';

const fake = createFakeServices();
// A noisy dependency: anything logged via console.log must NOT reach stdout.
const list = fake.services.tasks.list.bind(fake.services.tasks);
fake.services.tasks.list = async (...args) => {
  console.log('noisy log from a service');
  console.info('noisy info');
  return list(...args);
};

await runMcpStdio(fake.services, process.env.TEST_MCP_KEY ?? '');
process.stderr.write('stdio-entry: client disconnected\n');
