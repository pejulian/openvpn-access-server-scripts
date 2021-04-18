import * as AWS from 'aws-sdk';
import chalk from 'chalk';

/**
 * Determines if object identified by given key exists in given bucket
 * @param s3Client The s3 aws sdk client that will perform the operation
 * @param Bucket The bucket name
 * @param Key The key to the object
 * @returns {boolean} true when key exists, false otherwise
 */
export const objectExists = async (
    s3Client: AWS.S3,
    Bucket: string,
    Key: string
): Promise<boolean> => {
    try {
        await s3Client
            .headObject({
                Bucket,
                Key
            })
            .promise();
        return true;
    } catch (e) {
        console.log(
            chalk.bgRedBright(`${Key} not found in s3 bucket ${Bucket}`)
        );
        return false;
    }
};

/**
 * Gets an object by its key from the given bucket
 * @param s3Client The s3 aws sdk client that will perform the operation
 * @param Bucket The bucket name
 * @param Key The key to the object
 * @returns {string} The file content
 */
export const getObject = async (
    s3Client: AWS.S3,
    Bucket: string,
    Key: string
): Promise<string> => {
    try {
        const response = await s3Client
            .getObject({
                Bucket,
                Key
            })
            .promise();

        if (typeof response.Body === 'undefined') {
            throw new Error(`Body of ${Key} is undefined`);
        }

        return response.Body?.toString('utf-8');
    } catch (e) {
        console.log(
            chalk.bgRedBright(`Failed to get ${Key} from s3 bucket ${Bucket}`)
        );
        throw e;
    }
};

/**
 * Puts object specified by given key in given bucket
 * @param s3Client The s3 aws sdk client that will perform the operation
 * @param Bucket The bucket name
 * @param Key The key to the object
 */
export const putObject = async (
    s3Client: AWS.S3,
    Bucket: string,
    Key: string,
    Body: Buffer | string
): Promise<void> => {
    try {
        await s3Client
            .putObject({
                Bucket,
                Key,
                Body
            })
            .promise();
    } catch (e) {
        console.log(
            chalk.bgRedBright(
                `Failed to put object ${Key} in s3 bucket ${Bucket}`
            )
        );
        throw e;
    }
};
