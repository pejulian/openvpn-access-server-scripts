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
        packageJson.version = semver.inc(packageJson.version, 'patch');
        console.log(`Version: ${packageJson.version}`);
        writeFileSync(
            path.join(__dirname, '../package.json'),
            JSON.stringify(packageJson, undefined, 4)
        );
    } catch (e) {
        console.log(`An error occured`, e);
    }
}

run();
