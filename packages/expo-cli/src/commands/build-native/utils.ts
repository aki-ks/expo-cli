import spawnAsync from '@expo/spawn-async';
import { ApiV2 } from '@expo/xdl';
import delayAsync from 'delay-async';
import fs from 'fs-extra';
import ora from 'ora';

import log from '../../log';
import { printTableJsonArray } from '../utils/cli-table';
import { BuildInfo } from './Builder';

async function waitForBuildEndAsync(
  client: ApiV2,
  projectId: string,
  buildId: string,
  { timeoutSec = 1800, intervalSec = 30 } = {}
): Promise<string> {
  log('Waiting for build to complete. You can press Ctrl+C to exit.');
  const spinner = ora().start();
  let time = new Date().getTime();
  const endTime = time + timeoutSec * 1000;
  while (time <= endTime) {
    const buildInfo: BuildInfo = await client.getAsync(`projects/${projectId}/builds/${buildId}`);
    switch (buildInfo.status) {
      case 'finished':
        spinner.succeed('Build finished.');
        return buildInfo.artifacts?.buildUrl ?? '';
      case 'in-queue':
        spinner.text = 'Build queued...';
        break;
      case 'in-progress':
        spinner.text = 'Build in progress...';
        break;
      case 'errored':
        spinner.fail('Build failed.');
        throw new Error(`Standalone build failed!`);
      default:
        spinner.warn('Unknown status.');
        throw new Error(`Unknown status: ${buildInfo} - aborting!`);
    }
    time = new Date().getTime();
    await delayAsync(intervalSec * 1000);
  }
  spinner.warn('Timed out.');
  throw new Error(
    'Timeout reached! It is taking longer than expected to finish the build, aborting...'
  );
}

async function makeProjectTarballAsync(tarPath: string): Promise<number> {
  const spinner = ora('Making project tarball').start();
  const changes = (await spawnAsync('git', ['status', '-s'])).stdout;
  if (changes.length > 0) {
    spinner.fail('Could not make project tarball');
    throw new Error('Please commit all files before trying to build your project. Aborting...');
  }
  await spawnAsync('git', [
    'archive',
    '--format=tar.gz',
    '--prefix',
    'project/',
    '-o',
    tarPath,
    'HEAD',
  ]);
  spinner.succeed('Project tarball created.');

  const { size } = await fs.stat(tarPath);
  return size;
}

function printBuildTable(builds: BuildInfo[]) {
  const headers = ['platform', 'status', 'artifacts'];
  const colWidths = [10, 15, 80];
  const refactoredBuilds = builds.map(build => ({
    ...build,
    artifacts: build.artifacts?.buildUrl ?? 'not available',
  }));
  const buildTable = printTableJsonArray(headers, refactoredBuilds, colWidths);
  console.log(buildTable);
}

export { waitForBuildEndAsync, makeProjectTarballAsync, printBuildTable };
