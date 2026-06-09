import Transport = require('winston-transport');
import { PrismaService } from '../prisma/prisma.service';

/**
 * winston transport:把日志写入 system_logs 表,供管理端 /api/logs 查看。
 *
 * 设计要点:
 * - 只持久化 warn 及以上(由 transport 的 level 选项控制),控制写入量;
 * - 复用 DI 的 PrismaService(守住"全局唯一 DB 访问点"),不另起 PrismaClient;
 * - 写库失败只走 console.error,**绝不再经 winston**,否则会递归(写日志失败→记日志→再写库→…)。
 */
export class DbLogTransport extends Transport {
  constructor(
    private readonly prisma: PrismaService,
    opts?: Transport.TransportStreamOptions,
  ) {
    super(opts);
  }

  log(info: any, callback: () => void): void {
    // winston 约定:异步 transport 需 emit('logged') 并调用 callback
    setImmediate(() => this.emit('logged', info));

    const level = String(info?.level ?? '');
    const context = info?.context ? String(info.context).slice(0, 100) : null;
    const message =
      typeof info?.message === 'string'
        ? info.message
        : JSON.stringify(info?.message ?? '');

    this.prisma.systemLog
      .create({ data: { level, context, message } })
      .catch((e: any) => {
        // 写日志库失败只能用 console;若再经 winston 会触发递归
        // eslint-disable-next-line no-console
        console.error('[DbLogTransport] 写系统日志失败:', e?.message);
      });

    callback();
  }
}
