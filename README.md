# openvpn-access-server-scripts

A node module that holds a collection of scripts that will be used by EC2 instances spawned in the [openvpn-access-server-infra](https://github.com/pejulian/openvpn-access-server-infra) infrastructure deployment to complete the setup of OpenVPN Access Server and PiHole.

## Usage

To run the OpenVPN script:

```bash
npx openvpn-access-server-scripts setup-openvpn -d domain.foo-bar.com -e foo@bar.com -b foo-bar-bucket -r us-east-1 
```

To run the PiHole script:

```bash
npx openvpn-access-server-scripts setup-pihole
```

## Available Functions

### `setup-openvpn`

This function:

1. sets up open vpn with a default client user
2. optionally sets up open vpn with an upstream dns server (if `-i, --ip` is defined)
3. registers an SSL certificate via Lets Encrypt for the OpenVPN Access Server web interface so that it can be properly accessed via HTTPS.

After requesting a new certificate, this function will store the generated certificate in an S3 bucket for reuse. This is because there's a rate limit of 5 certificates for the same domain name per week. If a certificate already exists, this function will get those artifacts and reuse them when assigning the certificate to OpenVPN Access Server. 

| Option             | Required           | Description                                             |
| ------------------ | ------------------ | ------------------------------------------------------- |
| -i --ip            | :x:                | The private ip address of the upstream dns ec2 instance |
| -d --domain-name   | :heavy_check_mark: | The FQDN to be used for certificate registration        |
| -e --email         | :heavy_check_mark: | The email to use for certificate registration           |
| -b --bucket        | :heavy_check_mark: | The S3 Bucket to store/obtain certificate artifacts     |
| -r --region        | :heavy_check_mark: | The AWS region for the S3 SDK client to use             |
| -u --user-name     | :heavy_check_mark: | The default vpn client username                         |
| -p --user-password | :heavy_check_mark: | The default vpn client password                         |

### `setup-pihole`



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