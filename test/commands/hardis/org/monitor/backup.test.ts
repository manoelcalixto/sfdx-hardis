import { expect } from 'chai';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import MonitorBackup from '../../../../../src/commands/hardis/org/monitor/backup.js';
import { parsePackageXmlFile, writePackageXmlFile } from '../../../../../src/common/utils/xmlUtils.js';

describe('hardis:org:monitor:backup', () => {
  let tmpDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    tmpDir = path.join(os.tmpdir(), `sfdx-hardis-monitor-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.ensureDir(tmpDir);
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await fs.remove(tmpDir);
  });

  function createCommand(): any {
    const command = Object.create(MonitorBackup.prototype);
    command.maxByChunk = 2;
    command.startChunk = 1;
    command.debugMode = false;
    command.extractPackageXmlChunks = [];
    command.currentPackage = {};
    command.currentPackageLen = 0;
    return command;
  }

  it('retrieves package.xml manifests in chunks', async () => {
    const packageXml = path.join(tmpDir, 'manifest', 'package-large.xml');
    await writePackageXmlFile(packageXml, {
      ApexClass: ['ClassOne', 'ClassTwo', 'ClassThree'],
      Flow: ['FlowOne', 'FlowTwo'],
    });

    const command = createCommand();
    const retrievedChunks: any[] = [];
    command.retrievePackageXml = async (chunkFile: string) => {
      retrievedChunks.push(await parsePackageXmlFile(chunkFile));
    };

    await command.retrievePackageXmlInChunks(packageXml, {});

    expect(retrievedChunks).to.deep.equal([
      { ApexClass: ['ClassOne', 'ClassTwo'] },
      { ApexClass: ['ClassThree'] },
      { Flow: ['FlowOne', 'FlowTwo'] },
    ]);
    expect(await fs.pathExists(path.join(tmpDir, 'manifest', 'chunks', 'chunk-1.xml'))).to.equal(true);
    expect(await fs.pathExists(path.join(tmpDir, 'manifest', 'chunks', 'chunk-2.xml'))).to.equal(true);
    expect(await fs.pathExists(path.join(tmpDir, 'manifest', 'chunks', 'chunk-3.xml'))).to.equal(true);
  });

  it('chunks filtered backup manifests only when they exceed the retrieve limit', async () => {
    const packageXmlFullFile = path.join(tmpDir, 'manifest', 'package-all-org-items.xml');
    const customObjects = [
      'Account',
      ...Array.from({ length: 10001 }, (_, index) => `Generated_${index}__c`),
    ];
    await writePackageXmlFile(packageXmlFullFile, {
      CustomObject: customObjects,
    });

    const command = createCommand();
    command.namespaces = [];
    command.packageXmlToRemove = null;
    command.buildFilteredManifestsForRetrieve = async () => path.join(tmpDir, 'manifest', 'package-backup-items.xml');
    command.retrievePackageXml = async () => {
      throw new Error('Expected filtered retrieve to be chunked');
    };
    let chunkedManifest = '';
    command.retrievePackageXmlInChunks = async (manifestFile: string) => {
      chunkedManifest = manifestFile;
    };
    command.handleDataCloudRetrieve = async () => undefined;

    await command.extractMetadatasFiltered(packageXmlFullFile, {});

    expect(chunkedManifest).to.equal(path.join(tmpDir, 'manifest', 'package-backup-items.xml'));
    const filteredPackage = await parsePackageXmlFile(chunkedManifest);
    expect(filteredPackage.CustomObject).to.have.length(10001);
    expect(filteredPackage.CustomObject).not.to.include('Account');
  });
});
