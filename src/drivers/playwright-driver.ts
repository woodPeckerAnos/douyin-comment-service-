import path from "node:path";
import fs from "node:fs/promises";
import {
  chromium,
  type BrowserContext,
  type Page,
  type Response,
} from "playwright-core";
import { getConfig } from "../config.js";
import { clearStaleProfileLocks, assertProfileAvailable } from "../utils/profile-lock.js";
import { logProgress } from "../utils/logger.js";

const AUTH_STATE_FILE = "auth-state.json";

export type ResponseHandler = (response: Response) => void | Promise<void>;

export interface ScrollResult {
  scrolled: boolean;
  target: string;
  detail: string;
}

export class PlaywrightDriver {
  private context!: BrowserContext;
  private page!: Page;
  private responseHandlers = new Set<ResponseHandler>();
  private boundResponseHandler: ((response: Response) => void) | null = null;
  private closed = false;

  private constructor(private readonly profileDir: string) {}

  static async create(): Promise<PlaywrightDriver> {
    const config = getConfig();
    const driver = new PlaywrightDriver(config.browserProfilePath);
    await driver.init(config.HEADLESS, config.BROWSER_CHANNEL || undefined);
    return driver;
  }

  private async init(headless: boolean, channel?: string): Promise<void> {
    await fs.mkdir(this.profileDir, { recursive: true });
    const cleared = await clearStaleProfileLocks(this.profileDir);
    if (cleared) {
      logProgress("已清理残留的 Chrome Profile 锁文件");
    }
    await assertProfileAvailable(this.profileDir);

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless,
      channel,
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--remote-debugging-port=0",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());

    this.boundResponseHandler = (response: Response) => {
      for (const handler of this.responseHandlers) {
        void handler(response);
      }
    };
    this.context.on("response", this.boundResponseHandler);
    this.page.on("response", this.boundResponseHandler);
  }

  getProfileDir(): string {
    return this.profileDir;
  }

  getAuthStatePath(): string {
    return path.join(this.profileDir, AUTH_STATE_FILE);
  }

