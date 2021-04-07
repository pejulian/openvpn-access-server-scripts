const packageJson = require(`../package.json`);
const { writeFileSync } = require('fs');
const { exec } = require('child-process-promise');
const path = require('path');
const semver = require('semver');

const execRead = async (command, options) => {
    const { stdout } = await exec(command, options);
    return stdout.trim();
};

async function run() {
    try {
        const versions = await execRead(
            `npm view openvpn-access-server-scripts --json`
        );

        const publishedVersions = JSON.parse(str);

        const currentVersion = packageJson.version;

        const currentBetaVersions = publishedVersions.filter((version) => {
            if (version.includes(`${currentVersion}-beta`)) {
                return version;
            }
        });

        if (currentBetaVersions.length === 0) {
            packageJson.version += '-beta.0';
        } else {
            const latest = currentBetaVersions.slice(-1)[0];
            const number = latest.match(/.$/);
            const newVersionNumber = Number(number[0]) + 1;
            packageJson.version += '-beta.' + newVersionNumber;
            packageJson.main = 'index';
        }
    } catch (e) {
        packageJson.version = semver.inc(packageJson.version, 'prerelease', undefined, 'beta');
    } finally {
        console.log(`Version: ${packageJson.version}`);
        writeFileSync(
            path.join(__dirname, '../package.json'),
            JSON.stringify(packageJson, undefined, 4)
        );
    }
}

run();
