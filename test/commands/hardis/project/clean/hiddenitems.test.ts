/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import CleanHiddenItems from '../../../../../src/commands/hardis/project/clean/hiddenitems.js';

/**
 * Test fixture: writes a temporary `sfdx-project.json` at the repo root so the
 * SfCommand framework's `requiresProject = true` check passes WITHOUT chdir.
 */
function setupProjectTmpDir(prefix: string): { getForceApp: () => string } {
  const projectRoot = process.cwd();
  const projectFile = path.join(projectRoot, 'sfdx-project.json');
  let projectFileCreatedByUs = false;
  let tmpDir = '';

  before(async () => {
    if (!fs.existsSync(projectFile)) {
      await fs.writeJson(projectFile, {
        packageDirectories: [{ path: 'force-app', default: true }],
        namespace: '',
        sfdcLoginUrl: 'https://login.salesforce.com',
        sourceApiVersion: '66.0',
      });
      projectFileCreatedByUs = true;
    }
  });

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.ensureDir(tmpDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  after(async () => {
    if (projectFileCreatedByUs) {
      await fs.remove(projectFile);
    }
  });

  return {
    getForceApp: () => tmpDir,
  };
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

describe('hardis:project:clean:hiddenitems', () => {
  const ctx = setupProjectTmpDir('hiddenitems');

  it('ignores matching directories and removes hidden files', async () => {
    const root = ctx.getForceApp();
    const matchingDirectory = path.join(root, 'objects', 'FolderWithXmlExtension.xml');
    const hiddenFile = path.join(root, 'classes', 'HiddenClass.xml');
    const normalFile = path.join(root, 'classes', 'VisibleClass.xml');

    await fs.ensureDir(matchingDirectory);
    await writeFile(hiddenFile, '(hidden)');
    await writeFile(normalFile, '<xml/>');

    await CleanHiddenItems.run(['-f', root]);

    expect(fs.existsSync(matchingDirectory), 'matching directory should be ignored').to.be.true;
    expect(fs.existsSync(hiddenFile), 'hidden file should be removed').to.be.false;
    expect(fs.existsSync(normalFile), 'normal file should be kept').to.be.true;
  });
});
