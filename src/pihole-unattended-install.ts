import chalk from 'chalk';
import { SetupPiHoleOptions } from 'types';
import packageJson from '../package.json';
import fs from 'fs';
import shelljs from 'shelljs';
export class SetupPiHole {
    private readonly options: SetupPiHoleOptions;

    private _instanceId?: string;
    private _localHostName?: string;
    private _localIpv4?: string;

    constructor(options: SetupPiHoleOptions) {
        this.options = options;
        // TODO: Remove after installation
        console.log('options', options);
        this.runSetup();
    }

    public async runSetup(): Promise<void> {
        try {
            console.log(
                chalk.bgGreenBright(
                    `Running pihole unattended setup ${packageJson.version}`
                )
            );
            this.obtainEc2InstanceMetadata();
            this.configureResolvConf();
            this.createPiHoleConfig();
            this.modifyHosts();
            this.installPiHole();
            this.installUnbound();
            this.runTests();
            this.useUnbound();
            this.installTools();
            console.log(
                chalk.bgGreenBright(
                    `Setup completed... pihole is now configured with unbound as a recursive dns service!`
                )
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Something failed during pihole setup`),
                e
            );
            return;
        }
    }

    private obtainEc2InstanceMetadata(): void {
        try {
            console.log(chalk.bgGreenBright(`Obtaining ec2 instance metadata`));

            this.instanceId = shelljs
                .exec(`ec2metadata --instance-id`)
                .toString();

            this.localHostName = shelljs
                .exec(`ec2metadata --local-hostname`)
                .toString();

            this.localIpv4 = shelljs
                .exec(`ec2metadata --local-ipv4`)
                .toString();

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
                chalk.bgRedBright(`Failed to obtain ec2 instance metadata`),
                e
            );
            throw e;
        }
    }

    private configureResolvConf(): void {
        console.log(
            chalk.bgGreenBright(
                'Configuring /etc/resolv.conf before installation'
            )
        );

        try {
            shelljs.exec(
                `sudo sed -i -e 's/nameserver 127.0.0.53/nameserver 127.0.0.1/g' /etc/resolv.conf`
            );

            shelljs.exec(`sudo sed '$ a DNS=127.0.0.1' /etc/resolv.conf`);
            shelljs.exec(`sudo sed '$ a DNSStubListener=no' /etc/resolv.conf`);

            shelljs.exec(
                `sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to configure /etc/resolv.conf`),
                e
            );
            throw e;
        }
    }

    private createPiHoleConfig(): void {
        console.log(chalk.bgGreenBright(`Creating pihole configuration`));

        try {
            shelljs.mkdir(`-p`, `/etc/pihole`);
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to create /etc/pihole`), e);
            throw e;
        }