  async saveAuthState(): Promise<void> {
    await this.context.storageState({ path: this.getAuthStatePath() });
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      const hasSessionCookie = async (): Promise<boolean> => {
        const cookies = await this.context.cookies("https://www.douyin.com");
        return cookies.some(
          (cookie) => cookie.name === "sessionid" && Boolean(cookie.value),
        );
      };

      if (await hasSessionCookie()) {
        return true;
      }

      await this.goto("https://www.douyin.com/");
      await this.wait(2000);

      if (await hasSessionCookie()) {
        return true;
      }

      return await this.page.evaluate(`() => {
        const avatar = document.querySelector(
          '[data-e2e="user-avatar"], [class*="avatar"][class*="user"], a[href*="/user/"]'
        );
        if (avatar) return true;
        const loginBtn = document.querySelector('[data-e2e="login-button"], [class*="login"]');
        return !loginBtn;
      }`);
    } catch {
      return false;
    }
  }

  onResponse(handler: ResponseHandler): void {
    this.responseHandlers.add(handler);
  }

  offResponse(handler: ResponseHandler): void {
    this.responseHandlers.delete(handler);
  }

  async scroll(deltaY = 800): Promise<void> {
    await this.scrollForMoreComments();
    await this.page.mouse.wheel(0, deltaY);
  }

  /**
   * PC 视频页：评论在 route-scroll-container 内随页面滚动。
   * 优先滚到最后一条 comment-item，再在容器上 dispatch wheel。
   */
  async scrollForMoreComments(): Promise<ScrollResult> {
    const commentItems = this.page.locator(
      '[data-e2e="comment-list"] [data-e2e="comment-item"]',
    );
    const itemCount = await commentItems.count();

    if (itemCount > 0) {
      try {
        const targetIndex = Math.max(itemCount - 1, 0);
        await commentItems.nth(targetIndex).scrollIntoViewIfNeeded();
        await this.wait(400);
      } catch {
        // ignore
      }
    }

    const route = this.page
      .locator(".parent-route-container.route-scroll-container")
      .first();

    let containerMetrics = {
      found: false,
      className: "",
      before: 0,
      after: 0,
      scrollHeight: 0,
      clientHeight: 0,
    };

    if ((await route.count()) > 0) {
      containerMetrics = await route.evaluate((container) => {
        const before = container.scrollTop;
        const step = Math.max(container.clientHeight * 0.65, 480);
        container.scrollTop = Math.min(
          container.scrollTop + step,
          container.scrollHeight,
        );
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
        return {
          found: true,
          className: container.className,
          before,
          after: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
        };
      });
    }

    let scrolled =
      containerMetrics.found && containerMetrics.after > containerMetrics.before;

    if (!scrolled && (await route.count()) > 0) {
      const box = await route.boundingBox();
      if (box) {
        await this.page.mouse.move(
          box.x + box.width / 2,
          box.y + Math.min(box.height * 0.7, box.height - 20),
        );
        await this.page.mouse.wheel(0, 900);
        scrolled = true;
      }
    }

    if (!scrolled) {
      const windowScroll = await this.evaluate<{ before: number; after: number }>(
        `() => {
          const before = window.scrollY || document.documentElement.scrollTop;
          window.scrollBy(0, 700);
          const after = window.scrollY || document.documentElement.scrollTop;
          return { before, after };
        }`,
      );
      if (windowScroll.after > windowScroll.before) {
        scrolled = true;
        containerMetrics = {
          ...containerMetrics,
          found: true,
          className: "window",
          before: windowScroll.before,
          after: windowScroll.after,
        };
      }
    }

    if (!scrolled) {
      const commentList = this.page.locator('[data-e2e="comment-list"]').first();
      if ((await commentList.count()) > 0) {
        await commentList.click({ position: { x: 10, y: 10 } }).catch(() => undefined);
      }
      await this.page.keyboard.press("PageDown");
      scrolled = true;
      containerMetrics.className = containerMetrics.className || "keyboard";
    }

    const detail = containerMetrics.found
      ? `domItems=${itemCount}, scrollTop ${containerMetrics.before}->${containerMetrics.after}, sh=${containerMetrics.scrollHeight}, ch=${containerMetrics.clientHeight}`
      : `domItems=${itemCount}, used fallback scroll`;

    return {
      scrolled,
      target: containerMetrics.found
        ? containerMetrics.className.split(" ").slice(0, 3).join(".")
        : "fallback",
      detail,
    };
  }

  /** @deprecated 使用 scrollForMoreComments */
  async scrollMainContainer(): Promise<{ scrolled: boolean; target: string }> {
    const result = await this.scrollForMoreComments();
    return { scrolled: result.scrolled, target: result.target };
  }

  async scrollToCommentSection(): Promise<void> {
    const commentList = this.page.locator('[data-e2e="comment-list"]').first();
    if ((await commentList.count()) > 0) {
      await commentList.scrollIntoViewIfNeeded();
      return;
    }

    const icon = this.page.locator('[data-e2e="feed-comment-icon"]').first();
    if ((await icon.count()) > 0) {
      await icon.scrollIntoViewIfNeeded();
    }
  }

  async openCommentPanel(): Promise<void> {
    await this.scrollToCommentSection();
    await this.wait(1000);

    // PC 详情页评论区通常已内嵌展示，无需点击弹层
    const commentList = this.page.locator('[data-e2e="comment-list"]');
    if ((await commentList.count()) === 0) {
      const icon = this.page.locator('[data-e2e="feed-comment-icon"]').first();
      if ((await icon.count()) > 0) {
        await icon.click();
        await this.wait(800);
      }
    }
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async evaluate<T>(script: string): Promise<T> {
    return this.page.evaluate(script) as Promise<T>;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.boundResponseHandler) {
      this.page.off("response", this.boundResponseHandler);
      this.context.off("response", this.boundResponseHandler);
    }
    this.responseHandlers.clear();

    try {
      await this.saveAuthState();
    } catch {
      // storageState 失败不阻断关闭
    }

    try {
      await this.context.close();
    } catch {
      // ignore
    }
  }
}
