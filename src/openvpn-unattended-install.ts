import chalk from 'chalk';
import { spawnSync, SpawnSyncOptions } from 'child_process';
import AWS from 'aws-sdk';
import fs from 'fs';
import { SetupOpenVpnOptions } from 'types';
import { PromiseResult } from 'aws-sdk/lib/request';

export class SetupOpenVpn {
    private readonly options: SetupOpenVpnOptions;
    private readonly s3Client: AWS.S3;

    private static SPAWN_SYNC_OPTIONS: SpawnSyncOptions = {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    };

    constructor(options: SetupOpenVpnOptions) {
        this.options = options;
        this.s3Client = new AWS.S3({
            region: options.region
        });

        this.setupOpenVpn();
        this.setupSsl();
    }

    public setupOpenVpn() {
        const { userName, userPassword, ip } = this.options;

        if (typeof ip !== 'undefined') {
            console.log(chalk.green('Setting upstream dns settings'));

            try {
                spawnSync(
                    'sudo',
                    [
                        `/usr/local/openvpn_as/scripts/sacli`,
                        '--key',
                        'vpn.client.routing.reroute_dns',
                        `--value`,
                        `custom`,
                        `ConfigPut`
                    ].filter((el) => el !== ''),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );

                spawnSync(
                    'sudo',
                    [
                        `/usr/local/openvpn_as/scripts/sacli`,
                        '--key',
                        'vpn.server.dhcp_option.dns.0',
                        `--value`,
                        `${ip}`,
                        `ConfigPut`
                    ].filter((el) => el !== ''),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );

                spawnSync(
                    'sudo',
                    [
                        `/usr/local/openvpn_as/scripts/sacli`,
                        '--key',
                        'vpn.server.routing.gateway_access',
                        `--value`,
                        `true`,
                        `ConfigPut`
                    ].filter((el) => el !== ''),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );
            } catch (e) {
                console.log(
                    chalk.redBright(
                        'An error occured while setting upstream dns settings'
                    ),
                    e
                );
                return;
            }
        }

        try {
            console.log(
                chalk.green('Creating default client user for OpenVPN')
            );

            spawnSync(
                'sudo',
                [
                    `/usr/local/openvpn_as/scripts/sacli`,
                    '--key',
                    'vpn.client.routing.reroute_gw',
                    `--value`,
                    `true`,
                    `ConfigPut`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    `/usr/local/openvpn_as/scripts/sacli`,
                    '--user',
                    `${userName}`,
                    `--key`,
                    `type`,
                    '--value',
                    'user_connect',
                    `UserPropPut`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    `/usr/local/openvpn_as/scripts/sacli`,
                    '--user',
                    `${userName}`,
                    `--key`,
                    `prop_autologin`,
                    '--value',
                    'true',
                    `UserPropPut`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    `/usr/local/openvpn_as/scripts/sacli`,
                    '--user',
                    `${userName}`,
                    `--new_pass`,
                    `${userPassword}`,
                    'SetLocalPassword'
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            console.log(chalk.green('Updated OpenVPN config successfully!'));
        } catch (e) {
            console.log(
                chalk.redBright(
                    'An error occured while creating default client user'
                ),
                e
            );
            return;
        }
    }

    public async setupSsl() {
        console.log(
            chalk.green(
                `Starting process to append an SSL certificate to OpenVPN Access Server Web UI`
            )
        );

        const { domainName, email, bucket } = this.options;

        this.installCertbot();

        const hasExistingCert = await this.hasExistingCert();

        if (!hasExistingCert) {
            console.log(
                chalk.yellowBright(
                    `No existing certificate to reuse, creating new cert`
                )
            );

            // Run certbot
            try {
                spawnSync(
                    'sudo',
                    [
                        'certbot',
                        'certonly',
                        '--standalone',
                        '--server', // Specify the staging server for development purposes
                        'https://acme-staging-v02.api.letsencrypt.org/directory',
                        '--non-interactive',
                        '--agree-tos',
                        '--email',
                        email,
                        '--domains',
                        domainName
                    ].filter((el) => el !== ''),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );
            } catch (e) {
                console.log(
                    chalk.redBright('An error occured while generating a cert'),
                    e
                );
                return;
            }

            // Change letsencrypt directory permissions
            try {
                spawnSync(
                    'sudo',
                    ['chmod', '-R', '755', '/etc/letsencrypt'].filter(
                        (el) => el !== ''
                    ),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );
            } catch (e) {
                console.log(
                    chalk.redBright(
                        'An error while chaging directory permissions'
                    ),
                    e
                );
                return;
            }

            // Read generated certs and put them into s3
            try {
                const certPem = fs.readFileSync(
                    `/etc/letsencrypt/live/${domainName}/cert.pem`,
                    {
                        encoding: 'utf8'
                    }
                );

                const privKeyPem = fs.readFileSync(
                    `/etc/letsencrypt/live/${domainName}/privkey.pem`,
                    {
                        encoding: 'utf8'
                    }
                );

                const chainPem = fs.readFileSync(
                    `/etc/letsencrypt/live/${domainName}/chain.pem`,
                    {
                        encoding: 'utf8'
                    }
                );

                const fullChainPem = fs.readFileSync(
                    `/etc/letsencrypt/live/${domainName}/fullchain.pem`,
                    {
                        encoding: 'utf8'
                    }
                );

                await this.s3Client
                    .putObject({
                        Bucket: bucket,
                        Key: `letsencrypt/${domainName}/cert.pem`,
                        Body: certPem
                    })
                    .promise();

                await this.s3Client
                    .putObject({
                        Bucket: bucket,
                        Key: `letsencrypt/${domainName}/privkey.pem`,
                        Body: privKeyPem
                    })
                    .promise();

                await this.s3Client
                    .putObject({
                        Bucket: bucket,
                        Key: `letsencrypt/${domainName}/chain.pem`,
                        Body: chainPem
                    })
                    .promise();

                await this.s3Client
                    .putObject({
                        Bucket: bucket,
                        Key: `letsencrypt/${domainName}/fullchain.pem`,
                        Body: fullChainPem
                    })
                    .promise();
            } catch (e) {
                console.log(
                    chalk.redBright(
                        `An error occured when copying certs to S3 bucket ${bucket}`
                    ),
                    e
                );
                return;
            }
        } else {
            console.log(
                chalk.greenBright(`Existing cert found, reusing it...`)
            );

            // Make relevant directories
            try {
                spawnSync(
                    'sudo',
                    [
                        'mkdir',
                        '-p',
                        `/etc/letsencrypt/live/${domainName}`
                    ].filter((el) => el !== ''),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );

                spawnSync(
                    'sudo',
                    ['chmod', '-R', '777', `/etc/letsencrypt`].filter(
                        (el) => el !== ''
                    ),
                    SetupOpenVpn.SPAWN_SYNC_OPTIONS
                );
            } catch (e) {
                console.log(
                    chalk.redBright(
                        `An error occured while creating relevant directories to store certificate`
                    ),
                    e
                );
                return;
            }

            // Get objects from s3 and write to relevant directory
            try {
                this.writeToFile(
                    await this.getS3Object(
                        bucket,
                        `letsencrypt/${domainName}/cert.pem`
                    ),
                    `/etc/letsencrypt/live/${domainName}/cert.pem`
                );

                this.writeToFile(
                    await this.getS3Object(
                        bucket,
                        `letsencrypt/${domainName}/privkey.pem`
                    ),
                    `/etc/letsencrypt/live/${domainName}/privkey.pem`
                );

                this.writeToFile(
                    await this.getS3Object(
                        bucket,
                        `letsencrypt/${domainName}/chain.pem`
                    ),
                    `/etc/letsencrypt/live/${domainName}/chain.pem`
                );

                this.writeToFile(
                    await this.getS3Object(
                        bucket,
                        `letsencrypt/${domainName}/fullchain.pem`
                    ),
                    `/etc/letsencrypt/live/${domainName}/fullchain.pem`
                );
            } catch (e) {
                console.log(
                    chalk.redBright(
                        `An error occured while getting certificate artifacts from ${bucket}`
                    ),
                    e
                );
                return;
            }
        }

        this.applyCert();

        this.startOpenVpn();
    }

    private async getS3Object(Bucket: string, Key: string): Promise<string> {
        try {
            const response = await this.s3Client
                .getObject({
                    Bucket,
                    Key
                })
                .promise();

            if (typeof response.Body === 'undefined') {
                throw new Error(`Body of ${Key} is undefined`);
            }

            return response.Body?.toString('utf-8');
        } catch (e) {
            console.log(chalk.redBright(`Failed to get ${Key} from ${Bucket}`));
            throw e;
        }
    }

    private async writeToFile(content: string, path: string) {
        try {
            fs.writeFileSync(path, content);
        } catch (e) {
            console.log(chalk.redBright(`Failed to write ${path}`));
            throw e;
        }
    }

    /**
     * Check for existing certificate artifacts in the bucket
     */
    private async hasExistingCert(): Promise<boolean> {
        try {
            console.log(
                chalk.blueBright(`Checking for existing SSL certificate`)
            );

            const results: Array<
                PromiseResult<AWS.S3.HeadObjectOutput, AWS.AWSError>
            > = await Promise.all([
                await this.s3Client
                    .headObject({
                        Bucket: this.options.bucket,
                        Key: `letsencrypt/${this.options.domainName}/cert.pem`
                    })
                    .promise(),
                await this.s3Client
                    .headObject({
                        Bucket: this.options.bucket,
                        Key: `letsencrypt/${this.options.domainName}/privkey.pem`
                    })
                    .promise(),
                await this.s3Client
                    .headObject({
                        Bucket: this.options.bucket,
                        Key: `letsencrypt/${this.options.domainName}/chain.pem`
                    })
                    .promise(),
                await this.s3Client
                    .headObject({
                        Bucket: this.options.bucket,
                        Key: `letsencrypt/${this.options.domainName}/fullchain.pem`
                    })
                    .promise()
            ]);
            return true;
        } catch (e) {
            console.log(
                chalk.yellowBright(
                    `Required certificate artifacts could not be found in ${this.options.bucket}`
                ),
                e
            );
            return false;
        }
    }

    /**
     * Install certbot
     * @returns
     */
    private installCertbot() {
        try {
            console.log(chalk.blueBright(`Installing certbot`));

            spawnSync(
                'sudo',
                [
                    'apt-get',
                    '-y',
                    'install',
                    'software-properties-common'
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                ['add-apt-repository', 'ppa:certbot/certbot', '-y'].filter(
                    (el) => el !== ''
                ),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                ['apt-get', '-y', 'update'].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                ['apt-get', '-y', 'install', 'certbot'].filter(
                    (el) => el !== ''
                ),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );
        } catch (e) {
            console.log(
                chalk.redBright('An error occured while installing certbot'),
                e
            );
            return;
        }
    }

    private applyCert() {
        try {
            console.log(
                chalk.blueBright(
                    `Delete existing cert references in OpenVPN DB`
                )
            );

            spawnSync(
                'sudo',
                [
                    '/usr/local/openvpn_as/scripts/confdba',
                    '-mk',
                    'cs.ca_bundle'
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    '/usr/local/openvpn_as/scripts/confdba',
                    '-mk',
                    'cs.priv_key'
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    '/usr/local/openvpn_as/scripts/confdba',
                    '-mk',
                    'cs.cert'
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );
        } catch (e) {
            console.log(
                chalk.redBright(
                    'An error occured while deleting certificate references in OpenVPN DB'
                ),
                e
            );
            return;
        }

        try {
            console.log(
                chalk.blueBright(`Apply symbolic links to SSL certificates`)
            );

            spawnSync(
                'sudo',
                [
                    'ln',
                    '-s',
                    '-f',
                    `/etc/letsencrypt/live/${this.options.domainName}/cert.pem`,
                    `/usr/local/openvpn_as/etc/web-ssl/server.crt`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    'ln',
                    '-s',
                    '-f',
                    `/etc/letsencrypt/live/${this.options.domainName}/privkey.pem`,
                    `/usr/local/openvpn_as/etc/web-ssl/server.key`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );

            spawnSync(
                'sudo',
                [
                    'ln',
                    '-s',
                    '-f',
                    `/etc/letsencrypt/live/${this.options.domainName}/chain.pem`,
                    `/usr/local/openvpn_as/etc/web-ssl/ca.crt`
                ].filter((el) => el !== ''),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );
        } catch (e) {
            console.log(
                chalk.redBright(
                    'An error occured symlinking to certificate files'
                ),
                e
            );
            return;
        }
    }

    private stopOpenVpn() {
        try {
            console.log(chalk.blueBright(`Stopping openvpn`));

            spawnSync(
                'sudo',
                ['/usr/local/openvpn_as/scripts/sacli', 'stop'].filter(
                    (el) => el !== ''
                ),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );
        } catch (e) {
            console.log(
                chalk.redBright('An error occured while stopping openvpn'),
                e
            );
            return;
        }
    }

    private startOpenVpn() {
        try {
            console.log(chalk.blueBright(`Starting openvpn`));

            spawnSync(
                'sudo',
                ['/usr/local/openvpn_as/scripts/sacli', 'start'].filter(
                    (el) => el !== ''
                ),
                SetupOpenVpn.SPAWN_SYNC_OPTIONS
            );
        } catch (e) {
            console.log(
                chalk.redBright('An error occured while starting openvpn'),
                e
            );
            return;
        }
    }
}
