/** Only the existing unprivileged preview job is ineligible without test keys. */
export function isTrustedBrowserEligible(
  backendAvailable: boolean,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const publicPreview = environment.CI === 'true'
    && environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_JOB === 'preview-e2e'
    && environment.GITHUB_EVENT_NAME === 'deployment_status'
  return backendAvailable || !publicPreview
}
