export const CHATGPT_DOM = Object.freeze({
  newChat: 'a[data-testid="create-new-chat-button"][href="/"]',
  composer: 'form[data-type="unified-composer"]',
  prompt:
    'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"][role="textbox"]',
  upload:
    'form[data-type="unified-composer"] input#upload-files[type="file"][multiple]',
  attach:
    'form[data-type="unified-composer"] button#composer-plus-btn[data-testid="composer-plus-btn"]',
  modelTrigger:
    'form[data-type="unified-composer"] button[aria-haspopup="menu"]',
  chatModeRadio: '[role="radio"]',
  capabilitySlider: '[role="slider"]',
  checkedModel: '[role="menuitemradio"][aria-checked="true"]',
  proModel: '[role="menuitemradio"]',
  send:
    'form[data-type="unified-composer"] button#composer-submit-button[data-testid="send-button"]',
  stop: 'button#composer-submit-button[data-testid="stop-button"]',
  thinking: ".loading-shimmer-tertiary",
});

export async function probeChatGptDom(tab, options = {}) {
  const expectedModel = options.expectedModel || "Pro";
  return tab.playwright.evaluate(
    ({ selectors, expected }) => {
      const visible = (element) =>
        !!element && element.getClientRects().length > 0;
      const main = document.querySelector("main");
      const composer = document.querySelector(selectors.composer);
      const modelTriggers = Array.from(
        document.querySelectorAll(selectors.modelTrigger),
      ).filter(
        (element) =>
          visible(element) &&
          element.id !== "composer-plus-btn" &&
          element.getAttribute("data-testid") !== "composer-plus-btn",
      );
      const modelTrigger =
        modelTriggers.find(
          (element) => (element.textContent || "").trim() === expected,
        ) || modelTriggers.at(-1) || null;
      const checkedModels = Array.from(
        document.querySelectorAll(selectors.checkedModel),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const thinkingLabels = Array.from(
        document.querySelectorAll(selectors.thinking),
      )
        .filter(visible)
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      const modeRadios = Array.from(
        document.querySelectorAll(selectors.chatModeRadio),
      )
        .filter(visible)
        .map((element) => ({
          text: (element.textContent || "").trim(),
          checked:
            element.getAttribute("aria-checked") === "true" ||
            element.hasAttribute("data-checked"),
        }))
        .filter(({ text }) => text === "聊天" || text === "工作");
      const send = document.querySelector(selectors.send);
      const modelTriggerText = modelTrigger
        ? (modelTrigger.textContent || "").trim()
        : null;
      const state = {
        url: location.href,
        title: document.title,
        main: !!main,
        newChat: document.querySelectorAll(selectors.newChat).length > 0,
        composer: !!composer,
        prompt: !!document.querySelector(selectors.prompt),
        upload: !!document.querySelector(selectors.upload),
        attach: !!document.querySelector(selectors.attach),
        expectedModel: expected,
        modelSelected:
          modelTriggerText === expected ||
          checkedModels.some((model) => model === expected),
        modelTriggerText,
        modelTriggerCandidates: modelTriggers.map((element) =>
          (element.textContent || "").trim(),
        ),
        checkedModels,
        modeRadios,
        chatModeSelected:
          modeRadios.length === 0 ||
          modeRadios.some(({ text, checked }) => text === "聊天" && checked),
        sendPresent: !!send,
        sendEnabled: !!send && !send.disabled,
        stopPresent: !!document.querySelector(selectors.stop),
        thinkingActive: thinkingLabels.length > 0,
        thinkingLabels: thinkingLabels.slice(-3),
      };
      return {
        ok:
          state.main &&
          state.composer &&
          state.prompt &&
          state.upload &&
          state.attach &&
          state.chatModeSelected &&
          state.modelSelected,
        state,
      };
    },
    { selectors: CHATGPT_DOM, expected: expectedModel },
    { timeoutMs: 10000 },
  );
}

export function assertFreshProComposer(probe) {
  if (!probe?.ok) {
    throw new Error(
      `ChatGPT DOM contract failed: ${JSON.stringify(probe?.state || null)}`,
    );
  }
  if (probe.state.stopPresent || probe.state.thinkingActive) {
    throw new Error("ChatGPT tab is not a fresh idle Pro composer");
  }
  return probe;
}

export async function ensureChatModeAndMaxPro(tab, options = {}) {
  const expectedModel = options.expectedModel || "Pro";
  const settleMs = Number(options.settleMs ?? 500);

  async function visibleButtonTexts() {
    return tab.playwright.evaluate(
      ({ selectors }) =>
        Array.from(document.querySelectorAll(selectors.modelTrigger))
          .filter(
            (element) =>
              !!element.getClientRects().length &&
              element.id !== "composer-plus-btn" &&
              element.getAttribute("data-testid") !== "composer-plus-btn",
          )
          .map((element) => (element.textContent || "").trim())
          .filter(Boolean),
      { selectors: CHATGPT_DOM },
      { timeoutMs: 10000 },
    );
  }

  const chatRadio = tab.playwright.getByRole("radio", {
    name: "聊天",
    exact: true,
  });
  if ((await chatRadio.count()) > 0) {
    const checked = await chatRadio
      .first()
      .getAttribute("aria-checked", { timeoutMs: 3000 })
      .catch(() => null);
    if (checked !== "true") {
      await chatRadio.first().click({ timeoutMs: 5000 });
      await tab.playwright.waitForTimeout(settleMs);
    }
  }

  let probe = await probeChatGptDom(tab, { expectedModel });
  if (probe.ok) {
    return probe;
  }

  const triggerCount = await tab.playwright
    .locator(CHATGPT_DOM.modelTrigger)
    .count();
  if (triggerCount === 0) {
    throw new Error(`No composer model trigger found: ${JSON.stringify(probe)}`);
  }

  // The first aria-haspopup button is often the attachment button. The actual
  // model/capability trigger is the last visible non-attachment menu button in
  // the composer.
  const triggerIndex = await tab.playwright.evaluate(
    ({ selectors }) => {
      const visible = (element) =>
        !!element && element.getClientRects().length > 0;
      const all = Array.from(document.querySelectorAll(selectors.modelTrigger));
      const candidates = all
        .map((element, index) => ({ element, index }))
        .filter(
          ({ element }) =>
            visible(element) &&
            element.id !== "composer-plus-btn" &&
            element.getAttribute("data-testid") !== "composer-plus-btn",
        );
      return candidates.at(-1)?.index ?? -1;
    },
    { selectors: CHATGPT_DOM },
    { timeoutMs: 10000 },
  );
  if (triggerIndex < 0) {
    throw new Error(
      `No non-attachment model trigger found: ${JSON.stringify({
        probe,
        visibleButtonTexts: await visibleButtonTexts(),
      })}`,
    );
  }

  await tab.playwright
    .locator(CHATGPT_DOM.modelTrigger)
    .nth(triggerIndex)
    .click({ timeoutMs: 5000 });
  await tab.playwright.waitForTimeout(settleMs);

  const legacyPro = tab.playwright
    .locator(CHATGPT_DOM.proModel)
    .filter({ hasText: expectedModel });
  if ((await legacyPro.count()) > 0) {
    await legacyPro.first().click({ timeoutMs: 5000 });
    await tab.playwright.waitForTimeout(settleMs);
    probe = await probeChatGptDom(tab, { expectedModel });
    if (probe.ok) {
      return probe;
    }
  }

  const slider = tab.playwright.locator(CHATGPT_DOM.capabilitySlider).first();
  if ((await slider.count()) === 0) {
    throw new Error(
      `No legacy Pro option or capability slider found: ${JSON.stringify(
        probe,
      )}`,
    );
  }

  const target = await slider.evaluate(
    (element) => {
      const control =
        element.closest('[role="menuitem"][aria-label="能力"]') ||
        element.closest('[role="menuitem"]') ||
        element;
      const rect = control.getBoundingClientRect();
      return {
        x: Math.round(rect.x + rect.width - 8),
        y: Math.round(rect.y + rect.height / 2),
      };
    },
    undefined,
    { timeoutMs: 5000 },
  );
  await tab.cua.click(target);
  await tab.playwright.waitForTimeout(settleMs);

  probe = await probeChatGptDom(tab, { expectedModel });
  if (probe.ok) {
    return probe;
  }

  // Some builds only commit the max setting after the slider receives keyboard
  // input. Reopen the menu and press End/ArrowRight as a fallback.
  await tab.playwright
    .locator(CHATGPT_DOM.modelTrigger)
    .nth(triggerIndex)
    .click({ timeoutMs: 5000 });
  await tab.playwright.waitForTimeout(settleMs);
  if ((await slider.count()) > 0) {
    const thumb = await slider.evaluate(
      (element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
      },
      undefined,
      { timeoutMs: 5000 },
    );
    await tab.cua.click(thumb);
    await tab.cua.keypress({ keys: ["END"] });
    await tab.cua.keypress({ keys: ["ARROWRIGHT"] });
    await tab.playwright.waitForTimeout(settleMs);
  }

  probe = await probeChatGptDom(tab, { expectedModel });
  if (!probe.ok) {
    throw new Error(
      `Could not verify maxed ${expectedModel} composer: ${JSON.stringify(
        probe.state,
      )}`,
    );
  }
  return probe;
}
