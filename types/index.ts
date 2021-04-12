/**
 * Options to be used when running setup for OpenVPN Access Server
 */
export type SetupOpenVpnOptions = {
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
     * The S3 Bucket name to store certificates
     */
    readonly bucket: string;
    /**
     * The AWS region
     */
    readonly region: string;
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
export type SetupPiHoleOptions = {
    /**
     * Pi Hole Web UI admin password
     */
    readonly password: string;
    /**
     * The AWS region
     */
    readonly region: string;
};
