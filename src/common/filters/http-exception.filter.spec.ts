import {
  HttpException,
  HttpStatus,
  BadRequestException,
  ArgumentsHost,
} from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

/**
 * HttpExceptionFilter 单元测试 —— 全局响应契约:**无论何种异常都返回 HTTP 200**,
 * 业务状态码放进 body.code。改坏会让所有前端解析出错。
 */
function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: "GET", url: "/x" }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makeFilter() {
  const logger = { error: jest.fn() } as any;
  return new HttpExceptionFilter(logger);
}

describe("HttpExceptionFilter", () => {
  it("始终以 HTTP 200 响应,body.code 携带业务状态码", () => {
    const { host, status, json } = makeHost();
    makeFilter().catch(new BadRequestException("坏请求"), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe(400);
    expect(body.message).toBe("坏请求");
    expect(body).toHaveProperty("timestamp");
  });

  it("class-validator 校验失败(message 为数组)→ message=参数校验失败,data=errors", () => {
    const { host, json } = makeHost();
    const ex = new BadRequestException({
      message: ["字段A 必填", "字段B 非法"],
      error: "Bad Request",
      statusCode: 400,
    });
    makeFilter().catch(ex, host);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe("参数校验失败");
    expect(body.data).toEqual(["字段A 必填", "字段B 非法"]);
  });

  it("HttpException 字符串响应 → 直接作为 message", () => {
    const { host, json } = makeHost();
    makeFilter().catch(
      new HttpException("禁止访问", HttpStatus.FORBIDDEN),
      host,
    );
    const body = json.mock.calls[0][0];
    expect(body.code).toBe(403);
    expect(body.message).toBe("禁止访问");
  });

  it("普通 Error(非 HttpException)→ 500 + 错误 message", () => {
    const { host, json } = makeHost();
    makeFilter().catch(new Error("炸了"), host);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe(500);
    expect(body.message).toBe("炸了");
  });

  it("未知非 Error 异常 → 500 + 默认 message", () => {
    const { host, json } = makeHost();
    makeFilter().catch("字符串异常", host);
    const body = json.mock.calls[0][0];
    expect(body.code).toBe(500);
    expect(body.message).toBe("Internal server error");
  });
});
