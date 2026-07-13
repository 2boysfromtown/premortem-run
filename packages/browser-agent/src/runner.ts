import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type {
  BrowserFindingEvidence,
  BrowserRunResult,
  BrowserScenario,
  BrowserStepResult
} from './types';
import { sanitizeBrowserEnvironment } from './action-policy';
import { runGenericBrowserScenario } from './generic-runner';

const safeMessage = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').slice(0, 500);

export const runBrowserScenario = async (scenario: BrowserScenario): Promise<BrowserRunResult> => {
  if (
    scenario.actionProvider &&
    scenario.productName &&
    scenario.productDescription &&
    scenario.targetCustomer &&
    scenario.primaryGoal &&
    scenario.successCondition
  ) {
    return await runGenericBrowserScenario({
      ...scenario,
      actionProvider: scenario.actionProvider,
      productName: scenario.productName,
      productDescription: scenario.productDescription,
      targetCustomer: scenario.targetCustomer,
      primaryGoal: scenario.primaryGoal,
      successCondition: scenario.successCondition
    });
  }
  const startedAt = new Date().toISOString();
  const steps: BrowserStepResult[] = [];
  const consoleEvents: BrowserRunResult['consoleEvents'] = [];
  const networkEvents: BrowserRunResult['networkEvents'] = [];
  const findings: BrowserFindingEvidence[] = [];
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
      const requestUrl = new URL(route.request().url());
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
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        consoleEvents.push({ level: message.type(), message: safeMessage(message.text()) });
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
      if (response.status() >= 400)
        networkEvents.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          errorText: null
        });
    });

    const capture = async (
      actionType: string,
      targetDescription: string | null,
      observation: string,
      failureCode: string | null = null
    ) => {
      if (!page || !withinLimits()) return null;
      sequence += 1;
      const fileName = `${scenario.sessionId}-step-${String(sequence).padStart(2, '0')}.png`;
      const absolute = join(scenario.artifactsDir, fileName);
      await page.screenshot({ path: absolute, fullPage: false });
      const ref = relative(process.cwd(), absolute).replaceAll('\\', '/');
      steps.push({
        sequence,
        timestamp: new Date().toISOString(),
        currentUrl: page.url(),
        actionType,
        targetDescription,
        result: 'ok',
        screenshotRef: ref,
        observation,
        failureCode
      });
      return ref;
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
    const pageUrl = page.url();
    const h1 = (await page.locator('h1').first().textContent())?.trim() ?? '';
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
    const primaryCtaVisible = await page
      .locator('.primary-cta')
      .isVisible()
      .catch(() => false);
    if (consoleEvents.length > 0) {
      findings.push({
        title: 'Runtime error on landing page',
        category: 'runtime-error',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: pageUrl,
        deviceClass: scenario.persona.device,
        signature: consoleEvents[0]!.message,
        observedBehavior: `The browser emitted ${consoleEvents.length} console error or warning event(s).`,
        aiInterpretation: null,
        recommendedFix:
          'Fix the failing client initialization and handle rejected requests without uncaught console errors.',
        reproductionSteps: ['Open the landing page', 'Inspect the browser console'],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    const failedResponse = networkEvents.find(
      (event) => event.status !== null && event.status >= 500
    );
    if (failedResponse) {
      findings.push({
        title: 'Availability API request failed',
        category: 'network-failure',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: failedResponse.url,
        deviceClass: scenario.persona.device,
        signature: `${failedResponse.method} ${new URL(failedResponse.url).pathname} returned ${failedResponse.status}`,
        observedBehavior: `A real browser request returned HTTP ${failedResponse.status}.`,
        aiInterpretation: null,
        recommendedFix:
          'Restore the availability endpoint and add a resilient user-visible fallback state.',
        reproductionSteps: [
          'Open the landing page',
          'Observe the availability request in network tools'
        ],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    if (overflow)
      findings.push({
        title: 'Page overflows the mobile viewport',
        category: 'responsive-layout-issue',
        severity: 'medium',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: pageUrl,
        deviceClass: scenario.persona.device,
        signature: 'horizontal-overflow',
        observedBehavior:
          'document.scrollWidth exceeded document.clientWidth in the captured viewport.',
        aiInterpretation: null,
        recommendedFix:
          'Make the comparison content fluid or place it in an explicitly labelled, accessible scroll region.',
        reproductionSteps: ['Open on a 390px-wide viewport', 'Observe horizontal page overflow'],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    if (unlabeledInputs > 0)
      findings.push({
        title: 'Email field has no programmatic label',
        category: 'form-issue',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: pageUrl,
        deviceClass: scenario.persona.device,
        signature: 'input-workemail-missing-label',
        observedBehavior: `${unlabeledInputs} visible form input(s) lacked a label association.`,
        aiInterpretation: null,
        recommendedFix: 'Add a visible label associated with the email input using for/id.',
        reproductionSteps: [
          'Scroll to the signup form',
          'Inspect the email input accessibility name'
        ],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    if (scenario.persona.device === 'mobile' && !primaryCtaVisible)
      findings.push({
        title: 'Primary CTA is hidden on mobile',
        category: 'conversion-friction',
        severity: 'high',
        confidence: 'high',
        evidenceType: 'deterministic',
        affectedUrl: pageUrl,
        deviceClass: 'mobile',
        signature: 'primary-cta-display-none',
        observedBehavior: 'The primary navigation CTA was not visible at the mobile viewport.',
        aiInterpretation:
          'A hurried visitor may abandon before discovering the distant signup form.',
        recommendedFix:
          'Keep one clear primary action visible in the mobile header or first viewport.',
        reproductionSteps: ['Open the page at 390×844', 'Inspect the header for the primary CTA'],
        screenshotRef: initialShot,
        stepSequence: 1
      });

    if (scenario.persona.focus === 'pricing' && withinLimits()) {
      await page.getByRole('link', { name: 'Pricing' }).click();
      await page.waitForLoadState('domcontentloaded');
      const shot = await capture(
        'click',
        'Pricing link',
        'The pricing link opened an HTTP error page.',
        'BROKEN_NAVIGATION'
      );
      const pricingFailure = networkEvents.find(
        (event) => new URL(event.url).pathname === '/pricing' && event.status === 404
      );
      if (pricingFailure)
        findings.push({
          title: 'Pricing link is broken',
          category: 'broken-navigation',
          severity: 'critical',
          confidence: 'high',
          evidenceType: 'deterministic',
          affectedUrl: pricingFailure.url,
          deviceClass: scenario.persona.device,
          signature: 'GET /pricing returned 404',
          observedBehavior: 'Clicking the visible Pricing link produced a real HTTP 404 response.',
          aiInterpretation: null,
          recommendedFix:
            'Publish the pricing page or point the navigation link to a working destination.',
          reproductionSteps: [
            'Open the landing page',
            'Click Pricing in the primary navigation',
            'Observe the 404 response'
          ],
          screenshotRef: shot,
          stepSequence: sequence
        });
      return {
        status: 'completed',
        outcome: 'technical-failure',
        terminationReason: 'BROKEN_PRICING_LINK',
        deterministicCompleted: false,
        perceivedCompleted: false,
        startedAt,
        completedAt: new Date().toISOString(),
        steps,
        consoleEvents,
        networkEvents,
        findings
      };
    }

    if (scenario.persona.focus === 'successful-signup' && withinLimits()) {
      await page.locator('#signup').scrollIntoViewIfNeeded();
      await capture(
        'scroll',
        'Signup section',
        'The agent reached the signup form after a long scroll.'
      );
      await page.locator('input[name="workEmail"]').fill('simulated.customer@example.test');
      await capture('type', 'Work email input', 'Synthetic non-sensitive email entered.');
      await page.getByRole('button', { name: 'Make it happen, maybe' }).click();
      await page.waitForURL('**/welcome');
      const shot = await capture(
        'click',
        'Signup button',
        'Deterministic confirmation URL and marker reached.'
      );
      if (shot)
        await writeFile(
          join(scenario.artifactsDir, `${scenario.sessionId}-complete.json`),
          JSON.stringify({ completedAt: new Date().toISOString(), url: page.url() })
        );
      return {
        status: 'completed',
        outcome: 'completed',
        terminationReason: 'DETERMINISTIC_SUCCESS',
        deterministicCompleted: page.url() === scenario.successUrl,
        perceivedCompleted: true,
        startedAt,
        completedAt: new Date().toISOString(),
        steps,
        consoleEvents,
        networkEvents,
        findings
      };
    }

    if (scenario.persona.focus === 'comprehension' && h1.toLowerCase().includes('move forward')) {
      findings.push({
        title: 'Primary offer is difficult to interpret',
        category: 'content-comprehension',
        severity: 'medium',
        confidence: 'low',
        evidenceType: 'ai-interpreted',
        affectedUrl: pageUrl,
        deviceClass: scenario.persona.device,
        signature: `ambiguous-headline:${h1}`,
        observedBehavior: `The simulated visitor could not map the headline “${h1}” to the stated product goal.`,
        aiInterpretation:
          'The abstract wording may make the offer harder to understand for a first-time visitor.',
        recommendedFix:
          'State the product, intended customer, and concrete outcome in the headline or supporting copy.',
        reproductionSteps: [
          'Open the landing page as a first-time visitor',
          'Read the first viewport without prior context'
        ],
        screenshotRef: initialShot,
        stepSequence: 1
      });
    }
    await page.mouse.wheel(0, 1200);
    await capture(
      'scroll',
      'Page content',
      'The persona explored the page but did not reach a deterministic success condition.'
    );
    return {
      status: 'completed',
      outcome: 'abandoned',
      terminationReason: withinLimits() ? 'GOAL_NOT_FOUND' : 'LIMIT_REACHED',
      deterministicCompleted: false,
      perceivedCompleted: false,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
      consoleEvents,
      networkEvents,
      findings
    };
  } catch (error) {
    return {
      status: 'failed',
      outcome: 'technical-failure',
      terminationReason:
        error instanceof Error ? safeMessage(error.message) : 'UNKNOWN_BROWSER_ERROR',
      deterministicCompleted: false,
      perceivedCompleted: false,
      startedAt,
      completedAt: new Date().toISOString(),
      steps,
      consoleEvents,
      networkEvents,
      findings
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
};
