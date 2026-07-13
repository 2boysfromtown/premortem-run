import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import {
  selectNextActionWithFallback,
  type BrowserAffordance,
  type BrowserAgentInput,
  type NextAction
} from '@premortem/core/ai-provider';
import { evaluateSuccessCondition } from '@premortem/core/success-evaluation';
import {
  safeSyntheticValue,
  sanitizeBrowserEnvironment,
  validateProposedAction
} from './action-policy';
import type {
  BrowserFindingEvidence,
  BrowserRunResult,
  BrowserScenario,
  BrowserStepResult
} from './types';

const safeMessage = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').slice(0, 500);

const fallbackAction = (input: BrowserAgentInput): NextAction => {
  const pricing = input.affordances.find((item) => /pricing|plans|cost/i.test(item.text));
  if (input.persona.focus === 'pricing' && pricing) return { type: 'click', elementId: pricing.id };
  const emptyField = input.affordances.find(
    (item) => item.role === 'input' || item.role === 'textarea'
  );
  if (emptyField) {
    return { type: 'type', elementId: emptyField.id, text: 'PREMORTEM test' };
  }
  const goalTokens = input.primaryGoal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  const goalControl = input.affordances.find(
    (item) =>
      (item.role === 'button' || item.role === 'link') &&
      goalTokens.some((token) => item.text.toLowerCase().includes(token))
  );
  if (goalControl) return { type: 'click', elementId: goalControl.id };
  return input.step + 1 >= input.maxSteps
    ? { type: 'abandon', reason: 'Goal could not be found within the step limit.' }
    : { type: 'scroll', direction: 'down' };
};

const inspectPage = async (
  page: Page
): Promise<{
  visibleText: string;
  affordances: BrowserAffordance[];
  visibleElementIds: string[];
}> =>
  await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('a[href],button,input,textarea,select,[role="button"]')
    );
    const isVisible = (element: HTMLElement): boolean => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const affordances: Array<{
      id: string;
      role: 'link' | 'button' | 'input' | 'textarea' | 'select';
      text: string;
      inputType?: string;
      href?: string;
      options?: string[];
    }> = [];
    let index = 0;
    for (const element of candidates) {
      if (!isVisible(element) || affordances.length >= 80) continue;
      index += 1;
      const id = `pm-${index}`;
      element.dataset.premortemId = id;
      const tag = element.tagName.toLowerCase();
      const role =
        tag === 'a'
          ? 'link'
          : tag === 'input'
            ? 'input'
            : tag === 'textarea'
              ? 'textarea'
              : tag === 'select'
                ? 'select'
                : 'button';
      const text = (
        element.getAttribute('aria-label') ??
        element.textContent ??
        element.getAttribute('placeholder') ??
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
      const item: (typeof affordances)[number] = { id, role, text };
      if (element instanceof HTMLInputElement) item.inputType = element.type || 'text';
      if (element instanceof HTMLAnchorElement) item.href = element.href;
      if (element instanceof HTMLSelectElement) {
        item.options = Array.from(element.options)
          .map((option) => option.value || option.text)
          .slice(0, 50);
      }
      affordances.push(item);
    }
    return {
      visibleText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 4_000),
      affordances,
      visibleElementIds: Array.from(document.querySelectorAll<HTMLElement>('[id]'))
        .filter(isVisible)
        .map((element) => element.id)
        .filter(Boolean)
        .slice(0, 500)
    };
  });

