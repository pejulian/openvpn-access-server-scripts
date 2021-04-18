# openvpn-access-server-scripts

A node module that holds a collection of scripts that will be used by EC2 instances spawned in the [openvpn-access-server-infra](https://github.com/pejulian/openvpn-access-server-infra) infrastructure deployment to complete the setup of OpenVPN Access Server and PiHole.

> Scripts in this module are not standalone. They are built specifically to run based on infrastructure that has been set up in `openvpn-access-server-infra`. Usage of these scripts beyond that context may not have desired results.

## Usage

Example to run the OpenVPN script:

```bash
npx openvpn-access-server-scripts setup-openvpn -i 1.0.0.1 -h my.vpn.foo-bar.com -d my.vpn.foo-bar.com -e foo@bar.com -b foo-bar-bucket -r ap-southeast-1 -u user -p 123@abc -c staging
```

1. `-i`: An optional option to specify an upstream DNS server (in this context, the server that Pi Hole is running on) so that OpenVPN will forward traffic to this upstream DNS for further processing

Example to run the PiHole script:

```bash
npx openvpn-access-server-scripts setup-pihole -r ap-southeast-1 -p abc!@123
```
## Available Functions

### `setup-openvpn`

This function:

1. sets up open vpn with a default client user
2. optionally sets up open vpn with an upstream dns server (if `-i, --ip` is defined)
3. registers an SSL certificate via Lets Encrypt for the OpenVPN Access Server web interface so that it can be properly accessed via HTTPS.

After requesting a new certificate, this function will store the generated certificate in an S3 bucket for reuse. This is because there's a rate limit of 5 certificates for the same domain name per week. If a certificate already exists, this function will get those artifacts and reuse them when assigning the certificate to OpenVPN Access Server. 

| Option                | Required           | Description                                                                                              |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| -i --ip               | :x:                | The private ip address of the upstream dns ec2 instance                                                  |
| -c --cert-environment | :x:                | Which environment should be used when requesting SSL cert from Lets Encrypt (staging, production)        |
| -h --host-name        | :heavy_check_mark: | The FQDN (or public) address that will be the host of this VPN Access Server that vpn clients connect to |
| -d --domain-name      | :heavy_check_mark: | The FQDN to be used for certificate registration                                                         |
| -e --email            | :heavy_check_mark: | The email to use for certificate registration                                                            |
| -r --region           | :heavy_check_mark: | The AWS region for the S3 SDK client to use                                                              |
| -b --bucket-name      | :heavy_check_mark: | The S3 Bucket to store/obtain certificate artifacts                                                      |
| -u --user-name        | :heavy_check_mark: | The default vpn client username                                                                          |
| -p --user-password    | :heavy_check_mark: | The default vpn client password (special characters need to be handled before they are passed here)      |
### `setup-pihole`

Installs Pi Hole as a DNS server for Ad Blocking and sets up Unbound to serve as a recursive DNS service.
Also installs some additional tooling to enhance Pi Hole functionality.

 | Option        | Required           | Description                                                                                            |
 | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
 | -r --region   | :heavy_check_mark: | The AWS region for the S3 SDK client to use                                                            |
 | -p --password | :heavy_check_mark: | The pi hole web interface password (special characters need to be handled before they are passed here) |


### `backup-ssl-cert`

Takes a backup of existing SSL certs in the relevant Lets Encrypt directory when the host ec2 instance is being terminated so that it can be reused when a new Open VPN instance is created by the Auto Scaling Group.


 | Option                       | Required           | Description                                                                                                    |
 | ---------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
 | -d --domain-name             | :heavy_check_mark: | The FQDN to be used for certificate registration                                                               |
 | -r --region                  | :heavy_check_mark: | The AWS region for the S3 SDK client to use                                                                    |
 | -b --bucket-name             | :heavy_check_mark: | The S3 Bucket to store/obtain certificate artifacts                                                            |
 | -a --auto-scaling-group-name | :heavy_check_mark: | The name of the auto scaling group that triggers lifecycle events impacting the ec2 instance with the ssl cert |
 | -l --lifecycle-hook-name     | :heavy_check_mark: | The name of the lifecycle hook that triggers this script                                                       |
 | -t --lifecycle-action-token  | :heavy_check_mark: | The lifecycle action token (a unique id generated for lifecyle events)                                         |


## Publishing

A note about versions:

> Versioning follows semantic versioning. 

`semver` is installed to help with this.

To create a beta release:

```bash
npm run publish:beta
```

To create a `patch` release:

```bash
npm run publish
```