import chalk from 'chalk';
import AWS from 'aws-sdk';
import { IScriptable, SetupOpenVpnOptions } from 'types';
import packageJson from '../package.json';
import shelljs from 'shelljs';
import { getObject, objectExists } from './utils/s3-utils';
import { writeToFile } from './utils/fs-utils';

export class SetupOpenVpn implements IScriptable {
    private readonly options: SetupOpenVpnOptions;
    private readonly s3Client: AWS.S3;

    constructor(options: SetupOpenVpnOptions) {
        this.options = options;

        this.s3Client = new AWS.S3({
            region: this.options.region
        });

        this.run();
    }

    public run(): void {
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
        const { userName, userPassword, ip, hostName } = this.options;

        if (typeof ip !== 'undefined') {
            console.log(
                chalk.bgGreenBright(
                    'Setting upstream dns settings and access server hostname'
                )
            );

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
                    `sudo /usr/local/openvpn_as/scripts/sacli --key host.name --value ${hostName} ConfigPut`
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

        const { domainName, email } = this.options;

        this.installCertbot();

        const existingCertificate = this.getCertificate();

        if (typeof existingCertificate === 'undefined') {
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

            // Change letsencrypt directory permissions so that its contents can be read later on
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

            // Use certificate elements from s3 and write to relevant directory
            try {
                const certificateResponse = await this.getCertificate();

                if (typeof certificateResponse !== 'undefined') {
                    writeToFile(
                        certificateResponse.certPem,
                        `/etc/letsencrypt/live/${domainName}/cert.pem`
                    );

                    writeToFile(
                        certificateResponse.privkeyPem,
                        `/etc/letsencrypt/live/${domainName}/privkey.pem.enc`
                    );

                    writeToFile(
                        certificateResponse.chainPem,
                        `/etc/letsencrypt/live/${domainName}/chain.pem`
                    );

                    writeToFile(
                        certificateResponse.fullchainPem,
                        `/etc/letsencrypt/live/${domainName}/fullchain.pem`
                    );
                } else {
                    console.log(
                        chalk.bgYellowBright(
                            `Although initial certificate check showed an existing certificate to use, the actual content of the certificate was not found/usable`
                        )
                    );
                }
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        `An error occured while getting certificate artifacts from S3`
                    ),
                    e
                );
                throw e;
            }
        }

        this.installCertificate();
        this.startOpenVpn();
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

    private installCertificate() {
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
            return;
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
            return;
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

    /**
     * Obtains an existing certificate as an object containing all certificate elements as strings or undefined if the certificate does not exist
     */
    private async getCertificate(): Promise<
        | undefined
        | {
              readonly certPem: string;
              readonly privkeyPem: string;
              readonly chainPem: string;
              readonly fullchainPem: string;
          }
    > {
        try {
            const checks = await Promise.all([
                objectExists(
                    this.s3Client,
                    this.options.bucketName,
                    `letsencrypt/${this.options.domainName}/cert.pem`
                ),
                objectExists(
                    this.s3Client,
                    this.options.bucketName,
                    `letsencrypt/${this.options.domainName}/privkey.pem`
                ),
                objectExists(
                    this.s3Client,
                    this.options.bucketName,
                    `letsencrypt/${this.options.domainName}/chain.pem`
                ),
                objectExists(
                    this.s3Client,
                    this.options.bucketName,
                    `letsencrypt/${this.options.domainName}/fullchain.pem`
                )
            ]);

            const certificateExists = checks.every((value) => value === true);

            if (certificateExists) {
                const getResults = await Promise.all([
                    getObject(
                        this.s3Client,
                        this.options.bucketName,
                        `letsencrypt/${this.options.domainName}/cert.pem`
                    ),
                    getObject(
                        this.s3Client,
                        this.options.bucketName,
                        `letsencrypt/${this.options.domainName}/privkey.pem`
                    ),
                    getObject(
                        this.s3Client,
                        this.options.bucketName,
                        `letsencrypt/${this.options.domainName}/chain.pem`
                    ),
                    getObject(
                        this.s3Client,
                        this.options.bucketName,
                        `letsencrypt/${this.options.domainName}/fullchain.pem`
                    )
                ]);

                const hasContent = getResults.every(
                    (value) => typeof value !== 'undefined'
                );

                if (hasContent) {
                    return {
                        certPem: getResults[0],
                        privkeyPem: getResults[1],
                        chainPem: getResults[2],
                        fullchainPem: getResults[3]
                    };
                } else {
                    console.log(
                        chalk.bgYellowBright(
                            `Some or all the required certificate elements did not have any content when fetched from the s3 bucket ${this.options.bucketName}`
                        )
                    );
                    return undefined;
                }
            } else {
                console.log(
                    chalk.bgYellowBright(
                        `Some or all the required certificate elements could not be found in the s3 bucket ${this.options.bucketName}`
                    )
                );
                return undefined;
            }
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to obtain existing certifate`),
                e
            );
            return undefined;
        }
    }
}
