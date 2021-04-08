import chalk from 'chalk';
import { SetupPiHoleOptions } from 'types';
import { promisify } from 'util';
import AWS from 'aws-sdk';
import { exec, spawnSync, SpawnSyncOptions } from 'child_process';

const pexec = promisify(exec);

export class SetupPiHole {
    private readonly options: SetupPiHoleOptions;

    private _instanceId?: string;
    private _localHostName?: string;
    private _localIpv4?: string;

    private static SPAWN_SYNC_OPTIONS: SpawnSyncOptions = {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    };

    constructor(options: SetupPiHoleOptions) {
        this.options = options;

        this.obtainEc2InstanceMetadata().then(async () => {
            await this.configureResolvConf();
        });
    }

    get instanceId(): string | undefined {
        return this._instanceId;
    }

    set instanceId(value: string | undefined) {
        this._instanceId = value;
    }

    get localHostName(): string | undefined {
        return this._localHostName;
    }

    set localHostName(value: string | undefined) {
        this._localHostName = value;
    }

    get localIpv4(): string | undefined {
        return this._localIpv4;
    }

    set localIpv4(value: string | undefined) {
        this._localIpv4 = value;
    }

    private async obtainEc2InstanceMetadata(): Promise<void> {
        try {
            console.log(chalk.green(`Obtaining ec2 instance metadata`));

            let { stdout: instanceId } = await pexec(
                `ec2metadata --instance-id`
            );
            this.instanceId = instanceId;

            let { stdout: localHostName } = await pexec(
                `ec2metadata --local-hostname`
            );
            this.localHostName = localHostName;

            let { stdout: localIpv4 } = await pexec(`ec2metadata --local-ipv4`);
            this.localIpv4 = localIpv4;

            console.log(
                chalk.yellowBright(`instanceId`),
                chalk.cyanBright(this.instanceId)
            );
            console.log(
                chalk.yellowBright(`localIpv4`),
                chalk.cyanBright(this.localIpv4)
            );
            console.log(
                chalk.yellowBright(`localHostName`),
                chalk.cyanBright(this.localHostName)
            );
        } catch (e) {
            console.log(
                chalk.redBright(`Failed to obtain ec2 instance metadata`),
                e
            );
            throw e;
        }
    }

    public async configureResolvConf(): Promise<void> {
        console.log(
            chalk.green('Configuring /etc/resolv.conf before installation')
        );

        try {
            await pexec(
                `sudo sed -i -e 's/nameserver 127.0.0.53/nameserver 127.0.0.1/g' /etc/resolv.conf`
            );

            await pexec(`sudo  sed '$ a DNS=127.0.0.1' /etc/resolv.conf`);

            await pexec(`sudo sed '$ a DNSStubListener=no' /etc/resolv.conf`);

            await pexec(
                `sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf`
            );
        } catch (e) {
            console.log(
                chalk.redBright(`Failed to configure /etc/resolv.conf`),
                e
            );
            throw e;
        }
    }

    public async createPiHoleConfig(): Promise<void> {
        console.log(chalk.green(`Creating pihole configuration`));

        try {
            await pexec(`mkdir -p /etc/pihole`);
        } catch (e) {
            console.log(chalk.redBright(`Failed to create /etc/pihole`), e);
            throw e;
        }

        try {
            await pexec(`cat <<EOT >>/etc/pihole/setupVars.conf
            WEBPASSWORD=${this.options.password}
            PIHOLE_INTERFACE=eth0
            IPV4_ADDRESS=$PRIVATE_IP/24
            IPV6_ADDRESS=
            QUERY_LOGGING=true
            INSTALL_WEB=true
            DNSMASQ_LISTENING=single
            PIHOLE_DNS_1=1.1.1.1
            PIHOLE_DNS_2=1.0.0.1
            PIHOLE_DNS_3=
            PIHOLE_DNS_4=
            DNS_FQDN_REQUIRED=true
            DNS_BOGUS_PRIV=true
            DNSSEC=true
            TEMPERATUREUNIT=C
            WEBUIBOXEDLAYOUT=traditional
            WEBTHEME=default-dark
            API_EXCLUDE_DOMAINS=
            API_EXCLUDE_CLIENTS=
            API_QUERY_LOG_SHOW=all
            API_PRIVACY_MODE=false
            EOT`);
        } catch (e) {
            console.log(chalk.redBright(`Failed to create /etc/pihole`), e);
        }

        try {

        } catch (e) {
            
        }
    }

    public async modifyHosts(): Promise<void> {}

    public installPiHole() {}

    public installUnbound() {}
}