        try {
            const setupVars = `WEBPASSWORD=
PIHOLE_INTERFACE=eth0
IPV4_ADDRESS=${this.localIpv4}/24
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
`;

            fs.writeFileSync('/etc/pihole/setupVars.conf', setupVars, {
                encoding: 'utf8'
            });
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to create /etc/pihole/setupVars.conf`
                ),
                e
            );
            throw e;
        }
    }

    private modifyHosts(): void {
        console.log(chalk.bgGreenBright(`Modifying /etc/hosts`));

        try {
            console.log(
                chalk.gray(
                    `Content of /etc/hosts BEFORE running sed operations`
                )
            );
            console.log(shelljs.cat(`/etc/hosts`).toString());

            shelljs.exec(
                `sudo sed -i "1s/^/${this.localIpv4} ip-${this.localIpv4} \\n/" /etc/hosts`
            );
            shelljs.exec(
                `sudo sed -i /etc/hosts -e "s/^127.0.0.1 localhost$/127.0.0.1 localhost ${this.localHostName}/"`
            );

            console.log(
                chalk.gray(`Content of /etc/hosts AFTER running sed operations`)
            );
            console.log(shelljs.cat(`/etc/hosts`).toString());
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to modify /etc/hosts`), e);
            throw e;
        }
    }

    private installPiHole(): void {
        try {
            console.log(chalk.bgGreenBright(`Installing pihole`));
            shelljs.exec(
                `curl -L https://install.pi-hole.net | sudo bash /dev/stdin --unattended`
            );
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to install pihole`), e);
            throw e;
        }

        try {
            console.log(chalk.bgGreenBright(`Update pihole admin password`));
            shelljs.exec(
                `pihole -a -p "${this.escapeRegExp(this.options.password)}"`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to update pihole admin password`),
                e
            );
            throw e;
        }

        // add some good lists to blocks more ads and marketing
        // https://firebog.net/
        // https://www.github.developerdan.com/hosts/
        // https://blocklistproject.github.io/Lists/
        try {
            console.log(
                chalk.bgGreenBright(
                    `Adding selected adblock lists upfront to pihole`
                )
            );

            shelljs.exec(
                `pihole -a adlist add "https://www.github.developerdan.com/hosts/lists/ads-and-tracking-extended.txt"`
            );
            shelljs.exec(
                `pihole -a adlist add "https://www.github.developerdan.com/hosts/lists/amp-hosts-extended.txt"`
            );
            shelljs.exec(
                `pihole -a adlist add "https://blocklistproject.github.io/Lists/porn.txt"`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to add adblock lists to pihole`),
                e
            );
            throw e;
        }

        // https://www.youtube.com/watch?v=o-bxDuH_T6I
        // add a bunch of regexes to block stuff out
        try {
            console.log(chalk.bgGreenBright(`Adding useful regexes`));

            shelljs.exec(
                `pihole --regex '^ad([sxv]?[0-9]*|system)[_.-]([^.[:space:]]+\.){1,}|[_.-]ad([sxv]?[0-9]*|system)[_.-]' '^(.+[_.-])?adse?rv(er?|ice)?s?[0-9]*[_.-]' '^(.+[_.-])?telemetry[_.-]' '^adim(age|g)s?[0-9]*[_.-]' '^adtrack(er|ing)?[0-9]*[_.-]' '^advert(s|is(ing|ements?))?[0-9]*[_.-]' '^aff(iliat(es?|ion))?[_.-]' '^analytics?[_.-]' '^banners?[_.-]' '^beacons?[0-9]*[_.-]' '^count(ers?)?[0-9]*[_.-]' '^mads\.' '^pixels?[-.]' '^stat(s|istics)?[0-9]*[_.-]' '^https?://([A-Za-z0-9.-]*\.)?clicks\.beap\.bc\.yahoo\.com/' '^https?://([A-Za-z0-9.-]*\.)?secure\.footprint\.net/' '^https?://([A-Za-z0-9.-]*\.)?match\.com/' '^https?://([A-Za-z0-9.-]*\.)?clicks\.beap\.bc\.yahoo(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?sitescout(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?appnexus(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?evidon(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?mediamath(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?scorecardresearch(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?doubleclick(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?flashtalking(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?turn(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?mathtag(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?googlesyndication(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?s\.yimg\.com/cv/ae/us/audience/' '^https?://([A-Za-z0-9.-]*\.)?clicks\.beap/' '^https?://([A-Za-z0-9.-]*\.)?.doubleclick(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?yieldmanager(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?w55c(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?adnxs(\.\w{2}\.\w{2}|\.\w{2,4})/' '^https?://([A-Za-z0-9.-]*\.)?advertising\.com/' '^https?://([A-Za-z0-9.-]*\.)?evidon\.com/' '^https?://([A-Za-z0-9.-]*\.)?scorecardresearch\.com/' '^https?://([A-Za-z0-9.-]*\.)?flashtalking\.com/' '^https?://([A-Za-z0-9.-]*\.)?turn\.com/' '^https?://([A-Za-z0-9.-]*\.)?mathtag\.com/' '^https?://([A-Za-z0-9.-]*\.)?surveylink/' '^https?://([A-Za-z0-9.-]*\.)?info\.yahoo\.com/' '^https?://([A-Za-z0-9.-]*\.)?ads\.yahoo\.com/' '^https?://([A-Za-z0-9.-]*\.)?global\.ard\.yahoo\.com/'`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to add regexes to pihole`),
                e
            );
            throw e;
        }

        try {
            console.log(chalk.bgGreenBright(`Update gravity database`));
            shelljs.exec(`pihole -g`);
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to update gravity db`), e);
            throw e;
        }
    }

    private installUnbound(): void {
        try {
            console.log(chalk.bgGreenBright(`Installing unbound`));
            shelljs.exec(`sudo apt-get -qq update`);
            shelljs.exec(`sudo apt-get -qq upgrade -y`);
            shelljs.exec(`sudo apt-get -qq install unbound -y`);
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to install unbound package from apt-get`
                ),
                e
            );
            throw e;
        }

        try {
            console.log(
                chalk.bgGreenBright(
                    `Creating unbound configuration with default values`
                )
            );

            const unboundConfig = `server:
# If no logfile is specified, syslog is used
# logfile: "/var/log/unbound/unbound.log"
verbosity: 0

interface: 127.0.0.1
port: 5335
do-ip4: yes
do-udp: yes
do-tcp: yes

# May be set to yes if you have IPv6 connectivity
do-ip6: no

# You want to leave this to no unless you have *native* IPv6. With 6to4 and
# Terredo tunnels your web browser should favor IPv4 for the same reasons
prefer-ip6: no

# Use this only when you downloaded the list of primary root servers!
# If you use the default dns-root-data package, unbound will find it automatically
#root-hints: "/var/lib/unbound/root.hints"

# Trust glue only if it is within the server's authority
harden-glue: yes

# Require DNSSEC data for trust-anchored zones, if such data is absent, the zone becomes BOGUS
harden-dnssec-stripped: yes

# Don't use Capitalization randomization as it known to cause DNSSEC issues sometimes
# see https://discourse.pi-hole.net/t/unbound-stubby-or-dnscrypt-proxy/9378 for further details
use-caps-for-id: no

# Reduce EDNS reassembly buffer size.
# Suggested by the unbound man page to reduce fragmentation reassembly problems
edns-buffer-size: 1472

# Perform prefetching of close to expired message cache entries
# This only applies to domains that have been frequently queried
prefetch: yes

# One thread should be sufficient, can be increased on beefy machines. In reality for most users running on small networks or on a single machine, it should be unnecessary to seek performance enhancement by increasing num-threads above 1.
num-threads: 1

# Ensure kernel buffer is large enough to not lose messages in traffic spikes
so-rcvbuf: 1m

# Ensure privacy of local IP ranges
private-address: 192.168.0.0/16
private-address: 169.254.0.0/16
private-address: 172.16.0.0/12
private-address: 10.0.0.0/8
private-address: fd00::/8
private-address: fe80::/10
`;

            fs.writeFileSync(
                '/etc/unbound/unbound.conf.d/pi-hole.conf',
                unboundConfig,
                {
                    encoding: 'utf8'
                }
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to update create unbound configuration file`
                ),
                e
            );
            throw e;
        }

        try {
            shelljs.exec(`sleep 30s`);
            shelljs.exec(`sudo service unbound restart`);
            shelljs.exec(`sleep 5s`);
        } catch (e) {
            console.log(chalk.bgRedBright(`Error restarting unbound`), e);
            throw e;
        }
    }

    private runTests(): void {
        try {
            console.log(chalk.bgGreenBright(`Test recursive dns`));
            shelljs.exec(`dig pi-hole.net @127.0.0.1 -p 5335`);
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to test recursive dns`), e);
            throw e;
        }

        try {
            console.log(chalk.green(`Test DNSSec validation`));

            console.log(
                chalk.bgGreenBright(
                    `The output below should give a status report of SERVFAIL and no IP address.`
                )
            );
            shelljs.exec(`dig sigfail.verteiltesysteme.net @127.0.0.1 -p 5335`);

            console.log(
                chalk.bgGreenBright(
                    `The output below should give  NOERROR plus an IP address.`
                )
            );
            shelljs.exec(`dig sigok.verteiltesysteme.net @127.0.0.1 -p 5335`);
        } catch (e) {
            console.log(chalk.bgRedBright(`Failed to DNSSec tests`), e);
            throw e;
        }

        try {
            console.log(
                chalk.green(`Check if resolv.conf for unbound is disabled`)
            );
            shelljs.exec(`sudo systemctl status unbound-resolvconf.service`);
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to determine if unbound resolv.conf is disabled`
                ),
                e
            );
            throw e;
        }
    }

    private useUnbound(): void {
        console.log(
            chalk.bgGreenBright(
                `Updating pihole configuration to use unbound dns service`
            )
        );

        try {
            shelljs.exec(
                `sudo sed -i -e 's/PIHOLE_DNS_1=1.1.1.1/PIHOLE_DNS_1=127.0.0.1#5335/g' /etc/pihole/setupVars.conf`
            );

            shelljs.exec(
                `sudo sed -i '/PIHOLE_DNS_2=1.0.0.1/d' /etc/pihole/setupVars.conf`
            );
        } catch (e) {
            console.log(
                chalk.bgRedBright(`Failed to update pihole to use unbound`),
                e
            );
            throw e;
        }
    }

    private installTools(): void {
        try {
            console.log(chalk.bgGreenBright(`Installing pihole5-list-tool`));
            shelljs.exec(`sudo add-apt-repository -y ppa:deadsnakes/ppa`);
            shelljs.exec(`sudo apt-get -qq update`);
            shelljs.exec(`sudo apt-get -qq install -y python3.8`);
            shelljs.exec(`python3 --version`);
            shelljs.exec(
                `sudo apt-get -qq install -y python3-venv python3-pip`
            );
            shelljs.exec(`python3 -m pip --version`);
            shelljs.exec(`sudo -H pip3 install pihole5-list-tool`);
        } catch (e) {
            console.log(
                chalk.bgRedBright(
                    `Failed to determine if unbound resolv.conf is disabled`
                ),
                e
            );
            throw e;
        }
    }

    private escapeRegExp(input: unknown): string {
        const source =
            typeof input === 'string' || input instanceof String ? input : '';
        return source.replace(/[-[/\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    get instanceId(): string | undefined {
        return this._instanceId?.replace(/\r?\n|\r/g, '');
    }

    set instanceId(value: string | undefined) {
        this._instanceId = value;
    }

    get localHostName(): string | undefined {
        return this._localHostName?.replace(/\r?\n|\r/g, '');
    }

    set localHostName(value: string | undefined) {
        this._localHostName = value;
    }

    get localIpv4(): string | undefined {
        return this._localIpv4?.replace(/\r?\n|\r/g, '');
    }

    set localIpv4(value: string | undefined) {
        this._localIpv4 = value;
    }
}
