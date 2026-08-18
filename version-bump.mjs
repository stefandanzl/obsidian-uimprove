import { readFileSync, writeFileSync } from "fs";

const targetVersion =
	process.env.npm_package_version ?? JSON.parse(readFileSync("package.json", "utf8")).version;
console.log("target: ", targetVersion);
// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
// but only if the target version is not already in versions.json
// the Obsidian plugin provider backend uses this to detect compatability steps and
// based on that provides different plugin versions for different app versions
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (!Object.values(versions).includes(minAppVersion)) {
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
}
