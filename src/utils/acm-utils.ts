import * as AWS from 'aws-sdk';
import chalk from 'chalk';

/**
 * List and then find matching certificate by its domainame
 * @param domainName The domain name to filter certificates by
 * @returns
 */
export const getCertificate = async (
    client: AWS.ACM,
    domainName: string
): Promise<AWS.ACM.CertificateSummary | undefined> => {
    try {
        const result = await client.listCertificates({}).promise();

        console.log(
            chalk.greenBright(
                `ACM certificate list`,
                JSON.stringify(result, undefined, 4)
            )
        );

        const match = result.CertificateSummaryList?.find(
            (certificateSummary) => {
                if (certificateSummary.DomainName === domainName) {
                    return true;
                }
                return false;
            }
        );

        if (typeof match === 'undefined') {
            console.log(chalk.yellowBright(`No matching certificates found!`));
        }

        return match;
    } catch (e) {
        console.log(chalk.bgRedBright(`Failed to list certificates in ACM`), e);
        return undefined;
    }
};
