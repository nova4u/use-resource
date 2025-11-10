#!/usr/bin/env node

import fs from 'node:fs';
import { execSync } from 'node:child_process';
import prompts from 'prompts';

type BumpType = 'major' | 'minor' | 'patch';

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

function getCurrentVersion(): string {
  const packageJson = JSON.parse(
    fs.readFileSync('./package.json', 'utf8')
  ) as PackageJson;
  return packageJson.version;
}

function bumpVersion(version: string, type: BumpType): string {
  const parts = version.split('.').map(Number);

  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2]++;
      break;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }

  return parts.join('.');
}

function updatePackageJson(newVersion: string): void {
  const packageJson = JSON.parse(
    fs.readFileSync('./package.json', 'utf8')
  ) as PackageJson;
  packageJson.version = newVersion;
  fs.writeFileSync(
    './package.json',
    `${JSON.stringify(packageJson, null, '\t')}\n`
  );
  try {
    execSync('pnpm exec prettier --write package.json', { stdio: 'inherit' });
  } catch (error) {
    console.warn('⚠️  Warning: Could not format package.json');
  }
}

function createAndPushTag(version: string, bumpType: BumpType): void {
  const tag = `v${version}`;

  try {
    // Create git tag
    execSync(`git tag ${tag}`, { stdio: 'inherit' });
    console.log(`✅ Created tag: ${tag}`);

    // Push tag to origin (triggers GitHub workflow)
    execSync(`git push origin ${tag}`, { stdio: 'inherit' });
    console.log(`🚀 Pushed tag: ${tag}`);
    console.log('📦 GitHub workflow will now deploy to production!');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Error creating/pushing tag: ${error.message}`);
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    const currentVersion = getCurrentVersion();
    console.log(`\n📦 Current version: ${currentVersion}\n`);

    const response = await prompts([
      {
        type: 'select',
        name: 'bumpType',
        message: 'Select version bump type:',
        choices: [
          { title: 'major - Breaking changes (x.0.0)', value: 'major' },
          { title: 'minor - New features (0.x.0)', value: 'minor' },
          { title: 'patch - Bug fixes (0.0.x)', value: 'patch' },
        ],
      },
    ]);

    if (!response.bumpType) {
      console.log('❌ Cancelled');
      process.exit(0);
      return;
    }

    const bumpType = response.bumpType as BumpType;
    const newVersion = bumpVersion(currentVersion, bumpType);
    console.log(`\n${currentVersion} → ${newVersion} (${bumpType})\n`);

    const confirmation = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with version bump?',
      initial: true,
    });

    if (!confirmation.proceed) {
      console.log('❌ Cancelled');
      process.exit(0);
      return;
    }

    // Update package.json
    updatePackageJson(newVersion);
    console.log(`✅ Updated package.json to ${newVersion}`);

    // Commit the version change
    execSync('git add package.json', { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, {
      stdio: 'inherit',
    });
    console.log('✅ Committed version change');

    // Create and push tag
    createAndPushTag(newVersion, bumpType);

    console.log('\n✨ Version bump complete!');
    console.log(`🏷️  Tag v${newVersion} pushed to origin`);
    console.log('🚀 GitHub Actions workflow triggered for deployment\n');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
