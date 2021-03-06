#!/usr/bin/env node
import { Command } from 'commander';
import {
    SetupOpenVpnOptions,
    SetupPiHoleOptions,
    BackupSslCertOptions
} from 'types';
import { version, name } from '../package.json';
import { BackupSslCert } from './backup-ssl-cert';
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
    .option(
        `-c, --cert-environment [value]`,
        `Which environment should be used when requesting SSL cert from Lets Encrypt (staging, production)`,
        'production'
    )
    .requiredOption(
        `-h --host-name [value]`,
        `The FQDN (or private ip, though not recommended) to be used as the host name of the OpenVPN Access Server`
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
        `-r --region [value]`,
        `The AWS region to use when using the SDK to communicate with AWS`
    )
    .requiredOption(
        `-b --bucket-name [value]`,
        `The s3 bucket to look for stored ssl certs`
    )
    .requiredOption(
        `-u, --user-name [value]`,
        `The username of the client user`
    )
    .requiredOption(
        `-p, --user-password [value]`,
        `The password of the client user (special characters need to be escaped before they are passed here)`
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

program
    .command(`backup-ssl-cert`)
    .description(
        `Takes a backup of the SSL certificate generated by a Lets Encrypt installation installed in an EC2 instance running Amazon Linux 2 image`
    )
    .requiredOption(
        `-d, --domain-name [value]`,
        `The domain name to use to register the SSL certificate`
    )
    .requiredOption(
        `-r --region [value]`,
        `The AWS region to use when using the SDK to communicate with AWS`
    )
    .requiredOption(
        `-b --bucket-name [value]`,
        `The bucket name where SSL certficates will be backed up to`
    )
    .requiredOption(
        `-a --auto-scaling-group-name [value]`,
        `The name of the auto scaling group where lifecycle operations are being triggered`
    )
    .requiredOption(
        `-l --lifecycle-hook-name [value]`,
        `The lifecycle hook name`
    )
    .requiredOption(
        `-t --lifecycle-action-token [value]`,
        `The lifecycle token (needed for completing the hook)`
    )
    .action((...args: unknown[]) => {
        new BackupSslCert(args[0] as BackupSslCertOptions);
    });

program.parse(process.argv);
