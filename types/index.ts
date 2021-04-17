export type BaseOptions = {
    /**
     * The AWS region
     */
    readonly region: string;
};

/**
 * Options to be used when running setup for OpenVPN Access Server
 */
export type SetupOpenVpnOptions = BaseOptions & {
    readonly ip?: string;
    /**
     * FQDN to use as OpenVPN Access Server Host Name
     */
    readonly hostName: string;
    /**
     * Domain name to be used for Let's Encrypt certificate registration
     */
    readonly domainName: string;
    /**
     * The email to be used for Let's Encrypy certificate registration
     */
    readonly email: string;
    /**
     * The default client username to be created
     */
    readonly userName: string;
    /**
     * The default client password to be created
     */
    readonly userPassword: string;
    /**
     * The certificate environment (staging for testing, production for actual long term use)
     */
    readonly certEnvironment?: 'production' | 'staging';
};

/**
 * Options to be used when running setup for Pi Hole
 */
export type SetupPiHoleOptions = BaseOptions & {
    /**
     * Pi Hole Web UI admin password
     */
    readonly password: string;
};

/**
 * Options to be used when running backup for Lets Encrypt backup cert
 */
export type BackupSslCertOptions = BaseOptions & {
    /**
     * Domain name to be used for Let's Encrypt certificate registration
     */
    readonly domainName: string;
    /**
     * The name of the auto scaling group where lifecycle operations are being triggered
     */
    readonly autoScalingGroupName: string,
    /**
     * The lifecycle hook name
     */
    readonly lifecycleHookName: string,
    /**
     * The lifecycle token (needed for completing the hook)
     */
    readonly lifecycleActionToken: string,
};

export interface IScriptable {
    run(): void;
}
