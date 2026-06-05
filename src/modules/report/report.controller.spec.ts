import { ReportController } from "./report.controller";

/**
 * ReportController 单元测试 —— 唯一对外数据入口,承载:
 *   - 必填(type/apikey)+ 体积兜底校验,无效/超限静默丢弃(返回 200 不写库);
 *   - sendBeacon text/plain 场景下从 req.rawBody 兜底解析 JSON;
 *   - 业务异常转 500。
 * mock 掉 ReportService.handleReport,只验证 controller 的接收/校验/分发行为。
 */
function makeController(handleReport = jest.fn().mockResolvedValue(undefined)) {
  const service = { handleReport } as any;
  return { controller: new ReportController(service), handleReport };
}

const VALID = { type: "error", apikey: "k", message: "boom" };

describe("ReportController.reportData", () => {
  it("合法上报 → 调用 handleReport 并返回 200", async () => {
    const { controller, handleReport } = makeController();
    const res = await controller.reportData(VALID as any, {} as any);
    expect(handleReport).toHaveBeenCalledWith(VALID);
    expect(res).toEqual({ code: 200, message: "上报成功" });
  });

  it("缺 type → 静默丢弃(返回 200,不写库)", async () => {
    const { controller, handleReport } = makeController();
    const res = await controller.reportData({ apikey: "k" } as any, {} as any);
    expect(handleReport).not.toHaveBeenCalled();
    expect(res).toEqual({ code: 200, message: "上报成功" });
  });

  it("缺 apikey → 静默丢弃", async () => {
    const { controller, handleReport } = makeController();
    await controller.reportData({ type: "error" } as any, {} as any);
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("events 超过 8MB → 静默丢弃", async () => {
    const { controller, handleReport } = makeController();
    const big = "a".repeat(8 * 1024 * 1024 + 1);
    await controller.reportData(
      { type: "recordScreen", apikey: "k", events: big } as any,
      {} as any,
    );
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("message 超过 10000 → 静默丢弃", async () => {
    const { controller, handleReport } = makeController();
    await controller.reportData(
      { type: "error", apikey: "k", message: "m".repeat(10001) } as any,
      {} as any,
    );
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("breadcrumb 数组超过 500 → 静默丢弃", async () => {
    const { controller, handleReport } = makeController();
    await controller.reportData(
      {
        type: "error",
        apikey: "k",
        breadcrumb: new Array(501).fill({}),
      } as any,
      {} as any,
    );
    expect(handleReport).not.toHaveBeenCalled();
  });

  it("body 为空时从 req.rawBody 兜底解析 JSON(sendBeacon text/plain)", async () => {
    const { controller, handleReport } = makeController();
    const req: any = { rawBody: Buffer.from(JSON.stringify(VALID)) };
    const res = await controller.reportData({} as any, req);
    expect(handleReport).toHaveBeenCalledWith(VALID);
    expect(res).toEqual({ code: 200, message: "上报成功" });
  });

  it("rawBody 为非法 JSON → 返回 200 不抛(静默)", async () => {
    const { controller, handleReport } = makeController();
    const req: any = { rawBody: Buffer.from("not-json{") };
    const res = await controller.reportData({} as any, req);
    expect(handleReport).not.toHaveBeenCalled();
    expect(res).toEqual({ code: 200, message: "上报成功" });
  });

  it("handleReport 抛错 → 返回 500 与错误信息", async () => {
    const { controller } = makeController(
      jest.fn().mockRejectedValue(new Error("db down")),
    );
    const res = await controller.reportData(VALID as any, {} as any);
    expect(res).toEqual({ code: 500, message: "上报失败", error: "db down" });
  });
});
