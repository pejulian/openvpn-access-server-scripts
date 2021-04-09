#!/usr/bin/env node
import { Command } from 'commander';
import { SetupOpenVpnOptions, SetupPiHoleOptions } from 'types';
import { version, name } from '../package.json';
import { SetupOpenVpn } from './openvpn-unattended-install';
import { SetupPiHole } from './pihole-unattended-install.js';

const program = new Command();
program.name(name).version(version);

program
    .command(`setup-openvpn`)
    .description('Sets up SSL for OpenVPN Access Server Web UI')
    .option(
        `-i, --ip [value]`,
        `The private ip address of the pi hole ec2 instance (for setting up upstream dns)`
    )
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
    .requiredOption(
        `-u, --user-name [value]`,
        `The username of the client user`
    )
    .requiredOption(
        `-p, --user-password [value]`,
        `The password of the client user (special characters need to be escaped before they are passed here)`
    )
    .option(
        `-c, --cert-environment [value]`,
        `Which environment should be used when requesting SSL cert from Lets Encrypt (staging, production)`,
        'production'
    )
    .action((...args: unknown[]) => {
        new SetupOpenVpn(args[0] as SetupOpenVpnOptions); // Use first index in args array for options because there's no argument defined
    });

program
    .command(`setup-pihole`)
    .description(
        `Sets up unbound as a recursive DNS provider and sets up unbound to use it`
    )
    .requiredOption(
        `-r --region [value]`,
        `The AWS region to use when using the SDK to communicate with AWS`
    )
    .requiredOption(
        `-p, --password [value]`,
        `The password to login to the web interface (special characters need to be escaped before they are passed here)`
    )
    .action((...args: unknown[]) => {
        new SetupPiHole(args[0] as SetupPiHoleOptions); // Use first index in args array for options because there's no argument defined
    });

program.parse(process.argv);
