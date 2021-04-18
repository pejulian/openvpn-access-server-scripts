import fs from 'fs';
import chalk from 'chalk';

/**
 * Obtains a file on the filesystem according to the given path
 * @param path The path to the file
 * @returns The content of the file
 */
export const getFile = (path: string): string | undefined => {
    try {
        if (fs.existsSync(path)) {
            return fs.readFileSync(path, {
                encoding: 'utf8'
            });
        } else {
            console.log(
                chalk.yellowBright(`${path} does not exist in specified path`)
            );
            return undefined;
        }
    } catch (e) {
        console.log(chalk.bgRedBright(`Failed to read ${path}`), e);
        return undefined;
    }
};

/**
 * Writes the given content to a file on the given path
 * @param content The content of the file
 * @param path The path to write the file to
 * @param encoding The encoding to use when writing the file (defaults to utf8 if not supplied)
 */
export const writeToFile = (
    content: string,
    path: string,
    encoding: BufferEncoding = 'utf8'
): void => {
    try {
        fs.writeFileSync(path, content, {
            encoding
        });
    } catch (e) {
        console.log(
            chalk.bgRedBright(`Failed to write given content to ${path}`)
        );
        throw e;
    }
};
