import chalk from 'chalk';
import { AutoScaling } from 'aws-sdk';

/**
 * Proceed with the auto scaling group "continue" lifecycle hook
 * @param autoscalingClient The SDK client for auto scaling
 * @param autoScalingGroupName The ASG name
 * @param lifecycleHookName The Lifecyle hook name
 * @param lifecycleActionToken  The token
 * @param instanceId The EC2 instance id
 */
export const continueLifecycle = async (
    autoscalingClient: AutoScaling,
    autoScalingGroupName: string,
    lifecycleHookName: string,
    lifecycleActionToken: string,
    instanceId: string
): Promise<void> => {
    try {
        const params = {
            AutoScalingGroupName: autoScalingGroupName,
            LifecycleActionResult: 'CONTINUE',
            LifecycleHookName: lifecycleHookName,
            InstanceId: instanceId,
            LifecycleActionToken: lifecycleActionToken
        };

        console.log(
            chalk.cyanBright('Continuing lifecycle with params'),
            JSON.stringify(params, undefined, 4)
        );

        const result = await autoscalingClient
            .completeLifecycleAction(params)
            .promise();

        console.log(
            chalk.greenBright(`Triggered lifecycle action!`),
            JSON.stringify(result, undefined, 4)
        );
    } catch (e) {
        console.log(chalk.redBright(`Failed to trigger lifecycle action`), e);
        throw e;
    }
};
