import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  copyFile,
  ensureDir,
  platformPackages,
  readRootPackage,
  rootBinPath,
  rootLicensePath,
  rootReadmePath,
  writeJson
} from "./metadata.mjs";
import fs from "node:fs";

function parseArgs(argv) {
  const options = {
    binary: path.resolve("zig-out", "bin", process.platform === "win32" ? "codex-auth.exe" : "codex-auth"),
    outputDir: path.resolve("dist", "npm-local")
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--binary") {
      options.binary = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--output-dir") {
      options.outputDir = path.resolve(argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function currentPlatformPackage() {
  const found = platformPackages.find((pkg) => pkg.os === process.platform && pkg.cpu === process.arch);
  if (!found) {
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
  }
  return found;
}

function runNpmPack(packageDir, outputDir) {
  const result = spawnSync("npm", ["pack", packageDir, "--pack-destination", outputDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm pack failed for ${packageDir}`);
  }
  const tarballName = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball for ${packageDir}`);
  }
  return path.join(outputDir, tarballName);
}

function writePlatformPackage(outputDir, rootPackage, platformPackage, sourceBinary) {
  const dir = path.join(outputDir, platformPackage.packageDirName);
  ensureDir(path.join(dir, "bin"));

  const manifest = {
    name: platformPackage.packageName,
    version: rootPackage.version,
    description: `${rootPackage.name} binary for ${platformPackage.os} ${platformPackage.cpu}`,
    license: rootPackage.license,
    repository: rootPackage.repository,
    homepage: rootPackage.homepage,
    bugs: rootPackage.bugs,
    os: [platformPackage.os],
    cpu: [platformPackage.cpu],
    files: ["bin/", "LICENSE", "README.md"],
    publishConfig: {
      access: "public"
    }
  };

  const binaryFiles = platformPackage.binaryFiles ?? [platformPackage.binaryName];
  for (const binaryFile of binaryFiles) {
    copyFile(sourceBinary, path.join(dir, "bin", binaryFile), platformPackage.os === "win32" ? undefined : 0o755);
  }
  copyFile(rootReadmePath, path.join(dir, "README.md"));
  copyFile(rootLicensePath, path.join(dir, "LICENSE"));
  writeJson(path.join(dir, "package.json"), manifest);
  return dir;
}

function writeRootPackage(outputDir, rootPackage, platformPackage, platformTarball) {
  const dir = path.join(outputDir, "root");
  ensureDir(path.join(dir, "bin"));
  copyFile(rootBinPath, path.join(dir, "bin", "codex-auth.js"), 0o755);
  copyFile(rootReadmePath, path.join(dir, "README.md"));
  copyFile(rootLicensePath, path.join(dir, "LICENSE"));

  const localRootPackage = {
    ...rootPackage,
    optionalDependencies: {
      [platformPackage.packageName]: `file:${platformTarball}`
    }
  };
  writeJson(path.join(dir, "package.json"), localRootPackage);
  return dir;
}

const options = parseArgs(process.argv.slice(2));
if (!fs.existsSync(options.binary)) {
  throw new Error(`Missing binary: ${options.binary}. Run \`zig build -Doptimize=ReleaseSafe\` first.`);
}

const rootPackage = readRootPackage();
const platformPackage = currentPlatformPackage();

fs.rmSync(options.outputDir, { recursive: true, force: true });
ensureDir(options.outputDir);

const platformDir = writePlatformPackage(options.outputDir, rootPackage, platformPackage, options.binary);
const platformTarball = runNpmPack(platformDir, options.outputDir);
const rootDir = writeRootPackage(options.outputDir, rootPackage, platformPackage, platformTarball);
const rootTarball = runNpmPack(rootDir, options.outputDir);

console.log(`Packed local npm package for ${process.platform}/${process.arch}`);
console.log(`Root package: ${rootTarball}`);
console.log(`Platform package: ${platformTarball}`);
console.log(`Install with: npm install -g ${rootTarball}`);
