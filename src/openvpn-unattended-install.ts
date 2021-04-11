import chalk from 'chalk';
import AWS from 'aws-sdk';
import fs from 'fs';
import { SetupOpenVpnOptions } from 'types';
import { PromiseResult } from 'aws-sdk/lib/request';
import packageJson from '../package.json';
import shelljs from 'shelljs';

export class SetupOpenVpn {
    private readonly options: SetupOpenVpnOptions;
    private readonly s3Client: AWS.S3;

    constructor(options: SetupOpenVpnOptions) {
        this.options = options;
        this.s3Client = new AWS.S3({
            region: options.region
        });
        console.log('options', options);

        this.runSetup();
    }

    public runSetup(): void {
        try {
            console.log(
                chalk.bgGreenBright(
                    `Running openvpn unattended setup ${packageJson.version}`
                )
            );
            this.setupOpenVpn();
            this.setupSsl();
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Something failed during openvpn setup`),
                e
            );
            return;
        }
    }

    private setupOpenVpn() {
        const { userName, userPassword, ip, elasticIp } = this.options;

        if (typeof ip !== 'undefined') {
            console.log(chalk.bgGreenBright('Setting upstream dns settings and access server hostname'));

            try {
                shelljs.exec(
                    `sudo /usr/local/openvpn_as/scripts/sacli --key vpn.client.routing.reroute_dns --value custom ConfigPut`
                );
                shelljs.exec(
                    `sudo /usr/local/openvpn_as/scripts/sacli --key vpn.server.dhcp_option.dns.0 --value ${ip} ConfigPut`
                );
                shelljs.exec(
                    `sudo /usr/local/openvpn_as/scripts/sacli --key vpn.server.routing.gateway_access --value true ConfigPut`
                );
                shelljs.exec(
                    `sudo /usr/local/openvpn_as/scripts/sacli --key host.name --value ${elasticIp} ConfigPut`
                );
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        'An error occured while setting upstream dns settings'
                    ),
                    e
                );
                throw e;
            }
        }

        try {
            console.log(
                chalk.bgGreenBright('Creating default client user for OpenVPN')
            );

            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/sacli --key vpn.client.routing.reroute_gw --value true ConfigPut`
            );

            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/sacli --user ${userName} --key type --value user_connect UserPropPut`
            );

            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/sacli --user ${userName} --key prop_autologin --value true UserPropPut`
            );

            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/sacli --user ${userName}  --new_pass ${userPassword} SetLocalPassword`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    'An error occured while creating default client user'
                ),
                e
            );
            throw e;
        }
    }

    private async setupSsl() {
        console.log(
            chalk.bgGreenBright(
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
                shelljs.exec(
                    [
                        'sudo',
                        'certbot',
                        'certonly',
                        '--standalone',
                        '--non-interactive',
                        '--agree-tos',
                        '--email',
                        email,
                        '--domains',
                        domainName,
                        ...(this.options.certEnvironment === 'staging'
                            ? [
                                  '--server', // Specify the staging server for development purposes
                                  'https://acme-staging-v02.api.letsencrypt.org/directory'
                              ]
                            : [])
                    ].join(' ')
                );
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        'An error occured while generating a cert'
                    ),
                    e
                );
                throw e;
            }

            // Change letsencrypt directory permissions
            try {
                shelljs.exec(`sudo chmod -R 755 /etc/letsencrypt`);
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        'An error while chaging directory permissions'
                    ),
                    e
                );
                throw e;
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
                    chalk.bgRedBright(
                        `An error occured when copying certs to S3 bucket ${bucket}`
                    ),
                    e
                );
                throw e;
            }
        } else {
            console.log(
                chalk.bgGreenBright(`Existing cert found, reusing it...`)
            );

            // Make relevant directories
            try {
                shelljs.exec(
                    [
                        'sudo',
                        'mkdir',
                        '-p',
                        `/etc/letsencrypt/live/${domainName}`
                    ].join(' ')
                );

                shelljs.exec(
                    ['sudo', 'chmod', '-R', '777', `/etc/letsencrypt`].join(' ')
                );
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        `An error occured while creating relevant directories to store certificate`
                    ),
                    e
                );
                throw e;
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
                    chalk.bgRedBright(
                        `An error occured while getting certificate artifacts from ${bucket}`
                    ),
                    e
                );
                throw e;
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
            console.log(
                chalk.bgRedBright(`Failed to get ${Key} from ${Bucket}`)
            );
            throw e;
        }
    }

    private async writeToFile(content: string, path: string) {
        try {
            fs.writeFileSync(path, content);
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to write ${path}`));
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
            console.log(chalk.bgGreenBright(`Installing certbot`));
            shelljs.exec(`sudo apt-get -y install software-properties-common`);
            shelljs.exec(`sudo add-apt-repository ppa:certbot/certbot -y`);
            shelljs.exec(`sudo apt-get -y update`);
            shelljs.exec(`sudo apt-get -y install certbot`);
        } catch (e) {
            console.log(
                chalk.bgRedBright('An error occured while installing certbot'),
                e
            );
            throw e;
        }
    }

    private applyCert() {
        try {
            console.log(
                chalk.bgGreenBright(
                    `Delete existing cert references in OpenVPN DB`
                )
            );

            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/confdba -mk cs.ca_bundle`
            );
            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/confdba -mk cs.priv_key`
            );
            shelljs.exec(
                `sudo /usr/local/openvpn_as/scripts/confdba -mk cs.cert`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    'An error occured while deleting certificate references in OpenVPN DB'
                ),
                e
            );
            throw e;
        }

        try {
            console.log(
                chalk.bgGreenBright(`Apply symbolic links to SSL certificates`)
            );

            shelljs.exec(
                `sudo ln -s -f /etc/letsencrypt/live/${this.options.domainName}/cert.pem /usr/local/openvpn_as/etc/web-ssl/server.crt`
            );
            shelljs.exec(
                `sudo ln -s -f /etc/letsencrypt/live/${this.options.domainName}/privkey.pem /usr/local/openvpn_as/etc/web-ssl/server.key`
            );
            shelljs.exec(
                `sudo ln -s -f /etc/letsencrypt/live/${this.options.domainName}/chain.pem /usr/local/openvpn_as/etc/web-ssl/ca.crt`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    'An error occured symlinking to certificate files'
                ),
                e
            );
            throw e;
        }
    }

    private stopOpenVpn() {
        try {
            console.log(chalk.bgGreenBright(`Stopping openvpn`));
            shelljs.exec(`sudo /usr/local/openvpn_as/scripts/sacli stop`);
        } catch (e) {
            console.log(
                chalk.bgRedBright('An error occured while stopping openvpn'),
                e
            );
            return;
        }
    }

    private startOpenVpn() {
        try {
            console.log(chalk.blueBright(`Starting openvpn`));
            shelljs.exec(`sudo /usr/local/openvpn_as/scripts/sacli start`);
        } catch (e) {
            console.log(
                chalk.bgRedBright('An error occured while starting openvpn'),
                e
            );
            return;
        }
    }
}
