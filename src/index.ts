#!/usr/bin/env node
import { Command } from 'commander';
import { SetupSslOptions } from 'types';
import { version, name } from '../package.json';
import { SetupSsl } from './openvpn-unattended-install';

const program = new Command();
program.name(name).version(version);

program
    .command(`setup-openvpn`)
    .description('Sets up SSL for OpenVPN Access Server Web UI')
    .requiredOption(
        `-d, --domain-name [value]`,
        `The domain name to use to register the SSL certificate`
    )
    .requiredOption(
        `-e, --email [value]`,
        `The email to use to register the SSL certificate`
    )
    .requiredOption(
        `-b, --bucket [value]`,
        `The S3 bucket to reference when saving generated certificate artifacts or retreiving existing certifate artifacts for reuse`
    )
    .requiredOption(
        `-r --region [value]`,
        `The AWS region to use when using the SDK to communicate with AWS`
    )
    .action((...args: unknown[]) => {
        new SetupSsl(args[0] as SetupSslOptions); // Use first index in args array for options because there's no argument defined
    });

program.parse(process.argv);
