export type SetupOpenVpnOptions = {
    readonly ip?: string;
    readonly elasticIp: string;
    readonly domainName: string;
    readonly email: string;
    readonly bucket: string;
    readonly region: string;
    readonly userName: string;
    readonly userPassword: string
    readonly certEnvironment?: 'production' | 'staging';
};

export type SetupPiHoleOptions = {
    readonly password: string;
    readonly region: string;
}