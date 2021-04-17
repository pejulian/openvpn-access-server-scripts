import chalk from 'chalk';
import AWS from 'aws-sdk';
import fs from 'fs';
import { IScriptable, SetupOpenVpnOptions } from 'types';
import packageJson from '../package.json';
import shelljs from 'shelljs';
import { getCertificate } from './utils/acm-utils';

export class SetupOpenVpn implements IScriptable {
    private readonly options: SetupOpenVpnOptions;
    private readonly acmClient: AWS.ACM;

    constructor(options: SetupOpenVpnOptions) {
        this.options = options;

        this.acmClient = new AWS.ACM({
            region: this.options.region,
            apiVersion: '2015-12-08'
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

        const certificateSummary = await getCertificate(
            this.acmClient,
            this.options.domainName
        );

        if (typeof certificateSummary === 'undefined') {
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

            // Get cert elements from ACM and write to relevant directory
            try {
                const certificateResponse = await this.acmClient
                    .exportCertificate()
                    .promise();

                if (
                    typeof certificateResponse.Certificate !== 'undefined' &&
                    typeof certificateResponse.CertificateChain !==
                        'undefined' &&
                    typeof certificateResponse.PrivateKey !== 'undefined'
                ) {
                    this.writeToFile(
                        certificateResponse.Certificate,
                        `/etc/letsencrypt/live/${domainName}/cert.pem`
                    );

                    this.writeToFile(
                        certificateResponse.PrivateKey,
                        `/etc/letsencrypt/live/${domainName}/privkey.pem`
                    );

                    this.writeToFile(
                        certificateResponse.CertificateChain,
                        `/etc/letsencrypt/live/${domainName}/chain.pem`
                    );
                }

                // this.writeToFile(
                //     await this.getS3Object(
                //         bucket,
                //         `letsencrypt/${domainName}/fullchain.pem`
                //     ),
                //     `/etc/letsencrypt/live/${domainName}/fullchain.pem`
                // );
            } catch (e) {
                console.log(
                    chalk.bgRedBright(
                        `An error occured while getting certificate artifacts from ACM`
                    ),
                    e
                );
                throw e;
            }
        }

        this.installCertificate();
        this.startOpenVpn();
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
