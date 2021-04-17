import packageJson from '../package.json';
import shelljs from 'shelljs';
import { BackupSslCertOptions, IScriptable } from 'types';
import chalk from 'chalk';
import AWS from 'aws-sdk';
import fs from 'fs';
import { getCertificate } from './utils/acm-utils';
import { continueLifecycle } from './utils/asg-utils';

export class BackupSslCert implements IScriptable {
    private readonly options: BackupSslCertOptions;

    private readonly acmClient: AWS.ACM;
    private readonly autoScalingClient: AWS.AutoScaling;

    private readonly instanceId: string;

    constructor(options: BackupSslCertOptions) {
        this.options = options;

        this.acmClient = new AWS.ACM({
            region: this.options.region,
            apiVersion: '2015-12-08'
        });

        this.autoScalingClient = new AWS.AutoScaling({
            region: this.options.region
        });

        this.instanceId = shelljs.exec(`ec2metadata --instance-id`).toString();

        this.run();
    }

    public run(): void {
        try {
            console.log(
                chalk.bgGreenBright(
                    `Running SSL certificate backup ${packageJson.version}`
                )
            );

            // attempt to backup the ssl cert but always proceed
            // with the lifecycle irregardless of the outcome
            this.backupCert().finally(async () => {
                try {
                    await continueLifecycle(
                        this.autoScalingClient,
                        this.options.autoScalingGroupName,
                        this.options.lifecycleHookName,
                        this.options.lifecycleActionToken,
                        this.instanceId
                    );
                } catch (e) {
                    console.log(
                        chalk.bgRedBright(`Failed to continue ASG lifecycle`),
                        e
                    );
                    return;
                }
            });
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Something failed during SSL certificate backup`
                ),
                e
            );
            return;
        }
    }

    private async backupCert(): Promise<void> {
        console.log(
            chalk.bgGreenBright(
                `Backing up SSL certificate from EC2 instance ${this.instanceId}`
            )
        );

        const domainName = this.options.domainName;

        const certificateSummary = await getCertificate(
            this.acmClient,
            domainName
        );

        let certPem: string;
        let chainPem: string;
        let privkeyPem: string;

        try {
            certPem = fs.readFileSync(
                `/etc/letsencrypt/live/${domainName}/cert.pem`,
                {
                    encoding: 'utf8'
                }
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to read contents of cert.pem`),
                e
            );
            return;
        }

        try {
            chainPem = fs.readFileSync(
                `/etc/letsencrypt/live/${domainName}/chain.pem`,
                {
                    encoding: 'utf8'
                }
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to read contents of chain.pem`),
                e
            );
            return;
        }

        try {
            privkeyPem = fs.readFileSync(
                `/etc/letsencrypt/live/${domainName}/privkey.pem`,
                {
                    encoding: 'utf8'
                }
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to read contents of privkey.pem`),
                e
            );
            return;
        }

        try {
            const result = await this.acmClient
                .importCertificate({
                    Certificate: Buffer.from(certPem),
                    PrivateKey: Buffer.from(privkeyPem),
                    CertificateChain: Buffer.from(chainPem),
                    ...(typeof certificateSummary !== 'undefined' && {
                        CertificateArn: certificateSummary.CertificateArn
                    })
                })
                .promise();

            console.log(
                chalk.greenBright(
                    `Successfully  ${
                        typeof certificateSummary !== 'undefined'
                            ? 'update'
                            : 'import'
                    } certificate to ACM`
                ),
                result
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to ${
                        typeof certificateSummary !== 'undefined'
                            ? 'update'
                            : 'import'
                    } certificate into ACM`
                ),
                e
            );
            return;
        }
    }
}
