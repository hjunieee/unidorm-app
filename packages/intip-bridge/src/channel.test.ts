import { describe, expect, it, vi } from "vitest";
import { PlatformChannel, type Transport } from "./channel";
import { NativeToWeb, WebToNative } from "./messages";

/**
 * 두 채널을 메모리 상에서 교차 연결하는 한 쌍의 transport.
 * a.post -> b.inbound, b.post -> a.inbound 로 흘려보낸다.
 */
function makeLinkedTransports() {
  let aInbound: ((raw: string) => void) | null = null;
  let bInbound: ((raw: string) => void) | null = null;
  const a: Transport = {
    post: (raw) => queueMicrotask(() => bInbound?.(raw)),
    setInbound: (cb) => {
      aInbound = cb;
      return () => (aInbound = null);
    },
  };
  const b: Transport = {
    post: (raw) => queueMicrotask(() => aInbound?.(raw)),
    setInbound: (cb) => {
      bInbound = cb;
      return () => (bInbound = null);
    },
  };
  return { a, b };
}

describe("PlatformChannel", () => {
  it("delivers web -> native bridgeReady without a payload", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    native.on("bridgeReady", received);
    web.send("bridgeReady");

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
  });

  it("delivers a typed message web -> native with validated payload", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    native.on("navigateTo", received);

    web.send("navigateTo", { path: "/board/12", url: "https://intip.example/board/12" });

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual({
      path: "/board/12",
      url: "https://intip.example/board/12",
    });
  });

  it("delivers a typed message web -> native (goHome)", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    native.on("goHome", received);

    web.send("goHome", { path: "/home" });

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual({ path: "/home" });
  });

  it("delivers native -> web (receiveFcmToken)", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const onToken = vi.fn();
    web.on("receiveFcmToken", onToken);
    native.send("receiveFcmToken", "tok-123");

    await vi.waitFor(() => expect(onToken).toHaveBeenCalledWith("tok-123", expect.any(Object)));
  });

  it("delivers native -> web notificationOpened with the FCM message id", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    web.on("notificationOpened", received);
    native.send("notificationOpened", { fcmMessageId: 1234, path: "/posts/55" });

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual({ fcmMessageId: 1234, path: "/posts/55" });
  });

  it("delivers a typed message web -> native (navigateTo)", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    native.on("navigateTo", received);

    web.send("navigateTo", { path: "/board/12", url: "https://intip.example/board/12" });

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual({
      path: "/board/12",
      url: "https://intip.example/board/12",
    });
  });

  it("rejects an outgoing message that fails schema validation", () => {
    const { a } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    // url 이 빠진 잘못된 payload
    expect(() => web.send("navigateTo", { path: "/x" } as any)).toThrow(/schema validation/);
  });

  it("silently drops foreign inbound (non-protocol 'message')", async () => {
    const { a, b } = makeLinkedTransports();
    const onError = vi.fn();
    const native = new PlatformChannel(b, NativeToWeb, WebToNative, { onError });
    // a.post 는 b 의 inbound 로 감 -> native 가 받음
    a.post(JSON.stringify({ foo: "bar" }));

    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("isolates a throwing handler: siblings still run and the error goes to onError", async () => {
    const { a, b } = makeLinkedTransports();
    const onError = vi.fn();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative, { onError });

    const boom = new Error("handler blew up");
    const first = vi.fn(() => {
      throw boom;
    });
    const second = vi.fn();
    native.on("goBack", first);
    native.on("goBack", second);

    web.send("goBack");

    // 먼저 등록된 핸들러가 던져도 뒤의 핸들러는 계속 실행된다.
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    expect(first).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(boom, expect.any(String));
  });

  it("does not let a handler throw escape handleRaw", () => {
    // 웹에서 이 디스패치는 네이티브가 주입한 코드 안에서 동기 실행된다.
    // 예외가 새면 WebKit이 파일명·스택 없는 "Script error." 로 뭉개 디버깅이 불가능해진다.
    let inbound: ((raw: string) => void) | null = null;
    const transport: Transport = {
      post: () => {},
      setInbound: (cb) => {
        inbound = cb;
        return () => (inbound = null);
      },
    };
    const onError = vi.fn();
    const channel = new PlatformChannel(transport, NativeToWeb, WebToNative, { onError });
    channel.on("goBack", () => {
      throw new Error("handler blew up");
    });

    expect(() =>
      inbound!(JSON.stringify({ event: "goBack", v: 1 })),
    ).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it("delivers a typed message web -> native (syncTokenInfo)", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    native.on("syncTokenInfo", received);

    const tokenInfo = {
      accessToken: "access-123",
      accessTokenExpiredTime: "2025-01-22T23:25:47.754",
      refreshToken: "refresh-456",
      refreshTokenExpiredTime: "2025-02-22T23:25:47.754",
    };
    web.send("syncTokenInfo", tokenInfo);

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual(tokenInfo);
  });

  it("delivers a typed message native -> web (tokenInfoUpdated)", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    web.on("tokenInfoUpdated", received);

    const tokenInfo = {
      accessToken: "access-789",
      accessTokenExpiredTime: "2025-01-23T00:00:00.000",
      refreshToken: "refresh-999",
      refreshTokenExpiredTime: "2025-02-23T00:00:00.000",
    };
    native.send("tokenInfoUpdated", tokenInfo);

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual(tokenInfo);
  });

  it("supports request/reply correlation by id", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    native.on("requestAppUpdate", (_value, msg) => {
      native.reply(msg, "navigate", "/updated");
    });

    const res = await web.request("requestAppUpdate");
    expect(res).toMatchObject({ event: "navigate", value: "/updated" });
  });

  it("round-trips checkBack -> backResult with the request's id", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    // 웹: 닫을 오버레이가 있으면 소비했다고 응답한다.
    web.on("checkBack", (_value, msg) => {
      web.reply(msg, "backResult", { handled: true });
    });

    const res = await native.request("checkBack");
    expect(res).toMatchObject({ event: "backResult", value: { handled: true } });
  });

  it("delivers backResult(handled: false) so native can pop the screen", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    web.on("checkBack", (_value, msg) => {
      web.reply(msg, "backResult", { handled: false });
    });

    const res = await native.request("checkBack");
    expect(res).toMatchObject({ event: "backResult", value: { handled: false } });
  });

  it("round-trips share -> shareResult with the request's id", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    native.on("share", (value, msg) => {
      expect(value).toEqual({ url: "https://intip.example/board/12", title: "게시글" });
      native.reply(msg, "shareResult", {
        status: "shared",
        activityType: "com.apple.UIKit.activity.Mail",
      });
    });

    // share 는 OS 시트 응답을 기다리므로 기본 10s 대신 넉넉한 override 를 준다.
    const res = await web.requestWithOptions(
      "share",
      { timeoutMs: 5 * 60_000 },
      { url: "https://intip.example/board/12", title: "게시글" },
    );
    expect(res).toMatchObject({
      event: "shareResult",
      value: { status: "shared", activityType: "com.apple.UIKit.activity.Mail" },
    });
  });

  it("delivers native -> web bridgeCapabilities", async () => {
    const { a, b } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    const native = new PlatformChannel(b, NativeToWeb, WebToNative);

    const received = vi.fn();
    web.on("bridgeCapabilities", received);
    native.send("bridgeCapabilities", { protocol: 1, features: ["share", "checkBack"] });

    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]?.[0]).toEqual({ protocol: 1, features: ["share", "checkBack"] });
  });

  it("rejects an outgoing share message with an invalid url", () => {
    const { a } = makeLinkedTransports();
    const web = new PlatformChannel(a, WebToNative, NativeToWeb);
    expect(() => web.send("share", { url: "not-a-url" } as any)).toThrow(/schema validation/);
  });

  describe("requestWithOptions per-request timeout override", () => {
    it("does not time out at the default 10s when a longer override is given", async () => {
      vi.useFakeTimers();
      try {
        const { a, b } = makeLinkedTransports();
        const web = new PlatformChannel(a, WebToNative, NativeToWeb);
        const native = new PlatformChannel(b, NativeToWeb, WebToNative);

        // 사용자가 공유 시트를 12초 뒤에 닫았다고 가정 — 기본 10s 라면 이미
        // reject 되었을 시점이다.
        native.on("share", (_value, msg) => {
          setTimeout(() => {
            native.reply(msg, "shareResult", { status: "dismissed" });
          }, 12_000);
        });

        const promise = web.requestWithOptions(
          "share",
          { timeoutMs: 60_000 },
          { url: "https://intip.example" },
        );

        await vi.advanceTimersByTimeAsync(12_000);
        const res = await promise;
        expect(res).toMatchObject({ event: "shareResult", value: { status: "dismissed" } });
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects before the default 10s when a short override is given", async () => {
      vi.useFakeTimers();
      try {
        const { a } = makeLinkedTransports();
        const web = new PlatformChannel(a, WebToNative, NativeToWeb);

        const promise = web.requestWithOptions(
          "share",
          { timeoutMs: 2_000 },
          { url: "https://intip.example" },
        );
        const assertion = expect(promise).rejects.toThrow(/timed out/);

        await vi.advanceTimersByTimeAsync(2_001);
        await assertion;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
