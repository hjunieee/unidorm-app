/**
 * Shared types for the hooks `WebViewContainer` is composed from. Each hook
 * owns one concern (bridge handlers, root lifecycle, nav intents, token sync,
 * injected scripts, …); the container wires them together.
 */
import type { RefObject } from "react";
import type WebView from "react-native-webview";

import type { createNativeChannel } from "../../../packages/unidorm-bridge/src/adapters/native";

/** The container's single WebView ref, shared by every hook. */
export type WebViewRef = RefObject<WebView | null>;

/** The PlatformChannel bridge `WebViewContainer` builds over its WebView. */
export type NativeBridge = ReturnType<typeof createNativeChannel>;