export const runGenericBrowserScenario = async (
  scenario: BrowserScenario & {
    productName: string;
    productDescription: string;
    targetCustomer: string;
    primaryGoal: string;
    successCondition: NonNullable<BrowserScenario['successCondition']>;
    actionProvider: NonNullable<BrowserScenario['actionProvider']>;
  }
): Promise<BrowserRunResult> => {
  const startedAt = new Date().toISOString();
  const steps: BrowserStepResult[] = [];
  const consoleEvents: BrowserRunResult['consoleEvents'] = [];
  const networkEvents: BrowserRunResult['networkEvents'] = [];
  const findings: BrowserFindingEvidence[] = [];
  const emittedEvents = new Set<string>();
  await mkdir(scenario.artifactsDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    env: sanitizeBrowserEnvironment(process.env)
  });
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let sequence = 0;
  const startedMs = Date.now();
  const withinLimits = () =>
    sequence < scenario.maxSteps && Date.now() - startedMs < scenario.maxDurationMs;

  const result = (
    outcome: BrowserRunResult['outcome'],
    terminationReason: string,
    deterministicCompleted: boolean,
    perceivedCompleted: boolean,
    status: BrowserRunResult['status'] = 'completed'
  ): BrowserRunResult => ({
    status,
    outcome,
    terminationReason,
    deterministicCompleted,
    perceivedCompleted,
    startedAt,
    completedAt: new Date().toISOString(),
    steps,
    consoleEvents,
    networkEvents,
    findings
  });

  try {
    context = await browser.newContext({
      viewport:
        scenario.persona.device === 'mobile'
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      userAgent:
        scenario.persona.device === 'mobile'
          ? 'PREMORTEM-Mobile-Simulator/0.1'
          : 'PREMORTEM-Desktop-Simulator/0.1',
      acceptDownloads: false,
      serviceWorkers: 'block',
      permissions: []
    });
    await context.route('**/*', async (route) => {
      let requestUrl: URL;
      try {
        requestUrl = new URL(route.request().url());
      } catch {
        await route.abort('blockedbyclient');
        return;
      }
      if (
        !['http:', 'https:'].includes(requestUrl.protocol) ||
        requestUrl.origin !== scenario.allowedOrigin
      ) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    if (scenario.successCondition.type === 'event') {
      const eventName = scenario.successCondition.eventName;
      await page.exposeFunction('__premortemRecordEvent', (name: string) =>
        emittedEvents.add(name)
      );
      await page.addInitScript((name) => {
        window.addEventListener(name, () => {
          const recorder = (
            window as typeof window & {
              __premortemRecordEvent?: (value: string) => Promise<void>;
            }
          ).__premortemRecordEvent;
          void recorder?.(name);
        });
      }, eventName);
    }
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleEvents.push({ level: message.type(), message: safeMessage(message.text()) });
      }
    });
    page.on('pageerror', (error) =>
      consoleEvents.push({ level: 'error', message: safeMessage(error.message) })
    );
    page.on('requestfailed', (request) =>
      networkEvents.push({
        url: request.url(),
        method: request.method(),
        status: null,
        errorText: request.failure()?.errorText ?? 'request failed'
      })
    );
    page.on('response', (response) => {
      if (response.status() >= 400) {
        networkEvents.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          errorText: null
        });
      }
    });

    const capture = async (
      actionType: string,
      targetDescription: string | null,
      observation: string,
      failureCode: string | null = null,
      stepResult = 'ok'
    ) => {
      if (!page || !withinLimits()) return null;
      sequence += 1;
      const fileName = `${scenario.sessionId}-step-${String(sequence).padStart(2, '0')}.png`;
      const absolute = join(scenario.artifactsDir, fileName);
      await page.screenshot({ path: absolute, fullPage: false });
      const screenshotRef = relative(process.cwd(), absolute).replaceAll('\\', '/');
      steps.push({
        sequence,
        timestamp: new Date().toISOString(),
        currentUrl: page.url(),
        actionType,
        targetDescription,
        result: stepResult,
        screenshotRef,
        observation,
        failureCode
      });
      return screenshotRef;
    };

    await page.goto(scenario.startingUrl, {
      waitUntil: 'networkidle',
      timeout: Math.min(20_000, scenario.maxDurationMs)
    });
    const initialShot = await capture(
      'navigate',
      scenario.startingUrl,
      'Landing page loaded in an isolated browser context.'
    );
    const baseline = await inspectPage(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    const unlabeledInputs = await page
      .locator('input:not([aria-label]):not([aria-labelledby])')
      .evaluateAll(
        (inputs) =>
          inputs.filter((input) => {
            const id = input.getAttribute('id');
            return !id || !document.querySelector(`label[for="${CSS.escape(id)}"]`);
          }).length
      );
    if (consoleEvents.length > 0) {
      findings.push({
        title: 'Runtime error on page',
        category: 'runtime-error',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: page.url(),
        deviceClass: scenario.persona.device,
        signature: consoleEvents[0]!.message,
        observedBehavior: `The browser emitted ${consoleEvents.length} console error or warning event(s).`,
        aiInterpretation: null,
        recommendedFix: 'Fix the failing client initialization and rejected runtime operations.',
        reproductionSteps: ['Open the page', 'Inspect the browser console'],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    const failedResponse = networkEvents.find(
      (event) => event.status !== null && event.status >= 500
    );
    if (failedResponse) {
      findings.push({
        title: 'Server request failed',
        category: 'network-failure',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: failedResponse.url,
        deviceClass: scenario.persona.device,
        signature: `${failedResponse.method} ${new URL(failedResponse.url).pathname} returned ${failedResponse.status}`,
        observedBehavior: `A browser request returned HTTP ${failedResponse.status}.`,
        aiInterpretation: null,
        recommendedFix: 'Restore the failing endpoint and add a resilient user-visible fallback.',
        reproductionSteps: ['Open the page', 'Inspect failed network responses'],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    if (overflow) {
      findings.push({
        title: 'Page overflows the viewport',
        category: 'responsive-layout-issue',
        severity: 'medium',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: page.url(),
        deviceClass: scenario.persona.device,
        signature: 'horizontal-overflow',
        observedBehavior: 'document.scrollWidth exceeded document.clientWidth.',
        aiInterpretation: null,
        recommendedFix: 'Make fixed-width content responsive or use an accessible scroll region.',
        reproductionSteps: [
          'Open the page at the captured viewport',
          'Observe horizontal overflow'
        ],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    if (unlabeledInputs > 0) {
      findings.push({
        title: 'Form field has no programmatic label',
        category: 'form-issue',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: page.url(),
        deviceClass: scenario.persona.device,
        signature: 'visible-input-missing-label',
        observedBehavior: `${unlabeledInputs} visible form input(s) lacked a label association.`,
        aiInterpretation: null,
        recommendedFix: 'Associate each field with a visible label using for/id.',
        reproductionSteps: ['Open the form', 'Inspect each input accessibility name'],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }

    let visible = baseline;
    let perceivedCompleted = false;
    while (withinLimits()) {
      const success = evaluateSuccessCondition(scenario.successCondition, {
        currentUrl: page.url(),
        visibleTexts: [visible.visibleText],
        visibleElementIds: visible.visibleElementIds,
        completedSequence: steps.map((step) => step.actionType),
        emittedEvents: [...emittedEvents],
        perceivedCompleted
      });
      if (success.deterministicCompleted) {
        return result('completed', 'DETERMINISTIC_SUCCESS', true, perceivedCompleted || true);
      }
      const input: BrowserAgentInput = {
        currentUrl: page.url(),
        primaryGoal: scenario.primaryGoal,
        step: sequence,
        maxSteps: scenario.maxSteps,
        persona: scenario.persona,
        visibleText: visible.visibleText,
        affordances: visible.affordances
      };
      const selected = await selectNextActionWithFallback({
        provider: scenario.actionProvider,
        fallback: fallbackAction,
        input,
        maxAttempts: 2
      });
      const validation = validateProposedAction(
        selected.action,
        visible.affordances,
        scenario.allowedOrigin
      );
      if (!validation.ok) {
        await capture(
          selected.action.type,
          'Rejected provider action',
          'The proposed action was rejected by the browser policy.',
          validation.reason,
          'rejected'
        );
        visible = await inspectPage(page);
        continue;
      }
      const action = selected.action;
      if (action.type === 'abandon') {
        await capture('abandon', null, safeMessage(action.reason));
        perceivedCompleted = false;
        break;
      }
      if (action.type === 'complete') {
        perceivedCompleted = true;
        await capture(
          'complete',
          null,
          safeMessage(action.reason ?? 'Agent perceived completion.')
        );
        break;
      }
      if (action.type === 'scroll') {
        await page.mouse.wheel(0, action.direction === 'up' ? -800 : 800);
        await capture('scroll', action.direction, `Scrolled ${action.direction}.`);
      } else if (action.type === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
        await capture('back', null, 'Returned to the previous page.');
      } else if (action.type === 'capture') {
        await capture('capture', null, 'Captured page evidence.');
      } else if (action.type === 'navigate') {
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        await capture('navigate', action.url, 'Navigated to an allowed same-origin URL.');
      } else {
        const affordance = visible.affordances.find((item) => item.id === action.elementId)!;
        const locator = page.locator(`[data-premortem-id="${action.elementId}"]`);
        if (action.type === 'type') {
          await locator.fill(
            safeSyntheticValue({
              ...(affordance.inputType ? { inputType: affordance.inputType } : {}),
              proposedText: action.text
            })
          );
          await capture('type', affordance.text || affordance.role, 'Entered synthetic test data.');
        } else if (action.type === 'select') {
          const allowed = affordance.options ?? [];
          const value = allowed.includes(action.value) ? action.value : allowed[0];
          if (value) await locator.selectOption(value);
          await capture(
            'select',
            affordance.text || affordance.role,
            'Selected an allowed option.'
          );
        } else if (action.type === 'click') {
          const beforeNetworkCount = networkEvents.length;
          await locator.click();
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          const shot = await capture(
            'click',
            affordance.text || affordance.role,
            'Clicked a visible control.'
          );
          const newFailure = networkEvents
            .slice(beforeNetworkCount)
            .find((event) => event.status === 404);
          if (newFailure) {
            findings.push({
              title: 'Navigation produced a 404',
              category: 'broken-navigation',
              severity: 'critical',
              confidence: 'high',
              evidenceType: 'deterministic',
              affectedUrl: newFailure.url,
              deviceClass: scenario.persona.device,
              signature: `${newFailure.method} ${new URL(newFailure.url).pathname} returned 404`,
              observedBehavior: 'Clicking a visible control produced a real HTTP 404 response.',
              aiInterpretation: null,
              recommendedFix:
                'Point the control to a working destination or publish the missing page.',
              reproductionSteps: ['Open the page', `Click ${affordance.text || 'the control'}`],
              screenshotRef: shot,
              stepSequence: sequence
            });
          }
        }
      }
      visible = await inspectPage(page);
    }

    const finalVisible = await inspectPage(page);
    const finalSuccess = evaluateSuccessCondition(scenario.successCondition, {
      currentUrl: page.url(),
      visibleTexts: [finalVisible.visibleText],
      visibleElementIds: finalVisible.visibleElementIds,
      completedSequence: steps.map((step) => step.actionType),
      emittedEvents: [...emittedEvents],
      perceivedCompleted
    });
    if (finalSuccess.deterministicCompleted) {
      return result('completed', 'DETERMINISTIC_SUCCESS', true, perceivedCompleted || true);
    }
    findings.push({
      title: 'Primary goal was not completed',
      category: 'conversion-friction',
      severity: 'medium',
      confidence: 'medium',
      evidenceType: 'browser-observed',
      affectedUrl: page.url(),
      deviceClass: scenario.persona.device,
      signature: `goal-not-completed:${scenario.persona.focus}`,
      observedBehavior: `The simulated visitor did not complete “${scenario.primaryGoal}” within the configured limits.`,
      aiInterpretation: perceivedCompleted
        ? 'The agent perceived completion, but the deterministic success condition was not met.'
        : null,
      recommendedFix: 'Review the replay and make the next step toward the primary goal clearer.',
      reproductionSteps: steps.map(
        (step) => `${step.sequence}. ${step.actionType}: ${step.observation}`
      ),
      screenshotRef: steps.at(-1)?.screenshotRef ?? initialShot,
      stepSequence: steps.at(-1)?.sequence ?? 1
    });
    return result(
      'abandoned',
      withinLimits() ? 'GOAL_NOT_COMPLETED' : 'LIMIT_REACHED',
      false,
      perceivedCompleted
    );
  } catch (error) {
    return result(
      'technical-failure',
      error instanceof Error ? safeMessage(error.message) : 'UNKNOWN_BROWSER_ERROR',
      false,
      false,
      'failed'
    );
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};
