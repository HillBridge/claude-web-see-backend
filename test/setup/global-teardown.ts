/** Jest 全局 teardown：销毁所有容器。 */
import { stopInfra } from './containers';

export default async function globalTeardown(): Promise<void> {
  await stopInfra();
}
