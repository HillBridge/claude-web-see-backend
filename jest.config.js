/**
 * Jest 配置(NestJS 官方默认方案:ts-jest)。
 * 仅跑 src 下的 *.spec.ts 单元测试;不连真实 DB/Redis/MinIO,不起 HTTP 服务。
 * moduleNameMapper 与 tsconfig.json 的 paths 保持一致,使测试内别名 import 可解析。
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  // 覆盖率报告输出到项目根的 coverage/(而非 src/ 内,避免污染源码目录)
  coverageDirectory: "<rootDir>/../coverage",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    "^@common/(.*)$": "<rootDir>/common/$1",
    "^@modules/(.*)$": "<rootDir>/modules/$1",
    "^@shared/(.*)$": "<rootDir>/shared/$1",
    "^@config/(.*)$": "<rootDir>/config/$1",
    "^@logger/(.*)$": "<rootDir>/shared/logger/$1",
    // 排除真实的 npm 包 @prisma/client,只把项目内部别名 @prisma/xxx 指向 src/shared/prisma
    "^@prisma/(?!client)(.*)$": "<rootDir>/shared/prisma/$1",
    "^@/(.*)$": "<rootDir>/$1",
  },
};
